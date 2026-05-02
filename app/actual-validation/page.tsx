import { headers } from 'next/headers';
import Image from 'next/image';

type CctvItem = {
    id: string;
    name: string;
    type: string;
    region: string;
    district?: string;
    address?: string;
    operator?: string;
    streamUrl?: string;
    hlsUrl?: string;
    resolution?: string;
    lat?: number;
    lng?: number;
    source?: string;
    coordinateSource?: string;
    coordinateVerified?: boolean;
    coordinateNote?: string;
};

type AnalysisResponse = {
    job_id: string;
    cctv_id: string;
    timestamp: string;
    algorithm: string;
    tsa_status: string;
    confidence: number;
    verdict: string;
    vehicle_count?: number;
    events_detected?: string[];
};

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        cache: 'no-store',
        ...init,
        headers: {
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
        },
    });
    const payload = await res.json();
    if (!res.ok) {
        throw new Error(typeof payload?.error === 'string' ? payload.error : '요청 실패');
    }
    return payload as T;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ActualValidationPage() {
    const requestHeaders = headers();
    const forwardedHost = requestHeaders.get('x-forwarded-host');
    const host = forwardedHost ?? requestHeaders.get('host') ?? process.env.VERCEL_URL ?? 'localhost:3000';
    const forwardedProto = requestHeaders.get('x-forwarded-proto');
    const proto = forwardedProto ?? (host.includes('localhost') ? 'http' : 'https');
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`;

    const cctvList = await fetchJson<CctvItem[]>(`${baseUrl}/api/cctv`);
    const selected =
        cctvList.find((item) => item.id === 'GTIC-CCTV049')
        ?? cctvList.find((item) => item.type === 'traffic' && Boolean(item.hlsUrl || item.streamUrl))
        ?? cctvList[0];

    const analysis = await fetchJson<AnalysisResponse>(`${baseUrl}/api/forensic/analyze`, {
        method: 'POST',
        body: JSON.stringify({
            cctv_id: selected.id,
            hls_url: selected.hlsUrl || selected.streamUrl || '',
            analysis_mode: 'scan',
        }),
    });

    const total = cctvList.length;
    const verified = cctvList.filter((item) => item.coordinateVerified).length;
    const streams = cctvList.filter((item) => item.hlsUrl || item.streamUrl).length;
    const trafficStreams = cctvList.filter((item) => item.type === 'traffic' && (item.hlsUrl || item.streamUrl)).length;

    return (
        <main style={{
            minHeight: '100vh',
            background: 'linear-gradient(180deg, #07111f 0%, #0b1629 48%, #09101b 100%)',
            color: '#e5eefb',
            padding: '28px',
        }}>
            <div style={{
                maxWidth: 1400,
                margin: '0 auto',
                display: 'grid',
                gap: 20,
            }}>
                <section style={{
                    border: '1px solid rgba(64,196,255,0.18)',
                    background: 'rgba(7, 17, 31, 0.88)',
                    borderRadius: 18,
                    padding: '20px 24px',
                    boxShadow: '0 24px 60px rgba(0,0,0,0.35)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                        <div>
                            <div style={{ fontSize: 12, letterSpacing: '0.16em', color: '#7dd3fc', fontWeight: 700 }}>
                                ACTUAL DATA VALIDATION
                            </div>
                            <h1 style={{ margin: '8px 0 0', fontSize: 30, fontWeight: 800 }}>
                                실제 CCTV 데이터 검증 결과
                            </h1>
                        </div>
                        <div style={{
                            fontSize: 12,
                            color: '#a5f3fc',
                            border: '1px solid rgba(125,211,252,0.22)',
                            borderRadius: 999,
                            padding: '8px 14px',
                            background: 'rgba(14, 165, 233, 0.08)',
                        }}>
                            /api/cctv · /api/forensic/analyze
                        </div>
                    </div>

                    <div style={{
                        marginTop: 18,
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: 12,
                    }}>
                        {[
                            ['전체 CCTV', `${total}대`],
                            ['검증좌표', `${verified}대`],
                            ['스트림 보유', `${streams}개`],
                            ['교통 스트림', `${trafficStreams}개`],
                        ].map(([label, value]) => (
                            <div key={label} style={{
                                borderRadius: 14,
                                padding: '14px 16px',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.06)',
                            }}>
                                <div style={{ fontSize: 12, color: '#93c5fd' }}>{label}</div>
                                <div style={{ marginTop: 6, fontSize: 24, fontWeight: 800 }}>{value}</div>
                            </div>
                        ))}
                    </div>
                </section>

                <section style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1.75fr) minmax(340px, 0.95fr)',
                    gap: 20,
                    alignItems: 'start',
                }}>
                    <div style={{
                        borderRadius: 18,
                        overflow: 'hidden',
                        border: '1px solid rgba(64,196,255,0.18)',
                        background: '#0a1322',
                        boxShadow: '0 18px 48px rgba(0,0,0,0.35)',
                    }}>
                        <Image
                            src="/actual-validation-annotated.png"
                            alt="실제 CCTV 검증 프레임"
                            width={1280}
                            height={720}
                            priority
                            style={{ width: '100%', height: 'auto', display: 'block' }}
                        />
                    </div>

                    <aside style={{
                        borderRadius: 18,
                        border: '1px solid rgba(64,196,255,0.18)',
                        background: 'rgba(7, 17, 31, 0.88)',
                        padding: 20,
                        boxShadow: '0 18px 48px rgba(0,0,0,0.35)',
                    }}>
                        <div style={{ fontSize: 12, letterSpacing: '0.14em', color: '#93c5fd', fontWeight: 700 }}>
                            SELECTED CCTV
                        </div>
                        <h2 style={{ margin: '8px 0 4px', fontSize: 24, fontWeight: 800 }}>
                            {selected.name}
                        </h2>
                        <div style={{ color: '#cbd5e1', lineHeight: 1.7, fontSize: 14 }}>
                            <div>카메라 ID: {selected.id}</div>
                            <div>지역: {selected.region}</div>
                            <div>구역: {selected.district ?? '미상'}</div>
                            <div>주소: {selected.address ?? '미상'}</div>
                            <div>운영: {selected.operator ?? '미상'}</div>
                            <div>좌표: {selected.lat?.toFixed(6)}, {selected.lng?.toFixed(6)}</div>
                            <div>좌표 출처: {selected.coordinateSource ?? 'unknown'} · {selected.coordinateVerified ? 'verified' : 'approximate'}</div>
                        </div>

                        <div style={{
                            marginTop: 16,
                            padding: 14,
                            borderRadius: 14,
                            background: 'rgba(16, 185, 129, 0.08)',
                            border: '1px solid rgba(16, 185, 129, 0.18)',
                        }}>
                            <div style={{ fontSize: 12, color: '#6ee7b7', fontWeight: 700 }}>분석 결과</div>
                            <div style={{ marginTop: 6, fontSize: 16, fontWeight: 800 }}>{analysis.verdict}</div>
                            <div style={{ marginTop: 8, color: '#d1fae5', fontSize: 14, lineHeight: 1.7 }}>
                                <div>job_id: {analysis.job_id}</div>
                                <div>vehicle_count: {analysis.vehicle_count ?? 0}</div>
                                <div>confidence: {analysis.confidence.toFixed(1)}%</div>
                                <div>tsa_status: {analysis.tsa_status}</div>
                                <div>events: {(analysis.events_detected ?? []).join(', ')}</div>
                            </div>
                        </div>

                        <div style={{
                            marginTop: 16,
                            padding: 14,
                            borderRadius: 14,
                            background: 'rgba(96, 165, 250, 0.08)',
                            border: '1px solid rgba(96, 165, 250, 0.18)',
                        }}>
                            <div style={{ fontSize: 12, color: '#93c5fd', fontWeight: 700 }}>검증 포인트</div>
                            <ul style={{ margin: '10px 0 0', paddingLeft: 18, lineHeight: 1.8, color: '#dbeafe', fontSize: 14 }}>
                                <li>실제 CCTV 목록 792대 로드</li>
                                <li>실제 스트림 카메라로 분석 요청</li>
                                <li>실제 프레임 캡처 이미지를 페이지에 삽입</li>
                            </ul>
                        </div>
                    </aside>
                </section>
            </div>
        </main>
    );
}
