const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DEFAULT_CANDIDATES = path.join(DATA_DIR, 'cctv-vision-calibration-candidates.csv');
const OUTPUT_ROOT = path.resolve(process.cwd(), '.vision-calibration-samples');
const REPORT_JSON = path.join(DATA_DIR, 'cctv-vision-calibration-sample-report.json');
const REPORT_MD = path.join(DATA_DIR, 'cctv-vision-calibration-sample-report.md');

function parseArgs(argv) {
    const options = {
        candidatesPath: DEFAULT_CANDIDATES,
        limit: 5,
        timeoutMs: 12000,
        framesPerCamera: 1,
        frameIntervalSec: 1,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--candidates') {
            options.candidatesPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--limit') {
            options.limit = Number(argv[++index]);
        } else if (arg === '--timeout-ms') {
            options.timeoutMs = Number(argv[++index]);
        } else if (arg === '--frames-per-camera') {
            options.framesPerCamera = Number(argv[++index]);
        } else if (arg === '--frame-interval-sec') {
            options.frameIntervalSec = Number(argv[++index]);
        } else if (arg === '--help' || arg === '-h') {
            console.log('Usage: node scripts/capture-cctv-vision-samples.js [--candidates data/cctv-vision-calibration-candidates.csv] [--limit 5] [--timeout-ms 12000] [--frames-per-camera 3] [--frame-interval-sec 1]');
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!Number.isInteger(options.limit) || options.limit <= 0) {
        throw new Error('--limit must be a positive integer');
    }
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 3000) {
        throw new Error('--timeout-ms must be an integer >= 3000');
    }
    if (!Number.isInteger(options.framesPerCamera) || options.framesPerCamera <= 0) {
        throw new Error('--frames-per-camera must be a positive integer');
    }
    if (!Number.isInteger(options.frameIntervalSec) || options.frameIntervalSec <= 0) {
        throw new Error('--frame-interval-sec must be a positive integer');
    }
    return options;
}

function splitCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"') {
            if (inQuotes && line[index + 1] === '"') {
                current += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }
        if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
            continue;
        }
        current += char;
    }

    values.push(current);
    return values.map((value) => value.trim());
}

function loadCsv(filePath) {
    const lines = fs.readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0);
    if (lines.length === 0) {
        return [];
    }
    const headers = splitCsvLine(lines[0]);
    return lines.slice(1).map((line) => {
        const cells = splitCsvLine(line);
        return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']));
    });
}

function sanitizeFilename(value) {
    return String(value ?? '')
        .replace(/[^\w.-]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 80) || 'camera';
}

function runTool(command, args, timeoutMs) {
    return spawnSync(command, args, {
        encoding: 'utf8',
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024 * 4,
    });
}

function probeImage(filePath) {
    const result = runTool('ffprobe', [
        '-v', 'error',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=width,height',
        '-of', 'json',
        filePath,
    ], 5000);
    if (result.status !== 0 || !result.stdout) {
        return { width: null, height: null };
    }
    try {
        const parsed = JSON.parse(result.stdout);
        const stream = parsed.streams?.[0] ?? {};
        return {
            width: Number.isFinite(stream.width) ? stream.width : null,
            height: Number.isFinite(stream.height) ? stream.height : null,
        };
    } catch {
        return { width: null, height: null };
    }
}

function captureFrames(candidate, outputDir, options) {
    const filenamePrefix = `${String(candidate.rank).padStart(2, '0')}_${sanitizeFilename(candidate.cctvId)}`;
    const outputPattern = path.join(outputDir, `${filenamePrefix}_f%02d.jpg`);
    const streamUrl = candidate.streamUrl;
    if (!streamUrl) {
        return {
            ok: false,
            outputPath: null,
            frames: [],
            error: 'missing streamUrl',
            width: null,
            height: null,
        };
    }

    const timeoutMs = options.timeoutMs + (options.framesPerCamera * options.frameIntervalSec * 1000) + 2000;
    const result = runTool('ffmpeg', [
        '-y',
        '-hide_banner',
        '-loglevel', 'error',
        '-rw_timeout', String(Math.max(3_000_000, options.timeoutMs * 1000)),
        '-i', streamUrl,
        '-vf', `fps=1/${options.frameIntervalSec}`,
        '-frames:v', String(options.framesPerCamera),
        '-q:v', '3',
        outputPattern,
    ], timeoutMs);

    const frames = Array.from({ length: options.framesPerCamera }, (_, index) => {
        const outputPath = path.join(outputDir, `${filenamePrefix}_f${String(index + 1).padStart(2, '0')}.jpg`);
        const exists = fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0;
        if (!exists) {
            return null;
        }
        const { width, height } = probeImage(outputPath);
        return { outputPath, width, height };
    }).filter(Boolean);

    if (frames.length === 0) {
        return {
            ok: false,
            outputPath: null,
            frames: [],
            error: result.error?.message || result.stderr?.trim() || `ffmpeg exited with ${result.status}`,
            width: null,
            height: null,
        };
    }

    return {
        ok: true,
        outputPath: frames[0].outputPath,
        frames,
        error: null,
        width: frames[0].width,
        height: frames[0].height,
    };
}

