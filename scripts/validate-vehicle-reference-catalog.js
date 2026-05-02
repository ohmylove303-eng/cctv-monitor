const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PATH = path.resolve(__dirname, '../data/vehicle-reference-catalog.json');
const ALLOWED_GENERIC_TYPES = new Set(['car', 'truck', 'bus', 'motorcycle', 'van', 'taxi', 'unknown']);

function assertNonEmptyString(value, label) {
    assert.equal(typeof value, 'string', `${label} must be a string`);
    assert.ok(value.trim().length > 0, `${label} must not be empty`);
}

function validateCatalog(catalog, options = {}) {
    assert.equal(catalog.schemaVersion, 1, 'schemaVersion must be 1');
    assert.equal(catalog.taxonomy, 'verified_vehicle_reference_v1', 'taxonomy mismatch');
    assert.ok(Array.isArray(catalog.entries), 'entries must be an array');

    const ids = new Set();
    for (const [index, entry] of catalog.entries.entries()) {
        const prefix = `entries[${index}]`;
        assertNonEmptyString(entry.id, `${prefix}.id`);
        assert.ok(!ids.has(entry.id), `${prefix}.id must be unique`);
        ids.add(entry.id);
        assert.ok(options.allowFixture || entry.fixture !== true, `${prefix}.fixture entries are not allowed in production catalog`);

        assert.ok(ALLOWED_GENERIC_TYPES.has(entry.genericVehicleType), `${prefix}.genericVehicleType is not allowed`);
        assertNonEmptyString(entry.make, `${prefix}.make`);
        assertNonEmptyString(entry.model, `${prefix}.model`);
        assertNonEmptyString(entry.market, `${prefix}.market`);
        assert.equal(typeof entry.evidence, 'object', `${prefix}.evidence is required`);
        assertNonEmptyString(entry.evidence.source, `${prefix}.evidence.source`);
        assertNonEmptyString(entry.evidence.verificationMethod, `${prefix}.evidence.verificationMethod`);
        assert.equal(typeof entry.evidence.sampleCount, 'number', `${prefix}.evidence.sampleCount must be a number`);
        assert.ok(entry.evidence.sampleCount > 0, `${prefix}.evidence.sampleCount must be positive`);
    }
}

function run() {
    const args = process.argv.slice(2);
    const allowFixture = args.includes('--allow-fixture');
    const pathArg = args.find((arg) => !arg.startsWith('--'));
    const catalogPath = pathArg ? path.resolve(process.cwd(), pathArg) : DEFAULT_PATH;
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    validateCatalog(catalog, { allowFixture });
    console.log(`ok - vehicle reference catalog valid (${catalog.entries.length} entries)`);
}

if (require.main === module) {
    run();
}

module.exports = {
    ALLOWED_GENERIC_TYPES,
    validateCatalog,
};
