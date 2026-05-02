const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DEFAULT_INPUT = path.join(DATA_DIR, 'official-cctv-coordinates.csv');
const DEFAULT_JSON = path.join(DATA_DIR, 'official-coordinate-review-next.json');
const DEFAULT_MD = path.join(DATA_DIR, 'official-coordinate-review-next.md');
const DEFAULT_ROWS_CSV = path.join(DATA_DIR, 'official-coordinate-review-next-rows.csv');

const REQUIRED_HEADERS = [
    'id',
    'name',
    'address',
    'region',
    'source',
    'seed_lat',
    'seed_lng',
    'lat',
    'lng',
    'status',
    'source_document',
    'note',
    'matched_mng_no',
    'matched_manager',
    'matched_purpose',
    'matched_address',
    'matched_distance_m',
    'matched_score',
    'matched_camera_count',
    'match_strategy',
];

const INACTIVE_STATUSES = new Set(['pending', 'template', 'draft', 'disabled', 'inactive', 'review_needed', 'review']);
const REVIEW_STATUSES = new Set(['review_needed', 'review']);

function parseArgs(argv) {
    const options = {
        inputPath: DEFAULT_INPUT,
        jsonPath: DEFAULT_JSON,
        markdownPath: DEFAULT_MD,
        rowsCsvPath: DEFAULT_ROWS_CSV,
        top: 25,
        write: true,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--check') {
            options.write = false;
        } else if (arg === '--write') {
            options.write = true;
        } else if (arg === '--input') {
            options.inputPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--json') {
            options.jsonPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--markdown') {
            options.markdownPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--rows-csv') {
            options.rowsCsvPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--top') {
            options.top = Number(argv[++index]);
        } else if (arg === '--help' || arg === '-h') {
            console.log('Usage: node scripts/summarize-official-coordinate-review.js [--check|--write] [--top 25]');
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!Number.isInteger(options.top) || options.top <= 0) {
        throw new Error('--top must be a positive integer');
    }
    return options;
}

function clean(value) {
    return String(value ?? '').trim();
}

function normalize(value) {
    return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

function parseNumber(value) {
    const parsed = Number(clean(value));
    return Number.isFinite(parsed) ? parsed : null;
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

function parseCsv(raw) {
    const lines = raw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
    if (lines.length === 0) {
        throw new Error('official coordinate CSV must include a header row');
    }

    const headers = splitCsvLine(lines[0]);
    for (const header of REQUIRED_HEADERS) {
        if (!headers.includes(header)) {
            throw new Error(`official coordinate CSV missing column: ${header}`);
        }
    }

    return lines.slice(1).map((line, index) => {
        const values = splitCsvLine(line);
        if (values.length > headers.length) {
            throw new Error(`official coordinate CSV row ${index + 2} has too many columns`);
        }
        return Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? '']));
    });
}

function countBy(rows, pickKey) {
    return rows.reduce((acc, row) => {
        const key = pickKey(row) || 'blank';
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
    }, {});
}

function isReviewRow(row) {
    return REVIEW_STATUSES.has(normalize(row.status));
}

function isInactiveRow(row) {
    return INACTIVE_STATUSES.has(normalize(row.status));
}

function hasValidCoordinates(row) {
    return parseNumber(row.lat) !== null && parseNumber(row.lng) !== null;
}

function isActiveRow(row) {
    return !isInactiveRow(row) && hasValidCoordinates(row);
}

function activeGateError(row) {
    if (normalize(row.status) !== 'active') {
        return null;
    }
    if (!hasValidCoordinates(row)) {
        return 'active row missing valid lat/lng';
    }
    if (!clean(row.source_document)) {
        return 'active row missing source_document';
    }
    if (!clean(row.note)) {
        return 'active row missing note';
    }
    return null;
}

function priorityFor(row) {
    const status = normalize(row.status);
    if (status === 'pending') {
        return 'P5_source_evidence_required';
    }
    if (!isReviewRow(row)) {
        return 'not_review_target';
    }

    const distance = parseNumber(row.matched_distance_m);
    const score = parseNumber(row.matched_score);
    if (distance !== null && score !== null) {
        if (distance <= 100 && score >= 190) return 'P1_manual_review';
        if (distance <= 300 && score >= 170) return 'P2_manual_review';
        if (distance <= 800 && score >= 150) return 'P3_manual_review';
    }
    return 'P4_manual_review_low_confidence';
}

