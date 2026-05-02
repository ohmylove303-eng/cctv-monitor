const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const moduleCache = new Map();

function loadTsModule(relativePath) {
    const filePath = path.resolve(__dirname, '..', relativePath);
    if (moduleCache.has(filePath)) return moduleCache.get(filePath).exports;

    const source = fs.readFileSync(filePath, 'utf8');
    const transpiled = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
        fileName: filePath,
    });

    const module = { exports: {} };
    moduleCache.set(filePath, module);

    const localRequire = (specifier) => {
        if (specifier === '@/lib/traffic-sources') return loadTsModule('lib/traffic-sources.ts');
        if (specifier === '@/lib/road-presets') return loadTsModule('lib/road-presets.ts');
        return require(specifier);
    };

    const evaluator = new Function('exports', 'module', 'require', transpiled.outputText);
    evaluator(module.exports, module, localRequire);
    return module.exports;
}

function trafficCamera(overrides) {
    return {
        id: 'camera',
        name: '[수도권제1순환선] 카메라',
        type: 'traffic',
        status: '정상',
        region: '김포',
        district: '김포',
        address: '수도권제1순환선',
        operator: 'National-ITS',
        streamUrl: 'https://example.com/live.m3u8',
        hlsUrl: 'https://example.com/live.m3u8',
        lat: 37.5,
        lng: 126.7,
        source: 'National-ITS',
        coordinateSource: 'its_api',
        coordinateVerified: true,
        ...overrides,
    };
}

function buildCalibration(overrides = {}) {
    return {
        taxonomy: 'cctv_vision_calibration_v1',
        status: 'active',
        visionTier: 'tier_a',
        identificationUse: 'fine_grained_vehicle',
        approachDistanceMeters: 18,
        resolution: { width: 1920, height: 1080 },
        directionCalibrationStatus: 'calibrated',
        lineZones: {
            forward: { label: 'forward', points: [[240, 720], [1680, 720]] },
            reverse: { label: 'reverse', points: [[240, 840], [1680, 840]] },
        },
        evidence: {
            source: 'fixture',
            verificationMethod: 'unit test',
            sampleCount: 3,
            datasetPath: 'fixtures/route-monitoring',
            reviewer: 'test',
            reviewedAt: '2026-04-27',
        },
        ...overrides,
    };
}

function assertTravelOrder(plan, ids) {
    assert.ok(plan, 'route plan should be built');
    assert.deepEqual(
        plan.candidates.slice(0, ids.length).map((candidate) => candidate.id),
        ids,
        'route candidates must stay sorted by ETA/travel order'
    );
    assert.deepEqual(
        plan.candidates.slice(0, ids.length).map((candidate) => candidate.travelOrder),
        ids.map((_, index) => index + 1),
        'travelOrder should be sequential after ETA sorting'
    );
}

