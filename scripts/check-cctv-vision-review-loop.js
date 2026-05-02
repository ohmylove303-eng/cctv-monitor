const fs = require('node:fs');
const path = require('node:path');

const { HEADERS, mergeRows } = require('./apply-cctv-line-zone-patch');
const { auditRows } = require('./audit-cctv-vision-review-worklist');
const { buildPacket } = require('./build-cctv-vision-review-packet');
const { buildCatalogFromReview, parseCsv } = require('./promote-cctv-vision-calibration-review');
const { validateCatalog } = require('./validate-cctv-vision-calibration');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DEFAULT_CATALOG = path.join(DATA_DIR, 'cctv-vision-calibration.json');
const DEFAULT_PATCH = path.join(DATA_DIR, 'cctv-vision-line-zone-patch.csv');
const DEFAULT_REVIEW_CSV = path.join(DATA_DIR, 'cctv-vision-calibration-review-worklist.csv');
const DEFAULT_SAMPLE_REPORT = path.join(DATA_DIR, 'cctv-vision-calibration-sample-report.json');
const DEFAULT_JSON = path.join(DATA_DIR, 'cctv-vision-review-loop-status.json');
const DEFAULT_MD = path.join(DATA_DIR, 'cctv-vision-review-loop-status.md');
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
        write: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--write') {
            options.write = true;
        } else if (arg === '--check') {
            options.write = false;
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
            console.log('Usage: node scripts/check-cctv-vision-review-loop.js [--check|--write]');
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

function readCsvObjects(filePath, label) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`${label} does not exist: ${filePath}`);
    }
    return toObjects(parseCsv(fs.readFileSync(filePath, 'utf8')), label);
}

function safeStep(label, runStep) {
    try {
        return {
            ok: true,
            label,
            result: runStep(),
        };
    } catch (error) {
        return {
            ok: false,
            label,
            error: error.message,
        };
    }
}

function nextActionFor(summary) {
    if (!summary.catalog.ok || !summary.promoteDryRun.ok || !summary.audit.ok) {
        return 'fix_failed_check_before_review';
    }
    if (summary.catalog.result.activeEntries > 0) {
        return 'active_catalog_present_verify_api_and_route_overlay';
    }
    if ((summary.audit.result.activeGatePass ?? 0) > 0) {
        return 'run_vision_calibration_promote_after_final_review';
    }
    if ((summary.audit.result.readyToMarkActive ?? 0) > 0) {
        return 'mark_ready_rows_active_after_reviewer_confirmation';
    }
    return 'open_review_packet_fill_missing_fields_and_line_zones';
}

function buildLoopStatus(options) {
    const worklistRows = readCsvObjects(options.reviewCsvPath, 'review CSV');
    const sampleReport = JSON.parse(fs.readFileSync(options.sampleReportPath, 'utf8'));
    if (!Array.isArray(sampleReport.samples)) {
        throw new Error('sample report must include samples array');
    }

    const catalog = safeStep('catalog', () => {
        const parsed = JSON.parse(fs.readFileSync(options.catalogPath, 'utf8'));
        validateCatalog(parsed, { minSampleCount: options.minSampleCount });
        return {
            activeEntries: parsed.entries.length,
            path: options.catalogPath,
        };
    });

    const patchDryRun = safeStep('patchDryRun', () => {
        const patchRows = readCsvObjects(options.patchCsvPath, 'patch CSV');
        return mergeRows(worklistRows, patchRows, {
            allowActive: false,
            minSampleCount: options.minSampleCount,
        }).summary;
    });

    const audit = safeStep('audit', () => auditRows(worklistRows, options).summary);
    const packet = safeStep('reviewPacket', () => buildPacket(worklistRows, sampleReport, options).summary);
    const promoteDryRun = safeStep('promoteDryRun', () => {
        const promoted = buildCatalogFromReview(worklistRows, {
            catalogPath: options.catalogPath,
            minSampleCount: options.minSampleCount,
        });
        return {
            activeRows: promoted.entries.length,
        };
    });

    const summary = {
        catalog,
        patchDryRun,
        audit,
        reviewPacket: packet,
        promoteDryRun,
    };

    return {
        generatedAt: new Date().toISOString(),
        mode: options.write ? 'write' : 'check',
        input: {
            catalog: options.catalogPath,
            patchCsv: options.patchCsvPath,
            reviewCsv: options.reviewCsvPath,
            sampleReport: options.sampleReportPath,
        },
        summary,
        nextAction: nextActionFor(summary),
    };
}

function escapeMd(value) {
    return String(value ?? '').replace(/\|/g, '\\|');
}

function stepLine(step) {
    if (step.ok) {
        return `ok: ${JSON.stringify(step.result)}`;
    }
    return `fail: ${step.error}`;
}

function writeMarkdown(status, outputPath) {
    const lines = [
        '# CCTV Vision Review Loop Status',
        '',
        `- generatedAt: ${status.generatedAt}`,
        `- mode: ${status.mode}`,
        `- nextAction: ${status.nextAction}`,
        '',
        '## Inputs',
        '',
        `- catalog: ${status.input.catalog}`,
        `- patchCsv: ${status.input.patchCsv}`,
        `- reviewCsv: ${status.input.reviewCsv}`,
        `- sampleReport: ${status.input.sampleReport}`,
        '',
        '## Checks',
        '',
        '| Step | Result |',
        '| --- | --- |',
        ...Object.entries(status.summary).map(([key, step]) => `| ${key} | ${escapeMd(stepLine(step))} |`),
        '',
    ];
    fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

function run() {
    const options = parseArgs(process.argv.slice(2));
    const status = buildLoopStatus(options);
    if (options.write) {
        fs.writeFileSync(options.jsonPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
        writeMarkdown(status, options.markdownPath);
    }

    console.log(JSON.stringify({
        mode: status.mode,
        output: {
            json: options.write ? options.jsonPath : null,
            markdown: options.write ? options.markdownPath : null,
        },
        nextAction: status.nextAction,
        checks: Object.fromEntries(Object.entries(status.summary).map(([key, step]) => [key, step.ok ? 'ok' : `fail: ${step.error}`])),
    }, null, 2));
}

if (require.main === module) {
    run();
}

module.exports = {
    buildLoopStatus,
};