function distanceBucket(row) {
    const distance = parseNumber(row.matched_distance_m);
    if (distance === null) return 'unknown';
    if (distance <= 100) return '0_100m';
    if (distance <= 300) return '101_300m';
    if (distance <= 800) return '301_800m';
    if (distance <= 1500) return '801_1500m';
    return '1501m_plus';
}

function duplicateIds(rows) {
    const counts = countBy(rows.filter((row) => clean(row.id)), (row) => clean(row.id));
    return Object.entries(counts)
        .filter(([, count]) => count > 1)
        .map(([id, count]) => ({ id, count }));
}

function reviewTarget(row) {
    return {
        priority: priorityFor(row),
        id: clean(row.id),
        name: clean(row.name),
        address: clean(row.address),
        region: clean(row.region),
        source: clean(row.source),
        status: normalize(row.status) || 'blank',
        seedLat: parseNumber(row.seed_lat),
        seedLng: parseNumber(row.seed_lng),
        candidateLat: parseNumber(row.lat),
        candidateLng: parseNumber(row.lng),
        matchedMngNo: clean(row.matched_mng_no),
        matchedManager: clean(row.matched_manager),
        matchedPurpose: clean(row.matched_purpose),
        matchedAddress: clean(row.matched_address),
        matchedDistanceM: parseNumber(row.matched_distance_m),
        matchedScore: parseNumber(row.matched_score),
        matchedCameraCount: parseNumber(row.matched_camera_count),
        matchStrategy: clean(row.match_strategy),
        manualReviewRequired: true,
        autoPromotionAllowed: false,
        note: clean(row.note),
    };
}

function compareTargets(a, b) {
    const priority = a.priority.localeCompare(b.priority);
    if (priority !== 0) return priority;
    const distanceA = a.matchedDistanceM ?? Number.POSITIVE_INFINITY;
    const distanceB = b.matchedDistanceM ?? Number.POSITIVE_INFINITY;
    if (distanceA !== distanceB) return distanceA - distanceB;
    const scoreA = a.matchedScore ?? Number.NEGATIVE_INFINITY;
    const scoreB = b.matchedScore ?? Number.NEGATIVE_INFINITY;
    return scoreB - scoreA;
}

function summarize(options) {
    if (!fs.existsSync(options.inputPath)) {
        throw new Error(`official coordinate CSV does not exist: ${options.inputPath}`);
    }
    const rows = parseCsv(fs.readFileSync(options.inputPath, 'utf8'));
    const errors = rows
        .map((row, index) => ({
            rowNumber: index + 2,
            id: clean(row.id),
            error: activeGateError(row),
        }))
        .filter((item) => item.error);
    const duplicates = duplicateIds(rows);
    const reviewTargets = rows
        .filter((row) => isReviewRow(row) || normalize(row.status) === 'pending')
        .map(reviewTarget)
        .sort(compareTargets);

    const summary = {
        rows: rows.length,
        activeRows: rows.filter(isActiveRow).length,
        reviewNeededRows: rows.filter(isReviewRow).length,
        pendingRows: rows.filter((row) => normalize(row.status) === 'pending').length,
        blockedFromRuntime: rows.filter((row) => isInactiveRow(row) || !hasValidCoordinates(row)).length,
        invalidActiveRows: errors.length,
        duplicateIds: duplicates.length,
        autoPromotableRows: 0,
    };

    return {
        generatedAt: new Date().toISOString(),
        input: {
            csv: options.inputPath,
        },
        policy: {
            noAutomaticPromotion: true,
            activeRequirement: 'status=active, valid lat/lng, source_document, note',
            reviewNeededRuntimeEffect: 'ignored_by_official_coordinate_override_loader',
        },
        summary,
        counts: {
            byStatus: countBy(rows, (row) => normalize(row.status) || 'blank'),
            byRegion: countBy(rows, (row) => clean(row.region) || 'blank'),
            byPurpose: countBy(rows, (row) => clean(row.matched_purpose) || 'blank'),
            byReviewPriority: countBy(reviewTargets, (row) => row.priority),
            byDistanceBucket: countBy(rows.filter(isReviewRow), distanceBucket),
        },
        errors,
        duplicates,
        reviewTargets,
        topReviewTargets: reviewTargets.slice(0, options.top),
        nextAction: errors.length || duplicates.length
            ? 'fix_active_coordinate_csv_guardrail_errors'
            : 'review_priority_rows_manually_before_any_active_promotion',
    };
}

