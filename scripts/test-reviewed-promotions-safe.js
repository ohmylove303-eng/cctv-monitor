const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const WRAPPER = path.join(ROOT, 'scripts', 'apply-reviewed-promotions-safe.js');
const SUMMARY_JSON = path.join(ROOT, 'data', 'reviewed-promotions-summary.json');
const TEMPLATE_CSV = path.join(ROOT, 'data', 'official-cctv-coordinates.csv');

function runWrapper(args) {
    return spawnSync(process.execPath, [WRAPPER, ...args], {
        cwd: ROOT,
        encoding: 'utf8',
    });
}

const beforeTemplate = fs.readFileSync(TEMPLATE_CSV, 'utf8');
const dryRun = runWrapper(['--check']);

assert.equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
assert.equal(fs.readFileSync(TEMPLATE_CSV, 'utf8'), beforeTemplate, 'safe wrapper must not mutate the coordinate template');

const summary = JSON.parse(fs.readFileSync(SUMMARY_JSON, 'utf8'));
assert.equal(summary.dryRun, true);
assert.equal(summary.promotedRows.length, 0);
assert.ok(Array.isArray(summary.approvedIds));

const blocked = runWrapper(['--apply']);
assert.notEqual(blocked.status, 0, 'safe wrapper must reject --apply');
assert.match((blocked.stderr || blocked.stdout || ''), /refuses --apply/);

console.log('ok - reviewed promotions safe wrapper passed');
