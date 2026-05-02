const fs = require('node:fs');
const path = require('node:path');

const { validateBacktestReport } = require('./validate-vehicle-reid-runtime-backtest-report');

const REQUIRED_BUCKETS = ['day', 'night', 'cross_camera', 'long_distance', 'low_resolution'];
const DEFAULT_SAMPLES_PATH = path.resolve(__dirname, '../data/vehicle-reid-backtest-samples.csv');
const DEFAULT_SAMPLES_TEMPLATE_PATH = path.resolve(__dirname, '../data/vehicle-reid-backtest-samples.template.csv');
const DEFAULT_OBSERVATIONS_PATH = path.resolve(__dirname, '../data/vehicle-reid-backtest-observations.json');
const DEFAULT_OUTPUT_PATH = path.resolve(__dirname, '../data/vehicle-reid-runtime-backtest-report.json');

const POLICY = {
    noRuntimeMatchApprovalWithoutReviewedReport: true,
    requiredBuckets: [...REQUIRED_BUCKETS],
    minSamplesPerBucket: 20,
    minSamplesTotal: 100,
    matchSuccessRateThreshold: 0.85,
    falsePositiveRateMax: 0.05,
    falseNegativeRateMax: 0.15,
    notes: 'Same-vehicle ReID runtime remains disabled until reviewed backtest observations pass this gate.',
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
            console.log('Usage: node scripts/build-vehicle-reid-runtime-backtest-report.js [--check|--write] [--samples data/vehicle-reid-backtest-samples.csv] [--observations data/vehicle-reid-backtest-observations.json] [--output data/vehicle-reid-runtime-backtest-report.json]');
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

function parseDate(value) {
    const text = clean(value);
    if (!text) {
        return null;
    }
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function compareObservedAt(left, right) {
    const leftTime = parseDate(left.observedAt)?.getTime() ?? 0;
    const rightTime = parseDate(right.observedAt)?.getTime() ?? 0;
    if (leftTime !== rightTime) {
        return leftTime - rightTime;
    }
    return left.sampleId.localeCompare(right.sampleId);
}

function assertRequiredSample(sample) {
    if (!sample.identityId || !sample.bucket || !sample.cctvId || !sample.cropPath || !sample.observedAt || !sample.reviewer || !sample.reviewedAt) {
        throw new Error(`sample ${sample.sampleId || '<unknown>'} is missing required fields`);
    }
    if (!REQUIRED_BUCKETS.includes(sample.bucket)) {
        throw new Error(`invalid bucket for sample ${sample.sampleId}: ${sample.bucket}`);
    }
    if (!parseDate(sample.observedAt)) {
        throw new Error(`sample ${sample.sampleId} has invalid observedAt: ${sample.observedAt}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sample.reviewedAt) || !parseDate(`${sample.reviewedAt}T00:00:00.000Z`)) {
        throw new Error(`sample ${sample.sampleId} has invalid reviewedAt: ${sample.reviewedAt}`);
    }
}

function loadSamples(samplesPath) {
    const resolvedPath = samplesPath
        ? samplesPath
        : fs.existsSync(DEFAULT_SAMPLES_PATH)
            ? DEFAULT_SAMPLES_PATH
            : DEFAULT_SAMPLES_TEMPLATE_PATH;

    if (!fs.existsSync(resolvedPath)) {
        return { path: resolvedPath, samples: [] };
    }

    const rows = toObjects(parseCsv(fs.readFileSync(resolvedPath, 'utf8')));
    const seenIds = new Set();
    const samples = rows
        .map((row) => ({
            sampleId: clean(row.sampleId),
            identityId: clean(row.identityId),
            bucket: clean(row.bucket),
            cctvId: clean(row.cctvId),
            cropPath: clean(row.cropPath),
            observedAt: clean(row.observedAt),
            vehicleType: clean(row.vehicleType),
            reviewer: clean(row.reviewer),
            reviewedAt: clean(row.reviewedAt),
            notes: clean(row.notes),
        }))
        .filter((sample) => sample.sampleId.length > 0)
        .map((sample) => {
            assertRequiredSample(sample);
            if (seenIds.has(sample.sampleId)) {
                throw new Error(`duplicate sampleId: ${sample.sampleId}`);
            }
            seenIds.add(sample.sampleId);
            return sample;
        })
        .sort(compareObservedAt);

    return { path: resolvedPath, samples };
}

function loadObservations(observationsPath) {
    const resolvedPath = observationsPath || DEFAULT_OBSERVATIONS_PATH;
    if (!fs.existsSync(resolvedPath)) {
        return {
            path: resolvedPath,
            runtimeBackend: 'baseline',
            matchThreshold: 0.86,
            observations: [],
        };
    }

    const payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    const source = Array.isArray(payload)
        ? { observations: payload }
        : payload && typeof payload === 'object'
            ? payload
            : {};

    const runtimeBackend = clean(source.runtimeBackend || source.runtime_backend || source.engine || source.backend) || 'baseline';
    const matchThresholdRaw = source.matchThreshold ?? source.match_threshold ?? source.threshold;
    const matchThreshold = Number.isFinite(Number(matchThresholdRaw)) ? Number(matchThresholdRaw) : 0.86;
    const observations = Array.isArray(source.observations)
        ? source.observations.map((entry) => ({
            sampleId: clean(entry.sampleId || entry.sample_id),
            matchStatus: clean(entry.matchStatus || entry.match_status),
            matchScore: Number.isFinite(Number(entry.matchScore ?? entry.match_score)) ? Number(entry.matchScore ?? entry.match_score) : null,
            bestMatchSampleId: clean(entry.bestMatchSampleId || entry.best_match_sample_id),
            bestMatchIdentityId: clean(entry.bestMatchIdentityId || entry.best_match_identity_id),
            galleryEntriesBefore: Number.isFinite(Number(entry.galleryEntriesBefore ?? entry.gallery_entries_before)) ? Number(entry.galleryEntriesBefore ?? entry.gallery_entries_before) : null,
            galleryEntriesAfter: Number.isFinite(Number(entry.galleryEntriesAfter ?? entry.gallery_entries_after)) ? Number(entry.galleryEntriesAfter ?? entry.gallery_entries_after) : null,
            storedEntryId: clean(entry.storedEntryId || entry.stored_entry_id),
            notes: clean(entry.notes),
            engine: clean(entry.engine) || runtimeBackend,
        })).filter((entry) => entry.sampleId.length > 0)
        : [];

    return { path: resolvedPath, runtimeBackend, matchThreshold, observations };
}

function deriveDatasetId(samplesPath) {
    const base = path.basename(samplesPath || 'vehicle-reid-backtest-samples.csv');
    return base.replace(/\.template(\.csv)?$/i, '').replace(/\.csv$/i, '') || 'vehicle-reid-backtest-samples';
}

function latestReviewedAt(samples) {
    const reviewed = samples.map((sample) => sample.reviewedAt).filter(Boolean).sort();
    return reviewed.at(-1) || '1970-01-01';
}

function pickReviewer(samples) {
    return samples.map((sample) => sample.reviewer).find((value) => value.length > 0) || 'pending_review';
}

function safeRate(numerator, denominator) {
    if (!denominator) {
        return 0;
    }
    return Number((numerator / denominator).toFixed(4));
}

function createBucketResult(bucket) {
    return {
        bucket,
        sampleCount: 0,
        reviewedSampleCount: 0,
        missingObservationCount: 0,
        expectedPositiveCount: 0,
        expectedNegativeCount: 0,
        truePositiveMatches: 0,
        trueNegativeUnmatched: 0,
        falsePositiveMatches: 0,
        falseNegativeUnmatched: 0,
        matchSuccessRate: 0,
        falsePositiveRate: 0,
        falseNegativeRate: 0,
    };
}

function getMatchStatus(observation) {
    const status = clean(observation?.matchStatus || observation?.match_status).toLowerCase();
    if (status) {
        return status;
    }
    if (clean(observation?.bestMatchSampleId || observation?.best_match_sample_id).length > 0) {
        return 'matched';
    }
    return 'unmatched';
}

function buildVehicleReidRuntimeBacktestReportFromData(samplesInput, observationsInput, options = {}) {
    const samples = Array.isArray(samplesInput) ? samplesInput.slice().sort(compareObservedAt) : [];
    const observations = Array.isArray(observationsInput) ? observationsInput : [];
    const observationsById = new Map(observations.map((entry) => [clean(entry.sampleId || entry.sample_id), entry]));
    const sampleById = new Map(samples.map((sample) => [sample.sampleId, sample]));
    const bucketResults = new Map(REQUIRED_BUCKETS.map((bucket) => [bucket, createBucketResult(bucket)]));

    let sampleCountTotal = samples.length;
    let reviewedSampleCount = 0;
    let missingObservationCount = 0;
    let expectedPositiveCount = 0;
    let expectedNegativeCount = 0;
    let truePositiveMatches = 0;
    let trueNegativeUnmatched = 0;
    let falsePositiveMatches = 0;
    let falseNegativeUnmatched = 0;
    let galleryEntriesBefore = null;
    let galleryEntriesAfter = null;
    const seenIdentityIds = new Set();

    for (const sample of samples) {
        const bucketResult = bucketResults.get(sample.bucket) || bucketResults.get(REQUIRED_BUCKETS[0]);
        bucketResult.sampleCount += 1;

        const observation = observationsById.get(sample.sampleId);
        if (!observation) {
            bucketResult.missingObservationCount += 1;
            missingObservationCount += 1;
            continue;
        }

        reviewedSampleCount += 1;
        bucketResult.reviewedSampleCount += 1;

        const expectedPositive = seenIdentityIds.has(sample.identityId);
        const expectedNegative = !expectedPositive;
        if (expectedPositive) {
            expectedPositiveCount += 1;
            bucketResult.expectedPositiveCount += 1;
        } else {
            expectedNegativeCount += 1;
            bucketResult.expectedNegativeCount += 1;
        }

        const matchStatus = getMatchStatus(observation);
        const bestMatchSampleId = clean(observation.bestMatchSampleId || observation.best_match_sample_id);
        const bestMatchIdentityId = clean(observation.bestMatchIdentityId || observation.best_match_identity_id) || clean(sampleById.get(bestMatchSampleId)?.identityId);
        const actualMatched = matchStatus === 'matched';
        const matchesIdentity = actualMatched && bestMatchIdentityId.length > 0 && bestMatchIdentityId === sample.identityId;

        if (actualMatched && expectedPositive && matchesIdentity) {
            truePositiveMatches += 1;
            bucketResult.truePositiveMatches += 1;
        } else if (actualMatched && expectedNegative) {
            falsePositiveMatches += 1;
            bucketResult.falsePositiveMatches += 1;
        } else if (actualMatched && expectedPositive && !matchesIdentity) {
            falseNegativeUnmatched += 1;
            bucketResult.falseNegativeUnmatched += 1;
        } else if (!actualMatched && expectedPositive) {
            falseNegativeUnmatched += 1;
            bucketResult.falseNegativeUnmatched += 1;
        } else if (!actualMatched && expectedNegative) {
            trueNegativeUnmatched += 1;
            bucketResult.trueNegativeUnmatched += 1;
        }

        if (galleryEntriesBefore === null && Number.isFinite(Number(observation.galleryEntriesBefore ?? observation.gallery_entries_before))) {
            galleryEntriesBefore = Number(observation.galleryEntriesBefore ?? observation.gallery_entries_before);
        }
        if (Number.isFinite(Number(observation.galleryEntriesAfter ?? observation.gallery_entries_after))) {
            galleryEntriesAfter = Number(observation.galleryEntriesAfter ?? observation.gallery_entries_after);
        }

        seenIdentityIds.add(sample.identityId);
    }

    for (const bucketResult of bucketResults.values()) {
        bucketResult.matchSuccessRate = safeRate(bucketResult.truePositiveMatches, bucketResult.expectedPositiveCount);
        bucketResult.falsePositiveRate = safeRate(bucketResult.falsePositiveMatches, bucketResult.expectedNegativeCount);
        bucketResult.falseNegativeRate = safeRate(bucketResult.falseNegativeUnmatched, bucketResult.expectedPositiveCount);
    }

    const observationCoverage = safeRate(reviewedSampleCount, sampleCountTotal);
    const galleryBefore = Number.isFinite(galleryEntriesBefore) ? galleryEntriesBefore : 0;
    const galleryAfter = Number.isFinite(galleryEntriesAfter) ? galleryEntriesAfter : (Number.isFinite(galleryEntriesBefore) ? galleryEntriesBefore + reviewedSampleCount : reviewedSampleCount);
    const galleryGrowth = Math.max(0, galleryAfter - galleryBefore);

    const overall = {
        sampleCountTotal,
        reviewedSampleCount,
        missingObservationCount,
        expectedPositiveCount,
        expectedNegativeCount,
        truePositiveMatches,
        trueNegativeUnmatched,
        falsePositiveMatches,
        falseNegativeUnmatched,
        matchSuccessRate: safeRate(truePositiveMatches, expectedPositiveCount),
        falsePositiveRate: safeRate(falsePositiveMatches, expectedNegativeCount),
        falseNegativeRate: safeRate(falseNegativeUnmatched, expectedPositiveCount),
        galleryEntriesBefore: Math.max(0, galleryBefore),
        galleryEntriesAfter: Math.max(0, galleryAfter),
        galleryGrowth,
        observationCoverage,
    };

    const requiredBucketResults = REQUIRED_BUCKETS.map((bucket) => bucketResults.get(bucket) || createBucketResult(bucket));
    const totalReviewSatisfied = sampleCountTotal >= POLICY.minSamplesTotal
        && reviewedSampleCount === sampleCountTotal
        && missingObservationCount === 0
        && requiredBucketResults.every((bucketResult) => bucketResult.sampleCount >= POLICY.minSamplesPerBucket && bucketResult.reviewedSampleCount === bucketResult.sampleCount);
    const thresholdsSatisfied = overall.matchSuccessRate >= POLICY.matchSuccessRateThreshold
        && overall.falsePositiveRate <= POLICY.falsePositiveRateMax
        && overall.falseNegativeRate <= POLICY.falseNegativeRateMax;
    const status = sampleCountTotal === 0 || reviewedSampleCount === 0
        ? 'pending_review'
        : totalReviewSatisfied && thresholdsSatisfied
            ? 'active'
            : 'review_needed';

    const runtimeBackend = clean(options.runtimeBackend || observations.map((item) => clean(item.engine)).find((value) => value.length > 0) || 'baseline');
    const matchThreshold = Number.isFinite(Number(options.matchThreshold))
        ? Number(options.matchThreshold)
        : Number.isFinite(Number(observations.matchThreshold ?? observations.match_threshold))
            ? Number(observations.matchThreshold ?? observations.match_threshold)
            : 0.86;
    const generatedAt = options.generatedAt || new Date().toISOString();

    return {
        schemaVersion: 1,
        taxonomy: 'vehicle_reid_runtime_backtest_report_v1',
        active_report_count: status === 'active' ? 1 : 0,
        policy: POLICY,
        reports: [
            {
                id: clean(options.reportId) || 'vehicle-reid-runtime-backtest-main',
                status,
                engine: runtimeBackend,
                datasetId: clean(options.datasetId) || deriveDatasetId(options.samplesPath),
                sampleCountTotal,
                reviewedSampleCount,
                missingObservationCount,
                bucketResults: requiredBucketResults,
                summary: overall,
                evidence: {
                    datasetPath: clean(options.datasetPath) || path.dirname(options.samplesPath || DEFAULT_SAMPLES_PATH),
                    samplesPath: clean(options.samplesPath) || (options.samplesPath || DEFAULT_SAMPLES_PATH),
                    observationsPath: clean(options.observationsPath) || (options.observationsPath || DEFAULT_OBSERVATIONS_PATH),
                    reportPath: clean(options.outputPath) || DEFAULT_OUTPUT_PATH,
                    reviewer: pickReviewer(samples),
                    reviewedAt: latestReviewedAt(samples),
                    generatedAt,
                    runtimeBackend,
                    matchThreshold,
                },
            },
        ],
    };
}

function run() {
    const options = parseArgs(process.argv.slice(2));
    const samples = loadSamples(options.samplesPath);
    const observations = loadObservations(options.observationsPath);
    const report = buildVehicleReidRuntimeBacktestReportFromData(samples.samples, observations.observations, {
        samplesPath: samples.path,
        observationsPath: observations.path,
        outputPath: options.outputPath,
        runtimeBackend: observations.runtimeBackend,
        matchThreshold: observations.matchThreshold,
    });

    validateBacktestReport(report);

    if (options.write) {
        fs.writeFileSync(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    }

    console.log(`ok - vehicle ReID runtime backtest report builder ${report.active_report_count > 0 ? 'ready' : 'pending'} (${report.active_report_count} active reports)`);
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
    buildVehicleReidRuntimeBacktestReportFromData,
    loadObservations,
    loadSamples,
    parseCsv,
    toObjects,
};
