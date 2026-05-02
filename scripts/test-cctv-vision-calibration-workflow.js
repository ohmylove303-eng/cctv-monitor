const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { HEADERS, mergeRows } = require('./apply-cctv-line-zone-patch');
const { auditRows } = require('./audit-cctv-vision-review-worklist');
const { buildPacket, resolutionGate } = require('./build-cctv-vision-review-packet');
const { buildCatalogFromReview, parseCsv } = require('./promote-cctv-vision-calibration-review');
const { summarize } = require('./summarize-cctv-vision-review-status');

const OPTIONS = {
    catalogPath: 'data/cctv-vision-calibration.json',
    minSampleCount: 3,
};

function row(values) {
    return Object.fromEntries(HEADERS.map((header) => [header, values[header] ?? '']));
}

function csvRows(rows) {
    const parsed = parseCsv(`${csvText(rows)}\n`);
    return parsed.slice(1).map((values) => Object.fromEntries(parsed[0].map((header, index) => [header, values[index] ?? ''])));
}

function csvText(rows) {
    const csv = [
        HEADERS.join(','),
        ...rows.map((candidate) => HEADERS.map((header) => {
            const text = String(candidate[header] ?? '');
            return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        }).join(',')),
    ].join('\n');
    return csv;
}

const baseWorklist = row({
    reviewStatus: 'review_needed',
    cctvId: 'WF-TIER-A-001',
    cctvName: 'workflow fixture',
    region: '김포',
    resolutionWidth: '1920',
    resolutionHeight: '1080',
    directionCalibrationStatus: 'pending',
    evidenceSource: 'sample_frame_capture',
    verificationMethod: 'ffmpeg_multi_frame_probe',
    sampleCount: '3',
    datasetPath: '/tmp/cctv-vision-workflow-fixture',
    notes: 'fixture_only',
});

const reviewedPatch = row({
    reviewStatus: 'active',
    cctvId: 'WF-TIER-A-001',
    cctvName: 'workflow fixture',
    region: '김포',
    visionTier: 'tier_a',
    identificationUse: 'fine_grained_vehicle',
    approachDistanceMeters: '18',
    resolutionWidth: '1920',
    resolutionHeight: '1080',
    directionCalibrationStatus: 'calibrated',
    lineZoneForward: '240,720;1680,720',
    lineZoneReverse: '240,840;1680,840',
    evidenceSource: 'sample_frame_capture',
    verificationMethod: 'ffmpeg_multi_frame_probe_and_manual_line_zone',
    sampleCount: '3',
    datasetPath: '/tmp/cctv-vision-workflow-fixture',
    reviewer: 'workflow-auditor',
    reviewedAt: '2026-04-29',
    notes: 'fixture_only; manual_line_zone_review',
});

const blockedMerge = mergeRows(csvRows([baseWorklist]), csvRows([reviewedPatch]), {
    allowActive: false,
    minSampleCount: OPTIONS.minSampleCount,
});
assert.equal(blockedMerge.rows.length, 1);
assert.equal(blockedMerge.rows[0].reviewStatus, 'review_needed');
assert.equal(blockedMerge.summary.activeBlocked, 1);

const blockedAudit = auditRows(blockedMerge.rows, OPTIONS);
assert.equal(blockedAudit.summary.readyToMarkActive, 1);
assert.equal(blockedAudit.summary.activeGatePass, 0);
assert.equal(blockedAudit.items[0].auditStatus, 'ready_to_mark_active');

const activeMerge = mergeRows(csvRows([baseWorklist]), csvRows([reviewedPatch]), {
    allowActive: true,
    minSampleCount: OPTIONS.minSampleCount,
});
assert.equal(activeMerge.rows[0].reviewStatus, 'active');

const activeAudit = auditRows(activeMerge.rows, OPTIONS);
assert.equal(activeAudit.summary.activeGatePass, 1);
assert.equal(activeAudit.items[0].auditStatus, 'active_gate_pass');
assert.equal(resolutionGate(1920, 1080), 'tier_a_resolution_ok_needs_distance_line_zone');
assert.equal(resolutionGate(1280, 720), 'tier_b_resolution_review_not_tier_a');
assert.equal(resolutionGate(640, 480), 'tier_c_low_resolution_review');

const catalog = buildCatalogFromReview(activeMerge.rows, OPTIONS);
assert.equal(catalog.entries.length, 1);
assert.equal(catalog.entries[0].cctvId, 'WF-TIER-A-001');
assert.equal(catalog.entries[0].visionTier, 'tier_a');
assert.equal(catalog.entries[0].identificationUse, 'fine_grained_vehicle');
assert.equal(catalog.entries[0].directionCalibrationStatus, 'calibrated');
assert.equal(catalog.entries[0].lineZones.forward.points[1][0], 1680);

