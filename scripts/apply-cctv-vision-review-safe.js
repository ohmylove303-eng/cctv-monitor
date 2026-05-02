const { spawnSync } = require('node:child_process');
const path = require('node:path');

function runStep(label, args) {
    console.log(`\n[${label}] node ${args.join(' ')}`);
    const result = spawnSync(process.execPath, args, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: 'inherit',
    });

    if (result.error) {
        throw result.error;
    }
    if (result.status !== 0) {
        process.exit(result.status ?? 1);
    }
}

function run() {
    const passthroughArgs = process.argv.slice(2);
    if (passthroughArgs.includes('--allow-active')) {
        throw new Error('review-apply-safe refuses --allow-active. Use the lower-level apply script only after final reviewer approval.');
    }

    const scriptsDir = path.resolve(__dirname);
    runStep('safe patch apply', [
        path.join(scriptsDir, 'apply-cctv-line-zone-patch.js'),
        '--apply',
        ...passthroughArgs,
    ]);
    runStep('audit worklist', [
        path.join(scriptsDir, 'audit-cctv-vision-review-worklist.js'),
    ]);
    runStep('build review packet', [
        path.join(scriptsDir, 'build-cctv-vision-review-packet.js'),
    ]);
    runStep('write review loop status', [
        path.join(scriptsDir, 'check-cctv-vision-review-loop.js'),
        '--write',
    ]);
    runStep('smoke check', [
        path.join(scriptsDir, 'check-cctv-vision-review-loop.js'),
        '--check',
    ]);

    console.log('\nok - safe review apply completed without promoting active catalog entries');
}

run();
