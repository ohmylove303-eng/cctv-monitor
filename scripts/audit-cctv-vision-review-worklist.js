const fs = require('node:fs');
const path = require('node:path');

const { buildCatalogFromReview, parseCsv } = require('./promote-cctv-vision-calibration-review');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DEFAULT_REVIEW_CSV = path.join(DATA_DIR, 'cctv-vision-calibration-review-worklist.csv');
const DEFAULT_JSON = path.join(DATA_DIR, 'cctv-vision-calibration-review-audit.json');
const DEFAULT_MD = path.join(DATA_DIR, 'cctv-vision-calibration-review-audit.md');
const DEFAULT_MIN_SAMPLE_COUNT = 3;

const HEADERS = [
    'reviewStatus',
    'cctvId',
    'cctvName',
    'region',
    'visionTier',
    'identificationUse',
    'approachDistanceMeters',
    'resolutionWidth',
    'resolutionHeight',
    'directionCalibrationStatus',
    'lineZoneForward',
    'lineZoneReverse',
    'evidenceSource',
    'verificationMethod',
    'sampleCount',
    'datasetPath',
    'reviewer',
    'reviewedAt',
    'notes',
];

const ACTIVE_REQUIRED = [
    'visionTier',
    'identificationUse',
    'approachDistanceMeters',
    'resolutionWidth',
    'resolutionHeight',
    'directionCalibrationStatus',
    'evidenceSource',
    'verificationMethod',
    'sampleCount',
    'datasetPath',
    'reviewer',
    'reviewedAt',
];

function parseArgs(argv) {
    const options = {
        jsonPath: DEFAULT_JSON,
        markdownPath: DEFAULT_MD,
        minSampleCount: DEFAULT_MIN_SAMPLE_COUNT,
        reviewCsvPath: DEFAULT_REVIEW_CSV,
        write: true,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--review-csv') {
            options.reviewCsvPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--check') {
            options.write = false;
        } else if (arg === '--json') {
            options.jsonPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--markdown') {
            options.markdownPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--min-sample-count') {
            options.minSampleCount = Number(argv[++index]);
        } else if (arg === '--help' || arg === '-h') {
            console.log('Usage: node scripts/audit-cctv-vision-review-worklist.js [--check] [--review-csv data/cctv-vision-calibration-review-worklist.csv]');
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!Number.isInteger(options.minSampleCount) || options.minSampleCount <= 0) {
        throw new Error('--min-sample-count must be a positive integer');
    }
    return options;
}

function clean(value) {
    return String(value ?? '').trim();
}

function toObjects(rows) {
    if (rows.length === 0) {
        throw new Error('review CSV must include a header row');
    }
    const headers = rows[0].map((value) => clean(value));
    for (const header of HEADERS) {
        if (!headers.includes(header)) {
            throw new Error(`review CSV missing column: ${header}`);
        }
    }
    return rows.slice(1)
        .map((values, rowIndex) => {
            if (values.length > headers.length) {
                throw new Error(`row ${rowIndex + 2} has too many columns`);
            }
            return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
        })
        .filter((row) => Object.values(row).some((value) => clean(value)));
}

function missingFields(row) {
    const missing = ACTIVE_REQUIRED.filter((field) => !clean(row[field]));
    if (clean(row.directionCalibrationStatus) === 'calibrated') {
        if (!clean(row.lineZoneForward)) missing.push('lineZoneForward');
        if (!clean(row.lineZoneReverse)) missing.push('lineZoneReverse');
    }
    return missing;
}

function gateErrorFor(row, options) {
    try {
        buildCatalogFromReview([{ ...row, reviewStatus: 'active' }], {
            catalogPath: path.join(DATA_DIR, 'cctv-vision-calibration.json'),
            minSampleCount: options.minSampleCount,
        });
        return null;
    } catch (error) {
        return error.message;
    }
}

function statusFor(row, gateError) {
    const reviewStatus = clean(row.reviewStatus) || 'blank';
    if (!clean(row.cctvId)) {
        return 'ignored_blank';
    }
    if (!gateError && reviewStatus === 'active') {
        return 'active_gate_pass';
    }
    if (!gateError) {
        return 'ready_to_mark_active';
    }
    if (reviewStatus === 'active') {
        return 'active_blocked';
    }
    return 'review_needed';
}

function auditRows(rows, options) {
    const items = rows.map((row, index) => {
        const missing = missingFields(row);
        const gateError = gateErrorFor(row, options);
        return {
            rowNumber: index + 2,
            cctvId: clean(row.cctvId),
            cctvName: clean(row.cctvName),
            region: clean(row.region),
            reviewStatus: clean(row.reviewStatus) || 'blank',
            auditStatus: statusFor(row, gateError),
            visionTier: clean(row.visionTier),
            directionCalibrationStatus: clean(row.directionCalibrationStatus),
            sampleCount: clean(row.sampleCount),
            missing,
            gateError,
        };
    });

    const counts = items.reduce((acc, item) => {
        acc[item.auditStatus] = (acc[item.auditStatus] ?? 0) + 1;
        return acc;
    }, {});

    return {
        generatedAt: new Date().toISOString(),
        input: {
            reviewCsv: options.reviewCsvPath,
            minSampleCount: options.minSampleCount,
        },
        summary: {
            rows: items.length,
            counts,
            activeGatePass: counts.active_gate_pass ?? 0,
            readyToMarkActive: counts.ready_to_mark_active ?? 0,
            blocked: (counts.active_blocked ?? 0) + (counts.review_needed ?? 0),
        },
        items,
    };
}

function escapeMd(value) {
    return String(value ?? '').replace(/\|/g, '\\|');
}

function writeMarkdown(report, outputPath) {
    const lines = [
        '# CCTV Vision Calibration Review Audit',
        '',
        `- generatedAt: ${report.generatedAt}`,
        `- reviewCsv: ${report.input.reviewCsv}`,
        `- rows: ${report.summary.rows}`,
        `- activeGatePass: ${report.summary.activeGatePass}`,
        `- readyToMarkActive: ${report.summary.readyToMarkActive}`,
        `- blocked: ${report.summary.blocked}`,
        '',
        '## Rows',
        '',
        '| Row | CCTV | Status | Tier | Direction | Missing | Gate Error |',
        '| ---: | --- | --- | --- | --- | --- | --- |',
        ...report.items.map((item) => [
            item.rowNumber,
            `${escapeMd(item.cctvId)} ${escapeMd(item.cctvName)}`.trim(),
            item.auditStatus,
            item.visionTier || '-',
            item.directionCalibrationStatus || '-',
            item.missing.length ? escapeMd(item.missing.join(', ')) : '-',
            item.gateError ? escapeMd(item.gateError) : '-',
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |')),
        '',
    ];
    fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

function run() {
    const options = parseArgs(process.argv.slice(2));
    const rows = toObjects(parseCsv(fs.readFileSync(options.reviewCsvPath, 'utf8')));
    const report = auditRows(rows, options);

    if (options.write) {
        fs.writeFileSync(options.jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        writeMarkdown(report, options.markdownPath);
    }
    console.log(JSON.stringify({
        mode: options.write ? 'write' : 'check',
        output: {
            json: options.write ? options.jsonPath : null,
            markdown: options.write ? options.markdownPath : null,
        },
        summary: report.summary,
    }, null, 2));
}

if (require.main === module) {
    run();
}

module.exports = {
    auditRows,
};
