const assert = require('node:assert/strict');

const { buildVehicleVmmrReadiness } = require('./build-vehicle-vmmr-readiness');

const empty = buildVehicleVmmrReadiness({
    schemaVersion: 1,
    taxonomy: 'vehicle_vmmr_readiness_v1',
    policy: {
        noMakeModelWithoutValidatedModel: true,
        activationMetric: 'mAP50',
        activationThreshold: 0.85,
    },
    datasets: [],
    modelReports: [],
});

assert.equal(empty.status, 'empty');
assert.equal(empty.active_model_count, 0);
assert.equal(empty.fine_grained_model_ready, false);

const fixture = buildVehicleVmmrReadiness(require('../data/vehicle-vmmr-readiness.fixture.json'), {
    allowFixture: true,
});

assert.equal(fixture.status, 'active_report_ready');
assert.equal(fixture.active_model_count, 1);
assert.equal(fixture.fine_grained_model_ready, true);

console.log('ok - vehicle VMMR readiness builder passed');
