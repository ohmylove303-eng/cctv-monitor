const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_PATH = path.resolve(__dirname, '../data/cctv-vision-calibration.json');
const ALLOWED_TIERS = new Set(['tier_a', 'tier_b', 'tier_c']);
const ALLOWED_IDENTIFICATION_USE = new Set(['fine_grained_vehicle', 'vehicle_shape_direction', 'traffic_flow_only']);
const ALLOWED_DIRECTION_STATUS = new Set(['none', 'pending', 'calibrated']);

function assertNonEmptyString(value, label) {
    assert.equal(typeof value, 'string', `${label} must be a string`);
    assert.ok(value.trim().length > 0, `${label} must not be empty`);
}

function assertPositiveNumber(value, label) {
    assert.equal(typeof value, 'number', `${label} must be a number`);
    assert.ok(Number.isFinite(value) && value > 0, `${label} must be positive`);
}

function assertPositiveInteger(value, label) {
    assert.equal(typeof value, 'number', `${label} must be a number`);
    assert.ok(Number.isInteger(value) && value > 0, `${label} must be a positive integer`);
}

function validateLineZone(zone, label, width, height) {
    assert.equal(typeof zone, 'object', `${label} is required`);
    assert.equal(zone.label, label.endsWith('.forward') ? 'forward' : 'reverse', `${label}.label mismatch`);
    assert.ok(Array.isArray(zone.points), `${label}.points must be an array`);
    assert.equal(zone.points.length, 2, `${label}.points must have two points`);

    zone.points.forEach((point, index) => {
        assert.ok(Array.isArray(point), `${label}.points[${index}] must be an array`);
        assert.equal(point.length, 2, `${label}.points[${index}] must have x,y`);
        const [x, y] = point;
        assert.equal(typeof x, 'number', `${label}.points[${index}][0] must be a number`);
        assert.equal(typeof y, 'number', `${label}.points[${index}][1] must be a number`);
        assert.ok(x >= 0 && x <= width, `${label}.points[${index}][0] outside frame`);
        assert.ok(y >= 0 && y <= height, `${label}.points[${index}][1] outside frame`);
    });
}

function validateCatalog(catalog, options = {}) {
    const minSampleCount = options.minSampleCount ?? 3;
    assert.equal(catalog.schemaVersion, 1, 'schemaVersion must be 1');
    assert.equal(catalog.taxonomy, 'cctv_vision_calibration_v1', 'taxonomy mismatch');
    assert.ok(Array.isArray(catalog.entries), 'entries must be an array');

    const ids = new Set();
    for (const [index, entry] of catalog.entries.entries()) {
        const prefix = `entries[${index}]`;
        assert.equal(entry.status, 'active', `${prefix}.status must be active`);
        assertNonEmptyString(entry.cctvId, `${prefix}.cctvId`);
        assert.ok(!ids.has(entry.cctvId), `${prefix}.cctvId must be unique`);
        ids.add(entry.cctvId);
        assert.ok(ALLOWED_TIERS.has(entry.visionTier), `${prefix}.visionTier is not allowed`);
        assert.ok(ALLOWED_IDENTIFICATION_USE.has(entry.identificationUse), `${prefix}.identificationUse is not allowed`);
        assertPositiveNumber(entry.approachDistanceMeters, `${prefix}.approachDistanceMeters`);
        assert.equal(typeof entry.resolution, 'object', `${prefix}.resolution is required`);
        assertPositiveInteger(entry.resolution.width, `${prefix}.resolution.width`);
        assertPositiveInteger(entry.resolution.height, `${prefix}.resolution.height`);
        assert.ok(ALLOWED_DIRECTION_STATUS.has(entry.directionCalibrationStatus), `${prefix}.directionCalibrationStatus is not allowed`);

        if (entry.visionTier === 'tier_a') {
            assert.equal(entry.identificationUse, 'fine_grained_vehicle', `${prefix}.tier_a requires fine_grained_vehicle`);
            assert.ok(entry.approachDistanceMeters <= 20, `${prefix}.tier_a requires approachDistanceMeters <= 20`);
            assert.ok(entry.resolution.height >= 1080, `${prefix}.tier_a requires resolution.height >= 1080`);
        } else if (entry.visionTier === 'tier_b') {
            assert.equal(entry.identificationUse, 'vehicle_shape_direction', `${prefix}.tier_b requires vehicle_shape_direction`);
            assert.ok(entry.approachDistanceMeters > 20 && entry.approachDistanceMeters <= 80, `${prefix}.tier_b requires 20 < approachDistanceMeters <= 80`);
        } else if (entry.visionTier === 'tier_c') {
            assert.equal(entry.identificationUse, 'traffic_flow_only', `${prefix}.tier_c requires traffic_flow_only`);
            assert.ok(entry.approachDistanceMeters > 80 || entry.resolution.height < 720, `${prefix}.tier_c requires distance > 80m or resolution height < 720`);
        }

        if (entry.directionCalibrationStatus === 'calibrated') {
            assert.equal(typeof entry.lineZones, 'object', `${prefix}.lineZones is required when direction is calibrated`);
            validateLineZone(entry.lineZones.forward, `${prefix}.lineZones.forward`, entry.resolution.width, entry.resolution.height);
            validateLineZone(entry.lineZones.reverse, `${prefix}.lineZones.reverse`, entry.resolution.width, entry.resolution.height);
        }

        assert.equal(typeof entry.evidence, 'object', `${prefix}.evidence is required`);
        assertNonEmptyString(entry.evidence.source, `${prefix}.evidence.source`);
        assertNonEmptyString(entry.evidence.verificationMethod, `${prefix}.evidence.verificationMethod`);
        assertPositiveInteger(entry.evidence.sampleCount, `${prefix}.evidence.sampleCount`);
        assert.ok(entry.evidence.sampleCount >= minSampleCount, `${prefix}.evidence.sampleCount must be at least ${minSampleCount}`);
        assertNonEmptyString(entry.evidence.datasetPath, `${prefix}.evidence.datasetPath`);
        assertNonEmptyString(entry.evidence.reviewer, `${prefix}.evidence.reviewer`);
        assert.match(entry.evidence.reviewedAt, /^\d{4}-\d{2}-\d{2}$/, `${prefix}.evidence.reviewedAt must be YYYY-MM-DD`);
    }
}

function run() {
    const args = process.argv.slice(2);
    const pathArg = args.find((arg) => !arg.startsWith('--'));
    const minSampleCountArgIndex = args.indexOf('--min-sample-count');
    const minSampleCount = minSampleCountArgIndex >= 0 ? Number(args[minSampleCountArgIndex + 1]) : 3;
    const catalogPath = pathArg ? path.resolve(process.cwd(), pathArg) : DEFAULT_PATH;
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    validateCatalog(catalog, { minSampleCount });
    console.log(`ok - CCTV vision calibration catalog valid (${catalog.entries.length} entries)`);
}

if (require.main === module) {
    run();
}

module.exports = {
    ALLOWED_DIRECTION_STATUS,
    ALLOWED_IDENTIFICATION_USE,
    ALLOWED_TIERS,
    validateCatalog,
};
