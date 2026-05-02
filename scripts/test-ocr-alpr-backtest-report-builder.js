const assert = require('node:assert/strict');
const { buildBacktestReportFromData } = require('./build-ocr-alpr-backtest-report');

function run() {
    const empty = buildBacktestReportFromData([], [], {
        samplesPath: '/tmp/ocr-alpr-backtest-samples.template.csv',
        outputPath: '/tmp/ocr-alpr-backtest-report.json',
    });
    assert.equal(empty.active_report_count, 0);
    assert.deepEqual(empty.reports, []);

    const baseSamples = [
        { bucket: 'night', cctvId: 'cctv-1', framePath: '/tmp/night.jpg', groundTruthPlate: '12가3456', conditions: 'night' },
        { bucket: 'backlight', cctvId: 'cctv-2', framePath: '/tmp/backlight.jpg', groundTruthPlate: '34나5678', conditions: 'backlight' },
        { bucket: 'long_distance', cctvId: 'cctv-3', framePath: '/tmp/long.jpg', groundTruthPlate: '56다7890', conditions: 'long_distance' },
        { bucket: 'low_resolution', cctvId: 'cctv-4', framePath: '/tmp/low.jpg', groundTruthPlate: '78라9012', conditions: 'low_resolution' },
    ];

    const samples = baseSamples.flatMap((base, bucketIndex) =>
        Array.from({ length: 30 }, (_, index) => {
            const sampleId = `${base.bucket}-${String(index + 1).padStart(3, '0')}`;
            return {
                sampleId,
                bucket: base.bucket,
                cctvId: `${base.cctvId}-${bucketIndex + 1}`,
                framePath: `${base.framePath.replace('.jpg', '')}-${String(index + 1).padStart(3, '0')}.jpg`,
                groundTruthPlate: base.groundTruthPlate,
                conditions: base.conditions,
                reviewer: 'unit',
                reviewedAt: '2026-04-29',
            };
        })
    );
    const observations = samples.map((sample) => ({
        sampleId: sample.sampleId,
        engine: 'easyocr',
        predictedPlate: sample.groundTruthPlate,
        candidatePlates: [sample.groundTruthPlate, `${sample.groundTruthPlate}X`],
        comparisonEngines: [
            {
                engine: 'paddleocr',
                predictedPlate: sample.groundTruthPlate,
                candidatePlates: [sample.groundTruthPlate, `${sample.groundTruthPlate}P`],
            },
            {
                engine: 'dedicated_alpr',
                predictedPlate: sample.groundTruthPlate,
                candidatePlates: [sample.groundTruthPlate, `${sample.groundTruthPlate}A`],
            },
        ],
    }));

    const active = buildBacktestReportFromData(samples, observations, {
        samplesPath: '/tmp/ocr-alpr-backtest-samples.csv',
        outputPath: '/tmp/ocr-alpr-backtest-report.json',
        engine: 'easyocr',
    });
    assert.equal(active.active_report_count, 1);
    assert.equal(active.reports[0].status, 'active');
    assert.equal(active.reports[0].bucketResults.length, 4);
    assert.equal(active.reports[0].bucketResults[0].sampleCount, 30);
    assert.equal(active.reports[0].bucketResults[0].exactPlateAccuracy, 1);
    assert.equal(active.reports[0].bucketResults[0].candidateRecall, 1);
    assert.equal(active.reports[0].bucketResults[0].falsePositiveRate, 0);
    assert.equal(active.reports[0].engineComparisons.length, 3);
    assert.deepEqual(
        active.reports[0].engineComparisons.map((entry) => entry.engine).sort(),
        ['dedicated_alpr', 'easyocr', 'paddleocr'].sort(),
    );

    console.log('ok - OCR/ALPR backtest report builder checks passed');
}

run();
