const fs = require('node:fs');
const path = require('node:path');

const { buildCatalogFromReview, parseCsv } = require('./promote-vehicle-reference-review');

const DEFAULT_REVIEW_CSV = path.resolve(__dirname, '../data/vehicle-reference-review-template.csv');
const DEFAULT_CATALOG = path.resolve(__dirname, '../data/vehicle-reference-catalog.json');

function parseArgs(argv) {
    const options = {
        reviewCsvPath: DEFAULT_REVIEW_CSV,
        catalogPath: DEFAULT_CATALOG,
        write: true,
        allowFixture: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--review-csv') {
            options.reviewCsvPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--catalog') {
            options.catalogPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--check') {
            options.write = false;
        } else if (arg === '--write') {
            options.write = true;
        } else if (arg === '--allow-fixture') {
            options.allowFixture = true;
        } else if (arg === '--help' || arg === '-h') {
            console.log('Usage: node scripts/build-vehicle-reference-catalog.js [--check|--write] [--review-csv data/vehicle-reference-review-template.csv] [--catalog data/vehicle-reference-catalog.json] [--allow-fixture]');
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function loadReviewRows(reviewCsvPath) {
    if (!reviewCsvPath || !fs.existsSync(reviewCsvPath)) {
        return [];
    }
    const text = fs.readFileSync(reviewCsvPath, 'utf8');
    return parseCsv(text);
}

function toObjects(rows) {
    if (!Array.isArray(rows) || rows.length === 0) {
        return [];
    }

    const header = rows[0].map((value) => String(value ?? '').trim());
    return rows.slice(1).map((values) => Object.fromEntries(header.map((column, index) => [column, values[index] ?? ''])));
}

function buildVehicleReferenceCatalog(reviewCsvPath, options = {}) {
    const rows = toObjects(loadReviewRows(reviewCsvPath));
    const catalog = buildCatalogFromReview(rows, {
        catalogPath: options.catalogPath ?? DEFAULT_CATALOG,
        minSampleCount: options.minSampleCount ?? 3,
    });
    return catalog;
}

function run() {
    const options = parseArgs(process.argv.slice(2));
    const catalog = buildVehicleReferenceCatalog(options.reviewCsvPath, {
        catalogPath: options.catalogPath,
    });

    if (options.write) {
        fs.writeFileSync(options.catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
    }

    console.log(`ok - vehicle reference catalog builder ${catalog.entries.length > 0 ? 'ready' : 'pending'} (${catalog.entries.length} active entries)`);
}

if (require.main === module) {
    try {
        run();
    } catch (error) {
        console.error(error.message || String(error));
        process.exit(1);
    }
}

module.exports = {
    buildVehicleReferenceCatalog,
};
