const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const OUTPUT_JSON = path.join(DATA_DIR, 'execution-status-at-a-glance.json');
const OUTPUT_MD = path.join(DATA_DIR, 'execution-status-at-a-glance.md');

function readText(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function readJson(filePath, fallback = null) {
    try {
        return JSON.parse(readText(filePath));
    } catch {
        return fallback;
    }
}

function exists(filePath) {
    try {
        return fs.existsSync(filePath);
    } catch {
        return false;
    }
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const next = text[index + 1];

        if (inQuotes) {
            if (char === '"' && next === '"') {
                cell += '"';
                index += 1;
                continue;
            }
            if (char === '"') {
                inQuotes = false;
                continue;
            }
            cell += char;
            continue;
        }

        if (char === '"') {
            inQuotes = true;
            continue;
        }

        if (char === ',') {
            row.push(cell);
            cell = '';
            continue;
        }

        if (char === '\n') {
            row.push(cell);
            rows.push(row);
            row = [];
            cell = '';
            continue;
        }

        if (char === '\r') {
            continue;
        }

        cell += char;
    }

    if (cell.length > 0 || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }

    return rows.filter((values) => values.some((value) => value.trim().length > 0));
}

function getCsvObjects(filePath) {
    if (!exists(filePath)) {
        return [];
    }

    const rows = parseCsv(readText(filePath).trim());
    if (rows.length === 0) {
        return [];
    }

    const headers = rows[0].map((header) => header.trim());
    return rows.slice(1).map((values) => {
        const entry = {};
        headers.forEach((header, index) => {
            entry[header] = (values[index] ?? '').trim();
        });
        return entry;
    });
}

function countBy(items, selector) {
    return items.reduce((acc, item) => {
        const key = selector(item);
        if (!key) {
            return acc;
        }
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
    }, {});
}

function formatCountBlock(parts) {
    return parts.filter(Boolean).join(' / ');
}

function formatNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value.toLocaleString('en-US');
    }
    return value ?? '-';
}

function humanizeAction(action) {
    const map = {
        review_priority_rows_manually_before_any_active_promotion: 'P1/P2 수동 검토 후 승인',
        open_review_packet_fill_missing_fields_and_line_zones: '라인존/리뷰패킷 입력 보완',
        review_pending: '검토 대기',
        실데이터_검토: '실데이터 검토',
    };

    return map[action] ?? action ?? '-';
}

function readEnvPresence() {
    const envFiles = [
        path.join(ROOT, '.env.local'),
        path.join(ROOT, '.env.production.local'),
        path.join(ROOT, '.env.vercel'),
        path.join(ROOT, 'forensic-api', '.env'),
        path.join(ROOT, 'forensic-api', '.env.local'),
    ];

    const env = {
        requestedBackend: null,
        dsnConfigured: false,
        backendSource: null,
    };

    for (const filePath of envFiles) {
        if (!exists(filePath)) {
            continue;
        }

        const lines = readText(filePath).split(/\r?\n/);
        for (const line of lines) {
            const backendMatch = line.match(/^\s*TRACK_STORE_BACKEND\s*=\s*(.+?)\s*$/);
            if (backendMatch && !env.requestedBackend) {
                env.requestedBackend = backendMatch[1].replace(/^['"]|['"]$/g, '');
                env.backendSource = filePath;
            }

            const dsnMatch = line.match(/^\s*(TRACK_STORE_DSN|DATABASE_URL)\s*=\s*(.+?)\s*$/);
            if (dsnMatch) {
                env.dsnConfigured = true;
                if (!env.backendSource) {
                    env.backendSource = filePath;
                }
            }
        }
    }

    if (!env.requestedBackend) {
        env.requestedBackend = 'auto';
    }

    return env;
}

function readExecutionHarness() {
    const filePath = path.join(ROOT, 'forensic-api', 'app', 'execution_harness.py');
    const text = readText(filePath);
    const currentStage = text.match(/"current_stage":\s*"([^"]+)"/)?.[1] ?? 'unknown';
    const currentStageModel = text.match(/"current_stage_model":\s*"([^"]+)"/)?.[1] ?? 'unknown';
    const currentGoal = text.match(/"current_goal":\s*"([^"]+)"/)?.[1] ?? 'unknown';
    const phaseMatches = [...text.matchAll(/\{"stage":\s*"([^"]+)",\s*"model":\s*"([^"]+)"\}/g)];
    const phases = phaseMatches.map((match) => ({
        stage: match[1],
        model: match[2],
    }));

    return {
        status: text.includes('"status": "active"') ? 'active' : 'unknown',
        currentStage,
        currentStageModel,
        currentGoal,
        phases,
    };
}

