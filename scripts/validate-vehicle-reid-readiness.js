const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PATH = path.resolve(__dirname, '../data/vehicle-reid-readiness.json');

const ALLOWED_DATASET_STATUS = new Set(['pending', 'approved', 'rejected', 'keep_hidden']);
const ALLOWED_LICENSE_STATUS = new Set(['pending', 'approved', 'rejected']);
const ALLOWED_MODEL_STATUS = new Set(['candidate', 'active', 'rejected', 'keep_hidden', 'review_needed']);
const DEFAULT_ACTIVATION_THRESHOLD = 0.85;
const DEFAULT_MAX_FALSE_POSITIVE_RATE = 0.05;

function assertNonEmptyString(value, label) {
    assert.equal(typeof value, 'string', `${label} must be a string`);
    assert.ok(value.trim().length > 0, `${label} must not be empty`);
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

function validateEvidence(evidence, prefix) {
    assert.equal(typeof evidence, 'object', `${prefix}.evidence is required`);
    assertNonEmptyString(evidence.reviewer, `${prefix}.evidence.reviewer`);
    assertReviewedAt(evidence.reviewedAt, `${prefix}.evidence.reviewedAt`);
}

function validateDataset(dataset, index, options) {
    const prefix = `datasets[${index}]`;
    assertNonEmptyString(dataset.id, `${prefix}.id`);
    assert.ok(options.allowFixture || dataset.fixture !== true, `${prefix}.fixture entries are not allowed in production readiness`);
    assertNonEmptyString(dataset.sourceName, `${prefix}.sourceName`);
    assertNonEmptyString(dataset.sourceType, `${prefix}.sourceType`);
    assert.ok(ALLOWED_LICENSE_STATUS.has(dataset.licenseStatus), `${prefix}.licenseStatus is not allowed`);
    assert.ok(ALLOWED_DATASET_STATUS.has(dataset.reviewStatus), `${prefix}.reviewStatus is not allowed`);
    assertPositiveInteger(dataset.identityCount, `${prefix}.identityCount`);
    assertPositiveInteger(dataset.imageCount, `${prefix}.imageCount`);
    assertPositiveInteger(dataset.cameraCount, `${prefix}.cameraCount`);
    validateEvidence(dataset.evidence, prefix);
    assertNonEmptyString(dataset.evidence.datasetPath, `${prefix}.evidence.datasetPath`);
}

function validateModelReport(report, index, options, datasetIds, threshold, maxFalsePositiveRate) {
    const prefix = `modelReports[${index}]`;
    assertNonEmptyString(report.id, `${prefix}.id`);
    assert.ok(options.allowFixture || report.fixture !== true, `${prefix}.fixture entries are not allowed in production readiness`);
    assert.ok(ALLOWED_MODEL_STATUS.has(report.status), `${prefix}.status is not allowed`);
    assertNonEmptyString(report.modelFamily, `${prefix}.modelFamily`);
    assertPositiveInteger(report.embeddingDimension, `${prefix}.embeddingDimension`);

    const isActive = report.status === 'active';
    if (isActive) {
        assertNonEmptyString(report.weightsPath, `${prefix}.weightsPath`);
    } else if (report.weightsPath !== undefined) {
        assert.equal(typeof report.weightsPath, 'string', `${prefix}.weightsPath must be a string`);
    }

    assert.ok(Array.isArray(report.datasetIds), `${prefix}.datasetIds must be an array`);
    if (isActive) {
        assert.ok(report.datasetIds.length > 0, `${prefix}.datasetIds must not be empty for active model`);
    }
    report.datasetIds.forEach((id, datasetIndex) => {
        assertNonEmptyString(id, `${prefix}.datasetIds[${datasetIndex}]`);
        assert.ok(datasetIds.has(id), `${prefix}.datasetIds[${datasetIndex}] references unknown dataset`);
    });

    assert.equal(typeof report.metrics, 'object', `${prefix}.metrics is required`);
    assertMetric(report.metrics.top1Accuracy, `${prefix}.metrics.top1Accuracy`);
    assertMetric(report.metrics.meanAveragePrecision, `${prefix}.metrics.meanAveragePrecision`);
    assertMetric(report.metrics.crossCameraAccuracy, `${prefix}.metrics.crossCameraAccuracy`);
    assertMetric(report.metrics.precision, `${prefix}.metrics.precision`);
    assertMetric(report.metrics.recall, `${prefix}.metrics.recall`);
    assertMetric(report.metrics.falsePositiveRate, `${prefix}.metrics.falsePositiveRate`);

    if (isActive) {
        assert.ok(report.metrics.top1Accuracy >= threshold, `${prefix}.metrics.top1Accuracy must be >= ${threshold} for active model`);
        assert.ok(report.metrics.crossCameraAccuracy >= threshold, `${prefix}.metrics.crossCameraAccuracy must be >= ${threshold} for active model`);
        assert.ok(report.metrics.falsePositiveRate <= maxFalsePositiveRate, `${prefix}.metrics.falsePositiveRate must be <= ${maxFalsePositiveRate} for active model`);
    }

    validateEvidence(report.evidence, prefix);
    assertNonEmptyString(report.evidence.reportPath, `${prefix}.evidence.reportPath`);
}

function validateReadiness(readiness, options = {}) {
    const threshold = readiness.policy?.activationThreshold ?? DEFAULT_ACTIVATION_THRESHOLD;
    const maxFalsePositiveRate = readiness.policy?.maxFalsePositiveRate ?? DEFAULT_MAX_FALSE_POSITIVE_RATE;
    assert.equal(readiness.schemaVersion, 1, 'schemaVersion must be 1');
    assert.equal(readiness.taxonomy, 'vehicle_reid_readiness_v1', 'taxonomy mismatch');
    assert.equal(readiness.policy?.noIdentityMatchWithoutValidatedEmbedding, true, 'policy.noIdentityMatchWithoutValidatedEmbedding must be true');
    assert.equal(readiness.policy?.activationMetric, 'top1Accuracy', 'policy.activationMetric must be top1Accuracy');
    assertMetric(threshold, 'policy.activationThreshold');
    assertMetric(maxFalsePositiveRate, 'policy.maxFalsePositiveRate');

    assert.ok(Array.isArray(readiness.datasets), 'datasets must be an array');
    assert.ok(Array.isArray(readiness.modelReports), 'modelReports must be an array');

    const datasetIds = new Set();
    readiness.datasets.forEach((dataset, index) => {
        validateDataset(dataset, index, options);
        assert.ok(!datasetIds.has(dataset.id), `datasets[${index}].id must be unique`);
        datasetIds.add(dataset.id);
    });

    const modelIds = new Set();
    readiness.modelReports.forEach((report, index) => {
        validateModelReport(report, index, options, datasetIds, threshold, maxFalsePositiveRate);
        assert.ok(!modelIds.has(report.id), `modelReports[${index}].id must be unique`);
        modelIds.add(report.id);
    });
}

function run() {
    const args = process.argv.slice(2);
    const allowFixture = args.includes('--allow-fixture');
    const pathArg = args.find((arg) => !arg.startsWith('--'));
    const readinessPath = pathArg ? path.resolve(process.cwd(), pathArg) : DEFAULT_PATH;
    const readiness = JSON.parse(fs.readFileSync(readinessPath, 'utf8'));
    validateReadiness(readiness, { allowFixture });
    const activeModels = readiness.modelReports.filter((report) => report.status === 'active').length;
    console.log(`ok - vehicle ReID readiness valid (${activeModels} active models)`);
}

if (require.main === module) {
    run();
}

module.exports = {
    validateReadiness,
};
