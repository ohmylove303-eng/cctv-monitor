const fs = require('node:fs');
const path = require('node:path');

const { validateReadiness } = require('./validate-vehicle-reid-readiness');

const DEFAULT_INPUT_PATH = path.resolve(__dirname, '../data/vehicle-reid-readiness.json');
const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, '../data/vehicle-reid-readiness.json');

const DEFAULT_POLICY = {
    noIdentityMatchWithoutValidatedEmbedding: true,
    activationMetric: 'top1Accuracy',
    activationThreshold: 0.85,
    maxFalsePositiveRate: 0.05,
    notes: 'Same-vehicle ReID remains disabled until an active embedding model report passes this gate.',
};

function parseArgs(argv) {
    const options = {
        inputPath: DEFAULT_INPUT_PATH,
        outputPath: DEFAULT_OUTPUT_PATH,
        write: true,
        allowFixture: false,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--input') {
            options.inputPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--output') {
            options.outputPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--check') {
            options.write = false;
        } else if (arg === '--write') {
            options.write = true;
        } else if (arg === '--allow-fixture') {
            options.allowFixture = true;
        } else if (arg === '--help' || arg === '-h') {
            console.log('Usage: node scripts/build-vehicle-reid-readiness.js [--check|--write] [--input data/vehicle-reid-readiness.json] [--output data/vehicle-reid-readiness.json] [--allow-fixture]');
            process.exit(0);
        } else {
            throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return options;
}

function clean(value) {
    return String(value ?? '').trim();
}

function loadJson(filePath) {
    if (!filePath || !fs.existsSync(filePath)) {
        return null;
    }

    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
}

function normalizePolicy(policy) {
    const source = policy && typeof policy === 'object' && !Array.isArray(policy) ? policy : {};
    return {
        noIdentityMatchWithoutValidatedEmbedding: source.noIdentityMatchWithoutValidatedEmbedding ?? DEFAULT_POLICY.noIdentityMatchWithoutValidatedEmbedding,
        activationMetric: clean(source.activationMetric) || DEFAULT_POLICY.activationMetric,
        activationThreshold: typeof source.activationThreshold === 'number' ? source.activationThreshold : DEFAULT_POLICY.activationThreshold,
        maxFalsePositiveRate: typeof source.maxFalsePositiveRate === 'number' ? source.maxFalsePositiveRate : DEFAULT_POLICY.maxFalsePositiveRate,
        notes: clean(source.notes) || DEFAULT_POLICY.notes,
    };
}

function normalizeReadiness(input) {
    const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
    const datasets = Array.isArray(source.datasets) ? source.datasets : [];
    const modelReports = Array.isArray(source.modelReports) ? source.modelReports : [];
    const activeModelCount = modelReports.filter((report) => report && typeof report === 'object' && report.status === 'active').length;

    return {
        schemaVersion: source.schemaVersion ?? 1,
        taxonomy: clean(source.taxonomy) || 'vehicle_reid_readiness_v1',
        policy: normalizePolicy(source.policy),
        datasets,
        modelReports,
        active_model_count: activeModelCount,
        same_vehicle_reid_ready: activeModelCount > 0,
        runtime_integrated: Boolean(source.runtime_integrated ?? false),
        verification_status: activeModelCount > 0 ? 'active_report_ready' : 'pending_review',
        status: activeModelCount > 0
            ? 'active_report_ready'
            : datasets.length === 0 && modelReports.length === 0
                ? 'empty'
                : 'no_active_model',
        validation_note: clean(source.validation_note)
            || 'Same-vehicle ReID remains disabled until an active embedding model report passes this gate.',
    };
}

function buildVehicleReidReadiness(input, options = {}) {
    const readiness = normalizeReadiness(input);
    validateReadiness(readiness, { allowFixture: Boolean(options.allowFixture) });
    return readiness;
}

function run() {
    const options = parseArgs(process.argv.slice(2));
    const input = loadJson(options.inputPath) ?? {
        schemaVersion: 1,
        taxonomy: 'vehicle_reid_readiness_v1',
        policy: DEFAULT_POLICY,
        datasets: [],
        modelReports: [],
    };
    const readiness = buildVehicleReidReadiness(input, { allowFixture: options.allowFixture });

    if (options.write) {
        fs.writeFileSync(options.outputPath, `${JSON.stringify(readiness, null, 2)}\n`, 'utf8');
    }

    console.log(`ok - vehicle ReID readiness builder ${readiness.active_model_count > 0 ? 'ready' : 'pending'} (${readiness.active_model_count} active models)`);
}

if (require.main === module) {
    try {
        run();
    } catch (error) {
        console.error(error.message || String(error));
        process.exit(1);
    }
}

module.exports = {
    buildVehicleReidReadiness,
    normalizeReadiness,
};