const badTierPatch = {
    ...reviewedPatch,
    cctvId: 'WF-TIER-A-001',
    resolutionHeight: '720',
};
assert.throws(
    () => mergeRows(csvRows([baseWorklist]), csvRows([badTierPatch]), {
        allowActive: true,
        minSampleCount: OPTIONS.minSampleCount,
    }),
    /tier_a requires resolutionHeight >= 1080/
);

const tierBWorklist = row({
    ...baseWorklist,
    cctvId: 'WF-TIER-B-001',
    cctvName: 'workflow tier b fixture',
    resolutionWidth: '1280',
    resolutionHeight: '720',
});
const packet = buildPacket([blockedMerge.rows[0], tierBWorklist], {
    sampleDir: '/tmp/cctv-vision-workflow-fixture',
    summary: {
        captured: 2,
        capturedFrames: 6,
    },
    samples: [
        {
            cctvId: 'WF-TIER-A-001',
            cctvName: 'workflow fixture',
            source: 'fixture',
            streamUrl: 'https://example.invalid/tier-a.m3u8',
            width: 1920,
            height: 1080,
            capturedFrames: 3,
            frames: [
                { outputPath: '/tmp/cctv-vision-workflow-fixture/a1.jpg', width: 1920, height: 1080 },
            ],
        },
        {
            cctvId: 'WF-TIER-B-001',
            cctvName: 'workflow tier b fixture',
            source: 'fixture',
            streamUrl: 'https://example.invalid/tier-b.m3u8',
            width: 1280,
            height: 720,
            capturedFrames: 3,
            frames: [
                { outputPath: '/tmp/cctv-vision-workflow-fixture/b1.jpg', width: 1280, height: 720 },
            ],
        },
    ],
}, {
    ...OPTIONS,
    reviewCsvPath: '/tmp/cctv-vision-workflow-fixture/worklist.csv',
    sampleReportPath: '/tmp/cctv-vision-workflow-fixture/sample-report.json',
});
assert.equal(packet.summary.sampleCaptured, 2);
assert.equal(packet.summary.sampleFrames, 6);
assert.equal(packet.items[0].resolutionGate, 'tier_a_resolution_ok_needs_distance_line_zone');
assert.equal(packet.items[0].maxTierByResolution, 'tier_a_if_distance_<=20m');
assert.equal(packet.items[1].resolutionGate, 'tier_b_resolution_review_not_tier_a');
assert.equal(packet.items[1].maxTierByResolution, 'tier_b_or_lower');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cctv-vision-review-next-'));
const tempCatalog = path.join(tempDir, 'catalog.json');
const tempWorklist = path.join(tempDir, 'worklist.csv');
const tempPatch = path.join(tempDir, 'patch.csv');
const tempSampleReport = path.join(tempDir, 'sample-report.json');

fs.writeFileSync(tempCatalog, `${JSON.stringify({
    schemaVersion: 1,
    taxonomy: 'cctv_vision_calibration_v1',
    policy: {
        noInferenceWithoutEvidence: true,
        defaultStatus: 'review_needed',
    },
    entries: [],
}, null, 2)}\n`);
fs.writeFileSync(tempWorklist, `${csvText([baseWorklist])}\n`);
fs.writeFileSync(tempPatch, `${csvText([reviewedPatch])}\n`);
fs.writeFileSync(tempSampleReport, `${JSON.stringify({
    sampleDir: tempDir,
    summary: {
        captured: 1,
        capturedFrames: 3,
    },
    samples: [
        {
            cctvId: 'WF-TIER-A-001',
            cctvName: 'workflow fixture',
            source: 'fixture',
            streamUrl: 'https://example.invalid/tier-a.m3u8',
            width: 1920,
            height: 1080,
            capturedFrames: 3,
            frames: [
                { outputPath: path.join(tempDir, 'a1.jpg'), width: 1920, height: 1080 },
            ],
        },
    ],
}, null, 2)}\n`);

const nextSummary = summarize({
    catalogPath: tempCatalog,
    jsonPath: path.join(tempDir, 'next.json'),
    markdownPath: path.join(tempDir, 'next.md'),
    minSampleCount: OPTIONS.minSampleCount,
    patchCsvPath: tempPatch,
    reviewCsvPath: tempWorklist,
    sampleReportPath: tempSampleReport,
    write: false,
});
assert.equal(nextSummary.summary.activeCatalogEntries, 0);
assert.equal(nextSummary.summary.patchRowsAppliedInDryRun, 1);
assert.equal(nextSummary.targets[0].maxTierByResolution, 'tier_a_if_distance_<=20m');
assert.deepEqual(nextSummary.targets[0].manualInputsRemaining, [
    'visionTier',
    'identificationUse',
    'approachDistanceMeters',
    'reviewer',
    'reviewedAt',
    'directionCalibrationStatus',
    'lineZoneForward',
    'lineZoneReverse',
]);

console.log('ok - CCTV vision calibration workflow harness passed');
