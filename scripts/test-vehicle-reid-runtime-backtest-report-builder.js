const assert = require('node:assert/strict');

const { buildVehicleReidRuntimeBacktestReportFromData } = require('./build-vehicle-reid-runtime-backtest-report');
const { validateBacktestReport } = require('./validate-vehicle-reid-runtime-backtest-report');

const empty = buildVehicleReidRuntimeBacktestReportFromData([], [], {
    samplesPath: '/tmp/vehicle-reid-backtest-samples.template.csv',
    observationsPath: '/tmp/vehicle-reid-backtest-observations.json',
    outputPath: '/tmp/vehicle-reid-runtime-backtest-report.json',
    runtimeBackend: 'baseline',
    matchThreshold: 0.86,
});

assert.equal(empty.active_report_count, 0);
assert.equal(empty.reports[0].status, 'pending_review');
assert.equal(empty.reports[0].summary.sampleCountTotal, 0);

const samples = [
    {
        sampleId: 'reid-001',
        identityId: 'identity-a',
        bucket: 'day',
        cctvId: 'cctv-001',
        cropPath: '/samples/reid-001.png',
        observedAt: '2026-05-01T00:00:00Z',
        vehicleType: 'sedan',
        reviewer: 'auditor',
        reviewedAt: '2026-05-01',
        notes: '',
    },
    {
        sampleId: 'reid-002',
        identityId: 'identity-a',
        bucket: 'night',
        cctvId: 'cctv-002',
        cropPath: '/samples/reid-002.png',
        observedAt: '2026-05-01T00:01:00Z',
        vehicleType: 'sedan',
        reviewer: 'auditor',
        reviewedAt: '2026-05-01',
        notes: '',
    },
    {
        sampleId: 'reid-003',
        identityId: 'identity-b',
        bucket: 'cross_camera',
        cctvId: 'cctv-003',
        cropPath: '/samples/reid-003.png',
        observedAt: '2026-05-01T00:02:00Z',
        vehicleType: 'suv',
        reviewer: 'auditor',
        reviewedAt: '2026-05-01',
        notes: '',
    },
];

const observations = [
    {
        sampleId: 'reid-001',
        matchStatus: 'unmatched',
        matchScore: null,
        galleryEntriesBefore: 0,
        galleryEntriesAfter: 1,
        storedEntryId: 'entry-001',
        engine: 'baseline',
    },
    {
        sampleId: 'reid-002',
        matchStatus: 'matched',
        bestMatchSampleId: 'reid-001',
        matchScore: 0.99,
        galleryEntriesBefore: 1,
        galleryEntriesAfter: 2,
        storedEntryId: 'entry-002',
        engine: 'baseline',
    },
    {
        sampleId: 'reid-003',
        matchStatus: 'unmatched',
        matchScore: null,
        galleryEntriesBefore: 2,
        galleryEntriesAfter: 3,
        storedEntryId: 'entry-003',
        engine: 'baseline',
    },
];

const report = buildVehicleReidRuntimeBacktestReportFromData(samples, observations, {
    samplesPath: '/tmp/vehicle-reid-backtest-samples.csv',
    observationsPath: '/tmp/vehicle-reid-backtest-observations.json',
    outputPath: '/tmp/vehicle-reid-runtime-backtest-report.json',
    runtimeBackend: 'baseline',
    matchThreshold: 0.95,
});

validateBacktestReport(report);
assert.equal(report.active_report_count, 0);
assert.equal(report.reports[0].status, 'review_needed');
assert.equal(report.reports[0].summary.sampleCountTotal, 3);
assert.equal(report.reports[0].summary.reviewedSampleCount, 3);
assert.equal(report.reports[0].summary.matchSuccessRate, 1);
assert.equal(report.reports[0].summary.falsePositiveRate, 0);
assert.equal(report.reports[0].summary.galleryGrowth, 3);

console.log('ok - vehicle ReID runtime backtest report builder checks passed');
