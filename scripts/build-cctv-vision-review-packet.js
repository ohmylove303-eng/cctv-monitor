const fs = require('node:fs');
const path = require('node:path');

const { auditRows } = require('./audit-cctv-vision-review-worklist');
const { parseCsv } = require('./promote-cctv-vision-calibration-review');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DEFAULT_REVIEW_CSV = path.join(DATA_DIR, 'cctv-vision-calibration-review-worklist.csv');
const DEFAULT_SAMPLE_REPORT = path.join(DATA_DIR, 'cctv-vision-calibration-sample-report.json');
const DEFAULT_JSON = path.join(DATA_DIR, 'cctv-vision-calibration-review-packet.json');
const DEFAULT_MD = path.join(DATA_DIR, 'cctv-vision-calibration-review-packet.md');
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

function parseArgs(argv) {
    const options = {
        jsonPath: DEFAULT_JSON,
        markdownPath: DEFAULT_MD,
        minSampleCount: DEFAULT_MIN_SAMPLE_COUNT,
        reviewCsvPath: DEFAULT_REVIEW_CSV,
        sampleReportPath: DEFAULT_SAMPLE_REPORT,
        write: true,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--review-csv') {
            options.reviewCsvPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--sample-report') {
            options.sampleReportPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--json') {
            options.jsonPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--markdown') {
            options.markdownPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--min-sample-count') {
            options.minSampleCount = Number(argv[++index]);
        } else if (arg === '--check') {
            options.write = false;
        } else if (arg === '--help' || arg === '-h') {
            console.log('Usage: node scripts/build-cctv-vision-review-packet.js [--check]');
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

function resolutionGate(width, height) {
    if (!width || !height) {
        return 'no_sample_resolution';
    }
    if (height >= 1080) {
        return 'tier_a_resolution_ok_needs_distance_line_zone';
    }
    if (height >= 720) {
        return 'tier_b_resolution_review_not_tier_a';
    }
    return 'tier_c_low_resolution_review';
}

function maxTierByResolution(height) {
    if (!height) {
        return 'unknown';
    }
    if (height >= 1080) {
        return 'tier_a_if_distance_<=20m';
    }
    if (height >= 720) {
        return 'tier_b_or_lower';
    }
    return 'tier_c';
}

function buildPacket(rows, sampleReport, options) {
    const audit = auditRows(rows, options);
    const samplesById = new Map((sampleReport.samples ?? []).map((sample) => [sample.cctvId, sample]));
    const reviewPage = sampleReport.sampleDir ? path.join(sampleReport.sampleDir, 'line-zone-review.html') : '';

    const items = audit.items.map((item) => {
        const sample = samplesById.get(item.cctvId) ?? {};
        const width = Number(sample.width || clean(rows.find((row) => clean(row.cctvId) === item.cctvId)?.resolutionWidth));
        const height = Number(sample.height || clean(rows.find((row) => clean(row.cctvId) === item.cctvId)?.resolutionHeight));
        const frames = Array.isArray(sample.frames)
            ? sample.frames.map((frame) => ({
                path: frame.outputPath,
                width: frame.width,
                height: frame.height,
            }))
            : [];

        return {
            ...item,
            source: sample.source ?? '',
            streamUrl: sample.streamUrl ?? '',
            sampleResolution: width && height ? `${width}x${height}` : '',
            capturedFrames: sample.capturedFrames ?? frames.length,
            frames,
            reviewPage,
            resolutionGate: resolutionGate(width, height),
            maxTierByResolution: maxTierByResolution(height),
            nextAction: item.auditStatus === 'active_gate_pass'
                ? 'eligible_for_promote_dry_run'
                : 'fill_missing_fields_and_manual_line_zone_review',
        };
    });

    return {
        generatedAt: new Date().toISOString(),
        input: {
            reviewCsv: options.reviewCsvPath,
            sampleReport: options.sampleReportPath,
            sampleDir: sampleReport.sampleDir ?? '',
            reviewPage,
        },
        summary: {
            ...audit.summary,
            sampleCaptured: sampleReport.summary?.captured ?? 0,
            sampleFrames: sampleReport.summary?.capturedFrames ?? 0,
        },
        items,
    };
}

function escapeMd(value) {
    return String(value ?? '').replace(/\|/g, '\\|');
}

function writeMarkdown(packet, outputPath) {
    const lines = [
        '# CCTV Vision Calibration Review Packet',
        '',
        `- generatedAt: ${packet.generatedAt}`,
        `- reviewCsv: ${packet.input.reviewCsv}`,
        `- sampleReport: ${packet.input.sampleReport}`,
        `- sampleDir: ${packet.input.sampleDir}`,
        `- reviewPage: ${packet.input.reviewPage}`,
        `- activeGatePass: ${packet.summary.activeGatePass}`,
        `- readyToMarkActive: ${packet.summary.readyToMarkActive}`,
        `- blocked: ${packet.summary.blocked}`,
        '',
        '## Review Targets',
        '',
        '| CCTV | Resolution | Resolution Gate | Status | Missing | Sample Frames | Next |',
        '| --- | --- | --- | --- | --- | ---: | --- |',
        ...packet.items.map((item) => [
            `${escapeMd(item.cctvId)} ${escapeMd(item.cctvName)}`.trim(),
            item.sampleResolution || '-',
            item.resolutionGate,
            item.auditStatus,
            item.missing.length ? escapeMd(item.missing.join(', ')) : '-',
            item.capturedFrames || 0,
            item.nextAction,
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |')),
        '',
        '## Frame Paths',
        '',
        ...packet.items.flatMap((item) => [
            `### ${item.cctvId} ${item.cctvName}`,
            '',
            `- reviewPage: ${item.reviewPage}`,
            `- maxTierByResolution: ${item.maxTierByResolution}`,
            `- streamUrl: ${item.streamUrl || '-'}`,
            ...item.frames.map((frame) => `- frame: ${frame.path} (${frame.width}x${frame.height})`),
            '',
        ]),
    ];
    fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

function run() {
    const options = parseArgs(process.argv.slice(2));
    const rows = toObjects(parseCsv(fs.readFileSync(options.reviewCsvPath, 'utf8')));
    const sampleReport = JSON.parse(fs.readFileSync(options.sampleReportPath, 'utf8'));
    if (!Array.isArray(sampleReport.samples)) {
        throw new Error('sample report must include samples array');
    }

    const packet = buildPacket(rows, sampleReport, options);
    if (options.write) {
        fs.writeFileSync(options.jsonPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');
        writeMarkdown(packet, options.markdownPath);
    }

    console.log(JSON.stringify({
        mode: options.write ? 'write' : 'check',
        output: {
            json: options.write ? options.jsonPath : null,
            markdown: options.write ? options.markdownPath : null,
        },
        summary: packet.summary,
    }, null, 2));
}

if (require.main === module) {
    run();
}

module.exports = {
    buildPacket,
    resolutionGate,
};
