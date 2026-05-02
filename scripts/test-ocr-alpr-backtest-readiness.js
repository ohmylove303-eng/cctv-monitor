const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function run() {
    require(path.resolve(__dirname, 'validate-ocr-alpr-backtest-readiness.js'));
    const status = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'data', 'ocr-alpr-backtest-readiness.json'), 'utf8'));
    assert.equal(status.status, 'pending_review');
    assert.equal(status.active_report_count, 0);
    assert.deepEqual(status.required_buckets, ['night', 'backlight', 'long_distance', 'low_resolution']);
    console.log('ok - OCR/ALPR backtest readiness manifest checks passed');
}

run();
