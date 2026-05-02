const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PATH = path.resolve(__dirname, '../data/ocr-alpr-backtest-report.json');
const DEFAULT_REQUIRED_BUCKETS = ['night', 'backlight', 'long_distance', 'low_resolution'];
const ALLOWED_STATUS = new Set(['candidate', 'active', 'rejected', 'keep_hidden', 'review_needed']);
const ALLOWED_ENGINES = new Set(['easyocr', 'paddleocr', 'dedicated_alpr', 'other']);

function assertNonEmptyString(value, label) {
    assert.equal(typeof value, 'string', `${label} must be a string`);
    assert.ok(value.trim().length > 0, `${label} must not be empty`);
}

function assertMetric(value, label) {
    assert.equal(typeof value, 'number', `${label} must be a number`);
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${label} must be between 0 and 1`);
}

function assertPositiveInteger(value, label) {
    assert.equal(typeof value, 'number', `${label} must be a number`);
    assert.ok(Number.isInteger(value) && value > 0, `${label} must be a positive integer`);
}

function assertReviewedAt(value, label) {
    assertNonEmptyString(value, label);
    assert.match(value, /^\d{4}-\d{2}-\d{2}$/, `${label} must be YYYY-MM-DD`);
    const parsed = new Date(`${value}T00:00:00.000Z`);
    assert.equal(parsed.toISOString().slice(0, 10), value, `${label} must be a valid date`);
}

function validateEvidence(evidence, prefix) {
    assert.equal(typeof evidence, 'object', `${prefix}.evidence is required`);
    assertNonEmptyString(evidence.datasetPath, `${prefix}.evidence.datasetPath`);
    assertNonEmptyString(evidence.reportPath, `${prefix}.evidence.reportPath`);
    assertNonEmptyString(evidence.reviewer, `${prefix}.evidence.reviewer`);
    assertReviewedAt(evidence.reviewedAt, `${prefix}.evidence.reviewedAt`);
}

function validateBucketResult(result, prefix, policy, isActive) {
    assertNonEmptyString(result.bucket, `${prefix}.bucket`);
    assert.ok(policy.requiredBuckets.includes(result.bucket), `${prefix}.bucket is not required by policy`);
    assertPositiveInteger(result.sampleCount, `${prefix}.sampleCount`);
    assertMetric(result.exactPlateAccuracy, `${prefix}.exactPlateAccuracy`);
    assertMetric(result.candidateRecall, `${prefix}.candidateRecall`);
    assertMetric(result.falsePositiveRate, `${prefix}.falsePositiveRate`);

    if (!isActive) {
        return;
    }

    assert.ok(result.sampleCount >= policy.minSamplesPerBucket, `${prefix}.sampleCount must be >= ${policy.minSamplesPerBucket} for active report`);
    assert.ok(result.exactPlateAccuracy >= policy.exactPlateAccuracyThreshold, `${prefix}.exactPlateAccuracy must be >= ${policy.exactPlateAccuracyThreshold} for active report`);
    assert.ok(result.candidateRecall >= policy.candidateRecallThreshold, `${prefix}.candidateRecall must be >= ${policy.candidateRecallThreshold} for active report`);
    assert.ok(result.falsePositiveRate <= policy.falsePositiveRateMax, `${prefix}.falsePositiveRate must be <= ${policy.falsePositiveRateMax} for active report`);
}

function validateEngineComparison(result, prefix) {
    assertNonEmptyString(result.engine, `${prefix}.engine`);
    assert.ok(ALLOWED_ENGINES.has(result.engine), `${prefix}.engine is not allowed`);
    assertPositiveInteger(result.sampleCount, `${prefix}.sampleCount`);
    assertMetric(result.exactPlateAccuracy, `${prefix}.exactPlateAccuracy`);
    assertMetric(result.candidateRecall, `${prefix}.candidateRecall`);
    assertMetric(result.falsePositiveRate, `${prefix}.falsePositiveRate`);
}

function validateReport(report, index, policy, options) {
    const prefix = `reports[${index}]`;
    assertNonEmptyString(report.id, `${prefix}.id`);
    assert.ok(options.allowFixture || report.fixture !== true, `${prefix}.fixture entries are not allowed in production report`);
    assert.ok(ALLOWED_STATUS.has(report.status), `${prefix}.status is not allowed`);
    assert.ok(ALLOWED_ENGINES.has(report.engine), `${prefix}.engine is not allowed`);
    assertNonEmptyString(report.datasetId, `${prefix}.datasetId`);
    assert.ok(Array.isArray(report.bucketResults), `${prefix}.bucketResults must be an array`);
    if (report.engineComparisons !== undefined) {
        assert.ok(Array.isArray(report.engineComparisons), `${prefix}.engineComparisons must be an array`);
        const seenEngines = new Set();
        report.engineComparisons.forEach((engineComparison, engineIndex) => {
            validateEngineComparison(engineComparison, `${prefix}.engineComparisons[${engineIndex}]`);
            assert.ok(!seenEngines.has(engineComparison.engine), `${prefix}.engineComparisons[${engineIndex}].engine must be unique`);
            seenEngines.add(engineComparison.engine);
        });
    }

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

    validateEvidence(report.evidence, prefix);
}

function normalizePolicy(policy = {}) {
    assert.equal(policy.noRuntimeAccuracyApprovalWithoutReviewedReport, true, 'policy.noRuntimeAccuracyApprovalWithoutReviewedReport must be true');
    assert.ok(Array.isArray(policy.requiredBuckets), 'policy.requiredBuckets must be an array');
    for (const bucket of DEFAULT_REQUIRED_BUCKETS) {
        assert.ok(policy.requiredBuckets.includes(bucket), `policy.requiredBuckets missing ${bucket}`);
    }
    assertPositiveInteger(policy.minSamplesPerBucket, 'policy.minSamplesPerBucket');
    assertMetric(policy.exactPlateAccuracyThreshold, 'policy.exactPlateAccuracyThreshold');
    assertMetric(policy.candidateRecallThreshold, 'policy.candidateRecallThreshold');
    assertMetric(policy.falsePositiveRateMax, 'policy.falsePositiveRateMax');
    return policy;
}

function validateBacktestReport(payload, options = {}) {
    assert.equal(payload.schemaVersion, 1, 'schemaVersion must be 1');
    assert.equal(payload.taxonomy, 'ocr_alpr_backtest_report_v1', 'taxonomy mismatch');
    const policy = normalizePolicy(payload.policy);
    assert.ok(Array.isArray(payload.reports), 'reports must be an array');

    if (payload.active_report_count !== undefined) {
        assert.equal(Number(payload.active_report_count ?? 0), payload.active_report_count ?? 0, 'active_report_count must be numeric');
    }

    const ids = new Set();
    payload.reports.forEach((report, index) => {
        validateReport(report, index, policy, options);
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
        console.log(`skip - OCR/ALPR backtest report not found: ${path.relative(process.cwd(), reportPath)}`);
        return;
    }

    const payload = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    validateBacktestReport(payload, { allowFixture });
    const activeReports = payload.reports.filter((report) => report.status === 'active').length;
    console.log(`ok - OCR/ALPR backtest report valid (${activeReports} active reports)`);
}

if (require.main === module) {
    run();
}

module.exports = {
    validateBacktestReport,
};