function run() {
    const { buildRouteMonitoringPlan, buildRouteScopedTrackScope } = loadTsModule('lib/route-monitoring.ts');
    const { createFallbackTrackResponse } = loadTsModule('lib/forensic-fallback.ts');

    const origin = trafficCamera({
        id: 'origin',
        name: '[수도권제1순환선] 김포',
        lng: 126.7,
    });
    const near = trafficCamera({
        id: 'near',
        name: '[수도권제1순환선] 본선 1',
        lng: 126.71,
    });
    const mid = trafficCamera({
        id: 'mid',
        name: '[수도권제1순환선] 본선 2',
        lng: 126.735,
    });
    const highIdButLater = trafficCamera({
        id: 'high-id-later',
        name: '[수도권제1순환선] 서운분기점 IC 사거리',
        lng: 126.785,
        visionCalibration: buildCalibration(),
    });
    const offAxisRisk = trafficCamera({
        id: 'off-axis-risk',
        name: '[수도권제1순환선] 외측 교차로',
        lat: 37.555,
        lng: 126.845,
        visionCalibration: buildCalibration({
            visionTier: 'tier_c',
            identificationUse: 'traffic_flow_only',
            approachDistanceMeters: 120,
            resolution: { width: 1280, height: 720 },
            directionCalibrationStatus: 'pending',
            lineZones: {
                forward: { label: 'forward', points: [[180, 660], [1700, 690]] },
                reverse: { label: 'reverse', points: [[180, 880], [1700, 910]] },
            },
        }),
    });
    const reverseSide = trafficCamera({
        id: 'reverse-side',
        name: '[수도권제1순환선] 일산방향',
        lng: 126.68,
        visionCalibration: buildCalibration({
            visionTier: 'tier_b',
            approachDistanceMeters: 35,
            directionCalibrationStatus: 'calibrated',
            lineZones: {
                forward: { label: 'forward', points: [[220, 700], [1680, 710]] },
                reverse: { label: 'reverse', points: [[220, 830], [1680, 840]] },
            },
        }),
    });

    const plan = buildRouteMonitoringPlan(
        origin,
        [origin, highIdButLater, reverseSide, mid, near, offAxisRisk],
        'ring1',
        { direction: 'forward', speedKph: 60 }
    );

    assertTravelOrder(plan, ['near', 'mid', 'high-id-later', 'off-axis-risk']);
    assert.ok(
        plan.candidates.find((candidate) => candidate.id === 'high-id-later').identificationScore
        > plan.candidates.find((candidate) => candidate.id === 'near').identificationScore,
        'a stronger identification camera can score higher without jumping ahead of ETA order'
    );
    assert.equal(
        plan.candidates.find((candidate) => candidate.id === 'high-id-later').laneDirectionStatus,
        'calibrated',
        'calibrated cameras should expose lane direction status'
    );
    assert.equal(
        plan.candidates.find((candidate) => candidate.id === 'high-id-later').laneDirectionLabel,
        'forward',
        'forward-aligned cameras should preserve the resolved lane label'
    );
    assert.equal(
        plan.candidates.find((candidate) => candidate.id === 'high-id-later').laneDirectionSource,
        'vision_line_zone',
        'calibrated cameras should mark vision_line_zone as the source'
    );
    assert.equal(
        plan.candidates.find((candidate) => candidate.id === 'high-id-later').trafficCongestionStatus,
        'inferred',
        'traffic congestion should be inferred when enough ETA spacing exists'
    );
    assert.equal(
        plan.candidates.find((candidate) => candidate.id === 'high-id-later').trafficCongestionSource,
        'eta_spacing',
        'traffic congestion should use eta_spacing as the source'
    );
    assert.ok(
        ['low', 'medium', 'high'].includes(plan.candidates.find((candidate) => candidate.id === 'high-id-later').trafficCongestionLevel),
        'traffic congestion should carry a level when inferred'
    );
    assert.equal(
        plan.candidates.find((candidate) => candidate.id === 'off-axis-risk').routeDeviationRisk,
        'high',
        'off-axis cameras with weak calibration should be marked as high route deviation risk'
    );
    assert.equal(
        plan.candidates.find((candidate) => candidate.id === 'off-axis-risk').laneDirectionStatus,
        'unknown',
        'uncalibrated cameras should keep lane direction unknown'
    );
    assert.equal(
        plan.candidates.find((candidate) => candidate.id === 'off-axis-risk').laneDirectionSource,
        'not_calibrated',
        'uncalibrated cameras should report not_calibrated source'
    );
    assert.ok(
        plan.candidates.find((candidate) => candidate.id === 'off-axis-risk').delayRiskScore
        > plan.candidates.find((candidate) => candidate.id === 'near').delayRiskScore,
        'later off-axis cameras should carry a higher delay risk score than near cameras'
    );
    assert.equal(
        plan.candidates.some((candidate) => candidate.id === 'reverse-side'),
        false,
        'opposite-direction cameras should be excluded from forward route candidates'
    );

    const trackScope = [highIdButLater, near, mid, offAxisRisk].map((camera) => ({
        id: camera.id,
        name: camera.name,
        region: camera.region,
        address: camera.address,
        lat: camera.lat,
        lng: camera.lng,
        source: camera.source,
        streamUrl: camera.hlsUrl,
    }));
    const scoped = buildRouteScopedTrackScope(trackScope, plan, 'bundle');
    assert.deepEqual(
        scoped.map((camera) => camera.id),
        ['near', 'mid', 'high-id-later', 'off-axis-risk'],
        'tracking scope should preserve route ETA order'
    );
    assert.equal(
        scoped.find((camera) => camera.id === 'high-id-later').identificationGrade,
        'high',
        'tracking scope should preserve identification-friendly CCTV metadata'
    );
    assert.equal(
        scoped.find((camera) => camera.id === 'high-id-later').visionCalibration.visionTier,
        'tier_a',
        'tracking scope should preserve verified vision calibration metadata'
    );
    assert.equal(
        scoped.find((camera) => camera.id === 'high-id-later').laneDirectionStatus,
        'calibrated',
        'tracking scope should preserve lane direction status'
    );
    assert.equal(
        scoped.find((camera) => camera.id === 'high-id-later').laneDirectionLabel,
        'forward',
        'tracking scope should preserve lane direction labels'
    );
    assert.equal(
        scoped.find((camera) => camera.id === 'high-id-later').trafficCongestionStatus,
        'inferred',
        'tracking scope should preserve traffic congestion contract'
    );
    assert.equal(
        scoped.find((camera) => camera.id === 'high-id-later').trafficCongestionSource,
        'eta_spacing',
        'tracking scope should preserve traffic congestion source contract'
    );
    assert.equal(
        scoped.find((camera) => camera.id === 'off-axis-risk').routeDeviationRisk,
        'high',
        'tracking scope should preserve route deviation risk metadata'
    );
    assert.equal(
        scoped.find((camera) => camera.id === 'off-axis-risk').laneDirectionStatus,
        'unknown',
        'tracking scope should preserve unknown lane direction status'
    );
    assert.ok(
        scoped.find((camera) => camera.id === 'off-axis-risk').delayRiskScore
        > scoped.find((camera) => camera.id === 'near').delayRiskScore,
        'tracking scope should preserve delay risk ordering'
    );

    const fallbackTrack = createFallbackTrackResponse({
        origin_cctv_id: 'off-axis-risk',
        cctv_list: scoped,
        route_context: {
            roadLabel: '수도권제1순환선',
            scopeLabel: 'bundle',
        },
    });
    assert.ok(
        fallbackTrack.hits.length > 0,
        'fallback track response should include at least one hit'
    );
    assert.equal(
        fallbackTrack.hits[0].delay_risk_score !== undefined,
        true,
        'fallback track hits should preserve delay risk scores'
    );
    assert.equal(
        fallbackTrack.hits[0].route_deviation_risk,
        'high',
        'fallback track hits should preserve route deviation risk'
    );

    const reversePlan = buildRouteMonitoringPlan(
        origin,
        [origin, highIdButLater, reverseSide, mid, near, offAxisRisk],
        'ring1',
        { direction: 'reverse', speedKph: 60 }
    );
    assertTravelOrder(reversePlan, ['reverse-side']);
    assert.equal(
        reversePlan.candidates.find((candidate) => candidate.id === 'reverse-side').laneDirectionStatus,
        'calibrated',
        'reverse cameras should also be gate-checked as calibrated when line zones exist'
    );
    assert.equal(
        reversePlan.candidates.find((candidate) => candidate.id === 'reverse-side').laneDirectionLabel,
        'reverse',
        'reverse-aligned cameras should preserve the resolved lane label'
    );
    assert.equal(
        reversePlan.candidates.find((candidate) => candidate.id === 'reverse-side').trafficCongestionStatus,
        'unavailable',
        'single-camera route should not infer congestion'
    );

    const destinationBoundPlan = buildRouteMonitoringPlan(
        origin,
        [origin, highIdButLater, reverseSide, mid, near, offAxisRisk],
        'ring1',
        { direction: 'auto', destinationQuery: '본선 2', speedKph: 60 }
    );
    assertTravelOrder(destinationBoundPlan, ['near', 'mid']);
    assert.equal(
        destinationBoundPlan.candidates.find((candidate) => candidate.id === 'mid').trafficCongestionStatus,
        'unavailable',
        'two-camera destination-bounded route should not infer congestion'
    );
    assert.equal(
        destinationBoundPlan.candidates.some((candidate) => candidate.id === 'high-id-later'),
        false,
        'destination-bounded route should not include cameras beyond the target point'
    );

    console.log('ok - route monitoring ETA order regression checks passed');
}

run();
