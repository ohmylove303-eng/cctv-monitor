const assert = require('node:assert/strict');

const { buildVehicleReidReadiness } = require('./build-vehicle-reid-readiness');

const empty = buildVehicleReidReadiness({
    schemaVersion: 1,
    taxonomy: 'vehicle_reid_readiness_v1',
    policy: {
        noIdentityMatchWithoutValidatedEmbedding: true,
        activationMetric: 'top1Accuracy',
        activationThreshold: 0.85,
        maxFalsePositiveRate: 0.05,
    },
    datasets: [],
    modelReports: [],
});

assert.equal(empty.status, 'empty');
assert.equal(empty.active_model_count, 0);
assert.equal(empty.same_vehicle_reid_ready, false);

const fixture = buildVehicleReidReadiness(require('../data/vehicle-reid-readiness.fixture.json'), {
    allowFixture: true,
});

assert.equal(fixture.status, 'active_report_ready');
assert.equal(fixture.active_model_count, 1);
assert.equal(fixture.same_vehicle_reid_ready, true);

console.log('ok - vehicle ReID readiness builder passed');
