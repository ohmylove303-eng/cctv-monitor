const assert = require('node:assert/strict');

const { validateBacktestReport } = require('./validate-ocr-alpr-backtest-report');

function baseReport(overrides = {}) {
    return {
        schemaVersion: 1,
        taxonomy: 'ocr_alpr_backtest_report_v1',
        policy: {
            noRuntimeAccuracyApprovalWithoutReviewedReport: true,
            requiredBuckets: ['night', 'backlight', 'long_distance', 'low_resolution'],
            minSamplesPerBucket: 30,
            exactPlateAccuracyThreshold: 0.85,
            candidateRecallThreshold: 0.9,
            falsePositiveRateMax: 0.05,
        },
        reports: [
            {
                id: 'unit-ocr-alpr-report-001',
                status: 'active',
                engine: 'easyocr',
                datasetId: 'unit-ocr-alpr-dataset-001',
                engineComparisons: [
                    {
                        engine: 'easyocr',
                        sampleCount: 120,
                        exactPlateAccuracy: 0.86,
                        candidateRecall: 0.91,
                        falsePositiveRate: 0.04,
                    },
                    {
                        engine: 'paddleocr',
                        sampleCount: 120,
                        exactPlateAccuracy: 0.88,
                        candidateRecall: 0.92,
                        falsePositiveRate: 0.03,
                    },
                ],
                bucketResults: [
                    { bucket: 'night', sampleCount: 30, exactPlateAccuracy: 0.86, candidateRecall: 0.91, falsePositiveRate: 0.04 },
                    { bucket: 'backlight', sampleCount: 30, exactPlateAccuracy: 0.86, candidateRecall: 0.91, falsePositiveRate: 0.04 },
                    { bucket: 'long_distance', sampleCount: 30, exactPlateAccuracy: 0.85, candidateRecall: 0.9, falsePositiveRate: 0.05 },
                    { bucket: 'low_resolution', sampleCount: 30, exactPlateAccuracy: 0.86, candidateRecall: 0.91, falsePositiveRate: 0.04 },
                ],
                evidence: {
                    datasetPath: '/unit/ocr-alpr',
                    reportPath: '/unit/reports/ocr-alpr-backtest.json',
                    reviewer: 'unit-auditor',
                    reviewedAt: '2026-04-29',
                },
            },
        ],
        ...overrides,
    };
}

validateBacktestReport(baseReport());

assert.throws(
    () => validateBacktestReport(baseReport({
        reports: [
            {
                ...baseReport().reports[0],
                bucketResults: baseReport().reports[0].bucketResults.filter((result) => result.bucket !== 'night'),
            },
        ],
    })),
    /missing required bucket: night/
);

assert.throws(
    () => validateBacktestReport(baseReport({
        reports: [
            {
                ...baseReport().reports[0],
                bucketResults: [
                    { ...baseReport().reports[0].bucketResults[0], exactPlateAccuracy: 0.84 },
                    ...baseReport().reports[0].bucketResults.slice(1),
                ],
            },
        ],
    })),
    /exactPlateAccuracy must be >= 0.85/
);

assert.throws(
    () => validateBacktestReport(baseReport({
        reports: [
            {
                ...baseReport().reports[0],
                bucketResults: [
                    { ...baseReport().reports[0].bucketResults[0], falsePositiveRate: 0.06 },
                    ...baseReport().reports[0].bucketResults.slice(1),
                ],
            },
        ],
    })),
    /falsePositiveRate must be <= 0.05/
);

assert.throws(
    () => validateBacktestReport(baseReport({
        reports: [
            {
                ...baseReport().reports[0],
                fixture: true,
            },
        ],
    })),
    /fixture entries are not allowed/
);
validateBacktestReport(baseReport({
    reports: [
        {
            ...baseReport().reports[0],
            fixture: true,
        },
    ],
}), { allowFixture: true });

console.log('ok - OCR/ALPR backtest report guardrails passed');