function escapeMd(value) {
    return String(value ?? '').replace(/\|/g, '\\|');
}

function writeReport(report) {
    fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    const lines = [
        '# CCTV Vision Calibration Sample Report',
        '',
        `- generatedAt: ${report.generatedAt}`,
        `- candidates: ${report.candidatesPath}`,
        `- sampleDir: ${report.sampleDir}`,
        `- attempted: ${report.summary.attempted}`,
        `- captured: ${report.summary.captured}`,
        `- capturedFrames: ${report.summary.capturedFrames}`,
        `- failed: ${report.summary.failed}`,
        `- framesPerCamera: ${report.framesPerCamera}`,
        `- frameIntervalSec: ${report.frameIntervalSec}`,
        '',
        '## Rule',
        '',
        '- 이 보고서는 샘플 프레임 증거 수집용이며 운영 active 승격이 아니다.',
        '- `visionTier`, 거리, line zone, 리뷰어, 리뷰 일자를 수동 검증해야 한다.',
        '- 캡처 성공은 해상도 근거일 뿐 차량 세부 식별 가능성을 보장하지 않는다.',
        '',
        '## Samples',
        '',
        '| Rank | ID | Name | Source | Capture | Frames | Resolution | First Frame | Error |',
        '| ---: | --- | --- | --- | --- | ---: | --- | --- | --- |',
        ...report.samples.map((sample) => [
            sample.rank,
            escapeMd(sample.cctvId),
            escapeMd(sample.cctvName),
            escapeMd(sample.source),
            sample.captureOk ? 'ok' : 'failed',
            sample.capturedFrames ?? 0,
            sample.width && sample.height ? `${sample.width}x${sample.height}` : '-',
            sample.captureOk ? escapeMd(sample.outputPath) : '-',
            sample.error ? escapeMd(sample.error.slice(0, 160)) : '',
        ].join(' | ').replace(/^/, '| ').replace(/$/, ' |')),
        '',
    ];
    fs.writeFileSync(REPORT_MD, `${lines.join('\n')}\n`, 'utf8');
}

function run() {
    const options = parseArgs(process.argv.slice(2));
    const candidates = loadCsv(options.candidatesPath).slice(0, options.limit);
    if (candidates.length === 0) {
        throw new Error('No candidates found');
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const sampleDir = path.join(OUTPUT_ROOT, stamp);
    fs.mkdirSync(sampleDir, { recursive: true });
    fs.mkdirSync(DATA_DIR, { recursive: true });

    const samples = candidates.map((candidate) => {
        const capture = captureFrames(candidate, sampleDir, options);
        return {
            rank: Number(candidate.rank),
            cctvId: candidate.cctvId,
            cctvName: candidate.cctvName,
            region: candidate.region,
            source: candidate.source,
            suggestedReviewTier: candidate.suggestedReviewTier,
            streamUrl: candidate.streamUrl,
            captureOk: capture.ok,
            outputPath: capture.ok ? capture.outputPath : null,
            frames: capture.frames,
            capturedFrames: capture.frames.length,
            width: capture.width,
            height: capture.height,
            error: capture.error,
        };
    });

    const report = {
        generatedAt: new Date().toISOString(),
        candidatesPath: options.candidatesPath,
        sampleDir,
        framesPerCamera: options.framesPerCamera,
        frameIntervalSec: options.frameIntervalSec,
        summary: {
            attempted: samples.length,
            captured: samples.filter((sample) => sample.captureOk).length,
            capturedFrames: samples.reduce((sum, sample) => sum + sample.capturedFrames, 0),
            failed: samples.filter((sample) => !sample.captureOk).length,
        },
        samples,
    };
    writeReport(report);
    console.log(JSON.stringify({
        output: {
            json: REPORT_JSON,
            markdown: REPORT_MD,
            sampleDir,
        },
        summary: report.summary,
    }, null, 2));
}

run();
