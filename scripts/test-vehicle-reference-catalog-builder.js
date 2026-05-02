const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { buildVehicleReferenceCatalog } = require('./build-vehicle-reference-catalog');

const emptyCatalog = buildVehicleReferenceCatalog(path.resolve(__dirname, '../data/vehicle-reference-review-template.csv'));
assert.equal(emptyCatalog.entries.length, 0);

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cctv-reference-'));
const reviewCsvPath = path.join(tempDir, 'vehicle-reference-review.csv');
fs.writeFileSync(
    reviewCsvPath,
    [
        'reviewStatus,id,genericVehicleType,make,model,subtype,market,evidenceSource,verificationMethod,sampleCount,datasetPath,reviewer,reviewedAt,notes',
        'active,fixture-reference-001,car,fixture-make,fixture-model,fixture-subtype,fixture-market,fixture-source,manual review,3,/fixture/vehicle-reference,fixture-auditor,2026-04-29,fixture note',
    ].join('\n'),
    'utf8',
);

const catalog = buildVehicleReferenceCatalog(reviewCsvPath);
assert.equal(catalog.entries.length, 1);
assert.equal(catalog.entries[0].id, 'fixture-reference-001');
assert.equal(catalog.entries[0].evidence.datasetPath, '/fixture/vehicle-reference');
assert.equal(catalog.entries[0].evidence.sampleCount, 3);

fs.rmSync(tempDir, { recursive: true, force: true });

console.log('ok - vehicle reference catalog builder passed');