function detectRouteMonitoringFeatures() {
    const routeMonitoringPath = path.join(ROOT, 'lib', 'route-monitoring.ts');
    const typesPath = path.join(ROOT, 'types', 'cctv.ts');
    const routeMonitoringText = readText(routeMonitoringPath);
    const typesText = readText(typesPath);

    const features = [];
    if (routeMonitoringText.includes('delayRiskScore') && typesText.includes('delayRiskScore')) {
        features.push('delayRiskScore');
    }
    if (routeMonitoringText.includes('routeDeviationRisk') && typesText.includes('routeDeviationRisk')) {
        features.push('routeDeviationRisk');
    }
    if (routeMonitoringText.includes('laneDirectionStatus') && typesText.includes('laneDirectionStatus')) {
        features.push('laneDirectionStatus');
    }
    if (routeMonitoringText.includes('trafficCongestionStatus') && routeMonitoringText.includes('eta_spacing')) {
        features.push('trafficCongestionStatus=eta_spacing');
    }

    return {
        implemented: features.length > 0,
        features,
        verifiedBy: [
            'node scripts/test-route-monitoring-order.js',
            'npm run build',
        ],
    };
}

function getApprovedCoordinateIds() {
    const rows = getCsvObjects(path.join(DATA_DIR, 'review-needed-p1-rows.csv'));
    return rows
        .filter((row) => ['Y', 'y', 'yes', 'true', '1'].includes(String(row.approve ?? row.approved ?? '').trim().toLowerCase()))
        .map((row) => row.id || row.camera_id || row.cameraId || row.source_id)
        .filter(Boolean);
}

function summarizeCoordinates() {
    const summary = readJson(path.join(DATA_DIR, 'official-coordinate-review-next.json'), {});
    const approvedIds = getApprovedCoordinateIds();
    return {
        activeRows: summary.summary?.activeRows ?? null,
        reviewNeededRows: summary.summary?.reviewNeededRows ?? null,
        pendingRows: summary.summary?.pendingRows ?? null,
        blockedFromRuntime: summary.summary?.blockedFromRuntime ?? null,
        autoPromotableRows: summary.summary?.autoPromotableRows ?? null,
        p1ManualReview: summary.counts?.byReviewPriority?.P1_manual_review ?? null,
        topReviewTargets: (summary.topReviewTargets ?? []).slice(0, 5).map((target) => target.id).filter(Boolean),
        approvedIds,
        nextAction: summary.nextAction ?? 'review_pending',
    };
}

function summarizeVisionCalibration() {
    const status = readJson(path.join(DATA_DIR, 'cctv-vision-review-loop-status.json'), {});
    return {
        catalogActiveEntries: status.summary?.catalog?.result?.activeEntries ?? null,
        patchApplied: status.summary?.patchDryRun?.result?.applied ?? null,
        reviewPacketRows: status.summary?.reviewPacket?.result?.rows ?? null,
        reviewPacketSampleFrames: status.summary?.reviewPacket?.result?.sampleFrames ?? null,
        promoteDryRunActiveRows: status.summary?.promoteDryRun?.result?.activeRows ?? null,
        nextAction: status.nextAction ?? 'review_pending',
    };
}

