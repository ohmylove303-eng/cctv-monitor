const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const templatePath = path.resolve(__dirname, '../data/ocr-alpr-backtest-observations.template.json');
const payload = JSON.parse(fs.readFileSync(templatePath, 'utf8'));

assert.equal(payload.engine, 'easyocr');
assert.ok(Array.isArray(payload.observations));
assert.equal(payload.observations.length, 0);

console.log('ok - OCR/ALPR observations template passed');
