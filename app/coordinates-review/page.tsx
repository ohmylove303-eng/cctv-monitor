import Link from 'next/link';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';

type CoordinateReviewTarget = {
    priority: string;
    id: string;
    name: string;
    address: string;
    region: string;
    source: string;
    status: string;
    seedLat: number | null;
    seedLng: number | null;
    candidateLat: number | null;
    candidateLng: number | null;
    matchedMngNo: string;
    matchedManager: string;
    matchedPurpose: string;
    matchedAddress: string;
    matchedDistanceM: number | null;
    matchedScore: number | null;
    matchedCameraCount: number | null;
    matchStrategy: string;
    manualReviewRequired: boolean;
    autoPromotionAllowed: boolean;
    note: string;
};

type CoordinateReviewSummary = {
    generatedAt: string;
    summary: {
        rows: number;
        activeRows: number;
        reviewNeededRows: number;
        pendingRows: number;
        blockedFromRuntime: number;
        invalidActiveRows: number;
        duplicateIds: number;
        autoPromotableRows: number;
    };
    counts: {
        byReviewPriority: Record<string, number>;
    };
    reviewTargets: CoordinateReviewTarget[];
};

type ReviewedPromotionsSummary = {
    approvedIds: string[];
    promotedRows: unknown[];
    skippedRows: Array<{ id: string; reason: string }>;
    appliedSources: { site: number; row: number };
};

async function loadJson<T>(filePath: string): Promise<T> {
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as T;
}

function formatNumber(value: number | null | undefined) {
    return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ko-KR') : '-';
}

function pillColor(priority: string) {
    if (priority === 'P1_manual_review') return '#22c55e';
    if (priority === 'P2_manual_review') return '#38bdf8';
    if (priority === 'P3_manual_review') return '#f59e0b';
    if (priority === 'P4_manual_review_low_confidence') return '#94a3b8';
    return '#c084fc';
}

function priorityLabel(priority: string) {
    switch (priority) {
        case 'P1_manual_review':
            return 'P1';
        case 'P2_manual_review':
            return 'P2';
        case 'P3_manual_review':
            return 'P3';
        case 'P4_manual_review_low_confidence':
            return 'P4';
        case 'P5_source_evidence_required':
            return 'P5';
        default:
            return priority;
    }
}

