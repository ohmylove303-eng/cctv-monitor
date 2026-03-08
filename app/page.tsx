'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import StatusBar from '@/components/StatusBar';
import SidePanel from '@/components/SidePanel';
import CctvMap, { CctvMapHandle } from '@/components/CctvMap';
import EventPanel from '@/components/EventPanel';
import CameraDetail from '@/components/CameraDetail';
import ForensicModal from '@/components/ForensicModal';

import { CctvItem, LayerVisibility, RegionFilter } from '@/types/cctv';
import { SatelliteMode } from '@/components/SatelliteControlPanel';
import SatelliteControlPanel from '@/components/SatelliteControlPanel';

// 원본 데이터 복구
import { gimpoCctv } from '@/data/cctv-gimpo';
import { incheonCctv } from '@/data/cctv-incheon';

const mapTypeToEn = (koType: string) => {
    if (koType === '방범') return 'crime';
    if (koType === '소방') return 'fire';
    if (koType === '교통') return 'traffic';
    return koType;
};

const initialCctv = [...gimpoCctv, ...incheonCctv].map(c => ({
    ...c,
    type: mapTypeToEn(c.type) as any
}));

export default function DashboardPage() {
    const mapRef = useRef<CctvMapHandle>(null);

    // ─── 데이터 상태 (원본 데이터로 초기화, 타입 영문화) ──────────────────────────────────
    const [allCctv, setAllCctv] = useState<CctvItem[]>(initialCctv);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showForensic, setShowForensic] = useState(false);

    // ─── 필터 상태 ──────────────────────────────────────────────────────────
    const [visible, setVisible] = useState<LayerVisibility>({ crime: true, fire: true, traffic: true });
    const [regionFilter, setRegionFilter] = useState<RegionFilter>({ '김포': true, '인천': true });

    // ─── 위성 옵션 (S-Loop OS vFinal) ──────────────────────────────────────────
    const [satelliteMode, setSatelliteMode] = useState<SatelliteMode>('off');
    const [satelliteOpacity, setSatelliteOpacity] = useState(60);
    const [sentinelDate, setSentinelDate] = useState(new Date().toISOString().split('T')[0]);
    const [satLastUpdated, setSatLastUpdated] = useState<string | null>(null);
    const [isSatLoading, setIsSatLoading] = useState(false);

    // ─── 실시간 데이터 병합 (ITS API) ──────────────────────────────────────────
    useEffect(() => {
        async function syncRealData() {
            try {
                const res = await fetch('/api/cctv');
                if (!res.ok) return;
                const realData = await res.json();
                if (!realData || realData.length === 0) return;

                // 기존 데이터와 병합 (실시간 데이터가 우선)
                setAllCctv(prev => {
                    const merged = [...prev];
                    realData.forEach((d: any) => {
                        const idx = merged.findIndex(m => m.id === d.id);
                        const newItem: CctvItem = {
                            id: d.id,
                            name: d.name,
                            type: (d.id.startsWith('G-T') || d.id.includes('traffic')) ? 'traffic' : (d.id.includes('fire') ? 'fire' : 'crime'),
                            status: d.status === 'online' ? '정상' : (d.status === 'offline' ? '고장' : '점검중'),
                            region: d.region === '인천' ? '인천' : '김포',
                            district: d.region,
                            address: d.name,
                            operator: d.operator || 'System',
                            streamUrl: d.streamUrl || '',
                            hlsUrl: d.streamUrl,
                            lat: d.coordinates[1],
                            lng: d.coordinates[0],
                        };
                        if (idx >= 0) merged[idx] = newItem;
                        else merged.push(newItem);
                    });
                    return merged;
                });
            } catch (err) {
                console.warn('ITS API Sync skipped:', err);
            }
        }
        syncRealData();
    }, []);

    const selectedCctv = useMemo(() =>
        allCctv.find(c => c.id === selectedId) || null
        , [allCctv, selectedId]);

    // ─── 핸들러 ───────────────────────────────────────────────────────────
    const handleLocate = (id: string) => {
        const item = allCctv.find(c => c.id === id);
        if (item) {
            setSelectedId(item.id);
            mapRef.current?.flyTo(item.lat, item.lng, 15);
        }
    };

    return (
        <main style={{
            height: '100vh', width: '100vw',
            background: '#020617', color: '#f8fafc',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden', padding: 12, gap: 12,
        }}>
            {/* 상단 통합 상황 바 */}
            <StatusBar allItems={allCctv} />

            <div style={{ flex: 1, display: 'flex', gap: 12, minHeight: 0 }}>
                {/* 좌측 패널 (CCTV 레이어 + 지역 필터 + 위성 레이어 제어) */}
                <div style={{ width: 280, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <SidePanel
                        allCctv={allCctv}
                        visible={visible}
                        regionFilter={regionFilter}
                        onVisibleChange={setVisible}
                        onRegionChange={setRegionFilter}
                        onSelect={(c) => setSelectedId(c.id)}
                        onFlyTo={(c) => mapRef.current?.flyTo(c.lat, c.lng, 15)}
                        satelliteMode={satelliteMode}
                        onSatelliteModeChange={setSatelliteMode}
                    />
                </div>

                {/* 중앙 지도 (Deck.gl + MapLibre Fusion) */}
                <div style={{ flex: 1, position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <CctvMap
                        ref={mapRef}
                        items={allCctv.filter(c => visible[c.type] && regionFilter[c.region])}
                        onSelect={(c) => setSelectedId(c.id)}
                        satelliteMode={satelliteMode}
                        satelliteOpacity={satelliteOpacity}
                        sentinelDate={sentinelDate}
                        onLastUpdated={setSatLastUpdated}
                        onLoadingChange={setIsSatLoading}
                    />

                    {/* 플로팅 위성 제어 패널 */}
                    <SatelliteControlPanel
                        mode={satelliteMode}
                        onModeChange={setSatelliteMode}
                        opacity={satelliteOpacity}
                        onOpacityChange={setSatelliteOpacity}
                        sentinelDate={sentinelDate}
                        onSentinelDateChange={setSentinelDate}
                        lastUpdated={satLastUpdated}
                        isLoading={isSatLoading}
                    />
                </div>

                {/* 우측 패널 (LIVE EVENTS + 분석 패널) */}
                <div style={{ width: 340, display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <EventPanel
                        items={allCctv}
                        onLocate={handleLocate}
                    />

                    {/* 선택 시 하단 상세 패널 (필요시) */}
                    {selectedCctv && (
                        <div className="glass-panel" style={{ borderRadius: 12, padding: 14 }}>
                            <CameraDetail
                                camera={{
                                    id: selectedCctv.id,
                                    name: selectedCctv.name,
                                    region: selectedCctv.region as any,
                                    location: selectedCctv.address,
                                    position: { lat: selectedCctv.lat, lng: selectedCctv.lng },
                                    status: selectedCctv.status === '정상' ? 'normal' : 'offline',
                                    resolution: '4K UHD',
                                    fps: 30,
                                    installedAt: '2023-01-01',
                                    lastMaintenance: '2024-03-01',
                                    streamUrl: selectedCctv.streamUrl
                                }}
                                onClose={() => setSelectedId(null)}
                                onAnalysis={() => setShowForensic(true)}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* 디자인 일관성을 위한 전역 CSS 보강 */}
            <style jsx global>{`
                :root {
                    --neon-blue: #40c4ff;
                    --neon-green: #00e676;
                    --neon-amber: #ffb300;
                    --neon-red: #ff3333;
                    --neon-purple: #7c4dff;
                    --border-glass: rgba(255, 255, 255, 0.08);
                }
                .glass-panel {
                    background: rgba(13, 25, 48, 0.7);
                    backdrop-filter: blur(20px);
                    border: 1px solid var(--border-glass);
                    box-shadow: 0 12px 32px rgba(0,0,0,0.4);
                }
                .badge {
                    font-size: 10px; font-weight: 800; padding: 3px 8px; border-radius: 5px;
                    border: 1px solid transparent;
                }
                .badge-blue { background: rgba(64,196,255,0.1); color: var(--neon-blue); border-color: rgba(64,196,255,0.2); }
                .badge-green { background: rgba(0,230,118,0.1); color: var(--neon-green); border-color: rgba(0,230,118,0.2); }
                .badge-amber { background: rgba(255,179,0,0.1); color: var(--neon-amber); border-color: rgba(255,179,0,0.2); }
                .badge-red { background: rgba(255,51,51,0.1); color: var(--neon-red); border-color: rgba(255,51,51,0.2); }
                .badge-purple { background: rgba(124,77,255,0.1); color: var(--neon-purple); border-color: rgba(124,77,255,0.2); }
                
                .custom-scrollbar::-webkit-scrollbar { width: 6px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
            `}</style>

            {showForensic && selectedCctv && (
                <ForensicModal
                    cctv={selectedCctv}
                    onClose={() => setShowForensic(false)}
                />
            )}
        </main>
    );
}
