const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DEFAULT_REPORT = path.join(DATA_DIR, 'cctv-vision-calibration-sample-report.json');
const OUTPUT_CSV = path.join(DATA_DIR, 'cctv-vision-calibration-review-worklist.csv');
const OUTPUT_MD = path.join(DATA_DIR, 'cctv-vision-calibration-review-worklist.md');

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
        reportPath: DEFAULT_REPORT,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--report') {
            options.reportPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--help' || arg === '-h') {
            console.log('Usage: node scripts/build-cctv-vision-review-worklist.js [--report data/cctv-vision-calibration-sample-report.json]');
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function escapeCsv(value) {
    const text = String(value ?? '');
    if (/[",\n]/.test(text)) {
        return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
}

function escapeMd(value) {
    return String(value ?? '').replace(/\|/g, '\\|');
}

function resolutionNote(sample) {
    if (!sample.captureOk) {
        return 'capture_failed';
    }
    if (sample.height >= 1080) {
        return 'resolution_supports_tier_a_if_distance_and_line_zone_pass';
    }
    if (sample.height >= 720) {
        return 'resolution_supports_tier_b_review_not_tier_a';
    }
    return 'low_resolution_tier_c_review';
}

function getFrames(sample) {
    if (Array.isArray(sample.frames) && sample.frames.length > 0) {
        return sample.frames;
    }
    if (sample.outputPath) {
        return [{
            outputPath: sample.outputPath,
            width: sample.width,
            height: sample.height,
        }];
    }
    return [];
}

function buildRows(report) {
    return report.samples.map((sample) => {
        const frames = getFrames(sample);
        const framePaths = frames.map((frame) => frame.outputPath).filter(Boolean);
        const capturedFrames = frames.length;
        const note = [
            `capture=${sample.captureOk ? 'ok' : 'failed'}`,
            `suggested=${sample.suggestedReviewTier ?? 'unknown'}`,
            resolutionNote(sample),
            capturedFrames > 0 ? `frames=${framePaths.join(' | ')}` : '',
            sample.error ? `error=${sample.error}` : '',
            'needs_distance_line_zone_reviewer_reviewedAt',
        ].filter(Boolean).join('; ');

        return {
            reviewStatus: 'review_needed',
            cctvId: sample.cctvId,
            cctvName: sample.cctvName,
            region: sample.region,
            visionTier: '',
            identificationUse: '',
            approachDistanceMeters: '',
            resolutionWidth: sample.width ?? '',
            resolutionHeight: sample.height ?? '',
            directionCalibrationStatus: 'pending',
            lineZoneForward: '',
            lineZoneReverse: '',
            evidenceSource: sample.captureOk ? 'sample_frame_capture' : '',
            verificationMethod: sample.captureOk ? 'ffmpeg_multi_frame_probe' : '',
            sampleCount: sample.captureOk ? String(capturedFrames) : '',
            datasetPath: report.sampleDir ?? '',
            reviewer: '',
            reviewedAt: '',
            notes: note,
        };
    });
}

function writeCsv(rows) {
    const csv = [
        HEADERS.join(','),
        ...rows.map((row) => HEADERS.map((header) => escapeCsv(row[header])).join(',')),
    ].join('\n');
    fs.writeFileSync(OUTPUT_CSV, `${csv}\n`, 'utf8');
}

function writeMarkdown(report, rows) {
    const lines = [
        '# CCTV Vision Calibration Review Worklist',
        '',
        `- generatedAt: ${new Date().toISOString()}`,
        `- sampleReport: ${report.reportPath ?? DEFAULT_REPORT}`,
        `- sampleDir: ${report.sampleDir ?? ''}`,
        `- rows: ${rows.length}`,
        '',
        '## Rule',
        '',
        '- 이 파일은 검토 작업표이며 운영 active 승격이 아니다.',
        '- `reviewStatus`는 모두 `review_needed`로 유지된다.',
        '- Tier-A 승격은 1080p 이상만으로 부족하며, 20m 이하 거리와 line zone, 리뷰어 검증이 추가로 필요하다.',
        '- `sampleCount`가 3 이상이어도 거리, line zone, 리뷰어 검증이 없으면 active로 바꾸면 안 된다.',
        '',
        '## Rows',
        '',
        '| ID | Name | Resolution | Samples | Direction | Evidence | Next |',
        '| --- | --- | --- | ---: | --- | --- | --- |',
        ...rows.map((row) => [
            escapeMd(row.cctvId),
            escapeMd(row.cctvName),
            row.resolutionWidth && row.resolutionHeight ? `${row.resolutionWidth}x${row.resolutionHeight}` : '-',
            row.sampleCount || '-',
            row.directionCalibrationStatus,
            row.evidenceSource || '-',
            escapeMd(row.notes),
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |')),
        '',
    ];
    fs.writeFileSync(OUTPUT_MD, `${lines.join('\n')}\n`, 'utf8');
}

function run() {
    const options = parseArgs(process.argv.slice(2));
    const report = JSON.parse(fs.readFileSync(options.reportPath, 'utf8'));
    report.reportPath = options.reportPath;
    if (!Array.isArray(report.samples)) {
        throw new Error('sample report must include samples array');
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });
    const rows = buildRows(report);
    writeCsv(rows);
    writeMarkdown(report, rows);
    console.log(JSON.stringify({
        output: {
            csv: OUTPUT_CSV,
            markdown: OUTPUT_MD,
        },
        summary: {
            rows: rows.length,
            captured: rows.filter((row) => row.evidenceSource).length,
            reviewStatus: 'review_needed',
        },
    }, null, 2));
}

run();
