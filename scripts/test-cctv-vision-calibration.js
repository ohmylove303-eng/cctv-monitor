const assert = require('node:assert/strict');

const { mergeRows } = require('./apply-cctv-line-zone-patch');
const { auditRows } = require('./audit-cctv-vision-review-worklist');
const { buildCatalogFromReview, parseCsv } = require('./promote-cctv-vision-calibration-review');

const HEADER = 'reviewStatus,cctvId,cctvName,region,visionTier,identificationUse,approachDistanceMeters,resolutionWidth,resolutionHeight,directionCalibrationStatus,lineZoneForward,lineZoneReverse,evidenceSource,verificationMethod,sampleCount,datasetPath,reviewer,reviewedAt,notes';
const OPTIONS = { catalogPath: 'data/cctv-vision-calibration.json', minSampleCount: 3 };

function rows(line) {
    const parsed = parseCsv(`${HEADER}\n${line}\n`);
    const cols = parsed[0];
    return parsed.slice(1).map((values) => Object.fromEntries(cols.map((key, index) => [key, values[index] ?? ''])));
}

function mustReject(line, pattern) {
    assert.throws(() => buildCatalogFromReview(rows(line), OPTIONS), pattern);
}

buildCatalogFromReview(rows('review_needed,,,,,,,,,,,,,,,,,,'), OPTIONS);
mustReject(
    'active,KP-TR-001,검증 후보,김포,tier_a,fine_grained_vehicle,18,1280,720,none,,,manual review,sample frames,3,/verified/set,auditor,2026-04-27,',
    /resolution.height >= 1080/
);
mustReject(
    'active,KP-TR-002,검증 후보,김포,tier_b,vehicle_shape_direction,45,1280,720,calibrated,"0,400;1280,400",,manual review,sample frames,3,/verified/set,auditor,2026-04-27,',
    /lineZones.reverse/
);

const catalog = buildCatalogFromReview(
    rows('active,KP-TR-003,검증 후보,김포,tier_a,fine_grained_vehicle,18,1920,1080,calibrated,"240,720;1680,720","240,840;1680,840",manual review,sample frames,3,/verified/set,auditor,2026-04-27,verified'),
    OPTIONS
);
assert.equal(catalog.entries.length, 1);
assert.equal(catalog.entries[0].visionTier, 'tier_a');
assert.equal(catalog.entries[0].lineZones.forward.points[0][0], 240);

const worklistRows = rows('review_needed,GTIC-X-TEST,검증 후보,김포,,,,1920,1080,pending,,,sample_frame_capture,ffmpeg_multi_frame_probe,3,/sample,setter,,needs_line_zone');
const patchRows = rows('active,GTIC-X-TEST,검증 후보,김포,tier_a,fine_grained_vehicle,18,1920,1080,calibrated,"240,720;1680,720","240,840;1680,840",sample_frame_capture,ffmpeg_multi_frame_probe_and_manual_line_zone,3,/sample,auditor,2026-04-27,manual_patch');
const blockedPatch = mergeRows(worklistRows, patchRows, { allowActive: false, minSampleCount: 3 });
assert.equal(blockedPatch.summary.applied, 1);
assert.equal(blockedPatch.summary.activeBlocked, 1);
assert.equal(blockedPatch.rows[0].reviewStatus, 'review_needed');
assert.equal(blockedPatch.rows[0].lineZoneForward, '240,720;1680,720');
assert.match(blockedPatch.rows[0].notes, /active_status_blocked/);

const activePatch = mergeRows(worklistRows, patchRows, { allowActive: true, minSampleCount: 3 });
assert.equal(activePatch.rows[0].reviewStatus, 'active');

assert.throws(
    () => mergeRows(
        worklistRows,
        rows('review_needed,GTIC-X-TEST,검증 후보,김포,tier_a,fine_grained_vehicle,18,1920,1080,calibrated,"240,720;9999,720","240,840;1680,840",sample_frame_capture,ffmpeg_multi_frame_probe_and_manual_line_zone,3,/sample,auditor,2026-04-27,bad_line'),
        { allowActive: false, minSampleCount: 3 }
    ),
    /lineZoneForward point 2 x outside frame/
);

const audit = auditRows([
    {
        ...activePatch.rows[0],
        reviewStatus: 'review_needed',
    },
    {
        ...activePatch.rows[0],
        reviewStatus: 'active',
    },
    {
        ...activePatch.rows[0],
        reviewStatus: 'active',
        resolutionHeight: '720',
    },
], OPTIONS);
assert.equal(audit.summary.readyToMarkActive, 1);
assert.equal(audit.summary.activeGatePass, 1);
assert.equal(audit.summary.counts.active_blocked, 1);

console.log('ok - CCTV vision calibration promotion guardrails passed');