function escapeCsv(value) {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeTargetsCsv(targets, outputPath) {
    const headers = [
        'priority',
        'id',
        'name',
        'address',
        'region',
        'source',
        'status',
        'seedLat',
        'seedLng',
        'candidateLat',
        'candidateLng',
        'matchedMngNo',
        'matchedManager',
        'matchedPurpose',
        'matchedAddress',
        'matchedDistanceM',
        'matchedScore',
        'matchedCameraCount',
        'matchStrategy',
        'manualReviewRequired',
        'autoPromotionAllowed',
        'note',
    ];
    const csv = [
        headers.join(','),
        ...targets.map((target) => headers.map((header) => escapeCsv(target[header])).join(',')),
    ].join('\n');
    fs.writeFileSync(outputPath, `${csv}\n`, 'utf8');
}

function escapeMd(value) {
    return String(value ?? '').replace(/\|/g, '\\|');
}

function formatJson(value) {
    return escapeMd(JSON.stringify(value));
}

function writeMarkdown(report, outputPath, rowsCsvPath) {
    const lines = [
        '# Official Coordinate Review Next',
        '',
        `- generatedAt: ${report.generatedAt}`,
        `- nextAction: ${report.nextAction}`,
        `- csv: ${report.input.csv}`,
        `- reviewRowsCsv: ${rowsCsvPath}`,
        `- activeRows: ${report.summary.activeRows}`,
        `- reviewNeededRows: ${report.summary.reviewNeededRows}`,
        `- pendingRows: ${report.summary.pendingRows}`,
        `- blockedFromRuntime: ${report.summary.blockedFromRuntime}`,
        `- invalidActiveRows: ${report.summary.invalidActiveRows}`,
        `- autoPromotableRows: ${report.summary.autoPromotableRows}`,
        '',
        '## Guardrail',
        '',
        '- `review_needed` and `pending` rows are not applied by the runtime official-coordinate override loader.',
        '- This report never changes `status` and never promotes rows to `active`.',
        '- Promotion still requires manual source review and the existing reviewed-promotion flow.',
        '',
        '## Counts',
        '',
        `- byStatus: ${formatJson(report.counts.byStatus)}`,
        `- byRegion: ${formatJson(report.counts.byRegion)}`,
        `- byPurpose: ${formatJson(report.counts.byPurpose)}`,
        `- byReviewPriority: ${formatJson(report.counts.byReviewPriority)}`,
        `- byDistanceBucket: ${formatJson(report.counts.byDistanceBucket)}`,
        '',
        '## Top Manual Review Targets',
        '',
        '| Priority | ID | Name | Region | Distance | Score | Purpose | Matched Address |',
        '| --- | --- | --- | --- | ---: | ---: | --- | --- |',
        ...report.topReviewTargets.map((target) => [
            target.priority,
            target.id,
            target.name,
            target.region,
            target.matchedDistanceM ?? '-',
            target.matchedScore ?? '-',
            target.matchedPurpose || '-',
            target.matchedAddress || '-',
        ].map(escapeMd).join(' | ').replace(/^/, '| ').replace(/$/, ' |')),
        '',
    ];
    fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
}

function run() {
    const options = parseArgs(process.argv.slice(2));
    const report = summarize(options);

    if (report.errors.length) {
        throw new Error(`active coordinate guardrail errors: ${report.errors.map((item) => `${item.id || item.rowNumber}: ${item.error}`).join('; ')}`);
    }
    if (report.duplicates.length) {
        throw new Error(`duplicate coordinate IDs: ${report.duplicates.map((item) => `${item.id}(${item.count})`).join(', ')}`);
    }

    if (options.write) {
        fs.writeFileSync(options.jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
        writeTargetsCsv(report.reviewTargets, options.rowsCsvPath);
        writeMarkdown(report, options.markdownPath, options.rowsCsvPath);
    }

    console.log(JSON.stringify({
        mode: options.write ? 'write' : 'check',
        output: {
            json: options.write ? options.jsonPath : null,
            markdown: options.write ? options.markdownPath : null,
            rowsCsv: options.write ? options.rowsCsvPath : null,
        },
        nextAction: report.nextAction,
        summary: report.summary,
        counts: {
            byStatus: report.counts.byStatus,
            byReviewPriority: report.counts.byReviewPriority,
        },
    }, null, 2));
}

if (require.main === module) {
    run();
}

module.exports = {
    parseCsv,
    priorityFor,
    summarize,
};
