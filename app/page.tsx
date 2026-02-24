'use client';
import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { CctvItem, LayerVisibility, RegionFilter } from '@/types/cctv';
import { gimpoCctv } from '@/data/cctv-gimpo';
import { incheonCctv } from '@/data/cctv-incheon';
import StatusBar from '@/components/StatusBar';
import SidePanel from '@/components/SidePanel';
import EventPanel from '@/components/EventPanel';
import ForensicSearch from '@/components/ForensicSearch';
import CctvModal from '@/components/CctvModal';
import { CctvMapHandle } from '@/components/CctvMap';

const CctvMap = dynamic(() => import('@/components/CctvMap'), { ssr: false });

// 스트림이 연결된 목업 카메라만 (YouTube 임베드 있는 것)
const MOCK_STREAM = [...gimpoCctv, ...incheonCctv].filter(c => c.streamUrl);

type RightTab = 'events' | 'search';

interface ItsRaw {
    id: string; name?: string; address?: string;
    lat: number; lng: number; hlsUrl: string; source: string;
}

export default function Dashboard() {
    const mapRef = useRef<CctvMapHandle>(null);

    const [visible, setVisible] = useState<LayerVisibility>({
        crime: true, fire: true, traffic: true,
    });
    const [regionFilter, setRegionFilter] = useState<RegionFilter>({
        김포: true, 인천: true,
    });
    const [selectedCctv, setSelectedCctv] = useState<CctvItem | null>(null);
    const [rightTab, setRightTab] = useState<RightTab>('events');
    const [itsLoading, setItsLoading] = useState(true);
    const [itsCameras, setItsCameras] = useState<CctvItem[]>([]);

    // ─── 실제 Gimpo ITS 카메라 로드 ─────────────────────────────────────────
    useEffect(() => {
        fetch('/api/gimpo-cctv?type=all')
            .then(r => r.json())
            .then(json => {
                if (json.success && json.cameras?.length) {
                    const mapped: CctvItem[] = (json.cameras as ItsRaw[])
                        .filter(c => c.lat > 37 && c.lng > 126 && c.hlsUrl)
                        .map((c, i) => ({
                            id: c.id || `ITS-${i}`,
                            name: c.name || c.address || `김포 교통 CCTV ${i + 1}`,
                            type: 'traffic' as const,
                            status: '정상' as const,
                            region: '김포' as const,
                            district: (c.address ?? '').split(' ')[2] ?? '김포시',
                            address: c.address ?? '',
                            operator: '김포시교통정보센터(ITS)',
                            streamUrl: '',
                            hlsUrl: c.hlsUrl,
                            lat: c.lat,
                            lng: c.lng,
                        }));
                    setItsCameras(mapped);
                }
            })
            .catch(() => { })
            .finally(() => setItsLoading(false));
    }, []);

    // 실제 ITS + 스트림 있는 목업 통합 (ITS 실패 시 목업만)
    const ALL_CCTV: CctvItem[] = [...itsCameras, ...MOCK_STREAM];

    const filteredItems = ALL_CCTV.filter(c =>
        visible[c.type] && regionFilter[c.region]
    );

    const flyTo = useCallback((cctv: CctvItem, zoom = 14) => {
        mapRef.current?.flyTo(cctv.lat, cctv.lng, zoom);
    }, []);

    const handleSelect = useCallback((cctv: CctvItem) => {
        flyTo(cctv);
        setSelectedCctv(cctv);
    }, [flyTo]);

    const handleLocate = useCallback((cctvId: string) => {
        const found = ALL_CCTV.find(c => c.id === cctvId);
        if (found) { flyTo(found); setSelectedCctv(found); }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [flyTo, ALL_CCTV.length]);

    return (
        <div style={{
            height: '100vh', display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr)',
            gap: 8, padding: 8, background: '#020617',
        }}>
            <StatusBar allItems={ALL_CCTV} />

            <div style={{
                display: 'grid', gridTemplateColumns: '252px minmax(0,1fr) 300px',
                gap: 8, minHeight: 0
            }}>

                <SidePanel
                    allCctv={ALL_CCTV}
                    visible={visible}
                    regionFilter={regionFilter}
                    onVisibleChange={setVisible}
                    onRegionChange={setRegionFilter}
                    onSelect={handleSelect}
                    onFlyTo={flyTo}
                />

                {/* 중앙: 지도 */}
                <div className="glass-panel" style={{
                    borderRadius: 12, overflow: 'hidden',
                    display: 'flex', flexDirection: 'column', minHeight: 0
                }}>

                    {/* 툴바 */}
                    <div style={{
                        padding: '8px 13px',
                        borderBottom: '1px solid var(--border-glass)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        flexShrink: 0, background: 'rgba(13,25,48,0.85)'
                    }}>
                        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                            <button className="btn-neon" onClick={() => mapRef.current?.flyTo(37.520, 126.680, 10)}>⊙ 전체</button>
                            <button className="btn-neon" onClick={() => mapRef.current?.flyTo(37.615, 126.716, 12)}>✈ 김포</button>
                            <button className="btn-neon" onClick={() => mapRef.current?.flyTo(37.456, 126.705, 11)}>⚓ 인천</button>
                            {([
                                { key: 'crime' as const, label: '📷방범', color: '#60a5fa' },
                                { key: 'fire' as const, label: '🚒소방', color: '#f87171' },
                                { key: 'traffic' as const, label: '🚦교통', color: '#34d399' },
                            ] as const).map(({ key, label, color }) => (
                                <button key={key}
                                    onClick={() => setVisible(v => ({ ...v, [key]: !v[key] }))}
                                    style={{
                                        padding: '4px 9px', borderRadius: 5, fontSize: 10,
                                        fontWeight: visible[key] ? 800 : 500, cursor: 'pointer',
                                        background: visible[key] ? `${color}18` : 'rgba(255,255,255,0.03)',
                                        border: `1px solid ${visible[key] ? color + '44' : 'rgba(255,255,255,0.07)'}`,
                                        color: visible[key] ? color : '#334155', transition: 'all 0.12s',
                                    }}>
                                    {label}
                                </button>
                            ))}
                            {/* ITS 연동 상태 */}
                            {itsLoading ? (
                                <span style={{ fontSize: 9, color: '#f59e0b' }}>⟳ ITS 연동중…</span>
                            ) : itsCameras.length > 0 ? (
                                <span style={{ fontSize: 9, color: '#22c55e' }}>
                                    ● ITS 실제 {itsCameras.length}대 연동됨
                                </span>
                            ) : (
                                <span style={{ fontSize: 9, color: '#475569' }}>ITS 대기중</span>
                            )}
                        </div>
                        <div style={{ fontSize: 10, color: '#334155', flexShrink: 0 }}>
                            표시 {filteredItems.length}대 / 전체 {ALL_CCTV.length}대
                        </div>
                    </div>

                    <div style={{ flex: 1, minHeight: 0 }}>
                        <CctvMap ref={mapRef} items={filteredItems} onSelect={handleSelect} />
                    </div>

                    <div style={{
                        padding: '5px 14px',
                        borderTop: '1px solid var(--border-glass)',
                        display: 'flex', gap: 16, fontSize: 9, color: '#334155',
                        flexShrink: 0, background: 'rgba(13,25,48,0.8)', flexWrap: 'wrap'
                    }}>
                        <span style={{ color: '#3b82f6' }}>● MFSR 엔진 v2.4.1</span>
                        <span>생성형 AI 배제 ✓</span>
                        <span>방범 {filteredItems.filter(c => c.type === 'crime').length}대 · 소방 {filteredItems.filter(c => c.type === 'fire').length}대 · 교통 {filteredItems.filter(c => c.type === 'traffic').length}대</span>
                        <span style={{ color: '#22c55e' }}>
                            ● 실제스트림 {filteredItems.filter(c => c.hlsUrl || c.streamUrl).length}대
                        </span>
                    </div>
                </div>

                {/* 우측 탭 */}
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: 6 }}>
                    <div className="glass-panel" style={{
                        borderRadius: 9, padding: '5px 6px',
                        flexShrink: 0, display: 'flex', gap: 4
                    }}>
                        {([
                            { key: 'events' as const, label: '⚡ 이벤트' },
                            { key: 'search' as const, label: '🔍 포렌식 검색' },
                        ] as const).map(({ key, label }) => (
                            <button key={key} onClick={() => setRightTab(key)}
                                style={{
                                    flex: 1, padding: '6px 4px', borderRadius: 6, fontSize: 11,
                                    fontWeight: rightTab === key ? 800 : 500, cursor: 'pointer',
                                    background: rightTab === key ? 'rgba(64,196,255,0.14)' : 'transparent',
                                    border: `1px solid ${rightTab === key ? 'rgba(64,196,255,0.35)' : 'transparent'}`,
                                    color: rightTab === key ? '#40c4ff' : '#475569', transition: 'all 0.15s',
                                }}>
                                {label}
                            </button>
                        ))}
                    </div>
                    <div style={{ flex: 1, minHeight: 0, display: rightTab === 'events' ? 'flex' : 'none', flexDirection: 'column' }}>
                        <EventPanel items={ALL_CCTV} onLocate={handleLocate} />
                    </div>
                    <div style={{ flex: 1, minHeight: 0, display: rightTab === 'search' ? 'flex' : 'none', flexDirection: 'column' }}>
                        <ForensicSearch allCctv={ALL_CCTV} onLocate={handleLocate} />
                    </div>
                </div>
            </div>

            {selectedCctv && (
                <CctvModal cctv={selectedCctv} onClose={() => setSelectedCctv(null)} />
            )}
        </div>
    );
}