function summarizeOcrAlpr() {
    const readiness = readJson(path.join(DATA_DIR, 'ocr-alpr-backtest-readiness.json'), {});
    const report = readJson(path.join(DATA_DIR, 'ocr-alpr-backtest-report.json'), {});
    return {
        status: readiness.status ?? 'missing',
        activeReportCount: readiness.active_report_count ?? report.active_report_count ?? null,
        runtimeIntegrated: readiness.runtime_integrated ?? null,
        requiredBuckets: readiness.required_buckets ?? [],
        completedBuckets: readiness.completed_buckets ?? [],
        reportCount: Array.isArray(report.reports) ? report.reports.length : 0,
        engineComparisons: Array.isArray(report.engineComparisons) ? report.engineComparisons.length : 0,
    };
}

function summarizeVehicleReference() {
    const catalog = readJson(path.join(DATA_DIR, 'vehicle-reference-catalog.json'), {});
    return {
        entries: Array.isArray(catalog.entries) ? catalog.entries.length : 0,
        status: Array.isArray(catalog.entries) && catalog.entries.length > 0 ? 'loaded' : 'empty',
    };
}

function summarizeVehicleVmmr() {
    const readiness = readJson(path.join(DATA_DIR, 'vehicle-vmmr-readiness.json'), {});
    const activeModelCount = (readiness.modelReports ?? []).filter((report) => report.status === 'active').length;
    return {
        datasets: Array.isArray(readiness.datasets) ? readiness.datasets.length : 0,
        modelReports: Array.isArray(readiness.modelReports) ? readiness.modelReports.length : 0,
        activeModelCount,
        fineGrainedModelReady: readiness.fine_grained_model_ready ?? false,
        activationThreshold: readiness.policy?.activationThreshold ?? null,
    };
}

function summarizeVehicleReid() {
    const readiness = readJson(path.join(DATA_DIR, 'vehicle-reid-readiness.json'), {});
    const runtimeBacktest = readJson(path.join(DATA_DIR, 'vehicle-reid-runtime-backtest-report.json'), {});
    const syntheticSummary = readJson(path.join(DATA_DIR, 'vehicle-reid-runtime-backtest-summary.json'), {});

    const report = Array.isArray(runtimeBacktest.reports) ? runtimeBacktest.reports[0] : null;
    const bucketResults = Array.isArray(report?.bucketResults) ? report.bucketResults : [];

    return {
        readinessDatasets: Array.isArray(readiness.datasets) ? readiness.datasets.length : 0,
        readinessModelReports: Array.isArray(readiness.modelReports) ? readiness.modelReports.length : 0,
        runtimeStatus: runtimeBacktest.reports?.[0]?.status ?? 'missing',
        runtimeActiveReports: runtimeBacktest.active_report_count ?? 0,
        runtimeSampleCountTotal: report?.sampleCountTotal ?? null,
        runtimeReviewedSampleCount: report?.reviewedSampleCount ?? null,
        runtimeMatchSuccessRate: report?.summary?.matchSuccessRate ?? null,
        runtimeFalsePositiveRate: report?.summary?.falsePositiveRate ?? null,
        runtimeGalleryGrowth: report?.summary?.galleryGrowth ?? null,
        runtimeBucketsCovered: bucketResults.map((bucket) => bucket.bucket),
        syntheticStatus: syntheticSummary.status ?? 'missing',
        syntheticMatchSuccessRate: syntheticSummary.matchSuccessRate ?? null,
        syntheticFalsePositiveRate: syntheticSummary.falsePositiveRate ?? null,
        syntheticGalleryEntriesAfterRun: syntheticSummary.galleryEntriesAfterRun ?? null,
    };
}

