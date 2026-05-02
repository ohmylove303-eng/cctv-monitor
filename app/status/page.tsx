import Link from 'next/link';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';

type StatusData = {
    generatedAt: string;
    coordinates: {
        activeRows: number;
        reviewNeededRows: number;
        pendingRows: number;
        p1ManualReview: number;
        approvedIds: string[];
        topReviewTargets: string[];
        nextAction: string;
    };
    visionCalibration: {
        catalogActiveEntries: number;
        patchApplied: number;
        reviewPacketRows: number;
        reviewPacketSampleFrames: number;
        promoteDryRunActiveRows: number;
        nextAction: string;
    };
    ocrAlpr: {
        status: string;
        activeReportCount: number;
        runtimeIntegrated: boolean;
        requiredBuckets: string[];
        completedBuckets: string[];
    };
    vehicleReference: {
        entries: number;
        status: string;
    };
    vehicleVmmr: {
        datasets: number;
        modelReports: number;
        activeModelCount: number;
        fineGrainedModelReady: boolean;
        activationThreshold: number;
    };
    vehicleReid: {
        runtimeStatus: string;
        runtimeActiveReports: number;
        runtimeSampleCountTotal: number;
        runtimeMatchSuccessRate: number;
        runtimeFalsePositiveRate: number;
        runtimeGalleryGrowth: number;
    };
    trackingStore: {
        requestedBackend: string;
        dsnConfigured: boolean;
        supportedBackends: string[];
        fallbackEnabled: boolean;
        liveStatus: string;
    };
    routeMonitoring: {
        implemented: boolean;
        features: string[];
    };
    executionHarness: {
        currentStage: string;
        currentStageModel: string;
        currentGoal: string;
        phases: Array<{ stage: string; model: string }>;
    };
    implementationQueue?: Array<{
        axis: string;
        stage: string;
        model: string;
        status: string;
        blocker: string;
        nextAction: string;
        evidence: string;
    }>;
};

async function loadStatus(): Promise<StatusData> {
    const filePath = path.join(process.cwd(), 'data', 'execution-status-at-a-glance.json');
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as StatusData;
}

function StatCard({
    label,
    value,
    detail,
    accent = '#38bdf8',
}: {
    label: string;
    value: string;
    detail: string;
    accent?: string;
}) {
    return (
        <div
            style={{
                borderRadius: 14,
                border: '1px solid rgba(148,163,184,0.16)',
                background: 'rgba(15,23,42,0.72)',
                boxShadow: '0 18px 50px rgba(2,8,23,0.32)',
                padding: 16,
                minHeight: 118,
            }}
        >
            <div style={{ fontSize: 11, letterSpacing: '0.12em', color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 800, color: accent, lineHeight: 1.15 }}>{value}</div>
            <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, color: '#cbd5e1' }}>{detail}</div>
        </div>
    );
}

function StepChip({
    index,
    title,
    value,
    color,
}: {
    index: string;
    title: string;
    value: string;
    color: string;
}) {
    return (
        <div
            style={{
                flex: '1 1 150px',
                minWidth: 150,
                borderRadius: 999,
                border: `1px solid ${color}44`,
                background: `${color}14`,
                padding: '10px 14px',
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
            }}
        >
            <div style={{ fontSize: 10, letterSpacing: '0.12em', color, textTransform: 'uppercase', fontWeight: 800 }}>
                {index}
            </div>
            <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 700 }}>{title}</div>
            <div style={{ fontSize: 11, color: '#94a3b8' }}>{value}</div>
        </div>
    );
}

function statusColor(status: string) {
    if (status === 'implemented') {
        return '#22c55e';
    }
    if (status === 'ready_for_live_roundtrip') {
        return '#38bdf8';
    }
    if (status.includes('waiting')) {
        return '#f59e0b';
    }
    return '#94a3b8';
}

