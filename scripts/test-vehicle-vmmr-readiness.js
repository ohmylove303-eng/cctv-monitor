const assert = require('node:assert/strict');

const { validateReadiness } = require('./validate-vehicle-vmmr-readiness');

function baseReadiness(overrides = {}) {
    return {
        schemaVersion: 1,
        taxonomy: 'vehicle_vmmr_readiness_v1',
        policy: {
            noMakeModelWithoutValidatedModel: true,
            activationMetric: 'mAP50',
            activationThreshold: 0.85,
        },
        datasets: [
            {
                id: 'unit-dataset-001',
                sourceName: 'unit fixture',
                sourceType: 'manual_fixture',
                licenseStatus: 'approved',
                reviewStatus: 'approved',
                sampleCount: 90,
                evidence: {
                    datasetPath: '/unit/vehicle-vmmr',
                    reviewer: 'unit-auditor',
                    reviewedAt: '2026-04-29',
                },
            },
        ],
        modelReports: [
            {
                id: 'unit-model-001',
                status: 'active',
                modelFamily: 'unit-yolo',
                weightsPath: '/unit/best.pt',
                datasetIds: ['unit-dataset-001'],
                metrics: {
                    overallMap50: 0.9,
                    map50_95: 0.71,
                    precision: 0.89,
                    recall: 0.88,
                },
                classes: [
                    {
                        name: 'suv_domestic',
                        role: 'body_type',
                        map50: 0.86,
                        testSamples: 30,
                    },
                ],
                evidence: {
                    reportPath: '/unit/reports/backtest.json',
                    reviewer: 'unit-auditor',
                    reviewedAt: '2026-04-29',
                },
            },
        ],
        ...overrides,
    };
}

validateReadiness(baseReadiness());

assert.throws(
    () => validateReadiness(baseReadiness({
        modelReports: [
            {
                ...baseReadiness().modelReports[0],
                metrics: {
                    ...baseReadiness().modelReports[0].metrics,
                    overallMap50: 0.84,
                },
            },
        ],
    })),
    /overallMap50 must be >= 0.85/
);

assert.throws(
    () => validateReadiness(baseReadiness({
        modelReports: [
            {
                ...baseReadiness().modelReports[0],
                classes: [
                    {
                        name: 'suv_domestic',
                        role: 'body_type',
                        map50: 0.84,
                        testSamples: 30,
                    },
                ],
            },
        ],
    })),
    /classes\[0\]\.map50 must be >= 0.85/
);

assert.throws(
    () => validateReadiness(baseReadiness({
        modelReports: [
            {
                ...baseReadiness().modelReports[0],
                datasetIds: ['missing-dataset'],
            },
        ],
    })),
    /references unknown dataset/
);

assert.throws(
    () => validateReadiness(baseReadiness({
        modelReports: [
            {
                ...baseReadiness().modelReports[0],
                fixture: true,
            },
        ],
    })),
    /fixture entries are not allowed/
);
validateReadiness(baseReadiness({
    modelReports: [
        {
            ...baseReadiness().modelReports[0],
            fixture: true,
        },
    ],
}), { allowFixture: true });

console.log('ok - vehicle VMMR readiness guardrails passed');
