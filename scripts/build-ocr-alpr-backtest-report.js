const fs = require('node:fs');
const path = require('node:path');

const { validateBacktestReport } = require('./validate-ocr-alpr-backtest-report');

const REQUIRED_BUCKETS = ['night', 'backlight', 'long_distance', 'low_resolution'];
const DEFAULT_SAMPLES_PATH = path.resolve(__dirname, '../data/ocr-alpr-backtest-samples.csv');
const DEFAULT_SAMPLES_TEMPLATE_PATH = path.resolve(__dirname, '../data/ocr-alpr-backtest-samples.template.csv');
const DEFAULT_OBSERVATIONS_PATH = path.resolve(__dirname, '../data/ocr-alpr-backtest-observations.json');
const DEFAULT_OBSERVATIONS_TEMPLATE_PATH = path.resolve(__dirname, '../data/ocr-alpr-backtest-observations.template.json');
const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, '../data/ocr-alpr-backtest-report.json');

const POLICY = {
    noRuntimeAccuracyApprovalWithoutReviewedReport: true,
    requiredBuckets: [...REQUIRED_BUCKETS],
    minSamplesPerBucket: 30,
    exactPlateAccuracyThreshold: 0.85,
    candidateRecallThreshold: 0.9,
    falsePositiveRateMax: 0.05,
};

