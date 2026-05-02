const fs = require('node:fs');
const path = require('node:path');

const { HEADERS } = require('./apply-cctv-line-zone-patch');
const { buildPacket } = require('./build-cctv-vision-review-packet');
const { buildLoopStatus } = require('./check-cctv-vision-review-loop');
const { parseCsv } = require('./promote-cctv-vision-calibration-review');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DEFAULT_CATALOG = path.join(DATA_DIR, 'cctv-vision-calibration.json');
const DEFAULT_PATCH = path.join(DATA_DIR, 'cctv-vision-line-zone-patch.csv');
const DEFAULT_REVIEW_CSV = path.join(DATA_DIR, 'cctv-vision-calibration-review-worklist.csv');
const DEFAULT_SAMPLE_REPORT = path.join(DATA_DIR, 'cctv-vision-calibration-sample-report.json');
const DEFAULT_JSON = path.join(DATA_DIR, 'cctv-vision-review-next.json');
const DEFAULT_MD = path.join(DATA_DIR, 'cctv-vision-review-next.md');
const CHECKLIST = path.join(DATA_DIR, 'cctv-vision-line-zone-patch-checklist.md');
const DEFAULT_MIN_SAMPLE_COUNT = 3;

function parseArgs(argv) {
    const options = {
        catalogPath: DEFAULT_CATALOG,
        jsonPath: DEFAULT_JSON,
        markdownPath: DEFAULT_MD,
        minSampleCount: DEFAULT_MIN_SAMPLE_COUNT,
        patchCsvPath: DEFAULT_PATCH,
        reviewCsvPath: DEFAULT_REVIEW_CSV,
        sampleReportPath: DEFAULT_SAMPLE_REPORT,
        write: true,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--check') {
            options.write = false;
        } else if (arg === '--write') {
            options.write = true;
        } else if (arg === '--catalog') {
            options.catalogPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--patch-csv') {
            options.patchCsvPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--review-csv') {
            options.reviewCsvPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--sample-report') {
            options.sampleReportPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--json') {
            options.jsonPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--markdown') {
            options.markdownPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--min-sample-count') {
            options.minSampleCount = Number(argv[++index]);
        } else if (arg === '--help' || arg === '-h') {
            console.log('Usage: node scripts/summarize-cctv-vision-review-status.js [--check|--write]');
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

function toObjects(rows, label) {
    if (rows.length === 0) {
        throw new Error(`${label} must include a header row`);
    }
    const headers = rows[0].map((value) => clean(value));
    for (const header of HEADERS) {
        if (!headers.includes(header)) {
            throw new Error(`${label} missing column: ${header}`);
        }
    }
    return rows.slice(1)
        .map((values, rowIndex) => {
            if (values.length > headers.length) {
                throw new Error(`${label} row ${rowIndex + 2} has too many columns`);
            }
            return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
        })
        .filter((row) => Object.values(row).some((value) => clean(value)));
}

function readWorklistRows(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`review CSV does not exist: ${filePath}`);
    }
    return toObjects(parseCsv(fs.readFileSync(filePath, 'utf8')), 'review CSV');
}

function stepResult(step, key, fallback = 0) {
    return step?.ok ? step.result?.[key] ?? fallback : fallback;
}

function manualInputsFor(item) {
    const inputs = new Set(item.missing);
    if (item.directionCalibrationStatus !== 'calibrated') {
        inputs.add('directionCalibrationStatus');
        inputs.add('lineZoneForward');
        inputs.add('lineZoneReverse');
    }
    return Array.from(inputs);
}

function summarize(options) {
    const status = buildLoopStatus({
        ...options,
        write: false,
    });
    const worklistRows = readWorklistRows(options.reviewCsvPath);
    const sampleReport = JSON.parse(fs.readFileSync(options.sampleReportPath, 'utf8'));
    const packet = buildPacket(worklistRows, sampleReport, options);

    return {
        generatedAt: new Date().toISOString(),
        nextAction: status.nextAction,
        inputs: {
            patchCsv: options.patchCsvPath,
            reviewCsv: options.reviewCsvPath,
            reviewPage: packet.input.reviewPage,
            checklist: CHECKLIST,
        },
        summary: {
            activeCatalogEntries: stepResult(status.summary.catalog, 'activeEntries'),
            patchRowsAppliedInDryRun: stepResult(status.summary.patchDryRun, 'applied'),
            reviewRows: packet.summary.rows,
            activeGatePass: packet.summary.activeGatePass,
            readyToMarkActive: packet.summary.readyToMarkActive,
            blocked: packet.summary.blocked,
            sampleCaptured: packet.summary.sampleCaptured,
            sampleFrames: packet.summary.sampleFrames,
        },
        targets: packet.items.map((item) => {
            const manualInputsRemaining = manualInputsFor(item);
            return {
                cctvId: item.cctvId,
                cctvName: item.cctvName,
                resolution: item.sampleResolution,
                resolutionGate: item.resolutionGate,
                maxTierByResolution: item.maxTierByResolution,
                auditStatus: item.auditStatus,
                missing: item.missing,
                manualInputsRemaining,
                nextAction: item.nextAction,
            };
        }),
    };
}

function escapeMd(value) {
    return String(value ?? '').replace(/\|/g, '\\|');
}

function writeMarkdown(report, outputPath) {
    const lines = [
        '# CCTV Vision Review Next',
        '',
        `- generatedAt: ${report.generatedAt}`,
        `- nextAction: ${report.nextAction}`,
        `- activeCatalogEntries: ${report.summary.activeCatalogEntries}`,
        `- activeGatePass: ${report.summary.activeGatePass}`,
        `- readyToMarkActive: ${report.summary.readyToMarkActive}`,
        `- blocked: ${report.summary.blocked}`,
        `- sampleCaptured: ${report.summary.sampleCaptured}`,
        `- sampleFrames: ${report.summary.sampleFrames}`,
        '',
        '## Open',
        '',
        `- reviewPage: ${report.inputs.reviewPage}`,
        `- patchCsv: ${report.inputs.patchCsv}`,
        `- checklist: ${report.inputs.checklist}`,
        '',
        '## Remaining Manual Inputs',
        '',
        '| CCTV | Resolution | Max Tier | Status | Missing |',
        '| --- | --- | --- | --- | --- |',
        ...report.targets.map((item) => [
            `${escapeMd(item.cctvId)} ${escapeMd(item.cctvName)}`.trim(),
            item.resolution || '-',
            item.maxTierByResolution || '-',
            item.auditStatus,
            item.manualInputsRemaining.length ? escapeMd(item.manualInputsRemaining.join(', ')) : '-',
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |')),
        '',
        '## Guardrail',
        '',
        '- Do not infer distance, tier, or line-zone coordinates without manual frame review.',
        '- Use `npm run vision-calibration:review-apply-safe` after editing the patch CSV.',
        '- Promote to the active catalog only after reviewer confirmation and gate pass.',
        '',
    ];
    fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

function run() {
    const options = parseArgs(process.argv.slice(2));
    const report = summarize(options);
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
        nextAction: report.nextAction,
        summary: report.summary,
        targets: report.targets.map((target) => ({
            cctvId: target.cctvId,
            manualInputsRemaining: target.manualInputsRemaining,
            maxTierByResolution: target.maxTierByResolution,
        })),
    }, null, 2));
}

if (require.main === module) {
    run();
}

module.exports = {
    summarize,
};
