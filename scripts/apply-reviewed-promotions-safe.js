const { spawnSync } = require('node:child_process');
const path = require('node:path');

function runStep(label, command, args) {
    console.log(`\n[${label}] ${command} ${args.join(' ')}`);
    const result = spawnSync(command, args, {
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
    if (passthroughArgs.includes('--apply')) {
        throw new Error('coordinates:promote-reviewed-safe refuses --apply. Use the lower-level apply script only after final reviewer approval.');
    }

    const scriptsDir = path.resolve(__dirname);
    runStep('reviewed promotions dry run', 'npx', [
        '--yes',
        'tsx',
        path.join(scriptsDir, 'apply-reviewed-promotions.ts'),
    ]);
    runStep('coordinate review summary check', process.execPath, [
        path.join(scriptsDir, 'summarize-official-coordinate-review.js'),
        '--check',
    ]);

    console.log('\nok - reviewed promotions safe wrapper completed without applying active coordinate changes');
}

run();