function summarizeTrackingStore() {
    const env = readEnvPresence();
    const storeFile = path.join(ROOT, 'forensic-api', 'app', 'store.py');
    const storeText = readText(storeFile);
    const supportedBackends = [];
    if (storeText.includes('memory')) supportedBackends.push('memory');
    if (storeText.includes('json_file')) supportedBackends.push('json_file');
    if (storeText.includes('postgres')) supportedBackends.push('postgres');
    return {
        requestedBackend: env.requestedBackend,
        dsnConfigured: env.dsnConfigured,
        envSource: env.backendSource,
        supportedBackends: Array.from(new Set(supportedBackends)),
        fallbackEnabled: storeText.includes('fallback') || storeText.includes('json_file'),
        liveStatus: env.dsnConfigured ? 'live_validation_pending' : 'dsn_missing',
    };
}

function buildRows(summary) {
    return [
        {
            axis: '좌표 P1 검토',
            status: `active ${formatNumber(summary.coordinates.activeRows)} / review ${formatNumber(summary.coordinates.reviewNeededRows)} / pending ${formatNumber(summary.coordinates.pendingRows)}`,
            detail: `approved ${summary.coordinates.approvedIds.length}개 · P1 ${formatNumber(summary.coordinates.p1ManualReview)} · auto ${formatNumber(summary.coordinates.autoPromotableRows)}`,
            next: humanizeAction(summary.coordinates.nextAction),
        },
        {
            axis: 'CCTV vision calibration',
            status: `catalog ${formatNumber(summary.visionCalibration.catalogActiveEntries)} / packet ${formatNumber(summary.visionCalibration.reviewPacketRows)} rows`,
            detail: `${formatNumber(summary.visionCalibration.reviewPacketSampleFrames)} frames · patch applied ${formatNumber(summary.visionCalibration.patchApplied)} · active rows ${formatNumber(summary.visionCalibration.promoteDryRunActiveRows)}`,
            next: humanizeAction(summary.visionCalibration.nextAction),
        },
        {
            axis: 'OCR / ALPR',
            status: `${summary.ocrAlpr.status} · active reports ${formatNumber(summary.ocrAlpr.activeReportCount)}`,
            detail: `runtime integrated ${String(summary.ocrAlpr.runtimeIntegrated)} · buckets ${summary.ocrAlpr.requiredBuckets.length}/${summary.ocrAlpr.completedBuckets.length} · engine comparisons ${summary.ocrAlpr.engineComparisons}`,
            next: '실데이터 검토',
        },
        {
            axis: 'vehicle-reference',
            status: `${summary.vehicleReference.status} · entries ${formatNumber(summary.vehicleReference.entries)}`,
            detail: 'make/model/trim 추론 비활성',
            next: 'verified reference rows',
        },
        {
            axis: 'VMMR',
            status: `datasets ${formatNumber(summary.vehicleVmmr.datasets)} · modelReports ${formatNumber(summary.vehicleVmmr.modelReports)}`,
            detail: `active models ${formatNumber(summary.vehicleVmmr.activeModelCount)} · fine-grained ready ${String(summary.vehicleVmmr.fineGrainedModelReady)}`,
            next: `threshold ${formatNumber(summary.vehicleVmmr.activationThreshold)}`,
        },
        {
            axis: 'ReID',
            status: `${summary.vehicleReid.runtimeStatus} · active reports ${formatNumber(summary.vehicleReid.runtimeActiveReports)}`,
            detail: `sample ${formatNumber(summary.vehicleReid.runtimeSampleCountTotal)} · match ${formatNumber(summary.vehicleReid.runtimeMatchSuccessRate)} · FP ${formatNumber(summary.vehicleReid.runtimeFalsePositiveRate)} · growth ${formatNumber(summary.vehicleReid.runtimeGalleryGrowth)}`,
            next: `readiness ${formatNumber(summary.vehicleReid.readinessModelReports)} reports · synthetic ${formatNumber(summary.vehicleReid.syntheticMatchSuccessRate)}`,
        },
        {
            axis: 'tracking store',
            status: `${summary.trackingStore.requestedBackend} · ${summary.trackingStore.liveStatus}`,
            detail: `DSN ${summary.trackingStore.dsnConfigured ? 'configured' : 'missing'} · fallback ${String(summary.trackingStore.fallbackEnabled)} · backends ${summary.trackingStore.supportedBackends.join('/') || 'unknown'}`,
            next: summary.trackingStore.dsnConfigured ? 'live roundtrip' : 'TRACK_STORE_DSN 추가',
        },
        {
            axis: 'route monitoring',
            status: summary.routeMonitoring.implemented ? 'implemented' : 'missing',
            detail: summary.routeMonitoring.features.join(' · ') || 'features not detected',
            next: summary.routeMonitoring.verifiedBy.join(' / '),
        },
        {
            axis: 'execution harness',
            status: `${summary.executionHarness.currentStage} · ${summary.executionHarness.currentStageModel}`,
            detail: summary.executionHarness.phases.map((phase) => `${phase.stage}:${phase.model}`).join(' · '),
            next: summary.executionHarness.currentGoal,
        },
    ];
}

