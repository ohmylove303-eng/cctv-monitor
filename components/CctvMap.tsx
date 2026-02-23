'use client';
import {
    useEffect, useRef, useImperativeHandle,
    forwardRef, useState, useCallback,
} from 'react';
import { CctvItem } from '@/types/cctv';

export interface CctvMapHandle {
    flyTo: (lat: number, lng: number, zoom?: number) => void;
}

interface Props {
    items: CctvItem[];
    onSelect: (cctv: CctvItem) => void;
}

// ─── 상수 ────────────────────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
    crime: '#60a5fa', fire: '#f87171', traffic: '#34d399',
};
const STATUS_BORDER: Record<string, string> = {
    '정상': 'rgba(0,230,118,0.65)',
    '점검중': 'rgba(255,179,0,0.8)',
    '고장': 'rgba(255,51,51,1)',
};
const ZONE_CFG = {
    no_fly: { fill: '#ef4444', fillOp: 0.14, stroke: '#ef4444', strokeOp: 0.85, label: '비행 금지' },
    restricted: { fill: '#f59e0b', fillOp: 0.09, stroke: '#f59e0b', strokeOp: 0.70, label: '비행 제한' },
    allowed: { fill: '#22c55e', fillOp: 0.10, stroke: '#22c55e', strokeOp: 0.65, label: '비행 가능(신고)' },
};

type MapStyle = 'dark' | 'satellite' | 'hybrid';
const STYLES: Record<MapStyle, { label: string; icon: string }> = {
    dark: { label: '다크', icon: '🌙' },
    satellite: { label: '위성', icon: '🛰️' },
    hybrid: { label: '위성+', icon: '🗺️' },
};

// 원 좌표 생성기 (위경도 직접 근사)
function circle(lat: number, lng: number, km: number, pts = 48): [number, number][] {
    const latR = km / 111.32;
    const lngR = km / (111.32 * Math.cos((lat * Math.PI) / 180));
    const coords: [number, number][] = [];
    for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * 2 * Math.PI;
        coords.push([+(lng + lngR * Math.cos(a)).toFixed(6), +(lat + latR * Math.sin(a)).toFixed(6)]);
    }
    return coords;
}

// ─── 드론 구역 GeoJSON ───────────────────────────────────────────────────────
const DRONE_SOURCES = {
    'drone-no-fly': {
        features: [
            { zone: 'no_fly', label: '김포공항 비행금지 (9km)', lt: 37.5586, ln: 126.7960, r: 9 },
            { zone: 'no_fly', label: '인천공항 비행금지 (9km)', lt: 37.4490, ln: 126.4510, r: 9 },
        ],
    },
    'drone-restricted': {
        features: [
            { zone: 'restricted', label: '김포공항 비행제한 (15km)', lt: 37.5586, ln: 126.7960, r: 15 },
            { zone: 'restricted', label: '인천공항 비행제한 (15km)', lt: 37.4490, ln: 126.4510, r: 15 },
        ],
    },
    'drone-allowed': {
        features: [
            { zone: 'allowed', label: '한강신도시 비행가능(신고)', lt: 37.6094, ln: 126.6858, r: 2.5 },
            { zone: 'allowed', label: '송도국제도시 비행가능(신고)', lt: 37.3894, ln: 126.6390, r: 2 },
            { zone: 'allowed', label: '청라국제도시 비행가능(신고)', lt: 37.5368, ln: 126.6478, r: 1.8 },
        ],
    },
};

function makeDroneGeoJson(features: typeof DRONE_SOURCES['drone-no-fly']['features']) {
    return {
        type: 'FeatureCollection' as const,
        features: features.map(f => ({
            type: 'Feature' as const,
            properties: { zone: f.zone, label: f.label },
            geometry: { type: 'Polygon' as const, coordinates: [circle(f.lt, f.ln, f.r)] },
        })),
    };
}

