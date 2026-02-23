'use client';
import { useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { CctvItem, LayerVisibility, RegionFilter } from '@/types/cctv';
import { gimpoCctv } from '@/data/cctv-gimpo';
import { incheonCctv } from '@/data/cctv-incheon';
import StatusBar from '@/components/StatusBar';
import SidePanel from '@/components/SidePanel';
import EventPanel from '@/components/EventPanel';
import CctvModal from '@/components/CctvModal';
import { CctvMapHandle } from '@/components/CctvMap';

// MapLibre must be client-only
const CctvMap = dynamic(() => import('@/components/CctvMap'), { ssr: false });

const ALL_CCTV: CctvItem[] = [...gimpoCctv, ...incheonCctv];

export default function Dashboard() {
    const mapRef = useRef<CctvMapHandle>(null);

    const [visible, setVisible] = useState<LayerVisibility>({
        crime: true, fire: true, traffic: true,
    });
    const [regionFilter, setRegionFilter] = useState<RegionFilter>({
        김포: true, 인천: true,
    });
    const [selectedCctv, setSelectedCctv] = useState<CctvItem | null>(null);

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

                {/* 좌측: SidePanel */}
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
                        <div style={{ display: 'flex', gap: 7 }}>
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
                        </div>
                        <div style={{ fontSize: 10, color: '#334155' }}>
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
                        padding: '6px 14px',
                        borderTop: '1px solid var(--border-glass)',
                        display: 'flex', gap: 18, fontSize: 9, color: '#334155',
                        flexShrink: 0, background: 'rgba(13,25,48,0.8)'
                    }}>
                        <span style={{ color: '#3b82f6' }}>● MFSR 엔진 v2.4.1 가동중</span>
                        <span>생성형 AI 판단 배제 ✓</span>
                        <span>포렌식 룰셋 기반 탐지</span>
                    </div>
                </div>

                {/* 우측: 이벤트 패널 */}
                <EventPanel items={ALL_CCTV} onLocate={handleLocate} />
            </div>

            {/* CCTV 상세 모달 */}
            {selectedCctv && (
                <CctvModal
                    cctv={selectedCctv}
                    onClose={() => setSelectedCctv(null)}
                />
            )}
        </div>
    );
}