function buildImplementationQueue(summary) {
    const queue = [
        {
            axis: '좌표 P1/P2 수동 승인',
            stage: 'data_review',
            model: 'GPT-5.4 mini',
            status: summary.coordinates.reviewNeededRows > 0 ? 'waiting_for_manual_approval' : 'implemented',
            blocker: summary.coordinates.reviewNeededRows > 0 ? 'approve=Y reviewed rows required' : 'none',
            nextAction: 'review-needed-p1 rows approve gate',
            evidence: `active=${formatNumber(summary.coordinates.activeRows)}, review=${formatNumber(summary.coordinates.reviewNeededRows)}, pending=${formatNumber(summary.coordinates.pendingRows)}`,
        },
        {
            axis: 'CCTV vision line-zone calibration',
            stage: 'data_review',
            model: 'GPT-5.4 mini',
            status: summary.visionCalibration.promoteDryRunActiveRows > 0 ? 'implemented' : 'waiting_for_line_zone_review',
            blocker: summary.visionCalibration.promoteDryRunActiveRows > 0 ? 'none' : 'lineZoneForward/lineZoneReverse reviewer fields required',
            nextAction: 'fill review packet and run safe apply',
            evidence: `packet=${formatNumber(summary.visionCalibration.reviewPacketRows)}, frames=${formatNumber(summary.visionCalibration.reviewPacketSampleFrames)}, active=${formatNumber(summary.visionCalibration.promoteDryRunActiveRows)}`,
        },
        {
            axis: 'OCR/ALPR 실데이터 백테스트',
            stage: 'backtest',
            model: 'GPT-5.4 nano',
            status: summary.ocrAlpr.activeReportCount > 0 ? 'implemented' : 'waiting_for_reviewed_observations',
            blocker: summary.ocrAlpr.activeReportCount > 0 ? 'none' : 'reviewed OCR/ALPR observations required',
            nextAction: 'populate samples and observations',
            evidence: `status=${summary.ocrAlpr.status}, activeReports=${formatNumber(summary.ocrAlpr.activeReportCount)}, buckets=${summary.ocrAlpr.completedBuckets.length}/${summary.ocrAlpr.requiredBuckets.length}`,
        },
        {
            axis: 'vehicle-reference active catalog',
            stage: 'data_review',
            model: 'GPT-5.4 mini',
            status: summary.vehicleReference.entries > 0 ? 'implemented' : 'waiting_for_verified_reference_rows',
            blocker: summary.vehicleReference.entries > 0 ? 'none' : 'reviewStatus=active vehicle reference rows required',
            nextAction: 'add verified make/model rows',
            evidence: `entries=${formatNumber(summary.vehicleReference.entries)}, status=${summary.vehicleReference.status}`,
        },
        {
            axis: 'VMMR fine-grained activation',
            stage: 'backtest',
            model: 'GPT-5.4 nano',
            status: summary.vehicleVmmr.activeModelCount > 0 ? 'implemented' : 'waiting_for_model_report',
            blocker: summary.vehicleVmmr.activeModelCount > 0 ? 'none' : 'mAP threshold report required',
            nextAction: 'add validated VMMR model report',
            evidence: `activeModels=${formatNumber(summary.vehicleVmmr.activeModelCount)}, datasets=${formatNumber(summary.vehicleVmmr.datasets)}, threshold=${formatNumber(summary.vehicleVmmr.activationThreshold)}`,
        },
        {
            axis: 'ReID 운영 백테스트 승인',
            stage: 'backtest',
            model: 'GPT-5.4 nano',
            status: summary.vehicleReid.runtimeActiveReports > 0 ? 'implemented' : 'waiting_for_sample_threshold',
            blocker: summary.vehicleReid.runtimeActiveReports > 0 ? 'none' : 'sample count and reviewed active report threshold not met',
            nextAction: 'increase reviewed samples and regenerate report',
            evidence: `samples=${formatNumber(summary.vehicleReid.runtimeSampleCountTotal)}, match=${formatNumber(summary.vehicleReid.runtimeMatchSuccessRate)}, fp=${formatNumber(summary.vehicleReid.runtimeFalsePositiveRate)}`,
        },
        {
            axis: 'Postgres tracking store live 연결',
            stage: 'verification',
            model: 'GPT-5.4 mini',
            status: summary.trackingStore.dsnConfigured ? 'ready_for_live_roundtrip' : 'waiting_for_dsn',
            blocker: summary.trackingStore.dsnConfigured ? 'none' : 'TRACK_STORE_DSN missing',
            nextAction: summary.trackingStore.dsnConfigured ? 'run live roundtrip' : 'configure TRACK_STORE_DSN',
            evidence: `backend=${summary.trackingStore.requestedBackend}, live=${summary.trackingStore.liveStatus}, fallback=${String(summary.trackingStore.fallbackEnabled)}`,
        },
        {
            axis: '외부 교통 API verified congestion',
            stage: 'design',
            model: 'GPT-5.5',
            status: summary.routeMonitoring.features.includes('trafficCongestionStatus=eta_spacing') ? 'eta_spacing_inferred_only' : 'missing',
            blocker: 'verified traffic speed/volume source not connected',
            nextAction: 'connect external traffic source before verified congestion',
            evidence: summary.routeMonitoring.features.join(', ') || 'route features missing',
        },
    ];

    const order = {
        waiting_for_manual_approval: 1,
        waiting_for_line_zone_review: 2,
        waiting_for_reviewed_observations: 3,
        waiting_for_verified_reference_rows: 4,
        waiting_for_model_report: 5,
        waiting_for_sample_threshold: 6,
        waiting_for_dsn: 7,
        ready_for_live_roundtrip: 8,
        eta_spacing_inferred_only: 9,
        missing: 10,
        implemented: 20,
    };

    return queue.sort((a, b) => (order[a.status] ?? 99) - (order[b.status] ?? 99));
}

