const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const REQUIRED_BUCKETS = ['night', 'backlight', 'long_distance', 'low_resolution'];

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validate(payload, { allowFixture = false } = {}) {
    assert.ok(payload && typeof payload === 'object' && !Array.isArray(payload), 'payload must be an object');
    assert.equal(payload.taxonomy, 'ocr_alpr_backtest_readiness_v1');
    assert.ok(['missing', 'pending_review', 'reviewed', 'active_report_ready'].includes(payload.status), 'invalid status');
    assert.ok(Array.isArray(payload.required_buckets), 'required_buckets must be an array');
    assert.ok(Array.isArray(payload.completed_buckets), 'completed_buckets must be an array');
    assert.equal(Number(payload.active_report_count ?? 0), payload.active_report_count ?? 0, 'active_report_count must be numeric');

    for (const bucket of REQUIRED_BUCKETS) {
        assert.ok(payload.required_buckets.includes(bucket), `missing required bucket: ${bucket}`);
    }

    if (payload.status === 'active_report_ready') {
        assert.ok(payload.active_report_count > 0, 'active report count must be positive when active_report_ready');
        for (const bucket of REQUIRED_BUCKETS) {
            assert.ok(payload.completed_buckets.includes(bucket), `active_report_ready requires completed bucket: ${bucket}`);
        }
    }

    if (!allowFixture) {
        assert.ok(typeof payload.validation_note === 'string' && payload.validation_note.length > 0, 'validation_note is required');
    }
}

function main() {
    const target = process.argv[2]
        ? path.resolve(process.argv[2])
        : path.resolve(__dirname, '..', 'data', 'ocr-alpr-backtest-readiness.json');
    const allowFixture = process.argv.includes('--allow-fixture');
    validate(loadJson(target), { allowFixture });
    console.log(`ok - validated OCR/ALPR backtest readiness: ${path.relative(process.cwd(), target)}`);
}

if (require.main === module) {
    try {
        main();
    } catch (error) {
        console.error(error.message || String(error));
        process.exit(1);
    }
}
