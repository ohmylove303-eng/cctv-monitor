const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ALLOWED_GENERIC_TYPES, validateCatalog } = require('./validate-vehicle-reference-catalog');

const DEFAULT_REVIEW_CSV = path.resolve(__dirname, '../data/vehicle-reference-review-template.csv');
const DEFAULT_CATALOG = path.resolve(__dirname, '../data/vehicle-reference-catalog.json');
const DEFAULT_MIN_SAMPLE_COUNT = 3;
const REQUIRED_COLUMNS = [
    'reviewStatus',
    'id',
    'genericVehicleType',
    'make',
    'model',
    'subtype',
    'market',
    'evidenceSource',
    'verificationMethod',
    'sampleCount',
    'datasetPath',
    'reviewer',
    'reviewedAt',
    'notes',
];
const ALLOWED_STATUSES = new Set(['active', 'review_needed', 'pending', 'rejected', 'keep_hidden']);

function parseArgs(argv) {
    const options = {
        catalogPath: DEFAULT_CATALOG,
        minSampleCount: DEFAULT_MIN_SAMPLE_COUNT,
        reviewCsvPath: DEFAULT_REVIEW_CSV,
        write: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--write') {
            options.write = true;
        } else if (arg === '--check') {
            options.write = false;
        } else if (arg === '--review-csv') {
            options.reviewCsvPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--catalog') {
            options.catalogPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--min-sample-count') {
            options.minSampleCount = Number(argv[++index]);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    assert.ok(Number.isInteger(options.minSampleCount), '--min-sample-count must be an integer');
    assert.ok(options.minSampleCount > 0, '--min-sample-count must be positive');
    return options;
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const input = text.replace(/^\uFEFF/, '');

    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        const next = input[index + 1];
        if (char === '"') {
            if (inQuotes && next === '"') {
                field += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push(field);
            field = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') {
                index += 1;
            }
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += char;
        }
    }

    assert.equal(inQuotes, false, 'CSV has an unterminated quoted field');
    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows.filter((candidate) => candidate.some((value) => value.trim().length > 0));
}

function toObjects(rows) {
    assert.ok(rows.length > 0, 'review CSV must include a header row');
    const header = rows[0].map((value) => value.trim());
    for (const column of REQUIRED_COLUMNS) {
        assert.ok(header.includes(column), `review CSV missing column: ${column}`);
    }

    return rows.slice(1).map((values, rowIndex) => {
        assert.ok(values.length <= header.length, `row ${rowIndex + 2} has too many columns`);
        return Object.fromEntries(header.map((column, index) => [column, values[index] ?? '']));
    });
}

function clean(value) {
    return String(value ?? '').trim();
}

function assertPresent(row, field, rowNumber) {
    const value = clean(row[field]);
    assert.ok(value.length > 0, `row ${rowNumber}: ${field} is required for active review`);
    return value;
}

function parseReviewedAt(value, rowNumber) {
    assert.match(value, /^\d{4}-\d{2}-\d{2}$/, `row ${rowNumber}: reviewedAt must be YYYY-MM-DD`);
    const parsed = new Date(`${value}T00:00:00.000Z`);
    assert.equal(parsed.toISOString().slice(0, 10), value, `row ${rowNumber}: reviewedAt is not a valid date`);
    return value;
}

function parseSampleCount(value, minSampleCount, rowNumber) {
    assert.match(value, /^\d+$/, `row ${rowNumber}: sampleCount must be a positive integer`);
    const sampleCount = Number(value);
    assert.ok(sampleCount >= minSampleCount, `row ${rowNumber}: sampleCount must be at least ${minSampleCount}`);
    return sampleCount;
}

function makeEntry(row, rowNumber, minSampleCount) {
    const genericVehicleType = assertPresent(row, 'genericVehicleType', rowNumber);
    assert.ok(ALLOWED_GENERIC_TYPES.has(genericVehicleType), `row ${rowNumber}: genericVehicleType is not allowed`);

    const entry = {
        id: assertPresent(row, 'id', rowNumber),
        genericVehicleType,
        make: assertPresent(row, 'make', rowNumber),
        model: assertPresent(row, 'model', rowNumber),
        market: assertPresent(row, 'market', rowNumber),
        evidence: {
            source: assertPresent(row, 'evidenceSource', rowNumber),
            verificationMethod: assertPresent(row, 'verificationMethod', rowNumber),
            sampleCount: parseSampleCount(assertPresent(row, 'sampleCount', rowNumber), minSampleCount, rowNumber),
            datasetPath: assertPresent(row, 'datasetPath', rowNumber),
            reviewer: assertPresent(row, 'reviewer', rowNumber),
            reviewedAt: parseReviewedAt(assertPresent(row, 'reviewedAt', rowNumber), rowNumber),
        },
    };

    const subtype = clean(row.subtype);
    if (subtype) {
        entry.subtype = subtype;
    }
    const notes = clean(row.notes);
    if (notes) {
        entry.evidence.notes = notes;
    }
    return entry;
}

function buildCatalogFromReview(rows, options) {
    const entries = [];
    const ids = new Set();

    rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const status = clean(row.reviewStatus);
        const hasData = Object.entries(row).some(([key, value]) => key !== 'reviewStatus' && clean(value).length > 0);

        if (!status) {
            assert.ok(!hasData, `row ${rowNumber}: reviewStatus is required when row has data`);
            return;
        }
        assert.ok(ALLOWED_STATUSES.has(status), `row ${rowNumber}: reviewStatus is not allowed`);
        if (status !== 'active') {
            return;
        }

        const entry = makeEntry(row, rowNumber, options.minSampleCount);
        assert.ok(!ids.has(entry.id), `row ${rowNumber}: duplicate id ${entry.id}`);
        ids.add(entry.id);
        entries.push(entry);
    });

    const existingCatalog = fs.existsSync(options.catalogPath)
        ? JSON.parse(fs.readFileSync(options.catalogPath, 'utf8'))
        : {};
    const catalog = {
        schemaVersion: 1,
        taxonomy: 'verified_vehicle_reference_v1',
        policy: existingCatalog.policy ?? {
            noInferenceWithoutEvidence: true,
            minimumEvidence: 'verified_dataset_or_manual_review',
        },
        entries,
    };
    validateCatalog(catalog);
    return catalog;
}

function run() {
    const options = parseArgs(process.argv.slice(2));
    const rows = toObjects(parseCsv(fs.readFileSync(options.reviewCsvPath, 'utf8')));
    const catalog = buildCatalogFromReview(rows, options);

    if (options.write) {
        fs.writeFileSync(options.catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
        console.log(`ok - promoted ${catalog.entries.length} active vehicle reference rows`);
    } else {
        console.log(`ok - vehicle reference review valid (${catalog.entries.length} active rows, dry run)`);
    }
}

if (require.main === module) {
    run();
}

module.exports = {
    buildCatalogFromReview,
    parseCsv,
};
