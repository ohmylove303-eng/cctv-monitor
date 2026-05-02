const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

const OUTPUTS = [
    {
        md: path.join(DATA_DIR, 'review-needed-p1-suggested.md'),
        csv: path.join(DATA_DIR, 'review-needed-p1-suggested-sites.csv'),
        rowCsv: path.join(DATA_DIR, 'review-needed-p1-suggested-rows.csv'),
        marker: '# P1 Suggested Approvals',
        csvMarker: 'suggested_approve',
    },
    {
        md: path.join(DATA_DIR, 'review-needed-p1-third-wave.md'),
        csv: path.join(DATA_DIR, 'review-needed-p1-third-wave-sites.csv'),
        rowCsv: path.join(DATA_DIR, 'review-needed-p1-third-wave-rows.csv'),
        marker: '# P1 Third Wave Candidates',
        csvMarker: 'suggested_approve',
    },
];

function runScript(script) {
    const result = spawnSync('npm', ['run', script], {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (result.status !== 0) {
        throw new Error(
            [
                `failed to run ${script}`,
                result.stdout?.trim(),
                result.stderr?.trim(),
            ].filter(Boolean).join('\n')
        );
    }
}

function assertFileContains(filePath, marker) {
    assert.ok(fs.existsSync(filePath), `${filePath} should exist`);
    const content = fs.readFileSync(filePath, 'utf8');
    assert.ok(content.trim().length > 0, `${filePath} should not be empty`);
    assert.ok(content.includes(marker), `${filePath} should include ${marker}`);
}

function main() {
    runScript('coordinates:approval-suggestions');
    runScript('coordinates:third-wave');

    for (const output of OUTPUTS) {
        assertFileContains(output.md, output.marker);
        assertFileContains(output.csv, output.csvMarker);
        assertFileContains(output.rowCsv, output.csvMarker);
    }

    console.log('ok - coordinate suggestion exports passed');
}

main();
