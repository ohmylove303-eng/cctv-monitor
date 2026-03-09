'use client';

import React, { useState, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';

import StatusBar from './StatusBar';
import SidePanel from './CctvDetailPanel';
import EventFeed from './EventFeedPanel';
import SatelliteControl from './SatelliteControlPanel';
import { NormalizedCctv, SatelliteMode, StatusSummary } from '@/app/types';

const Map3DViewer = dynamic(() => import('./Map3DViewer'), { ssr: false });

export default function CctvFusionDashboard() {
    const [cctvPoints, setCctvPoints] = useState<NormalizedCctv[]>([]);
    const [selectedCctv, setSelectedCctv] = useState<NormalizedCctv | null>(null);
    const [regionFilter, setRegionFilter] = useState('전체');
    const [searchQuery, setSearchQuery] = useState('');

    const [satelliteMode, setSatelliteMode] = useState<SatelliteMode>('off');
    const [satelliteOpacity, setSatelliteOpacity] = useState(60);
    const [sentinelDate, setSentinelDate] = useState(new Date().toISOString().split('T')[0]);
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);
    const [isSatLoading, setIsSatLoading] = useState(false);

    useEffect(() => {
        fetch('/api/cctv').then(res => res.json()).then(setCctvPoints);
    }, []);

    const filteredCctv = useMemo(() => {
        return cctvPoints.filter(p => {
            const matchRegion = regionFilter === '전체' || p.region.includes(regionFilter);
            const matchSearch = p.name.includes(searchQuery);
            return matchRegion && matchSearch;
        });
    }, [cctvPoints, regionFilter, searchQuery]);

    const summary: StatusSummary = useMemo(() => ({
        total: filteredCctv.length,
        online: filteredCctv.filter(p => p.status === '정상').length,
        offline: filteredCctv.filter(p => p.status === '고장').length,
        unknown: filteredCctv.filter(p => p.status === '점검중').length
    }), [filteredCctv]);

    return (
        <div className="flex flex-col h-screen w-screen bg-black text-white overflow-hidden">
            <StatusBar
                summary={summary}
                regionFilter={regionFilter}
                onRegionChange={setRegionFilter}
            />

            <div className="flex-1 flex relative">
                <div className="flex-1 relative bg-gray-900">
                    <div className="absolute top-3 left-3 z-10">
                        <input
                            type="text"
                            placeholder="CCTV 검색..."
                            className="bg-gray-900/80 border border-gray-700 rounded px-3 py-1.5 text-xs outline-none focus:border-cyan-500 w-48 backdrop-blur"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>

                    <Map3DViewer
                        cctvPoints={filteredCctv}
                        selectedCctv={selectedCctv}
                        onSelectCctv={setSelectedCctv}
                        satelliteMode={satelliteMode}
                        satelliteOpacity={satelliteOpacity}
                        sentinelDate={sentinelDate}
                        onLastUpdated={setLastUpdated}
                        onLoadingChange={setIsSatLoading}
                    />

                    <SatelliteControl
                        mode={satelliteMode}
                        onModeChange={setSatelliteMode}
                        opacity={satelliteOpacity}
                        onOpacityChange={setSatelliteOpacity}
                        sentinelDate={sentinelDate}
                        onSentinelDateChange={setSentinelDate}
                        lastUpdated={lastUpdated}
                        isLoading={isSatLoading}
                    />
                </div>

                <SidePanel
                    cctv={selectedCctv}
                    onClose={() => setSelectedCctv(null)}
                />
            </div>

            <EventFeed />
        </div>
    );
}