// ─── MapLibre 스타일 빌드 ────────────────────────────────────────────────────
function buildStyle(s: MapStyle) {
    const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    return {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
            osm: { type: 'raster', tiles: [OSM], tileSize: 256 },
            satellite: { type: 'raster', tiles: [SAT], tileSize: 256 },
        },
        layers: [
            { id: 'bg', type: 'background', paint: { 'background-color': '#060d20' } },
            ...(s === 'dark' ? [{
                id: 'base', type: 'raster' as const, source: 'osm',
                paint: { 'raster-opacity': 0.13, 'raster-saturation': -1 }
            }] : []),
            ...(s === 'satellite' ? [{
                id: 'base', type: 'raster' as const, source: 'satellite',
                paint: { 'raster-opacity': 0.95 }
            }] : []),
            ...(s === 'hybrid' ? [
                { id: 'base', type: 'raster' as const, source: 'satellite', paint: { 'raster-opacity': 0.88 } },
                { id: 'overlay', type: 'raster' as const, source: 'osm', paint: { 'raster-opacity': 0.28, 'raster-saturation': -0.4 } },
            ] : []),
        ],
    };
}

// ─── 드론 레이어 맵에 추가 ──────────────────────────────────────────────────
function addDroneLayers(map: import('maplibre-gl').Map) {
    if (map.getSource('drone-no-fly')) return; // 이미 추가됨

    const order: (keyof typeof DRONE_SOURCES)[] = ['drone-restricted', 'drone-no-fly', 'drone-allowed'];
    order.forEach(srcId => {
        const zone = srcId.replace('drone-', '') as keyof typeof ZONE_CFG;
        const cfg = ZONE_CFG[zone];
        map.addSource(srcId, { type: 'geojson', data: makeDroneGeoJson(DRONE_SOURCES[srcId].features) });
        map.addLayer({
            id: `${srcId}-fill`, type: 'fill', source: srcId,
            paint: { 'fill-color': cfg.fill, 'fill-opacity': cfg.fillOp }
        });
        map.addLayer({
            id: `${srcId}-stroke`, type: 'line', source: srcId,
            paint: {
                'line-color': cfg.stroke, 'line-width': srcId === 'drone-no-fly' ? 2 : 1.5,
                'line-dasharray': srcId !== 'drone-no-fly' ? [4, 3] : [1],
                'line-opacity': cfg.strokeOp
            }
        });
    });
}

