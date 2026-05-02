const assert = require('node:assert/strict');

const { validateReadiness } = require('./validate-vehicle-reid-readiness');

const baseDataset = {
    id: 'dataset-001',
    sourceName: 'reviewed-reid-dataset',
    sourceType: 'manual_review',
    licenseStatus: 'approved',
    reviewStatus: 'approved',
    identityCount: 40,
    imageCount: 160,
    cameraCount: 4,
    evidence: {
        datasetPath: '/verified/reid-dataset',
        reviewer: 'auditor',
        reviewedAt: '2026-04-29',
    },
};

const activeReport = {
    id: 'reid-model-001',
    status: 'active',
    modelFamily: 'embedding-reid',
    weightsPath: '/verified/reid/best.pt',
    embeddingDimension: 512,
    datasetIds: ['dataset-001'],
    metrics: {
        top1Accuracy: 0.9,
        meanAveragePrecision: 0.81,
        crossCameraAccuracy: 0.87,
        precision: 0.9,
        recall: 0.86,
        falsePositiveRate: 0.03,
    },
    evidence: {
        reportPath: '/verified/reports/reid-backtest.json',
        reviewer: 'auditor',
        reviewedAt: '2026-04-29',
    },
};

const activeReadiness = {
    schemaVersion: 1,
    taxonomy: 'vehicle_reid_readiness_v1',
    policy: {
        noIdentityMatchWithoutValidatedEmbedding: true,
        activationMetric: 'top1Accuracy',
        activationThreshold: 0.85,
        maxFalsePositiveRate: 0.05,
    },
    datasets: [baseDataset],
    modelReports: [activeReport],
};

validateReadiness({
    ...activeReadiness,
    datasets: [],
    modelReports: [],
});
validateReadiness(activeReadiness);

assert.throws(
    () => validateReadiness({
        ...activeReadiness,
        modelReports: [{
            ...activeReport,
            metrics: {
                ...activeReport.metrics,
                crossCameraAccuracy: 0.72,
            },
        }],
    }),
    /crossCameraAccuracy must be >= 0.85/
);

assert.throws(
    () => validateReadiness({
        ...activeReadiness,
        modelReports: [{
            ...activeReport,
            metrics: {
                ...activeReport.metrics,
                falsePositiveRate: 0.12,
            },
        }],
    }),
    /falsePositiveRate must be <= 0.05/
);

assert.throws(
    () => validateReadiness({
        ...activeReadiness,
        modelReports: [{
            ...activeReport,
            datasetIds: ['missing-dataset'],
        }],
    }),
    /references unknown dataset/
);

console.log('ok - vehicle ReID readiness harness passed');
