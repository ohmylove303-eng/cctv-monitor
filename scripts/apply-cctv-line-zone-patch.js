const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { buildCatalogFromReview, parseCsv } = require('./promote-cctv-vision-calibration-review');
const {
    ALLOWED_DIRECTION_STATUS,
    ALLOWED_IDENTIFICATION_USE,
    ALLOWED_TIERS,
} = require('./validate-cctv-vision-calibration');

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DEFAULT_WORKLIST = path.join(DATA_DIR, 'cctv-vision-calibration-review-worklist.csv');
const DEFAULT_PATCH = path.join(DATA_DIR, 'cctv-vision-line-zone-patch.csv');
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

const MERGE_COLUMNS = [
    'reviewStatus',
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

const ALLOWED_REVIEW_STATUS = new Set(['active', 'review_needed', 'pending', 'rejected', 'keep_hidden']);

function parseArgs(argv) {
    const options = {
        allowActive: false,
        apply: false,
        minSampleCount: DEFAULT_MIN_SAMPLE_COUNT,
        outputCsvPath: null,
        patchCsvPath: DEFAULT_PATCH,
        worklistCsvPath: DEFAULT_WORKLIST,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--apply') {
            options.apply = true;
        } else if (arg === '--allow-active') {
            options.allowActive = true;
        } else if (arg === '--check') {
            options.apply = false;
        } else if (arg === '--worklist-csv') {
            options.worklistCsvPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--patch-csv') {
            options.patchCsvPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--output-csv') {
            options.outputCsvPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--min-sample-count') {
            options.minSampleCount = Number(argv[++index]);
        } else if (arg === '--help' || arg === '-h') {
            console.log([
                'Usage: node scripts/apply-cctv-line-zone-patch.js [options]',
                '',
                'Options:',
                '  --patch-csv <path>       CSV copied from line-zone-review.html',
                '  --worklist-csv <path>    Review worklist to patch',
                '  --output-csv <path>      Write destination when --apply is used',
                '  --apply                  Write the merged CSV; default is dry-run',
                '  --allow-active           Preserve patch reviewStatus=active',
                '  --min-sample-count <n>   Active gate sample threshold',
            ].join('\n'));
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    assert.ok(Number.isInteger(options.minSampleCount), '--min-sample-count must be an integer');
    assert.ok(options.minSampleCount > 0, '--min-sample-count must be positive');
    options.outputCsvPath = options.outputCsvPath ?? options.worklistCsvPath;
    return options;
}

function clean(value) {
    return String(value ?? '').trim();
}

function toObjects(rows, label) {
    assert.ok(rows.length > 0, `${label} must include a header row`);
    const headers = rows[0].map((value) => clean(value));
    for (const header of HEADERS) {
        assert.ok(headers.includes(header), `${label} missing column: ${header}`);
    }

    return rows.slice(1)
        .map((values, index) => {
            assert.ok(values.length <= headers.length, `${label} row ${index + 2} has too many columns`);
            return Object.fromEntries(headers.map((header, headerIndex) => [header, values[headerIndex] ?? '']));
        })
        .filter((row) => Object.values(row).some((value) => clean(value).length > 0));
}

function readCsvObjects(filePath, label) {
    assert.ok(fs.existsSync(filePath), `${label} does not exist: ${filePath}`);
    return toObjects(parseCsv(fs.readFileSync(filePath, 'utf8')), label);
}

function escapeCsv(value) {
    const text = String(value ?? '');
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function writeCsv(filePath, rows) {
    const csv = [
        HEADERS.join(','),
        ...rows.map((row) => HEADERS.map((header) => escapeCsv(row[header])).join(',')),
    ].join('\n');
    fs.writeFileSync(filePath, `${csv}\n`, 'utf8');
}

function parsePositiveNumber(value, label) {
    const text = clean(value);
    if (!text) {
        return null;
    }
    const parsed = Number(text);
    assert.ok(Number.isFinite(parsed) && parsed > 0, `${label} must be positive`);
    return parsed;
}

function parsePositiveInteger(value, label) {
    const text = clean(value);
    if (!text) {
        return null;
    }
    const parsed = Number(text);
    assert.ok(Number.isInteger(parsed) && parsed > 0, `${label} must be a positive integer`);
    return parsed;
}

function parseLineZoneText(value, label, width, height) {
    const text = clean(value);
    if (!text) {
        return null;
    }
    const points = text.split(';').map((pointText) => pointText.split(',').map((token) => Number(token.trim())));
    assert.equal(points.length, 2, `${label} must use x1,y1;x2,y2`);
    points.forEach((point, pointIndex) => {
        assert.equal(point.length, 2, `${label} point ${pointIndex + 1} must use x,y`);
        const [x, y] = point;
        assert.ok(Number.isFinite(x) && Number.isFinite(y), `${label} point ${pointIndex + 1} must be numeric`);
        if (width) {
            assert.ok(x >= 0 && x <= width, `${label} point ${pointIndex + 1} x outside frame`);
        }
        if (height) {
            assert.ok(y >= 0 && y <= height, `${label} point ${pointIndex + 1} y outside frame`);
        }
    });
    return points;
}

function validatePatchRow(row, rowNumber) {
    const id = clean(row.cctvId);
    if (!id) {
        return false;
    }

    const status = clean(row.reviewStatus);
    if (status) {
        assert.ok(ALLOWED_REVIEW_STATUS.has(status), `patch row ${rowNumber}: reviewStatus is not allowed`);
    }

    const visionTier = clean(row.visionTier);
    const identificationUse = clean(row.identificationUse);
    const directionStatus = clean(row.directionCalibrationStatus);
    const width = parsePositiveInteger(row.resolutionWidth, `patch row ${rowNumber}: resolutionWidth`);
    const height = parsePositiveInteger(row.resolutionHeight, `patch row ${rowNumber}: resolutionHeight`);
    const distance = parsePositiveNumber(row.approachDistanceMeters, `patch row ${rowNumber}: approachDistanceMeters`);

    if (visionTier) {
        assert.ok(ALLOWED_TIERS.has(visionTier), `patch row ${rowNumber}: visionTier is not allowed`);
    }
    if (identificationUse) {
        assert.ok(ALLOWED_IDENTIFICATION_USE.has(identificationUse), `patch row ${rowNumber}: identificationUse is not allowed`);
    }
    if (directionStatus) {
        assert.ok(ALLOWED_DIRECTION_STATUS.has(directionStatus), `patch row ${rowNumber}: directionCalibrationStatus is not allowed`);
    }

    if (visionTier === 'tier_a') {
        assert.equal(identificationUse, 'fine_grained_vehicle', `patch row ${rowNumber}: tier_a requires fine_grained_vehicle`);
        assert.ok(distance === null || distance <= 20, `patch row ${rowNumber}: tier_a requires approachDistanceMeters <= 20`);
        assert.ok(height === null || height >= 1080, `patch row ${rowNumber}: tier_a requires resolutionHeight >= 1080`);
    } else if (visionTier === 'tier_b') {
        assert.equal(identificationUse, 'vehicle_shape_direction', `patch row ${rowNumber}: tier_b requires vehicle_shape_direction`);
        assert.ok(distance === null || (distance > 20 && distance <= 80), `patch row ${rowNumber}: tier_b requires 20 < approachDistanceMeters <= 80`);
    } else if (visionTier === 'tier_c') {
        assert.equal(identificationUse, 'traffic_flow_only', `patch row ${rowNumber}: tier_c requires traffic_flow_only`);
        assert.ok(distance === null || height === null || distance > 80 || height < 720, `patch row ${rowNumber}: tier_c requires distance > 80m or resolutionHeight < 720`);
    }

    parseLineZoneText(row.lineZoneForward, `patch row ${rowNumber}: lineZoneForward`, width, height);
    parseLineZoneText(row.lineZoneReverse, `patch row ${rowNumber}: lineZoneReverse`, width, height);
    if (directionStatus === 'calibrated') {
        assert.ok(clean(row.lineZoneForward), `patch row ${rowNumber}: calibrated requires lineZoneForward`);
        assert.ok(clean(row.lineZoneReverse), `patch row ${rowNumber}: calibrated requires lineZoneReverse`);
    }

    return true;
}

function appendNote(existing, note) {
    const current = clean(existing);
    return current ? `${current}; ${note}` : note;
}

function mergeRows(worklistRows, patchRows, options) {
    const rows = worklistRows.map((row) => ({ ...row }));
    const indexById = new Map();
    rows.forEach((row, index) => {
        const id = clean(row.cctvId);
        assert.ok(id, `worklist row ${index + 2}: cctvId is required`);
        assert.ok(!indexById.has(id), `worklist row ${index + 2}: duplicate cctvId ${id}`);
        indexById.set(id, index);
    });

    const seenPatchIds = new Set();
    let applied = 0;
    let activeBlocked = 0;
    const patchedIds = [];

    patchRows.forEach((patchRow, patchIndex) => {
        const rowNumber = patchIndex + 2;
        if (!validatePatchRow(patchRow, rowNumber)) {
            return;
        }

        const id = clean(patchRow.cctvId);
        assert.ok(!seenPatchIds.has(id), `patch row ${rowNumber}: duplicate cctvId ${id}`);
        seenPatchIds.add(id);
        assert.ok(indexById.has(id), `patch row ${rowNumber}: cctvId not found in worklist: ${id}`);

        const target = rows[indexById.get(id)];
        for (const column of MERGE_COLUMNS) {
            const value = clean(patchRow[column]);
            if (value) {
                target[column] = value;
            }
        }

        if (target.reviewStatus === 'active' && !options.allowActive) {
            target.reviewStatus = 'review_needed';
            target.notes = appendNote(target.notes, 'active_status_blocked_by_apply_patch_without_allow_active');
            activeBlocked += 1;
        }

        applied += 1;
        patchedIds.push(id);
    });

    buildCatalogFromReview(rows, {
        catalogPath: path.join(DATA_DIR, 'cctv-vision-calibration.json'),
        minSampleCount: options.minSampleCount,
    });

    return {
        rows,
        summary: {
            activeBlocked,
            applied,
            outputReviewStatus: options.allowActive ? 'preserve_patch_status' : 'active_forced_to_review_needed',
            patchedIds,
            worklistRows: rows.length,
        },
    };
}

function run() {
    const options = parseArgs(process.argv.slice(2));
    const worklistRows = readCsvObjects(options.worklistCsvPath, 'worklist CSV');
    const patchRows = readCsvObjects(options.patchCsvPath, 'patch CSV');
    const result = mergeRows(worklistRows, patchRows, options);

    if (options.apply) {
        writeCsv(options.outputCsvPath, result.rows);
    }

    console.log(JSON.stringify({
        mode: options.apply ? 'apply' : 'dry-run',
        input: {
            worklistCsv: options.worklistCsvPath,
            patchCsv: options.patchCsvPath,
        },
        output: {
            csv: options.apply ? options.outputCsvPath : null,
        },
        summary: result.summary,
    }, null, 2));
}

if (require.main === module) {
    run();
}

module.exports = {
    HEADERS,
    mergeRows,
    parseLineZoneText,
};