function parseArgs(argv) {
    const options = {
        samplesPath: null,
        observationsPath: null,
        outputPath: DEFAULT_OUTPUT_PATH,
        write: true,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--samples') {
            options.samplesPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--observations') {
            options.observationsPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--output') {
            options.outputPath = path.resolve(process.cwd(), argv[++index]);
        } else if (arg === '--write') {
            options.write = true;
        } else if (arg === '--check') {
            options.write = false;
        } else if (arg === '--help' || arg === '-h') {
            console.log('Usage: node scripts/build-ocr-alpr-backtest-report.js [--check|--write] [--samples data/ocr-alpr-backtest-samples.csv] [--observations data/ocr-alpr-backtest-observations.json] [--output data/ocr-alpr-backtest-report.json]');
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

function normalizeCandidatePlates(value) {
    if (Array.isArray(value)) {
        return value.map((plate) => clean(plate)).filter(Boolean);
    }
    if (clean(value)) {
        return clean(value).split(/[|,]/).map((plate) => clean(plate)).filter(Boolean);
    }
    return [];
}

function normalizeEngineObservation(entry, fallbackEngine = 'other') {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const engine = clean(entry.engine) || clean(fallbackEngine) || 'other';
    const predictedPlate = clean(entry.predictedPlate || entry.predicted_plate);
    const candidatePlates = normalizeCandidatePlates(entry.candidatePlates ?? entry.candidate_plates);
    const notes = clean(entry.notes);
    if (!engine) {
        return null;
    }
    return {
        engine,
        predictedPlate,
        candidatePlates,
        notes,
    };
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    const input = text.replace(/^\uFEFF/, '');

    for (let index = 0; index < input.length; index += 1) {
        const char = input[index];
        const next = input[index + 1];
        if (char === '"') {
            if (inQuotes && next === '"') {
                field += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            row.push(field);
            field = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && next === '\n') {
                index += 1;
            }
            row.push(field);
            rows.push(row);
            row = [];
            field = '';
        } else {
            field += char;
        }
    }

    if (field.length > 0 || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows.filter((candidate) => candidate.some((value) => clean(value).length > 0));
}

function toObjects(rows) {
    if (rows.length === 0) {
        return [];
    }
    const header = rows[0].map((value) => clean(value));
    return rows.slice(1).map((values) => Object.fromEntries(header.map((column, index) => [column, values[index] ?? ''])));
}

function normalizePlate(value) {
    return clean(value).replace(/[\s_-]+/g, '').toUpperCase();
}

function pickExistingPath(primary, fallback) {
    if (primary && fs.existsSync(primary)) {
        return primary;
    }
    if (fallback && fs.existsSync(fallback)) {
        return fallback;
    }
    return primary ?? fallback;
}

function loadSamples(samplesPath) {
    if (samplesPath) {
        if (!fs.existsSync(samplesPath)) {
            return { path: samplesPath, samples: [] };
        }
        const rows = toObjects(parseCsv(fs.readFileSync(samplesPath, 'utf8')));
        const samples = rows
            .map((row) => ({
                sampleId: clean(row.sampleId),
                bucket: clean(row.bucket),
                cctvId: clean(row.cctvId),
                framePath: clean(row.framePath),
                groundTruthPlate: clean(row.groundTruthPlate),
                conditions: clean(row.conditions),
                reviewer: clean(row.reviewer),
                reviewedAt: clean(row.reviewedAt),
                notes: clean(row.notes),
            }))
            .filter((sample) => sample.sampleId.length > 0);

        for (const sample of samples) {
            if (!REQUIRED_BUCKETS.includes(sample.bucket)) {
                throw new Error(`invalid bucket for sample ${sample.sampleId}: ${sample.bucket}`);
            }
            if (!sample.cctvId || !sample.framePath || !sample.groundTruthPlate || !sample.reviewer || !sample.reviewedAt) {
                throw new Error(`sample ${sample.sampleId} is missing required fields`);
            }
        }

        return { path: samplesPath, samples };
    }

    const resolvedPath = pickExistingPath(DEFAULT_SAMPLES_PATH, DEFAULT_SAMPLES_TEMPLATE_PATH);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
        return { path: resolvedPath ?? DEFAULT_SAMPLES_PATH, samples: [] };
    }

    const rows = toObjects(parseCsv(fs.readFileSync(resolvedPath, 'utf8')));
    const samples = rows
        .map((row) => ({
            sampleId: clean(row.sampleId),
            bucket: clean(row.bucket),
            cctvId: clean(row.cctvId),
            framePath: clean(row.framePath),
            groundTruthPlate: clean(row.groundTruthPlate),
            conditions: clean(row.conditions),
            reviewer: clean(row.reviewer),
            reviewedAt: clean(row.reviewedAt),
            notes: clean(row.notes),
        }))
        .filter((sample) => sample.sampleId.length > 0);

    for (const sample of samples) {
        if (!REQUIRED_BUCKETS.includes(sample.bucket)) {
            throw new Error(`invalid bucket for sample ${sample.sampleId}: ${sample.bucket}`);
        }
        if (!sample.cctvId || !sample.framePath || !sample.groundTruthPlate || !sample.reviewer || !sample.reviewedAt) {
            throw new Error(`sample ${sample.sampleId} is missing required fields`);
        }
    }

    return { path: resolvedPath, samples };
}

function loadObservations(observationsPath) {
    if (observationsPath) {
        if (!fs.existsSync(observationsPath)) {
            return { path: observationsPath, engine: 'other', observations: [] };
        }
        const payload = JSON.parse(fs.readFileSync(observationsPath, 'utf8'));
        const source = Array.isArray(payload)
            ? { observations: payload }
            : payload && typeof payload === 'object'
                ? payload
                : {};
        const engine = clean(source.engine) || 'other';
        const observations = Array.isArray(source.observations)
            ? source.observations.map((entry) => {
                const primary = normalizeEngineObservation(entry, engine);
                if (!primary) {
                    return null;
                }
                const comparisonEngines = Array.isArray(entry.comparisonEngines ?? entry.comparison_engines)
                    ? (entry.comparisonEngines ?? entry.comparison_engines)
                        .map((comparisonEntry) => normalizeEngineObservation(comparisonEntry, primary.engine))
                        .filter(Boolean)
                    : [];

                return {
                    sampleId: clean(entry.sampleId),
                    predictedPlate: primary.predictedPlate,
                    candidatePlates: primary.candidatePlates,
                    engine: primary.engine,
                    notes: primary.notes,
                    comparisonEngines,
                };
            }).filter((entry) => entry && entry.sampleId.length > 0)
            : [];

        return { path: observationsPath, engine, observations };
    }

    const resolvedPath = pickExistingPath(DEFAULT_OBSERVATIONS_PATH, DEFAULT_OBSERVATIONS_TEMPLATE_PATH);
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
        return { path: resolvedPath, engine: 'other', observations: [] };
    }

    const payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    const source = Array.isArray(payload)
        ? { observations: payload }
        : payload && typeof payload === 'object'
            ? payload
            : {};
    const engine = clean(source.engine) || 'other';
    const observations = Array.isArray(source.observations)
        ? source.observations.map((entry) => {
            const primary = normalizeEngineObservation(entry, engine);
            if (!primary) {
                return null;
            }
            const comparisonEngines = Array.isArray(entry.comparisonEngines ?? entry.comparison_engines)
                ? (entry.comparisonEngines ?? entry.comparison_engines)
                    .map((comparisonEntry) => normalizeEngineObservation(comparisonEntry, primary.engine))
                    .filter(Boolean)
                : [];

            return {
                sampleId: clean(entry.sampleId),
                predictedPlate: primary.predictedPlate,
                candidatePlates: primary.candidatePlates,
                engine: primary.engine,
                notes: primary.notes,
                comparisonEngines,
            };
        }).filter((entry) => entry && entry.sampleId.length > 0)
        : [];

    return { path: resolvedPath, engine, observations };
}

function latestReviewedAt(samples) {
    const reviewed = samples.map((sample) => sample.reviewedAt).filter(Boolean).sort();
    return reviewed.at(-1) || '1970-01-01';
}

function pickReviewer(samples) {
    return samples.map((sample) => sample.reviewer).find((value) => value.length > 0) || 'pending_review';
}

function deriveDatasetId(samplesPath) {
    const base = path.basename(samplesPath || 'ocr-alpr-backtest-samples.csv');
    return base.replace(/\.template$/i, '').replace(/\.csv$/i, '') || 'ocr-alpr-backtest-samples';
}

function summarizeBucket(samples, observations, bucket) {
    const bucketSamples = samples.filter((sample) => sample.bucket === bucket);
    const observationById = new Map(observations.map((observation) => [observation.sampleId, observation]));
    const observed = bucketSamples
        .map((sample) => ({ sample, observation: observationById.get(sample.sampleId) }))
        .filter((entry) => Boolean(entry.observation));

    if (observed.length === 0) {
        return null;
    }

    let exactCount = 0;
    let candidateCount = 0;
    let falsePositiveCount = 0;

    for (const { sample, observation } of observed) {
        const groundTruth = normalizePlate(sample.groundTruthPlate);
        const predicted = normalizePlate(observation.predictedPlate);
        const candidatePlates = observation.candidatePlates.map(normalizePlate);
        if (predicted && predicted === groundTruth) {
            exactCount += 1;
        }
        if ((predicted && predicted === groundTruth) || candidatePlates.includes(groundTruth)) {
            candidateCount += 1;
        }
        if (predicted && predicted !== groundTruth) {
            falsePositiveCount += 1;
        }
    }

    const sampleCount = observed.length;
    return {
        bucket,
        sampleCount,
        exactPlateAccuracy: Number((exactCount / sampleCount).toFixed(4)),
        candidateRecall: Number((candidateCount / sampleCount).toFixed(4)),
        falsePositiveRate: Number((falsePositiveCount / sampleCount).toFixed(4)),
    };
}

function summarizeEngineComparisons(samples, observations) {
    const sampleById = new Map(samples.map((sample) => [sample.sampleId, sample]));
    const statsByEngine = new Map();

    const record = (engine, sample, predictedPlate, candidatePlates) => {
        const engineName = clean(engine) || 'other';
        const groundTruth = normalizePlate(sample.groundTruthPlate);
        const predicted = normalizePlate(predictedPlate);
        const normalizedCandidates = (Array.isArray(candidatePlates) ? candidatePlates : [])
            .map(normalizePlate)
            .filter(Boolean);

        if (!statsByEngine.has(engineName)) {
            statsByEngine.set(engineName, {
                engine: engineName,
                sampleCount: 0,
                exactCount: 0,
                candidateCount: 0,
                falsePositiveCount: 0,
            });
        }

        const stats = statsByEngine.get(engineName);
        stats.sampleCount += 1;
        if (predicted && predicted === groundTruth) {
            stats.exactCount += 1;
        }
        if ((predicted && predicted === groundTruth) || normalizedCandidates.includes(groundTruth)) {
            stats.candidateCount += 1;
        }
        if (predicted && predicted !== groundTruth) {
            stats.falsePositiveCount += 1;
        }
    };

    for (const observation of observations) {
        const sample = sampleById.get(observation.sampleId);
        if (!sample) {
            continue;
        }
        record(observation.engine, sample, observation.predictedPlate, observation.candidatePlates);
        const seen = new Set([clean(observation.engine) || 'other']);
        for (const comparisonEngine of Array.isArray(observation.comparisonEngines) ? observation.comparisonEngines : []) {
            const engineName = clean(comparisonEngine.engine) || 'other';
            if (seen.has(engineName)) {
                continue;
            }
            seen.add(engineName);
            record(engineName, sample, comparisonEngine.predictedPlate, comparisonEngine.candidatePlates);
        }
    }

    return Array.from(statsByEngine.values())
        .map((stats) => ({
            engine: stats.engine,
            sampleCount: stats.sampleCount,
            exactPlateAccuracy: Number((stats.exactCount / stats.sampleCount).toFixed(4)),
            candidateRecall: Number((stats.candidateCount / stats.sampleCount).toFixed(4)),
            falsePositiveRate: Number((stats.falsePositiveCount / stats.sampleCount).toFixed(4)),
        }))
        .sort((left, right) => right.sampleCount - left.sampleCount || left.engine.localeCompare(right.engine));
}

function isActiveBucketResult(result) {
    return result.sampleCount >= POLICY.minSamplesPerBucket
        && result.exactPlateAccuracy >= POLICY.exactPlateAccuracyThreshold
        && result.candidateRecall >= POLICY.candidateRecallThreshold
        && result.falsePositiveRate <= POLICY.falsePositiveRateMax;
}

function buildBacktestReportFromData(samplesInput, observationsInput, options = {}) {
    const samples = Array.isArray(samplesInput) ? samplesInput : [];
    const observations = Array.isArray(observationsInput) ? observationsInput : [];
    const bucketResults = REQUIRED_BUCKETS
        .map((bucket) => summarizeBucket(samples, observations, bucket))
        .filter(Boolean);
    const engineComparisons = summarizeEngineComparisons(samples, observations);

    const report = {
        schemaVersion: 1,
        taxonomy: 'ocr_alpr_backtest_report_v1',
        active_report_count: 0,
        policy: POLICY,
        reports: [],
        engineComparisons,
    };

    if (bucketResults.length === 0) {
        return report;
    }

    const status = bucketResults.length === REQUIRED_BUCKETS.length && bucketResults.every(isActiveBucketResult)
        ? 'active'
        : 'review_needed';

    const engine = clean(options.engine)
        || observations.map((item) => clean(item.engine)).find((value) => value.length > 0)
        || 'other';
    const reportSamples = samples.filter((sample) => REQUIRED_BUCKETS.includes(sample.bucket));
    const evidence = {
        datasetPath: clean(options.datasetPath) || path.dirname(options.samplesPath || DEFAULT_SAMPLES_PATH),
        reportPath: clean(options.outputPath) || DEFAULT_OUTPUT_PATH,
        reviewer: pickReviewer(reportSamples),
        reviewedAt: latestReviewedAt(reportSamples),
    };

    report.reports.push({
        id: clean(options.reportId) || 'ocr-alpr-backtest-main',
        status,
        engine,
        datasetId: clean(options.datasetId) || deriveDatasetId(options.samplesPath),
        bucketResults,
        engineComparisons,
        evidence,
    });
    report.active_report_count = status === 'active' ? 1 : 0;
    return report;
}

function run() {
    const options = parseArgs(process.argv.slice(2));
    const samples = loadSamples(options.samplesPath);
    const observations = loadObservations(options.observationsPath);
    const report = buildBacktestReportFromData(samples.samples, observations.observations, {
        samplesPath: samples.path,
        observationsPath: observations.path,
        outputPath: options.outputPath,
        engine: observations.engine,
    });

    validateBacktestReport(report);

    if (options.write) {
        fs.writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }

    console.log(`ok - OCR/ALPR backtest report builder ${report.active_report_count > 0 ? 'ready' : 'pending'} (${report.active_report_count} active reports)`);
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
    buildBacktestReportFromData,
    loadObservations,
    loadSamples,
    parseCsv,
    toObjects,
};
