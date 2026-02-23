'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { Camera, ForensicEvent } from '@/types';
import { cameras as initialCameras } from '@/data/cameras';
import { forensicEvents as initialEvents } from '@/data/events';
import { computeRegionStats, getSystemStatus } from '@/lib/utils';
import Header from '@/components/Header';
import CameraCard from '@/components/CameraCard';
import EventPanel from '@/components/EventPanel';
import CameraDetail from '@/components/CameraDetail';

// MapView must be client-only (maplibre-gl is browser-only)
const MapView = dynamic(() => import('@/components/MapView'), { ssr: false });

type TabType = 'all' | '김포' | '인천';
type StatusFilter = 'all' | 'normal' | 'alert' | 'offline' | 'recording';

export default function Dashboard() {
    const [cameras] = useState<Camera[]>(initialCameras);
    const [events, setEvents] = useState<ForensicEvent[]>(initialEvents);
    const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
    const [regionTab, setRegionTab] = useState<TabType>('all');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [clock, setClock] = useState('');
    const [search, setSearch] = useState('');

    // Live clock
    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setClock(now.toLocaleTimeString('ko-KR', { hour12: false }));
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    // Acknowledge event
    const handleAcknowledge = useCallback((eventId: string) => {
        setEvents((prev) =>
            prev.map((e) =>
                e.id === eventId
                    ? { ...e, acknowledged: true, acknowledgedBy: '관제원', acknowledgedAt: new Date().toISOString() }
                    : e
            )
        );
    }, []);

    // Filtered cameras
    const filteredCameras = cameras.filter((c) => {
        const regionMatch = regionTab === 'all' || c.region === regionTab;
        const statusMatch = statusFilter === 'all' || c.status === statusFilter;
        const searchMatch =
            !search ||
            c.name.includes(search) ||
            c.id.toLowerCase().includes(search.toLowerCase()) ||
            c.location.includes(search);
        return regionMatch && statusMatch && searchMatch;
    });

    const stats = computeRegionStats(cameras, events);
    const system = getSystemStatus();
    const unackedCount = events.filter((e) => !e.acknowledged).length;

    const tabStyle = (active: boolean): React.CSSProperties => ({
        padding: '5px 14px',
        fontSize: 12,
        fontWeight: active ? 700 : 500,
        color: active ? '#f1f5f9' : '#475569',
        background: active ? 'rgba(59,130,246,0.2)' : 'transparent',
        border: `1px solid ${active ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'all 0.15s',
    });

    const filterBtnStyle = (active: boolean, color?: string): React.CSSProperties => ({
        padding: '3px 10px',
        fontSize: 11,
        fontWeight: active ? 700 : 400,
        color: active ? (color ?? '#f1f5f9') : '#475569',
        background: active ? `${color ?? '#3b82f6'}18` : 'transparent',
        border: `1px solid ${active ? (color ?? '#3b82f6') + '44' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 5,
        cursor: 'pointer',
        transition: 'all 0.15s',
    });

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                width: '100vw',
                background: '#020617',
                overflow: 'hidden',
                fontFamily: "'Inter', sans-serif",
            }}
        >
            {/* ── Header ── */}
            <Header stats={stats} system={system} clock={clock} />

            {/* ── Body (sidebar + map + event panel) ── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* ─ Left Sidebar: Camera List ─ */}
                <aside
                    style={{
                        width: 280,
                        background: 'rgba(8,14,38,0.96)',
                        borderRight: '1px solid rgba(255,255,255,0.07)',
                        display: 'flex',
                        flexDirection: 'column',
                        flexShrink: 0,
                        overflow: 'hidden',
                    }}
                >
                    {/* Region tabs */}
                    <div
                        style={{
                            padding: '10px 12px',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex',
                            gap: 6,
                            flexShrink: 0,
                        }}
                    >
                        {(['all', '김포', '인천'] as TabType[]).map((t) => (
                            <button key={t} style={tabStyle(regionTab === t)} onClick={() => setRegionTab(t)}>
                                {t === 'all' ? '전체' : t}
                            </button>
                        ))}
                    </div>

                    {/* Search */}
                    <div style={{ padding: '8px 12px', flexShrink: 0 }}>
                        <input
                            type="text"
                            placeholder="카메라 검색..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            style={{
                                width: '100%',
                                background: 'rgba(255,255,255,0.04)',
                                border: '1px solid rgba(255,255,255,0.08)',
                                borderRadius: 7,
                                padding: '7px 10px',
                                color: '#e2e8f0',
                                fontSize: 12,
                                outline: 'none',
                            }}
                        />
                    </div>

                    {/* Status filters */}
                    <div
                        style={{
                            padding: '6px 12px',
                            display: 'flex',
                            gap: 5,
                            flexWrap: 'wrap',
                            flexShrink: 0,
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                        }}
                    >
                        <button style={filterBtnStyle(statusFilter === 'all')} onClick={() => setStatusFilter('all')}>전체</button>
                        <button style={filterBtnStyle(statusFilter === 'normal', '#22c55e')} onClick={() => setStatusFilter('normal')}>정상</button>
                        <button style={filterBtnStyle(statusFilter === 'alert', '#f59e0b')} onClick={() => setStatusFilter('alert')}>경보</button>
                        <button style={filterBtnStyle(statusFilter === 'recording', '#3b82f6')} onClick={() => setStatusFilter('recording')}>녹화</button>
                        <button style={filterBtnStyle(statusFilter === 'offline', '#6b7280')} onClick={() => setStatusFilter('offline')}>오프라인</button>
                    </div>

                    {/* Camera count */}
                    <div
                        style={{
                            padding: '6px 14px',
                            fontSize: 10,
                            color: '#334155',
                            flexShrink: 0,
                        }}
                    >
                        {filteredCameras.length}개 카메라 표시 중
                    </div>

                    {/* Camera list */}
                    <div
                        style={{
                            flex: 1,
                            overflowY: 'auto',
                            padding: '4px 12px 12px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 8,
                        }}
                    >
                        {filteredCameras.map((cam) => (
                            <CameraCard
                                key={cam.id}
                                camera={cam}
                                selected={selectedCamera?.id === cam.id}
                                onClick={() =>
                                    setSelectedCamera((prev) => (prev?.id === cam.id ? null : cam))
                                }
                            />
                        ))}
                        {filteredCameras.length === 0 && (
                            <div
                                style={{
                                    textAlign: 'center',
                                    padding: '40px 0',
                                    color: '#334155',
                                    fontSize: 12,
                                }}
                            >
                                검색 결과 없음
                            </div>
                        )}
                    </div>
                </aside>

                {/* ─ Center: Map ─ */}
                <main style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                    <MapView
                        cameras={cameras}
                        selectedCamera={selectedCamera}
                        onSelectCamera={(cam) =>
                            setSelectedCamera((prev) => (prev?.id === cam.id ? null : cam))
                        }
                    />

                    {/* Camera detail overlay */}
                    {selectedCamera && (
                        <CameraDetail
                            camera={selectedCamera}
                            onClose={() => setSelectedCamera(null)}
                        />
                    )}

                    {/* Bottom status bar */}
                    <div
                        style={{
                            position: 'absolute',
                            bottom: 0,
                            left: 0,
                            right: 0,
                            height: 32,
                            background: 'rgba(6,13,32,0.88)',
                            borderTop: '1px solid rgba(255,255,255,0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            padding: '0 16px',
                            gap: 24,
                            fontSize: 10,
                            color: '#334155',
                            backdropFilter: 'blur(8px)',
                            zIndex: 10,
                        }}
                    >
                        <span style={{ color: '#1d4ed8' }}>● MFSR 엔진 가동중</span>
                        <span>생성형 AI 판단 배제 ✓</span>
                        <span>포렌식 룰셋 기반</span>
                        <span
                            style={{
                                marginLeft: 'auto',
                                color: unackedCount > 0 ? '#f59e0b' : '#334155',
                            }}
                        >
                            {unackedCount > 0 ? `미확인 이벤트 ${unackedCount}건` : '미확인 이벤트 없음'}
                        </span>
                    </div>
                </main>

                {/* ─ Right: Event Panel ─ */}
                <aside
                    style={{
                        width: 320,
                        background: 'rgba(8,14,38,0.96)',
                        borderLeft: '1px solid rgba(255,255,255,0.07)',
                        display: 'flex',
                        flexDirection: 'column',
                        flexShrink: 0,
                        overflow: 'hidden',
                    }}
                >
                    <EventPanel events={events} onAcknowledge={handleAcknowledge} />
                </aside>
            </div>
        </div>
    );
}
