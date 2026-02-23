'use client';
import { useState, useRef, useCallback } from 'react';
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

const ALL_CCTV: CctvItem[] = [...gimpoCctv, ...incheonCctv];

type RightTab = 'events' | 'search';

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
    }, [flyTo]);

    return (
        <div style={{
            height: '100vh', display: 'grid',
            gridTemplateRows: 'auto minmax(0, 1fr)',
            gap: 8, padding: 8, background: '#020617',
        }}>
            {/* 상단 상태바 */}
            <StatusBar allItems={ALL_CCTV} />

            {/* 메인 3열 레이아웃 */}
            <div style={{
                display: 'grid', gridTemplateColumns: '252px minmax(0,1fr) 300px',
                gap: 8, minHeight: 0
            }}>

                {/* 좌측: SidePanel (레이어 필터 + 카메라 목록) */}
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

                    {/* 지도 툴바 */}
                    <div style={{
                        padding: '8px 13px',
                        borderBottom: '1px solid var(--border-glass)',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        flexShrink: 0, background: 'rgba(13,25,48,0.85)'
                    }}>
                        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                            <button className="btn-neon"
                                onClick={() => mapRef.current?.flyTo(37.520, 126.680, 10)}>
                                ⊙ 전체
                            </button>
                            <button className="btn-neon"
                                onClick={() => mapRef.current?.flyTo(37.615, 126.716, 12)}>
                                ✈ 김포
                            </button>
                            <button className="btn-neon"
                                onClick={() => mapRef.current?.flyTo(37.456, 126.705, 11)}>
                                ⚓ 인천
                            </button>
                            {/* 레이어 빠른 토글 */}
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
                                        color: visible[key] ? color : '#334155',
                                        transition: 'all 0.12s',
                                    }}>
                                    {label}
                                </button>
                            ))}
                        </div>
                        <div style={{ fontSize: 10, color: '#334155', flexShrink: 0 }}>
                            표시 {filteredItems.length} / 전체 {ALL_CCTV.length}대
                        </div>
                    </div>

                    {/* 지도 본체 */}
                    <div style={{ flex: 1, minHeight: 0 }}>
                        <CctvMap
                            ref={mapRef}
                            items={filteredItems}
                            onSelect={handleSelect}
                        />
                    </div>

                    {/* 하단 상태 */}
                    <div style={{
                        padding: '5px 14px',
                        borderTop: '1px solid var(--border-glass)',
                        display: 'flex', gap: 16, fontSize: 9, color: '#334155',
                        flexShrink: 0, background: 'rgba(13,25,48,0.8)', flexWrap: 'wrap'
                    }}>
                        <span style={{ color: '#3b82f6' }}>● MFSR 엔진 v2.4.1 가동중</span>
                        <span>생성형 AI 판단 배제 ✓</span>
                        <span>방범 {filteredItems.filter(c => c.type === 'crime').length}대 · 소방 {filteredItems.filter(c => c.type === 'fire').length}대 · 교통 {filteredItems.filter(c => c.type === 'traffic').length}대</span>
                    </div>
                </div>

                {/* 우측: 탭 패널 (이벤트 / 포렌식 검색) */}
                <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, gap: 6 }}>
                    {/* 탭 헤더 */}
                    <div className="glass-panel" style={{
                        borderRadius: 9, padding: '5px 6px', flexShrink: 0,
                        display: 'flex', gap: 4,
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
                                    color: rightTab === key ? '#40c4ff' : '#475569',
                                    transition: 'all 0.15s',
                                }}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* 탭 콘텐츠 */}
                    <div style={{
                        flex: 1, minHeight: 0, display: rightTab === 'events' ? 'flex' : 'none',
                        flexDirection: 'column'
                    }}>
                        <EventPanel items={ALL_CCTV} onLocate={handleLocate} />
                    </div>
                    <div style={{
                        flex: 1, minHeight: 0, display: rightTab === 'search' ? 'flex' : 'none',
                        flexDirection: 'column'
                    }}>
                        <ForensicSearch allCctv={ALL_CCTV} onLocate={handleLocate} />
                    </div>
                </div>
            </div>

            {/* CCTV 상세 모달 */}
            {selectedCctv && (
                <CctvModal cctv={selectedCctv} onClose={() => setSelectedCctv(null)} />
            )}
        </div>
    );
}