function buildMarkdown(summary) {
    const rows = buildRows(summary);
    const queue = summary.implementationQueue ?? buildImplementationQueue(summary);
    const approvedIds = summary.coordinates.approvedIds.length > 0 ? summary.coordinates.approvedIds.join(', ') : '없음';
    const topReviewTargets = summary.coordinates.topReviewTargets.length > 0 ? summary.coordinates.topReviewTargets.join(', ') : '없음';

    return `# Execution Status at a Glance

생성 시각: ${summary.generatedAt}

| 축 | 상태 | 요약 | 다음 |
| --- | --- | --- | --- |
${rows.map((row) => `| ${row.axis} | ${row.status} | ${row.detail} | ${row.next} |`).join('\n')}

## 한눈에 보는 핵심

- 좌표 승인 ID: ${approvedIds}
- 좌표 P1 수동 검토 상위: ${topReviewTargets}
- ReID 백테스트: ${summary.vehicleReid.runtimeSampleCountTotal ?? 0} samples / match ${summary.vehicleReid.runtimeMatchSuccessRate ?? 0} / FP ${summary.vehicleReid.runtimeFalsePositiveRate ?? 0}
- OCR/ALPR: ${summary.ocrAlpr.status} / active reports ${summary.ocrAlpr.activeReportCount ?? 0}
- VMMR: active models ${summary.vehicleVmmr.activeModelCount ?? 0} / datasets ${summary.vehicleVmmr.datasets ?? 0}
- vehicle-reference: entries ${summary.vehicleReference.entries ?? 0}

## 미구현 큐

| 축 | 단계 | 모델 | 상태 | 막힌 이유 | 다음 실행 |
| --- | --- | --- | --- | --- | --- |
${queue.map((item) => `| ${item.axis} | ${item.stage} | ${item.model} | ${item.status} | ${item.blocker} | ${item.nextAction} |`).join('\n')}

## 최근 검증 메모

- \`npm run test:coordinates-review\`
- \`npm run test:ocr-backtest\`
- \`npm run test:vehicle-reference\`
- \`node scripts/test-route-monitoring-order.js\`
- \`npm run test:tracking-store\`
- \`npm run build\`

## 작업 축 메모

- 좌표: 남은 P1/P2 검토는 수동 승인만 반영.
- ReID/OCR: 실데이터가 들어와야 active 리포트가 열린다.
- Vision calibration: 별도 라인존 테스트 패널로 분리됨.
- Tracking store: Postgres 어댑터는 붙어 있고 DSN만 남아 있다.
`;
}