// ──────────────────────────────────────────────────────────────────────────────
const CctvMap = forwardRef<CctvMapHandle, Props>(({ items, onSelect }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<import('maplibre-gl').Map | null>(null);
    const markersRef = useRef<import('maplibre-gl').Marker[]>([]);  // ← 핵심 fix
    const mapReadyRef = useRef(false);

    const [mapStyle, setMapStyle] = useState<MapStyle>('dark');
    const [showDrone, setShowDrone] = useState(true);
    const [droneInfo, setDroneInfo] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
        flyTo: (lat, lng, zoom = 14) => {
            mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 900 });
        },
    }));

    // ─── CCTV 마커 갱신 (올바른 인스턴스 관리) ────────────────────────────────
    const refreshMarkers = useCallback(async () => {
        const map = mapRef.current;
        if (!map || !mapReadyRef.current) return;

        // 이전 마커 인스턴스 전부 제거
        markersRef.current.forEach(m => m.remove());
        markersRef.current = [];

        const ml = await import('maplibre-gl');
        const maplibregl = ml.default;

        items.forEach(cam => {
            const color = TYPE_COLOR[cam.type] ?? '#94a3b8';
            const border = STATUS_BORDER[cam.status] ?? 'rgba(148,163,184,0.4)';
            const icon = cam.type === 'crime' ? '📷' : cam.type === 'fire' ? '🚒' : '🚦';

            const el = document.createElement('div');
            el.style.cssText = `
        width:32px;height:32px;
        background:${color}22;border:2.5px solid ${border};
        border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        cursor:pointer;display:flex;align-items:center;justify-content:center;
        box-shadow:0 0 12px ${color}66,0 2px 8px rgba(0,0,0,0.55);
        transition:transform 0.12s ease;
        ${cam.status === '고장' ? 'animation:blink 1.5s ease-in-out infinite;' : ''}
      `;
            const inner = document.createElement('div');
            inner.style.cssText = 'transform:rotate(45deg);font-size:14px;line-height:1;pointer-events:none;';
            inner.textContent = icon;
            el.appendChild(inner);

            el.addEventListener('mouseenter', () => { el.style.transform = 'rotate(-45deg) scale(1.28)'; });
            el.addEventListener('mouseleave', () => { el.style.transform = 'rotate(-45deg) scale(1)'; });
            el.addEventListener('click', e => { e.stopPropagation(); onSelect(cam); });

            const marker = new maplibregl.Marker({ element: el })
                .setLngLat([cam.lng, cam.lat])
                .addTo(map);

            markersRef.current.push(marker);  // 저장
        });
    }, [items, onSelect]);

    // ─── 지도 초기화 (한 번만) ────────────────────────────────────────────────
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        import('maplibre-gl').then(ml => {
            const maplibregl = ml.default;
            const map = new maplibregl.Map({
                container: containerRef.current!,
                style: buildStyle('dark') as unknown as import('maplibre-gl').StyleSpecification,
                center: [126.680, 37.520],
                zoom: 10, minZoom: 7, maxZoom: 18,
                attributionControl: false,
            });

            map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
            map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

            map.on('load', () => {
                mapRef.current = map;
                mapReadyRef.current = true;
                addDroneLayers(map);

                // 드론 구역 클릭 이벤트
                ['drone-no-fly-fill', 'drone-restricted-fill', 'drone-allowed-fill'].forEach(id => {
                    map.on('click', id, e => {
                        setDroneInfo(e.features?.[0]?.properties?.label ?? null);
                    });
                    map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
                    map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
                });
                map.on('click', () => setDroneInfo(null));

                refreshMarkers();
            });
        });

        return () => {
            markersRef.current.forEach(m => m.remove());
            markersRef.current = [];
            mapRef.current?.remove();
            mapRef.current = null;
            mapReadyRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── 아이템 변경 시 마커 갱신 ─────────────────────────────────────────────
    useEffect(() => {
        if (mapReadyRef.current) refreshMarkers();
    }, [refreshMarkers]);

    // ─── 지도 스타일 변경 ─────────────────────────────────────────────────────
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReadyRef.current) return;
        map.setStyle(buildStyle(mapStyle) as unknown as import('maplibre-gl').StyleSpecification);
        map.once('styledata', () => {
            addDroneLayers(map);
            refreshMarkers();
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mapStyle]);

    // ─── 드론 레이어 가시성 ───────────────────────────────────────────────────
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReadyRef.current) return;
        const vis = showDrone ? 'visible' : 'none';
        ['drone-no-fly-fill', 'drone-no-fly-stroke',
            'drone-restricted-fill', 'drone-restricted-stroke',
            'drone-allowed-fill', 'drone-allowed-stroke',
        ].forEach(id => { if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', vis); });
    }, [showDrone]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

            {/* 지도 스타일 + 드론 토글 */}
            <div style={{
                position: 'absolute', top: 10, left: 10,
                display: 'flex', flexDirection: 'column', gap: 5, zIndex: 20
            }}>
                {(Object.keys(STYLES) as MapStyle[]).map(s => (
                    <button key={s} onClick={() => setMapStyle(s)}
                        style={{
                            padding: '5px 11px', borderRadius: 6, cursor: 'pointer', fontSize: 11,
                            fontWeight: mapStyle === s ? 800 : 500, transition: 'all 0.15s',
                            background: mapStyle === s ? 'rgba(64,196,255,0.22)' : 'rgba(6,13,32,0.85)',
                            border: `1px solid ${mapStyle === s ? 'rgba(64,196,255,0.55)' : 'rgba(255,255,255,0.1)'}`,
                            color: mapStyle === s ? '#40c4ff' : '#64748b',
                            backdropFilter: 'blur(10px)',
                        }}>
                        {STYLES[s].icon} {STYLES[s].label}
                    </button>
                ))}
                <button onClick={() => setShowDrone(v => !v)}
                    style={{
                        marginTop: 4, padding: '5px 11px', borderRadius: 6, cursor: 'pointer',
                        fontSize: 11, fontWeight: showDrone ? 800 : 500, transition: 'all 0.15s',
                        background: showDrone ? 'rgba(129,140,248,0.18)' : 'rgba(6,13,32,0.85)',
                        border: `1px solid ${showDrone ? 'rgba(129,140,248,0.5)' : 'rgba(255,255,255,0.1)'}`,
                        color: showDrone ? '#818cf8' : '#475569',
                        backdropFilter: 'blur(10px)',
                    }}>
                    🛸 드론 구역 {showDrone ? 'ON' : 'OFF'}
                </button>
            </div>

            {/* 드론 구역 클릭 팝업 */}
            {droneInfo && (
                <div style={{
                    position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
                    zIndex: 30, background: 'rgba(6,13,32,0.9)', backdropFilter: 'blur(10px)',
                    border: '1px solid rgba(129,140,248,0.4)', borderRadius: 8,
                    padding: '6px 16px', fontSize: 12, color: '#818cf8', fontWeight: 700,
                    pointerEvents: 'none',
                }}>
                    🛸 {droneInfo}
                </div>
            )}

            {/* 범례 */}
            <div className="glass-panel" style={{
                position: 'absolute', bottom: 48, right: 12,
                borderRadius: 9, padding: '10px 13px', zIndex: 10,
            }}>
                {[{ label: '방범 CCTV', color: '#60a5fa' },
                { label: '소방 CCTV', color: '#f87171' },
                { label: '교통 CCTV', color: '#34d399' }].map(l => (
                    <div key={l.label} style={{
                        display: 'flex', alignItems: 'center',
                        gap: 7, marginBottom: 5, color: '#94a3b8', fontSize: 11
                    }}>
                        <span style={{
                            width: 9, height: 9, borderRadius: '50%', background: l.color,
                            flexShrink: 0, boxShadow: `0 0 6px ${l.color}`
                        }} />
                        {l.label}
                    </div>
                ))}
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '5px 0 6px' }} />
                {[{ label: '정상', c: 'rgba(0,230,118,0.85)' },
                { label: '점검중', c: 'rgba(255,179,0,0.85)' },
                { label: '고장', c: 'rgba(255,51,51,1)' }].map(s => (
                    <div key={s.label} style={{
                        display: 'flex', alignItems: 'center',
                        gap: 6, marginBottom: 4, color: '#64748b', fontSize: 10
                    }}>
                        <span style={{
                            width: 7, height: 7, borderRadius: '50%',
                            border: `2px solid ${s.c}`, flexShrink: 0
                        }} />
                        {s.label}
                    </div>
                ))}
                {showDrone && (
                    <>
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '6px 0' }} />
                        <div style={{
                            fontSize: 9, color: '#475569', fontWeight: 700,
                            letterSpacing: '0.08em', marginBottom: 5
                        }}>드론 운용 구역</div>
                        {Object.entries(ZONE_CFG).map(([k, v]) => (
                            <div key={k} style={{
                                display: 'flex', alignItems: 'center',
                                gap: 6, marginBottom: 4, color: '#64748b', fontSize: 10
                            }}>
                                <span style={{
                                    width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                                    background: `${v.fill}22`, border: `1.5px solid ${v.stroke}`
                                }} />
                                {v.label}
                            </div>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
});

CctvMap.displayName = 'CctvMap';
export default CctvMap;