export default async function CoordinatesReviewPage() {
    const dataDir = path.join(process.cwd(), 'data');
    const review = await loadJson<CoordinateReviewSummary>(path.join(dataDir, 'official-coordinate-review-next.json'));
    const promotionSummary = await loadJson<ReviewedPromotionsSummary>(path.join(dataDir, 'reviewed-promotions-summary.json'));
    const topTargets = review.reviewTargets.slice(0, 10);
    const reviewedTargets = review.reviewTargets.filter((target) => promotionSummary.approvedIds.includes(target.id));
    const pendingTargets = review.reviewTargets.filter((target) => !promotionSummary.approvedIds.includes(target.id));

    return (
        <main
            style={{
                minHeight: '100vh',
                background: 'linear-gradient(180deg, #020617 0%, #0b1220 45%, #111827 100%)',
                color: '#e5eefb',
                padding: 24,
            }}
        >
            <div style={{ maxWidth: 1440, margin: '0 auto', display: 'grid', gap: 20 }}>
                <header
                    style={{
                        borderRadius: 18,
                        border: '1px solid rgba(148,163,184,0.18)',
                        background: 'rgba(2,6,23,0.78)',
                        padding: '20px 22px',
                        boxShadow: '0 24px 70px rgba(0,0,0,0.32)',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                        <div>
                            <div style={{ fontSize: 11, letterSpacing: '0.18em', color: '#7dd3fc', fontWeight: 800, textTransform: 'uppercase' }}>
                                Coordinate Approval Queue
                            </div>
                            <h1 style={{ margin: '8px 0 6px', fontSize: 28, lineHeight: 1.15 }}>좌표 수동 승인 화면</h1>
                            <p style={{ margin: 0, maxWidth: 900, fontSize: 14, lineHeight: 1.7, color: '#cbd5e1' }}>
                                자동 승격은 닫아두고, `review_needed`와 `pending` 중에서 사람이 승인한 것만 `active`로 넘어가게 하는 검토 큐입니다.
                                현재 이 화면에 보이는 항목은 하네스가 허용한 다음 실행 단위예요.
                            </p>
                        </div>
                        <div style={{ minWidth: 240, textAlign: 'right' }}>
                            <div style={{ fontSize: 11, letterSpacing: '0.12em', color: '#94a3b8', textTransform: 'uppercase' }}>generated at</div>
                            <div style={{ marginTop: 8, fontSize: 16, fontWeight: 700, color: '#e2e8f0' }}>{review.generatedAt}</div>
                            <div style={{ marginTop: 10, fontSize: 12, color: '#94a3b8' }}>
                                approved {promotionSummary.approvedIds.length} · row apply {promotionSummary.appliedSources.row}
                            </div>
                        </div>
                    </div>

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                            gap: 12,
                            marginTop: 18,
                        }}
                    >
                        {[
                            ['전체 행', `${review.summary.rows}개`, '#38bdf8'],
                            ['active', `${review.summary.activeRows}개`, '#22c55e'],
                            ['review_needed', `${review.summary.reviewNeededRows}개`, '#f59e0b'],
                            ['pending', `${review.summary.pendingRows}개`, '#94a3b8'],
                            ['P1/P2', `${(review.counts.byReviewPriority.P1_manual_review ?? 0) + (review.counts.byReviewPriority.P2_manual_review ?? 0)}개`, '#a78bfa'],
                        ].map(([label, value, color]) => (
                            <div
                                key={label}
                                style={{
                                    borderRadius: 14,
                                    padding: '14px 16px',
                                    background: 'rgba(255,255,255,0.04)',
                                    border: '1px solid rgba(255,255,255,0.06)',
                                }}
                            >
                                <div style={{ fontSize: 12, color: '#93c5fd' }}>{label}</div>
                                <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800, color }}>{value}</div>
                            </div>
                        ))}
                    </div>
                </header>

                <section
                    style={{
                        display: 'grid',
                        gridTemplateColumns: '1.05fr 0.95fr',
                        gap: 16,
                        alignItems: 'start',
                    }}
                >
                    <div
                        style={{
                            borderRadius: 18,
                            border: '1px solid rgba(148,163,184,0.16)',
                            background: 'rgba(15,23,42,0.74)',
                            padding: 18,
                        }}
                    >
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginBottom: 10 }}>승인된 ID</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            {promotionSummary.approvedIds.map((id) => (
                                <span
                                    key={id}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: 999,
                                        border: '1px solid rgba(34,197,94,0.28)',
                                        background: 'rgba(34,197,94,0.1)',
                                        color: '#86efac',
                                        fontSize: 12,
                                        fontWeight: 800,
                                    }}
                                >
                                    {id}
                                </span>
                            ))}
                        </div>
                    <div style={{ marginTop: 14, fontSize: 12, color: '#94a3b8', lineHeight: 1.7 }}>
                            승인된 5건은 이미 별도 승인 기록에 반영되어 있고, runtime 반영은 `active` 상태만 통과합니다.
                        </div>
                    </div>

                    <div
                        style={{
                            borderRadius: 18,
                            border: '1px solid rgba(148,163,184,0.16)',
                            background: 'rgba(15,23,42,0.74)',
                            padding: 18,
                        }}
                    >
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0', marginBottom: 10 }}>다음 실행</div>
                        <div style={{ display: 'grid', gap: 8, color: '#cbd5e1', fontSize: 13, lineHeight: 1.7 }}>
                            <div>1. P1/P2 후보를 검토한다.</div>
                            <div>2. `approve=Y` 근거가 있는 행만 반영한다.</div>
                            <div>3. `npm run coordinates:promote-reviewed-safe`로 dry-run 확인한다.</div>
                            <div>4. 승격 후 `active` 수만 증가한다.</div>
                        </div>
                        <div style={{ marginTop: 14, fontSize: 12, color: '#94a3b8' }}>
                            이 큐는 자동 승격이 아니라, 사람이 본 뒤에만 움직이는 안전 레이어입니다.
                        </div>
                    </div>
                </section>

                <section
                    style={{
                        borderRadius: 18,
                        border: '1px solid rgba(148,163,184,0.16)',
                        background: 'rgba(15,23,42,0.74)',
                        padding: 18,
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0' }}>상위 검토 대상</div>
                            <div style={{ marginTop: 5, fontSize: 12, color: '#94a3b8' }}>
                                P1/P2 우선으로, 실제 주소와 매칭 정보가 붙은 항목만 먼저 봅니다.
                            </div>
                        </div>
                        <div style={{ fontSize: 12, color: '#cbd5e1' }}>
                            reviewed {reviewedTargets.length} / pending {pendingTargets.length}
                        </div>
                    </div>

                    <div style={{ overflowX: 'auto', marginTop: 14 }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                            <thead>
                                <tr style={{ textAlign: 'left', color: '#94a3b8' }}>
                                    <th style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.16)' }}>Priority</th>
                                    <th style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.16)' }}>ID</th>
                                    <th style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.16)' }}>Name</th>
                                    <th style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.16)' }}>Region</th>
                                    <th style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.16)' }}>Distance</th>
                                    <th style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.16)' }}>Score</th>
                                    <th style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.16)' }}>Match</th>
                                    <th style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.16)' }}>Note</th>
                                </tr>
                            </thead>
                            <tbody>
                                {topTargets.map((target) => (
                                    <tr key={target.id}>
                                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>
                                            <span
                                                style={{
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    padding: '4px 8px',
                                                    borderRadius: 999,
                                                    border: `1px solid ${pillColor(target.priority)}44`,
                                                    color: pillColor(target.priority),
                                                    background: `${pillColor(target.priority)}12`,
                                                    fontSize: 11,
                                                    fontWeight: 800,
                                                }}
                                            >
                                                {priorityLabel(target.priority)}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.08)', fontWeight: 700, color: '#e2e8f0' }}>
                                            {target.id}
                                        </td>
                                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>{target.name}</td>
                                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>{target.region}</td>
                                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>{formatNumber(target.matchedDistanceM)}m</td>
                                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.08)' }}>{formatNumber(target.matchedScore)}</td>
                                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.08)', color: '#cbd5e1' }}>
                                            {target.matchedAddress}
                                        </td>
                                        <td style={{ padding: '10px 8px', borderBottom: '1px solid rgba(148,163,184,0.08)', color: '#94a3b8' }}>
                                            {target.note}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>

                <section
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: 12,
                    }}
                >
                    {Object.entries(review.counts.byReviewPriority).map(([priority, count]) => (
                        <div
                            key={priority}
                            style={{
                                borderRadius: 14,
                                padding: '14px 16px',
                                background: 'rgba(15,23,42,0.74)',
                                border: '1px solid rgba(148,163,184,0.16)',
                            }}
                        >
                            <div style={{ fontSize: 12, color: '#94a3b8' }}>{priorityLabel(priority)}</div>
                            <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800, color: '#e2e8f0' }}>{count}</div>
                        </div>
                    ))}
                </section>

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <Link
                        href="/status"
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
                        상태 화면
                    </Link>
                    <div style={{ padding: '10px 14px', borderRadius: 999, border: '1px solid rgba(148,163,184,0.2)', color: '#cbd5e1', fontSize: 13 }}>
                        검토 전 확인용 승인 큐
                    </div>
                </div>
            </div>
        </main>
    );
}