export default async function StatusPage() {
    const data = await loadStatus();
    const phases = data.executionHarness.phases;
    const queue = data.implementationQueue ?? [];

    return (
        <main
            style={{
                minHeight: '100vh',
                background: 'radial-gradient(circle at top, rgba(14,165,233,0.12), transparent 35%), linear-gradient(180deg, #020617 0%, #0f172a 100%)',
                color: 'white',
                padding: 24,
            }}
        >
            <div style={{ maxWidth: 1440, margin: '0 auto', display: 'grid', gap: 20 }}>
                <header
                    style={{
                        borderRadius: 18,
                        padding: '18px 20px',
                        border: '1px solid rgba(148,163,184,0.18)',
                        background: 'rgba(2,6,23,0.72)',
                        boxShadow: '0 30px 80px rgba(2,8,23,0.28)',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: 11, letterSpacing: '0.18em', color: '#38bdf8', textTransform: 'uppercase', fontWeight: 800 }}>
                                Execution Flow Snapshot
                            </div>
                            <h1 style={{ margin: '8px 0 6px', fontSize: 28, lineHeight: 1.15 }}>프로그램이 실제로 흘러가는 단계별 화면</h1>
                            <p style={{ margin: 0, color: '#cbd5e1', fontSize: 14, lineHeight: 1.7, maxWidth: 880 }}>
                                좌표 검토, vision calibration, OCR/ALPR, vehicle-reference, VMMR, ReID, 추적 저장소, 경로 감시, 실행 하네스를 한 장으로 묶어
                                현재 어디가 구현됐고 무엇이 검토 대기인지 바로 보이도록 만든 캡처용 뷰입니다.
                            </p>
                        </div>
                        <div style={{ minWidth: 240, textAlign: 'right' }}>
                            <div style={{ fontSize: 11, letterSpacing: '0.12em', color: '#94a3b8', textTransform: 'uppercase' }}>generated at</div>
                            <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{data.generatedAt}</div>
                            <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
                                {data.executionHarness.currentStage} · {data.executionHarness.currentStageModel}
                            </div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
                        {phases.map((phase, index) => (
                            <StepChip
                                key={phase.stage}
                                index={`${index + 1}`}
                                title={phase.stage}
                                value={phase.model}
                                color={index === 0 ? '#38bdf8' : index === phases.length - 1 ? '#a78bfa' : '#22c55e'}
                            />
                        ))}
                    </div>
                </header>

                <section
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                        gap: 14,
                    }}
                >
                    <StatCard
                        label="좌표 P1 검토"
                        value={`active ${data.coordinates.activeRows} / review ${data.coordinates.reviewNeededRows} / pending ${data.coordinates.pendingRows}`}
                        detail={`승인 ${data.coordinates.approvedIds.length}건 · P1 ${data.coordinates.p1ManualReview}건 · 다음: ${data.coordinates.nextAction}`}
                        accent="#22c55e"
                    />
                    <StatCard
                        label="Vision calibration"
                        value={`${data.visionCalibration.reviewPacketRows} rows / ${data.visionCalibration.reviewPacketSampleFrames} frames`}
                        detail={`catalog ${data.visionCalibration.catalogActiveEntries} · patch applied ${data.visionCalibration.patchApplied} · next: ${data.visionCalibration.nextAction}`}
                        accent="#38bdf8"
                    />
                    <StatCard
                        label="OCR / ALPR"
                        value={`${data.ocrAlpr.status} · reports ${data.ocrAlpr.activeReportCount}`}
                        detail={`runtime integrated ${String(data.ocrAlpr.runtimeIntegrated)} · buckets ${data.ocrAlpr.completedBuckets.length}/${data.ocrAlpr.requiredBuckets.length}`}
                        accent="#f59e0b"
                    />
                    <StatCard
                        label="vehicle-reference"
                        value={`${data.vehicleReference.status} · ${data.vehicleReference.entries} entries`}
                        detail="make/model/trim 추론은 아직 비활성"
                        accent="#a78bfa"
                    />
                    <StatCard
                        label="VMMR"
                        value={`active models ${data.vehicleVmmr.activeModelCount}`}
                        detail={`datasets ${data.vehicleVmmr.datasets} · fine-grained ready ${String(data.vehicleVmmr.fineGrainedModelReady)} · threshold ${data.vehicleVmmr.activationThreshold}`}
                        accent="#ec4899"
                    />
                    <StatCard
                        label="ReID"
                        value={`${data.vehicleReid.runtimeStatus} · match ${data.vehicleReid.runtimeMatchSuccessRate}`}
                        detail={`samples ${data.vehicleReid.runtimeSampleCountTotal} · FP ${data.vehicleReid.runtimeFalsePositiveRate} · growth ${data.vehicleReid.runtimeGalleryGrowth}`}
                        accent="#14b8a6"
                    />
                    <StatCard
                        label="Tracking store"
                        value={`${data.trackingStore.requestedBackend} · ${data.trackingStore.liveStatus}`}
                        detail={`DSN ${data.trackingStore.dsnConfigured ? 'configured' : 'missing'} · fallback ${String(data.trackingStore.fallbackEnabled)} · backends ${data.trackingStore.supportedBackends.join('/')}`}
                        accent="#f97316"
                    />
                    <StatCard
                        label="Route monitoring"
                        value={data.routeMonitoring.implemented ? 'implemented' : 'missing'}
                        detail={data.routeMonitoring.features.join(' · ')}
                        accent="#84cc16"
                    />
                    <StatCard
                        label="Execution harness"
                        value={data.executionHarness.currentStageModel}
                        detail={data.executionHarness.phases.map((phase) => `${phase.stage}:${phase.model}`).join(' · ')}
                        accent="#c084fc"
                    />
                </section>

                <section
                    style={{
                        borderRadius: 18,
                        border: '1px solid rgba(148,163,184,0.18)',
                        background: 'rgba(15,23,42,0.72)',
                        padding: 18,
                        display: 'grid',
                        gap: 14,
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0' }}>미구현 큐</div>
                            <div style={{ marginTop: 5, fontSize: 12, color: '#94a3b8' }}>
                                하네스가 막고 있는 항목과 다음 실행 단계를 분리해서 보여줍니다.
                            </div>
                        </div>
                        <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                            {queue.filter((item) => item.status !== 'implemented').length} pending / {queue.length} total
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>
                        {queue.map((item) => {
                            const color = statusColor(item.status);
                            return (
                                <article
                                    key={item.axis}
                                    style={{
                                        borderRadius: 14,
                                        border: `1px solid ${color}33`,
                                        background: `${color}0f`,
                                        padding: 14,
                                        minHeight: 150,
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: '#f8fafc', lineHeight: 1.35 }}>{item.axis}</div>
                                        <div
                                            style={{
                                                flex: '0 0 auto',
                                                borderRadius: 999,
                                                border: `1px solid ${color}55`,
                                                color,
                                                padding: '4px 8px',
                                                fontSize: 10,
                                                fontWeight: 800,
                                                letterSpacing: '0.08em',
                                                textTransform: 'uppercase',
                                            }}
                                        >
                                            {item.stage}
                                        </div>
                                    </div>
                                    <div style={{ marginTop: 10, fontSize: 12, color, fontWeight: 800 }}>{item.status}</div>
                                    <div style={{ marginTop: 8, fontSize: 12, color: '#cbd5e1', lineHeight: 1.55 }}>{item.evidence}</div>
                                    <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8', lineHeight: 1.55 }}>blocker: {item.blocker}</div>
                                    <div style={{ marginTop: 10, fontSize: 12, color: '#e2e8f0', lineHeight: 1.55 }}>
                                        next: {item.nextAction} · {item.model}
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>

                <section
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1.2fr 0.8fr',
                        gap: 14,
                    }}
                >
                    <div
                        style={{
                            borderRadius: 18,
                            border: '1px solid rgba(148,163,184,0.18)',
                            background: 'rgba(15,23,42,0.72)',
                            padding: 18,
                        }}
                    >
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginBottom: 10 }}>한눈에 보는 핵심</div>
                        <ul style={{ margin: 0, paddingLeft: 18, color: '#cbd5e1', lineHeight: 1.8, fontSize: 13 }}>
                            <li>좌표 승인 ID: {data.coordinates.approvedIds.join(', ') || '없음'}</li>
                            <li>ReID 백테스트: {data.vehicleReid.runtimeSampleCountTotal} samples / match {data.vehicleReid.runtimeMatchSuccessRate} / FP {data.vehicleReid.runtimeFalsePositiveRate}</li>
                            <li>OCR/ALPR: {data.ocrAlpr.status} / active reports {data.ocrAlpr.activeReportCount}</li>
                            <li>VMMR: active models {data.vehicleVmmr.activeModelCount} / datasets {data.vehicleVmmr.datasets}</li>
                            <li>vehicle-reference: entries {data.vehicleReference.entries}</li>
                        </ul>
                    </div>

                    <div
                        style={{
                            borderRadius: 18,
                            border: '1px solid rgba(148,163,184,0.18)',
                            background: 'rgba(15,23,42,0.72)',
                            padding: 18,
                        }}
                    >
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginBottom: 10 }}>다음으로 이어질 축</div>
                        <div style={{ display: 'grid', gap: 10, color: '#cbd5e1', fontSize: 13, lineHeight: 1.6 }}>
                            <div>1. 남은 좌표 P1/P2 수동 검토</div>
                            <div>2. ReID / OCR 실데이터 보강</div>
                            <div>3. tracking store live DSN 연결</div>
                            <div>4. vision calibration line-zone 입력 완료</div>
                        </div>
                        <div style={{ marginTop: 16, fontSize: 12, color: '#94a3b8' }}>
                            이 화면은 캡처용 요약이라 실제 운영 화면을 해치지 않고 별도 경로로 분리되어 있습니다.
                        </div>
                    </div>
                </section>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Link
                        href="/"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: 999,
                            padding: '10px 14px',
                            textDecoration: 'none',
                            color: 'white',
                            background: 'rgba(56,189,248,0.16)',
                            border: '1px solid rgba(56,189,248,0.28)',
                            fontWeight: 700,
                            fontSize: 13,
                        }}
                    >
                        메인으로
                    </Link>
                    <div style={{ padding: '10px 14px', borderRadius: 999, border: '1px solid rgba(148,163,184,0.2)', color: '#cbd5e1', fontSize: 13 }}>
                        캡처용 화면 · stage-by-stage overview
                    </div>
                </div>
            </div>
        </main>
    );
}