function buildSummary(generatedAt = new Date().toISOString()) {
    const executionHarness = readExecutionHarness();
    const summary = {
        schemaVersion: 1,
        taxonomy: 'execution_status_at_a_glance_v1',
        generatedAt,
        coordinates: summarizeCoordinates(),
        visionCalibration: summarizeVisionCalibration(),
        ocrAlpr: summarizeOcrAlpr(),
        vehicleReference: summarizeVehicleReference(),
        vehicleVmmr: summarizeVehicleVmmr(),
        vehicleReid: summarizeVehicleReid(),
        trackingStore: summarizeTrackingStore(),
        routeMonitoring: detectRouteMonitoringFeatures(),
        executionHarness,
    };
    summary.implementationQueue = buildImplementationQueue(summary);

    return summary;
}

function writeOutputs(summary) {
    const markdown = buildMarkdown(summary);
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(OUTPUT_JSON, `${JSON.stringify(summary, null, 2)}\n`);
    fs.writeFileSync(OUTPUT_MD, `${markdown.trimEnd()}\n`);
}

function main() {
    const checkOnly = process.argv.includes('--check');

    if (checkOnly) {
        const existingJson = exists(OUTPUT_JSON) ? readText(OUTPUT_JSON) : null;
        const existingMd = exists(OUTPUT_MD) ? readText(OUTPUT_MD) : null;
        if (!existingJson || !existingMd) {
            console.error('execution-status-at-a-glance is out of date.');
            process.exitCode = 1;
            return;
        }

        const existingData = JSON.parse(existingJson);
        const summary = buildSummary(existingData.generatedAt ?? new Date(0).toISOString());
        const markdown = buildMarkdown(summary);
        const expectedJson = `${JSON.stringify(summary, null, 2)}\n`;
        const expectedMd = `${markdown.trimEnd()}\n`;

        if (existingJson !== expectedJson || existingMd !== expectedMd) {
            console.error('execution-status-at-a-glance is out of date.');
            process.exitCode = 1;
            return;
        }

        console.log('execution-status-at-a-glance is current.');
        return;
    }

    const summary = buildSummary();
    const markdown = buildMarkdown(summary);
    writeOutputs(summary);
    console.log(`Wrote ${path.relative(ROOT, OUTPUT_JSON)} and ${path.relative(ROOT, OUTPUT_MD)}`);
}

main();
