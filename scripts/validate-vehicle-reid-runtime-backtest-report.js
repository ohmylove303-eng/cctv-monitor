const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PATH = path.resolve(__dirname, '../data/vehicle-reid-runtime-backtest-report.json');
const REQUIRED_BUCKETS = ['day', 'night', 'cross_camera', 'long_distance', 'low_resolution'];
const ALLOWED_STATUS = new Set(['pending_review', 'review_needed', 'active', 'candidate', 'rejected', 'keep_hidden']);

function assertNonEmptyString(value, label) {
    assert.equal(typeof value, 'string', `${label} must be a string`);
    assert.ok(value.trim().length > 0, `${label} must not be empty`);
}

function assertNonNegativeInteger(value, label) {
    assert.equal(typeof value, 'number', `${label} must be a number`);
    assert.ok(Number.isInteger(value) && value >= 0, `${label} must be a non-negative integer`);
}

function assertPositiveInteger(value, label) {
    assert.equal(typeof value, 'number', `${label} must be a number`);
    assert.ok(Number.isInteger(value) && value > 0, `${label} must be a positive integer`);
}

function assertMetric(value, label) {
    assert.equal(typeof value, 'number', `${label} must be a number`);
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${label} must be between 0 and 1`);
}

function assertReviewedAt(value, label) {
    assertNonEmptyString(value, label);
    assert.match(value, /^\d{4}-\d{2}-\d{2}$/, `${label} must be YYYY-MM-DD`);
    const parsed = new Date(`${value}T00:00:00.000Z`);
    assert.equal(parsed.toISOString().slice(0, 10), value, `${label} must be a valid date`);
}

function validatePolicy(policy) {
    assert.equal(typeof policy, 'object', 'policy is required');
    assert.equal(policy.noRuntimeMatchApprovalWithoutReviewedReport, true, 'policy.noRuntimeMatchApprovalWithoutReviewedReport must be true');
    assert.ok(Array.isArray(policy.requiredBuckets), 'policy.requiredBuckets must be an array');
    for (const bucket of REQUIRED_BUCKETS) {
        assert.ok(policy.requiredBuckets.includes(bucket), `policy.requiredBuckets missing ${bucket}`);
    }
    assertPositiveInteger(policy.minSamplesPerBucket, 'policy.minSamplesPerBucket');
    assertPositiveInteger(policy.minSamplesTotal, 'policy.minSamplesTotal');
    assertMetric(policy.matchSuccessRateThreshold, 'policy.matchSuccessRateThreshold');
    assertMetric(policy.falsePositiveRateMax, 'policy.falsePositiveRateMax');
    assertMetric(policy.falseNegativeRateMax, 'policy.falseNegativeRateMax');
}

function validateEvidence(evidence, prefix) {
    assert.equal(typeof evidence, 'object', `${prefix}.evidence is required`);
    assertNonEmptyString(evidence.datasetPath, `${prefix}.evidence.datasetPath`);
    assertNonEmptyString(evidence.samplesPath, `${prefix}.evidence.samplesPath`);
    assertNonEmptyString(evidence.observationsPath, `${prefix}.evidence.observationsPath`);
    assertNonEmptyString(evidence.reportPath, `${prefix}.evidence.reportPath`);
    assertNonEmptyString(evidence.reviewer, `${prefix}.evidence.reviewer`);
    assertReviewedAt(evidence.reviewedAt, `${prefix}.evidence.reviewedAt`);
    assertNonEmptyString(evidence.generatedAt, `${prefix}.evidence.generatedAt`);
    assertNonEmptyString(evidence.runtimeBackend, `${prefix}.evidence.runtimeBackend`);
    assertMetric(evidence.matchThreshold, `${prefix}.evidence.matchThreshold`);
}

function validateBucketResult(result, prefix, policy, isActive) {
    assertNonEmptyString(result.bucket, `${prefix}.bucket`);
    assert.ok(policy.requiredBuckets.includes(result.bucket), `${prefix}.bucket is not required by policy`);
    assertNonNegativeInteger(result.sampleCount, `${prefix}.sampleCount`);
    assertNonNegativeInteger(result.reviewedSampleCount, `${prefix}.reviewedSampleCount`);
    assertNonNegativeInteger(result.missingObservationCount, `${prefix}.missingObservationCount`);
    assertNonNegativeInteger(result.expectedPositiveCount, `${prefix}.expectedPositiveCount`);
    assertNonNegativeInteger(result.expectedNegativeCount, `${prefix}.expectedNegativeCount`);
    assertNonNegativeInteger(result.truePositiveMatches, `${prefix}.truePositiveMatches`);
    assertNonNegativeInteger(result.trueNegativeUnmatched, `${prefix}.trueNegativeUnmatched`);
    assertNonNegativeInteger(result.falsePositiveMatches, `${prefix}.falsePositiveMatches`);
    assertNonNegativeInteger(result.falseNegativeUnmatched, `${prefix}.falseNegativeUnmatched`);
    assertMetric(result.matchSuccessRate, `${prefix}.matchSuccessRate`);
    assertMetric(result.falsePositiveRate, `${prefix}.falsePositiveRate`);
    assertMetric(result.falseNegativeRate, `${prefix}.falseNegativeRate`);

    if (!isActive) {
        return;
    }

    assert.ok(result.sampleCount >= policy.minSamplesPerBucket, `${prefix}.sampleCount must be >= ${policy.minSamplesPerBucket} for active report`);
    assert.ok(result.reviewedSampleCount === result.sampleCount, `${prefix}.reviewedSampleCount must equal sampleCount for active report`);
    assert.ok(result.missingObservationCount === 0, `${prefix}.missingObservationCount must be 0 for active report`);
    assert.ok(result.matchSuccessRate >= policy.matchSuccessRateThreshold, `${prefix}.matchSuccessRate must be >= ${policy.matchSuccessRateThreshold} for active report`);
    assert.ok(result.falsePositiveRate <= policy.falsePositiveRateMax, `${prefix}.falsePositiveRate must be <= ${policy.falsePositiveRateMax} for active report`);
    assert.ok(result.falseNegativeRate <= policy.falseNegativeRateMax, `${prefix}.falseNegativeRate must be <= ${policy.falseNegativeRateMax} for active report`);
}

function validateSummary(summary, prefix, isActive) {
    assert.equal(typeof summary, 'object', `${prefix}.summary is required`);
    assertNonNegativeInteger(summary.sampleCountTotal, `${prefix}.summary.sampleCountTotal`);
    assertNonNegativeInteger(summary.reviewedSampleCount, `${prefix}.summary.reviewedSampleCount`);
    assertNonNegativeInteger(summary.missingObservationCount, `${prefix}.summary.missingObservationCount`);
    assertNonNegativeInteger(summary.expectedPositiveCount, `${prefix}.summary.expectedPositiveCount`);
    assertNonNegativeInteger(summary.expectedNegativeCount, `${prefix}.summary.expectedNegativeCount`);
    assertNonNegativeInteger(summary.truePositiveMatches, `${prefix}.summary.truePositiveMatches`);
    assertNonNegativeInteger(summary.trueNegativeUnmatched, `${prefix}.summary.trueNegativeUnmatched`);
    assertNonNegativeInteger(summary.falsePositiveMatches, `${prefix}.summary.falsePositiveMatches`);
    assertNonNegativeInteger(summary.falseNegativeUnmatched, `${prefix}.summary.falseNegativeUnmatched`);
    assertNonNegativeInteger(summary.galleryEntriesBefore, `${prefix}.summary.galleryEntriesBefore`);
    assertNonNegativeInteger(summary.galleryEntriesAfter, `${prefix}.summary.galleryEntriesAfter`);
    assertNonNegativeInteger(summary.galleryGrowth, `${prefix}.summary.galleryGrowth`);
    assertMetric(summary.observationCoverage, `${prefix}.summary.observationCoverage`);
    assertMetric(summary.matchSuccessRate, `${prefix}.summary.matchSuccessRate`);
    assertMetric(summary.falsePositiveRate, `${prefix}.summary.falsePositiveRate`);
    assertMetric(summary.falseNegativeRate, `${prefix}.summary.falseNegativeRate`);

    if (isActive) {
        assert.ok(summary.sampleCountTotal >= 100, `${prefix}.summary.sampleCountTotal must be >= 100 for active report`);
        assert.ok(summary.reviewedSampleCount === summary.sampleCountTotal, `${prefix}.summary.reviewedSampleCount must equal sampleCountTotal for active report`);
        assert.ok(summary.missingObservationCount === 0, `${prefix}.summary.missingObservationCount must be 0 for active report`);
        assert.ok(summary.matchSuccessRate >= 0.85, `${prefix}.summary.matchSuccessRate must be >= 0.85 for active report`);
        assert.ok(summary.falsePositiveRate <= 0.05, `${prefix}.summary.falsePositiveRate must be <= 0.05 for active report`);
        assert.ok(summary.falseNegativeRate <= 0.15, `${prefix}.summary.falseNegativeRate must be <= 0.15 for active report`);
    }
}

function validateReport(report, index, policy, options) {
    const prefix = `reports[${index}]`;
    assertNonEmptyString(report.id, `${prefix}.id`);
    assert.ok(options.allowFixture || report.fixture !== true, `${prefix}.fixture entries are not allowed in production report`);
    assert.ok(ALLOWED_STATUS.has(report.status), `${prefix}.status is not allowed`);
    assertNonEmptyString(report.engine, `${prefix}.engine`);
    assertNonEmptyString(report.datasetId, `${prefix}.datasetId`);
    assertNonNegativeInteger(report.sampleCountTotal, `${prefix}.sampleCountTotal`);
    assertNonNegativeInteger(report.reviewedSampleCount, `${prefix}.reviewedSampleCount`);
    assertNonNegativeInteger(report.missingObservationCount, `${prefix}.missingObservationCount`);
    assert.ok(Array.isArray(report.bucketResults), `${prefix}.bucketResults must be an array`);

    const isActive = report.status === 'active';
    const seenBuckets = new Set();
    report.bucketResults.forEach((bucketResult, bucketIndex) => {
        validateBucketResult(bucketResult, `${prefix}.bucketResults[${bucketIndex}]`, policy, isActive);
        assert.ok(!seenBuckets.has(bucketResult.bucket), `${prefix}.bucketResults[${bucketIndex}].bucket must be unique`);
        seenBuckets.add(bucketResult.bucket);
    });

    if (isActive) {
        for (const bucket of policy.requiredBuckets) {
            assert.ok(seenBuckets.has(bucket), `${prefix}.bucketResults missing required bucket: ${bucket}`);
        }
    }

    validateSummary(report.summary, prefix, isActive);
    validateEvidence(report.evidence, prefix);
}

function validateBacktestReport(payload, options = {}) {
    assert.equal(payload.schemaVersion, 1, 'schemaVersion must be 1');
    assert.equal(payload.taxonomy, 'vehicle_reid_runtime_backtest_report_v1', 'taxonomy mismatch');
    validatePolicy(payload.policy);
    assert.ok(Array.isArray(payload.reports), 'reports must be an array');

    if (payload.active_report_count !== undefined) {
        assert.equal(Number(payload.active_report_count ?? 0), payload.active_report_count ?? 0, 'active_report_count must be numeric');
    }

    const ids = new Set();
    payload.reports.forEach((report, index) => {
        validateReport(report, index, payload.policy, options);
        assert.ok(!ids.has(report.id), `reports[${index}].id must be unique`);
        ids.add(report.id);
    });

    if (payload.active_report_count !== undefined) {
        const activeReports = payload.reports.filter((report) => report.status === 'active').length;
        assert.equal(Number(payload.active_report_count), activeReports, 'active_report_count must match active reports');
    }
}

function run() {
    const args = process.argv.slice(2);
    const allowFixture = args.includes('--allow-fixture');
    const pathArg = args.find((arg) => !arg.startsWith('--'));
    const reportPath = pathArg ? path.resolve(process.cwd(), pathArg) : DEFAULT_PATH;

    if (!fs.existsSync(reportPath)) {
        console.log(`skip - vehicle ReID runtime backtest report not found: ${path.relative(process.cwd(), reportPath)}`);
        return;
    }

    const payload = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    validateBacktestReport(payload, { allowFixture });
    const activeReports = payload.reports.filter((report) => report.status === 'active').length;
    console.log(`ok - vehicle ReID runtime backtest report valid (${activeReports} active reports)`);
}

if (require.main === module) {
    run();
}

module.exports = {
    validateBacktestReport,
};
