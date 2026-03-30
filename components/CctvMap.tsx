import {
    useEffect, useRef, useImperativeHandle,
    forwardRef, useState, useCallback, useMemo,
} from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer } from '@deck.gl/layers';
import type { LayersList } from '@deck.gl/core';
import { CctvItem } from '@/types/cctv';
import type { SatelliteMode } from '@/components/SatelliteControlPanel';
import { hasVerifiedCoordinate } from '@/lib/coordinate-quality';
import type { RouteMonitoringPlan } from '@/lib/route-monitoring';

export interface CctvMapHandle {
    flyTo: (lat: number, lng: number, zoom?: number) => void;
    fitToItems: (points: Pick<CctvItem, 'lat' | 'lng'>[]) => void;
}

interface Props {
    items: CctvItem[];
    routeMonitoringPlan?: RouteMonitoringPlan | null;
    onSelect: (cctv: CctvItem) => void;
    // 위성 레이어 props
    satelliteMode?: SatelliteMode;
    satelliteOpacity?: number;
    sentinelDate?: string;
    onLastUpdated?: (t: string) => void;
    onLoadingChange?: (v: boolean) => void;
    onErrorChange?: (message: string | null) => void;
}

type SatellitePosition = {
    name: string;
    coordinates: [number, number, number];
};

type BaseMapProvider = 'openfreemap' | 'google' | 'arcgis';

type GoogleBasemapResponse = {
    provider: 'google';
    style: 'satellite' | 'hybrid';
    tileUrl: string;
    tileSize: number;
    safeMaxZoom: number;
    copyright: string | null;
};

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
type DroneZoneKey = keyof typeof ZONE_CFG;
type DroneZoneVisibility = Record<DroneZoneKey, boolean>;

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

const DRONE_ZONE_KEY: Record<keyof typeof DRONE_SOURCES, keyof typeof ZONE_CFG> = {
    'drone-no-fly': 'no_fly',
    'drone-restricted': 'restricted',
    'drone-allowed': 'allowed',
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
function buildDarkStyle() {
    return 'https://tiles.openfreemap.org/styles/dark';
}

function buildArcGisStyle(s: Extract<MapStyle, 'satellite' | 'hybrid'>) {
    const SAT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
    const OSM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    if (s === 'satellite') {
        return {
            version: 8,
            glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
            sources: {
                satellite: { type: 'raster', tiles: [SAT], tileSize: 256 },
            },
            layers: [
                { id: 'bg', type: 'background', paint: { 'background-color': '#000' } },
                { id: 'sat', type: 'raster', source: 'satellite', paint: { 'raster-opacity': 0.97 } },
            ],
        };
    }

    // hybrid: 위성 + OSM 라벨 오버레이
    return {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
            satellite: { type: 'raster', tiles: [SAT], tileSize: 256 },
            osmlabels: { type: 'raster', tiles: [OSM], tileSize: 256 },
        },
        layers: [
            { id: 'bg', type: 'background', paint: { 'background-color': '#1a1a2e' } },
            { id: 'sat', type: 'raster', source: 'satellite', paint: { 'raster-opacity': 0.87 } },
            {
                id: 'osm-lbl', type: 'raster', source: 'osmlabels',
                paint: { 'raster-opacity': 0.55, 'raster-saturation': -0.3, 'raster-contrast': 0.2 }
            },
        ],
    };
}

function buildGoogleStyle(
    s: Extract<MapStyle, 'satellite' | 'hybrid'>,
    tileUrl: string,
    tileSize: number
) {
    if (s === 'hybrid') {
        return {
            version: 8,
            glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
            sources: {
                googleSatellite: {
                    type: 'raster',
                    tiles: [tileUrl],
                    tileSize,
                },
                osmlabels: {
                    type: 'raster',
                    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                    tileSize: 256,
                },
            },
            layers: [
                { id: 'bg', type: 'background', paint: { 'background-color': '#000' } },
                {
                    id: 'google-satellite-base',
                    type: 'raster',
                    source: 'googleSatellite',
                    paint: { 'raster-opacity': 0.98 },
                },
                {
                    id: 'google-road-overlay',
                    type: 'raster',
                    source: 'osmlabels',
                    paint: {
                        'raster-opacity': 0.42,
                        'raster-saturation': -0.65,
                        'raster-contrast': 0.2,
                    },
                },
            ],
        };
    }

    return {
        version: 8,
        glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
        sources: {
            google: {
                type: 'raster',
                tiles: [tileUrl],
                tileSize,
            },
        },
        layers: [
            { id: 'bg', type: 'background', paint: { 'background-color': '#000' } },
            {
                id: 'google-base',
                type: 'raster',
                source: 'google',
                paint: { 'raster-opacity': s === 'satellite' ? 0.98 : 0.95 },
            },
        ],
    };
}

function buildFallbackStyle(s: MapStyle): string | object {
    if (s === 'dark') {
        return buildDarkStyle();
    }

    return buildArcGisStyle(s);
}

// ─── 드론 레이어 맵에 추가 ──────────────────────────────────────────────────
function addDroneLayers(map: import('maplibre-gl').Map) {
    ['drone-no-fly', 'drone-restricted', 'drone-allowed'].forEach(id => {
        if (map.getLayer(`${id}-fill`)) map.removeLayer(`${id}-fill`);
        if (map.getLayer(`${id}-stroke`)) map.removeLayer(`${id}-stroke`);
        if (map.getSource(id)) map.removeSource(id);
    });

    const order: (keyof typeof DRONE_SOURCES)[] = ['drone-allowed', 'drone-restricted', 'drone-no-fly'];
    order.forEach(srcId => {
        const cfg = ZONE_CFG[DRONE_ZONE_KEY[srcId]];
        map.addSource(srcId, { type: 'geojson', data: makeDroneGeoJson(DRONE_SOURCES[srcId].features) });
        map.addLayer({
            id: `${srcId}-fill`, type: 'fill', source: srcId,
            paint: { 'fill-color': cfg.fill, 'fill-opacity': 0.35 }
        });
        map.addLayer({
            id: `${srcId}-stroke`, type: 'line', source: srcId,
            paint: {
                'line-color': cfg.stroke,
                'line-width': srcId === 'drone-no-fly' ? 3 : 2,
                'line-dasharray': srcId !== 'drone-no-fly' ? [4, 3] : [1],
                'line-opacity': 0.95,
            }
        });
    });
}

function ensureRegionLayers(map: import('maplibre-gl').Map) {
    if (!map.getSource(REGION_BOUNDARY_SOURCE)) {
        map.addSource(REGION_BOUNDARY_SOURCE, {
            type: 'geojson',
            data: buildRegionBoundaryGeoJson([]),
        });
    }

    if (!map.getSource(REGION_LABEL_SOURCE)) {
        map.addSource(REGION_LABEL_SOURCE, {
            type: 'geojson',
            data: buildRegionLabelGeoJson([]),
        });
    }

    if (!map.getLayer(REGION_FILL_LAYER)) {
        map.addLayer({
            id: REGION_FILL_LAYER,
            type: 'fill',
            source: REGION_BOUNDARY_SOURCE,
            paint: {
                'fill-color': ['get', 'fill'],
                'fill-opacity': 0.0,
            },
            layout: {
                visibility: 'none',
            },
        });
    }

    if (!map.getLayer(REGION_LINE_LAYER)) {
        map.addLayer({
            id: REGION_LINE_LAYER,
            type: 'line',
            source: REGION_BOUNDARY_SOURCE,
            paint: {
                'line-color': ['get', 'line'],
                'line-width': 2,
                'line-opacity': 0.0,
                'line-dasharray': [2, 2],
            },
            layout: {
                visibility: 'none',
            },
        });
    }

    if (!map.getLayer(REGION_LABEL_LAYER) && map.getStyle()?.glyphs) {
        map.addLayer({
            id: REGION_LABEL_LAYER,
            type: 'symbol',
            source: REGION_LABEL_SOURCE,
            layout: {
                'text-field': ['get', 'region'],
                'text-size': 13,
                'text-font': ['Open Sans Bold'],
                'text-letter-spacing': 0.06,
            },
            paint: {
                'text-color': ['get', 'line'],
                'text-halo-color': 'rgba(6,13,32,0.95)',
                'text-halo-width': 1.5,
            },
        });
    }
}

function syncRegionLayers(map: import('maplibre-gl').Map, items: CctvItem[]) {
    ensureRegionLayers(map);
    const reliableItems = items.filter((item) => hasVerifiedCoordinate(item));
    const regionItems = reliableItems.length > 0 ? reliableItems : items;
    const boundarySource = map.getSource(REGION_BOUNDARY_SOURCE) as import('maplibre-gl').GeoJSONSource | undefined;
    const labelSource = map.getSource(REGION_LABEL_SOURCE) as import('maplibre-gl').GeoJSONSource | undefined;
    boundarySource?.setData(buildRegionBoundaryGeoJson(regionItems) as any);
    labelSource?.setData(buildRegionLabelGeoJson(regionItems) as any);
}

function moveLayerIfPresent(map: import('maplibre-gl').Map, id: string) {
    if (map.getLayer(id)) {
        map.moveLayer(id);
    }
}

function liftOperationalLayers(map: import('maplibre-gl').Map) {
    [
        REGION_FILL_LAYER,
        REGION_LINE_LAYER,
        'drone-allowed-fill',
        'drone-allowed-stroke',
        'drone-restricted-fill',
        'drone-restricted-stroke',
        'drone-no-fly-fill',
        'drone-no-fly-stroke',
        CCTV_LAYER,
        ROUTE_LINE_LAYER,
        ROUTE_FOCUS_LAYER,
        REGION_LABEL_LAYER,
    ].forEach((id) => moveLayerIfPresent(map, id));
}

// ─── 위성 레이어 ID 상수 ─────────────────────────────────────────────────────
const SAT_IMAGE_SOURCE = 'sat-image-source';
const SAT_IMAGE_LAYER = 'sat-image-layer';
const SAT_RASTER_SOURCE = 'sat-raster-source';
const SAT_RASTER_LAYER = 'sat-raster-layer';
const CCTV_SOURCE = 'cctv-points-source';
const CCTV_LAYER = 'cctv-points-layer';
const REGION_BOUNDARY_SOURCE = 'region-boundaries-source';
const REGION_LABEL_SOURCE = 'region-boundaries-label-source';
const REGION_FILL_LAYER = 'region-boundaries-fill';
const REGION_LINE_LAYER = 'region-boundaries-line';
const REGION_LABEL_LAYER = 'region-boundaries-label';
const ROUTE_SOURCE = 'route-monitoring-source';
const ROUTE_LINE_LAYER = 'route-monitoring-line';
const ROUTE_FOCUS_LAYER = 'route-monitoring-focus';
const SATELLITE_REQUEST_SCALE = 2;
const SATELLITE_REQUEST_MAX_DIMENSION = 2048;
const SATELLITE_REFRESH_DEBOUNCE_MS = 180;
const BASEMAP_VIEWPORT_REFRESH_DEBOUNCE_MS = 220;
const PLANET_MIN_ZOOM = 13;
const SENTINEL_AUTO_HIDE_ZOOM = 14;
const DEFAULT_MAP_MAX_ZOOM = 22;
const FALLBACK_SATELLITE_BASEMAP_SAFE_MAX_ZOOM = 19;
const DRONE_ZONE_ORDER: DroneZoneKey[] = ['no_fly', 'restricted', 'allowed'];
const DEFAULT_DRONE_ZONE_VISIBILITY: DroneZoneVisibility = {
    no_fly: true,
    restricted: true,
    allowed: true,
};
const DRONE_LAYER_IDS: Record<DroneZoneKey, string[]> = {
    no_fly: ['drone-no-fly-fill', 'drone-no-fly-stroke'],
    restricted: ['drone-restricted-fill', 'drone-restricted-stroke'],
    allowed: ['drone-allowed-fill', 'drone-allowed-stroke'],
};
const REGION_COLOR: Record<CctvItem['region'], { fill: string; line: string }> = {
    김포: { fill: 'rgba(16,185,129,0.18)', line: '#10b981' },
    인천: { fill: 'rgba(6,182,212,0.16)', line: '#06b6d4' },
    서울: { fill: 'rgba(139,92,246,0.16)', line: '#8b5cf6' },
};

function closeRing(points: [number, number][]) {
    if (points.length === 0) return points;
    const [firstLng, firstLat] = points[0];
    const [lastLng, lastLat] = points[points.length - 1];
    if (firstLng === lastLng && firstLat === lastLat) {
        return points;
    }
    return [...points, [firstLng, firstLat]];
}

function cross(o: [number, number], a: [number, number], b: [number, number]) {
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

function convexHull(points: [number, number][]) {
    if (points.length <= 1) return points;

    const sorted = [...points].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
    const lower: [number, number][] = [];
    for (const point of sorted) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) {
            lower.pop();
        }
        lower.push(point);
    }

    const upper: [number, number][] = [];
    for (const point of [...sorted].reverse()) {
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) {
            upper.pop();
        }
        upper.push(point);
    }

    lower.pop();
    upper.pop();
    return [...lower, ...upper];
}

function buildPaddedBounds(points: [number, number][]) {
    const lngs = points.map(([lng]) => lng);
    const lats = points.map(([, lat]) => lat);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const padLng = Math.max((maxLng - minLng) * 0.12, 0.01);
    const padLat = Math.max((maxLat - minLat) * 0.12, 0.01);

    return closeRing([
        [minLng - padLng, minLat - padLat],
        [maxLng + padLng, minLat - padLat],
        [maxLng + padLng, maxLat + padLat],
        [minLng - padLng, maxLat + padLat],
    ]);
}

function buildRegionPolygon(points: [number, number][]) {
    if (points.length <= 2) {
        return buildPaddedBounds(points);
    }

    const hull = convexHull(points);
    if (hull.length < 3) {
        return buildPaddedBounds(points);
    }

    const centroidLng = points.reduce((sum, [lng]) => sum + lng, 0) / points.length;
    const centroidLat = points.reduce((sum, [, lat]) => sum + lat, 0) / points.length;
    const lngs = points.map(([lng]) => lng);
    const lats = points.map(([, lat]) => lat);
    const padLng = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 0.08, 0.008);
    const padLat = Math.max((Math.max(...lats) - Math.min(...lats)) * 0.08, 0.008);

    return closeRing(hull.map(([lng, lat]) => ([
        centroidLng + (lng - centroidLng) * 1.08 + (lng >= centroidLng ? padLng : -padLng),
        centroidLat + (lat - centroidLat) * 1.08 + (lat >= centroidLat ? padLat : -padLat),
    ])));
}

function buildRegionBoundaryGeoJson(items: CctvItem[]) {
    const grouped = new Map<CctvItem['region'], [number, number][]>();

    items.forEach((item) => {
        const current = grouped.get(item.region) ?? [];
        current.push([item.lng, item.lat]);
        grouped.set(item.region, current);
    });

    return {
        type: 'FeatureCollection' as const,
        features: Array.from(grouped.entries()).map(([region, points]) => ({
            type: 'Feature' as const,
            properties: {
                region,
                fill: REGION_COLOR[region].fill,
                line: REGION_COLOR[region].line,
            },
            geometry: {
                type: 'Polygon' as const,
                coordinates: [buildRegionPolygon(points)],
            },
        })),
    };
}

function buildRegionLabelGeoJson(items: CctvItem[]) {
    const grouped = new Map<CctvItem['region'], [number, number][]>();

    items.forEach((item) => {
        const current = grouped.get(item.region) ?? [];
        current.push([item.lng, item.lat]);
        grouped.set(item.region, current);
    });

    return {
        type: 'FeatureCollection' as const,
        features: Array.from(grouped.entries()).map(([region, points]) => ({
            type: 'Feature' as const,
            properties: {
                region,
                line: REGION_COLOR[region].line,
            },
            geometry: {
                type: 'Point' as const,
                coordinates: [
                    points.reduce((sum, [lng]) => sum + lng, 0) / points.length,
                    points.reduce((sum, [, lat]) => sum + lat, 0) / points.length,
                ],
            },
        })),
    };
}

function resolveMapMaxZoom(style: MapStyle) {
    if (style !== 'dark') {
        return FALLBACK_SATELLITE_BASEMAP_SAFE_MAX_ZOOM;
    }
    return DEFAULT_MAP_MAX_ZOOM;
}

function buildCctvGeoJson(items: CctvItem[]) {
    return {
        type: 'FeatureCollection' as const,
        features: items.map((item) => ({
            type: 'Feature' as const,
            properties: {
                id: item.id,
                name: item.name,
                type: item.type,
                status: item.status,
                source: item.source ?? '',
                region: item.region,
                regionRank: item.region === '김포' ? 0 : item.region === '인천' ? 1 : 2,
                typeRank: item.type === 'crime' ? 0 : item.type === 'fire' ? 1 : 2,
            },
            geometry: {
                type: 'Point' as const,
                coordinates: [item.lng, item.lat],
            },
        })),
    };
}

function removeSatLayers(map: import('maplibre-gl').Map) {
    if (map.getLayer(SAT_IMAGE_LAYER)) map.removeLayer(SAT_IMAGE_LAYER);
    if (map.getLayer(SAT_RASTER_LAYER)) map.removeLayer(SAT_RASTER_LAYER);
    if (map.getSource(SAT_IMAGE_SOURCE)) map.removeSource(SAT_IMAGE_SOURCE);
    if (map.getSource(SAT_RASTER_SOURCE)) map.removeSource(SAT_RASTER_SOURCE);
}

function buildSatelliteViewportQuery(map: import('maplibre-gl').Map, date?: string) {
    const bounds = map.getBounds();
    const canvas = map.getCanvas();
    const baseWidth = canvas.clientWidth || canvas.width || 1024;
    const baseHeight = canvas.clientHeight || canvas.height || 1024;
    const devicePixelRatio = typeof window === 'undefined' ? 1 : (window.devicePixelRatio || 1);

    let width = Math.max(512, Math.round(baseWidth * Math.min(devicePixelRatio, SATELLITE_REQUEST_SCALE)));
    let height = Math.max(512, Math.round(baseHeight * Math.min(devicePixelRatio, SATELLITE_REQUEST_SCALE)));

    const maxDimension = Math.max(width, height);
    if (maxDimension > SATELLITE_REQUEST_MAX_DIMENSION) {
        const scale = SATELLITE_REQUEST_MAX_DIMENSION / maxDimension;
        width = Math.max(256, Math.round(width * scale));
        height = Math.max(256, Math.round(height * scale));
    }

    const query = new URLSearchParams();
    if (date) {
        query.set('date', date);
    }
    query.set(
        'bbox',
        [
            bounds.getWest().toFixed(6),
            bounds.getSouth().toFixed(6),
            bounds.getEast().toFixed(6),
            bounds.getNorth().toFixed(6),
        ].join(',')
    );
    query.set('width', String(width));
    query.set('height', String(height));
    return query;
}

function boundsWithinCoverage(
    map: import('maplibre-gl').Map,
    coverageBbox: readonly [number, number, number, number]
) {
    const bounds = map.getBounds();
    const margin = 0.002;

    return (
        bounds.getWest() >= coverageBbox[0] + margin &&
        bounds.getSouth() >= coverageBbox[1] + margin &&
        bounds.getEast() <= coverageBbox[2] - margin &&
        bounds.getNorth() <= coverageBbox[3] - margin
    );
}

function ensureCctvLayers(map: import('maplibre-gl').Map) {
    if (!map.getSource(CCTV_SOURCE)) {
        map.addSource(CCTV_SOURCE, {
            type: 'geojson',
            data: buildCctvGeoJson([]),
        });
    }

    if (!map.getLayer(CCTV_LAYER)) {
        map.addLayer({
            id: CCTV_LAYER,
            type: 'circle',
            source: CCTV_SOURCE,
            layout: {
                'circle-sort-key': [
                    '+',
                    ['*', ['get', 'regionRank'], 10],
                    ['get', 'typeRank'],
                ],
            },
            paint: {
                'circle-radius': [
                    'match',
                    ['get', 'type'],
                    'crime', 9,
                    'fire', 9,
                    10,
                ],
                'circle-color': [
                    'match',
                    ['get', 'type'],
                    'crime', '#60a5fa',
                    'fire', '#f87171',
                    '#34d399',
                ],
                'circle-stroke-width': 2.5,
                'circle-stroke-color': [
                    'match',
                    ['get', 'status'],
                    '점검중', '#ffb300',
                    '고장', '#ff3333',
                    '#00e676',
                ],
                'circle-opacity': 0.92,
                'circle-stroke-opacity': 0.95,
            },
        });
    }
}

function syncCctvLayers(map: import('maplibre-gl').Map, items: CctvItem[]) {
    ensureCctvLayers(map);
    const source = map.getSource(CCTV_SOURCE) as import('maplibre-gl').GeoJSONSource | undefined;
    source?.setData(buildCctvGeoJson(items) as any);
}

function buildRouteMonitoringGeoJson(plan: RouteMonitoringPlan | null, items: CctvItem[]) {
    if (!plan) {
        return { type: 'FeatureCollection' as const, features: [] as any[] };
    }

    const lookup = new Map(items.map((item) => [item.id, item]));
    const orderedItems = plan.prioritizedIds
        .map((id) => lookup.get(id))
        .filter((item): item is CctvItem => Boolean(item));

    const features: any[] = [];

    if (orderedItems.length >= 2) {
        features.push({
            type: 'Feature',
            properties: { kind: 'route-line' },
            geometry: {
                type: 'LineString',
                coordinates: orderedItems.map((item) => [item.lng, item.lat]),
            },
        });
    }

    plan.candidates.forEach((candidate) => {
        const item = lookup.get(candidate.id);
        if (!item) return;
        const timeWindowRank = candidate.timeWindowLabel === '즉시'
            ? 0
            : candidate.timeWindowLabel === '단기'
                ? 1
                : candidate.timeWindowLabel === '중기'
                    ? 2
                    : 3;

        features.push({
            type: 'Feature',
            properties: {
                id: candidate.id,
                isForward: candidate.isForward ? 1 : 0,
                etaMinutes: candidate.etaMinutes,
                isFocus: plan.focusIds.includes(candidate.id) ? 1 : 0,
                timeWindowRank,
            },
            geometry: {
                type: 'Point',
                coordinates: [item.lng, item.lat],
            },
        });
    });

    return {
        type: 'FeatureCollection' as const,
        features,
    };
}

function ensureRouteMonitoringLayers(map: import('maplibre-gl').Map) {
    if (!map.getSource(ROUTE_SOURCE)) {
        map.addSource(ROUTE_SOURCE, {
            type: 'geojson',
            data: buildRouteMonitoringGeoJson(null, []),
        });
    }

    if (!map.getLayer(ROUTE_LINE_LAYER)) {
        map.addLayer({
            id: ROUTE_LINE_LAYER,
            type: 'line',
            source: ROUTE_SOURCE,
            filter: ['==', ['geometry-type'], 'LineString'],
            paint: {
                'line-color': '#22d3ee',
                'line-width': 3,
                'line-opacity': 0.85,
                'line-dasharray': [2, 1.5],
            },
        });
    }

    if (!map.getLayer(ROUTE_FOCUS_LAYER)) {
        map.addLayer({
            id: ROUTE_FOCUS_LAYER,
            type: 'circle',
            source: ROUTE_SOURCE,
            filter: ['==', ['geometry-type'], 'Point'],
            paint: {
                'circle-radius': [
                    'case',
                    ['==', ['get', 'isFocus'], 1], 8,
                    ['==', ['get', 'isForward'], 1], 6.5,
                    5,
                ],
                'circle-color': [
                    'case',
                    ['==', ['get', 'timeWindowRank'], 0], '#22d3ee',
                    ['==', ['get', 'timeWindowRank'], 1], '#38bdf8',
                    ['==', ['get', 'timeWindowRank'], 2], '#60a5fa',
                    '#94a3b8',
                ],
                'circle-stroke-color': '#f0f9ff',
                'circle-stroke-width': ['case', ['==', ['get', 'isFocus'], 1], 2.6, 2],
                'circle-opacity': 0.88,
            },
        });
    }
}

function syncRouteMonitoringLayers(
    map: import('maplibre-gl').Map,
    plan: RouteMonitoringPlan | null,
    items: CctvItem[]
) {
    ensureRouteMonitoringLayers(map);
    const source = map.getSource(ROUTE_SOURCE) as import('maplibre-gl').GeoJSONSource | undefined;
    source?.setData(buildRouteMonitoringGeoJson(plan, items) as any);
}

// ──────────────────────────────────────────────────────────────────────────────
const CctvMap = forwardRef<CctvMapHandle, Props>(({
    items,
    routeMonitoringPlan = null,
    onSelect,
    satelliteMode = 'off',
    satelliteOpacity = 60,
    sentinelDate,
    onLastUpdated,
    onLoadingChange,
    onErrorChange,
}, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<import('maplibre-gl').Map | null>(null);
    const maplibreRef = useRef<typeof import('maplibre-gl') | null>(null);
    const markersRef = useRef<import('maplibre-gl').Marker[]>([]);
    const satelliteObjectUrlRef = useRef<string | null>(null);
    const satelliteRefreshTimeoutRef = useRef<number | null>(null);
    const baseMapRefreshTimeoutRef = useRef<number | null>(null);
    const satelliteModeRef = useRef<SatelliteMode>(satelliteMode);
    const planetCoverageRef = useRef<readonly [number, number, number, number] | null>(null);
    const mapReadyRef = useRef(false);
    const itemsRef = useRef<CctvItem[]>(items);
    const onSelectRef = useRef(onSelect);

    const [mapStyle, setMapStyle] = useState<MapStyle>('dark');
    const mapStyleRef = useRef<MapStyle>('dark');
    const [baseMapProvider, setBaseMapProvider] = useState<BaseMapProvider>('openfreemap');
    const [baseMapAttribution, setBaseMapAttribution] = useState<string | null>(null);
    const [baseMapStatus, setBaseMapStatus] = useState<string | null>(null);
    const baseMapProviderRef = useRef<BaseMapProvider>('openfreemap');
    const [showDrone, setShowDrone] = useState(true);
    const [droneZones, setDroneZones] = useState<DroneZoneVisibility>(DEFAULT_DRONE_ZONE_VISIBILITY);
    const [droneInfo, setDroneInfo] = useState<string | null>(null);
    const [satelliteLayerVersion, setSatelliteLayerVersion] = useState(0);
    const [baseMapViewportVersion, setBaseMapViewportVersion] = useState(0);
    const showDroneRef = useRef(showDrone);
    const droneZonesRef = useRef(droneZones);

    // ─── 위성 데이터 상태 (S-Loop OS vFinal) ───────────────────────────────────
    const [satPositions, setSatPositions] = useState<SatellitePosition[]>([]);
    const workerRef = useRef<Worker | null>(null);
    const [viewState, setViewState] = useState({
        longitude: 126.680,
        latitude: 37.520,
        zoom: 10,
        pitch: 0,
        bearing: 0
    });

    useEffect(() => {
        itemsRef.current = items;
        onSelectRef.current = onSelect;
    }, [items, onSelect]);

    useEffect(() => {
        mapStyleRef.current = mapStyle;
    }, [mapStyle]);

    useEffect(() => {
        baseMapProviderRef.current = baseMapProvider;
    }, [baseMapProvider]);

    useEffect(() => {
        showDroneRef.current = showDrone;
        droneZonesRef.current = droneZones;
    }, [droneZones, showDrone]);

    useEffect(() => {
        satelliteModeRef.current = satelliteMode;
        if (satelliteMode !== 'planet') {
            planetCoverageRef.current = null;
        }
    }, [satelliteMode]);

    // 1. 위성 추적 워커 초기화 (Lazy Load: 위성 모드 켜질 때만)
    useEffect(() => {
        if (satelliteMode === 'off') {
            workerRef.current?.terminate();
            workerRef.current = null;
            setSatPositions([]);
            return;
        }

        if (workerRef.current) return; // 이미 실행 중이면 무시

        async function initSatellites() {
            try {
                const res = await fetch('/api/tle');
                const tles = await res.json();

                workerRef.current = new Worker('/workers/satelliteWorker.js');
                workerRef.current.postMessage({ type: 'INIT', tles });
                workerRef.current.onmessage = (e) => {
                    if (e.data.type === 'UPDATE') setSatPositions(e.data.positions);
                };
            } catch (err) { console.error('Sat Worker Error:', err); }
        }
        initSatellites();

        return () => {
            // 정리 작업은 위성 모드가 꺼질 때 수행됨
        };
    }, [satelliteMode]);

    useImperativeHandle(ref, () => ({
        flyTo: (lat, lng, zoom = 14) => {
            mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 900 });
        },
        fitToItems: (points) => {
            const map = mapRef.current;
            if (!map || points.length === 0) return;
            if (points.length === 1) {
                const [point] = points;
                map.flyTo({ center: [point.lng, point.lat], zoom: 15, duration: 900 });
                return;
            }

            const lngs = points.map((point) => point.lng);
            const lats = points.map((point) => point.lat);

            map.fitBounds(
                [
                    [Math.min(...lngs), Math.min(...lats)],
                    [Math.max(...lngs), Math.max(...lats)],
                ],
                {
                    padding: { top: 80, right: 340, bottom: 80, left: 300 },
                    duration: 900,
                    maxZoom: 15,
                }
            );
        },
    }));

    const handleCctvPick = useCallback((e: any) => {
        const pickedId = e.features?.[0]?.properties?.id;
        const picked = itemsRef.current.find((item) => item.id === pickedId);
        if (picked) {
            onSelectRef.current(picked);
        }
    }, []);

    const handleCctvPointerEnter = useCallback(() => {
        mapRef.current?.getCanvas().style.setProperty('cursor', 'pointer');
    }, []);

    const handleCctvPointerLeave = useCallback(() => {
        mapRef.current?.getCanvas().style.setProperty('cursor', '');
    }, []);

    const handleDronePick = useCallback((event: any) => {
        setDroneInfo(event.features?.[0]?.properties?.label ?? null);
    }, []);

    const handleDronePointerEnter = useCallback(() => {
        mapRef.current?.getCanvas().style.setProperty('cursor', 'pointer');
    }, []);

    const handleDronePointerLeave = useCallback(() => {
        mapRef.current?.getCanvas().style.setProperty('cursor', '');
    }, []);

    const bindCctvInteractions = useCallback((map: import('maplibre-gl').Map) => {
        map.off('click', CCTV_LAYER, handleCctvPick);
        map.off('mouseenter', CCTV_LAYER, handleCctvPointerEnter);
        map.off('mouseleave', CCTV_LAYER, handleCctvPointerLeave);

        map.on('click', CCTV_LAYER, handleCctvPick);
        map.on('mouseenter', CCTV_LAYER, handleCctvPointerEnter);
        map.on('mouseleave', CCTV_LAYER, handleCctvPointerLeave);
    }, [handleCctvPick, handleCctvPointerEnter, handleCctvPointerLeave]);

    const bindDroneInteractions = useCallback((map: import('maplibre-gl').Map) => {
        ['drone-no-fly-fill', 'drone-restricted-fill', 'drone-allowed-fill'].forEach((id) => {
            if (!map.getLayer(id)) return;
            map.off('click', id, handleDronePick);
            map.off('mouseenter', id, handleDronePointerEnter);
            map.off('mouseleave', id, handleDronePointerLeave);
            map.on('click', id, handleDronePick);
            map.on('mouseenter', id, handleDronePointerEnter);
            map.on('mouseleave', id, handleDronePointerLeave);
        });
    }, [handleDronePick, handleDronePointerEnter, handleDronePointerLeave]);

    const syncDomMarkers = useCallback(() => {
        const map = mapRef.current;
        if (!map || !mapReadyRef.current) return;

        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = [];
    }, []);

    // ─── CCTV 포인트 레이어 동기화 ─────────────────────────────────────────
    const syncVisibleCctv = useCallback(() => {
        const map = mapRef.current;
        if (!map || !mapReadyRef.current) return;
        syncRegionLayers(map, items);
        syncCctvLayers(map, items);
        syncRouteMonitoringLayers(map, routeMonitoringPlan, items);
        bindCctvInteractions(map);
        syncDomMarkers();
        liftOperationalLayers(map);
    }, [bindCctvInteractions, items, routeMonitoringPlan, syncDomMarkers]);

    const revokeSatelliteObjectUrl = useCallback(() => {
        if (satelliteObjectUrlRef.current) {
            URL.revokeObjectURL(satelliteObjectUrlRef.current);
            satelliteObjectUrlRef.current = null;
        }
    }, []);

    const syncSentinelVisibility = useCallback(() => {
        const map = mapRef.current;
        if (!map || !mapReadyRef.current) return;

        const visibility =
            satelliteModeRef.current === 'sentinel' && map.getZoom() >= SENTINEL_AUTO_HIDE_ZOOM
                ? 'none'
                : 'visible';

        [SAT_IMAGE_LAYER, SAT_RASTER_LAYER].forEach((layerId) => {
            if (map.getLayer(layerId)) {
                map.setLayoutProperty(layerId, 'visibility', visibility);
            }
        });
    }, []);

    const syncDroneVisibility = useCallback(() => {
        const map = mapRef.current;
        if (!map || !mapReadyRef.current) return;

        DRONE_ZONE_ORDER.forEach((zone) => {
            const visibility = showDroneRef.current && droneZonesRef.current[zone] ? 'visible' : 'none';
            DRONE_LAYER_IDS[zone].forEach((id) => {
                if (map.getLayer(id)) {
                    map.setLayoutProperty(id, 'visibility', visibility);
                }
            });
        });
    }, []);

    useEffect(() => {
        syncDroneVisibility();
    }, [droneZones, showDrone, syncDroneVisibility]);

    const toggleDroneZone = useCallback((zone: DroneZoneKey) => {
        if (!showDrone) {
            setShowDrone(true);
            setDroneZones((prev) => ({ ...prev, [zone]: true }));
            return;
        }

        setDroneZones((prev) => ({ ...prev, [zone]: !prev[zone] }));
    }, [showDrone]);

    const requestSatelliteRefresh = useCallback((delay = SATELLITE_REFRESH_DEBOUNCE_MS) => {
        if (typeof window === 'undefined') return;
        if (satelliteRefreshTimeoutRef.current !== null) {
            window.clearTimeout(satelliteRefreshTimeoutRef.current);
        }
        satelliteRefreshTimeoutRef.current = window.setTimeout(() => {
            satelliteRefreshTimeoutRef.current = null;
            setSatelliteLayerVersion(v => v + 1);
        }, delay);
    }, []);

    const requestBaseMapViewportRefresh = useCallback((delay = BASEMAP_VIEWPORT_REFRESH_DEBOUNCE_MS) => {
        if (typeof window === 'undefined') return;
        if (baseMapProviderRef.current !== 'google') return;
        if (baseMapRefreshTimeoutRef.current !== null) {
            window.clearTimeout(baseMapRefreshTimeoutRef.current);
        }
        baseMapRefreshTimeoutRef.current = window.setTimeout(() => {
            baseMapRefreshTimeoutRef.current = null;
            setBaseMapViewportVersion((version) => version + 1);
        }, delay);
    }, []);

    const fetchGoogleBasemapMetadata = useCallback(async (
        style: Extract<MapStyle, 'satellite' | 'hybrid'>,
        map: import('maplibre-gl').Map
    ) => {
        const bounds = map.getBounds();
        const query = new URLSearchParams({
            style,
            north: bounds.getNorth().toFixed(6),
            south: bounds.getSouth().toFixed(6),
            east: bounds.getEast().toFixed(6),
            west: bounds.getWest().toFixed(6),
            zoom: String(Math.ceil(map.getZoom())),
        });

        const response = await fetch(`/api/maps/google/basemap?${query.toString()}`, {
            cache: 'no-store',
        });

        const payload = await response.json().catch(() => null) as (GoogleBasemapResponse & {
            error?: string;
        }) | null;

        if (!response.ok || !payload) {
            throw new Error(payload?.error ?? `Google basemap fetch failed (${response.status})`);
        }

        return payload;
    }, []);

    // ─── 지도 초기화 (한 번만) ─────────────────────────────────────────────
    useEffect(() => {
        if (!containerRef.current || mapRef.current) return;

        import('maplibre-gl').then(ml => {
            maplibreRef.current = ml;
            const maplibregl = (((ml as any).default) ?? ml) as typeof import('maplibre-gl');
            const map = new maplibregl.Map({
                container: containerRef.current!,
                style: buildDarkStyle() as unknown as import('maplibre-gl').StyleSpecification,
                center: [126.680, 37.520],
                zoom: 10, minZoom: 7, maxZoom: resolveMapMaxZoom('dark'),
                attributionControl: false,
            });

            map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
            map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

            map.on('load', () => {
                mapRef.current = map;
                mapReadyRef.current = true;
                setSatelliteLayerVersion(v => v + 1);
                addDroneLayers(map);
                syncRegionLayers(map, itemsRef.current);
                syncDroneVisibility();
                syncCctvLayers(map, itemsRef.current);
                syncRouteMonitoringLayers(map, routeMonitoringPlan, itemsRef.current);
                bindCctvInteractions(map);
                bindDroneInteractions(map);
                syncDomMarkers();
                liftOperationalLayers(map);

                // MapLibre 이동 시 viewState 동기화
                map.on('move', () => {
                    const center = map.getCenter();
                    setViewState({
                        longitude: center.lng,
                        latitude: center.lat,
                        zoom: map.getZoom(),
                        pitch: map.getPitch(),
                        bearing: map.getBearing()
                    });
                });
                map.on('zoom', () => {
                    syncSentinelVisibility();
                });
                map.on('moveend', () => {
                    if (baseMapProviderRef.current === 'google' && mapStyleRef.current !== 'dark') {
                        requestBaseMapViewportRefresh();
                    }
                    if (satelliteModeRef.current === 'off') return;
                    if (
                        satelliteModeRef.current === 'planet'
                        && planetCoverageRef.current
                        && boundsWithinCoverage(map, planetCoverageRef.current)
                    ) {
                        return;
                    }
                    requestSatelliteRefresh();
                });
                map.on('resize', () => {
                    if (baseMapProviderRef.current === 'google' && mapStyleRef.current !== 'dark') {
                        requestBaseMapViewportRefresh(0);
                    }
                    if (satelliteModeRef.current === 'off') return;
                    requestSatelliteRefresh(0);
                });

                map.on('click', () => setDroneInfo(null));
            });
        });

        return () => {
            if (baseMapRefreshTimeoutRef.current !== null) {
                window.clearTimeout(baseMapRefreshTimeoutRef.current);
                baseMapRefreshTimeoutRef.current = null;
            }
            if (satelliteRefreshTimeoutRef.current !== null) {
                window.clearTimeout(satelliteRefreshTimeoutRef.current);
                satelliteRefreshTimeoutRef.current = null;
            }
            revokeSatelliteObjectUrl();
            markersRef.current.forEach((marker) => marker.remove());
            markersRef.current = [];
            mapRef.current?.remove();
            mapRef.current = null;
            maplibreRef.current = null;
            mapReadyRef.current = false;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [bindCctvInteractions, bindDroneInteractions, requestBaseMapViewportRefresh, requestSatelliteRefresh, revokeSatelliteObjectUrl, syncDomMarkers, syncDroneVisibility]);

    // ─── 아이템 변경 시 마커 갱신 ─────────────────────────────────────────
    useEffect(() => {
        if (mapReadyRef.current) syncVisibleCctv();
    }, [syncVisibleCctv]);

    // ─── 지도 스타일 변경 ────────────────────────────────────────────────
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReadyRef.current) return;
        let cancelled = false;
        let frameId: number | null = null;
        let timeoutId: number | null = null;

        const restoreStyleBoundLayers = () => {
            if (cancelled) return;
            addDroneLayers(map);
            syncRegionLayers(map, itemsRef.current);
            syncDroneVisibility();
            syncCctvLayers(map, itemsRef.current);
            syncRouteMonitoringLayers(map, routeMonitoringPlan, itemsRef.current);
            bindCctvInteractions(map);
            bindDroneInteractions(map);
            syncDomMarkers();
            liftOperationalLayers(map);
            timeoutId = window.setTimeout(() => {
                if (!cancelled) {
                    setSatelliteLayerVersion(v => v + 1);
                }
            }, 0);
        };

        const waitForStyle = () => {
            if (cancelled) return;
            if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
                restoreStyleBoundLayers();
                return;
            }
            frameId = window.requestAnimationFrame(waitForStyle);
        };

        const applyBaseStyle = async () => {
            let nextStyle: string | object = buildFallbackStyle(mapStyle);
            let nextMaxZoom = resolveMapMaxZoom(mapStyle);
            let nextProvider: BaseMapProvider = mapStyle === 'dark' ? 'openfreemap' : 'arcgis';
            let nextAttribution: string | null = null;
            let nextStatus: string | null = mapStyle === 'dark' ? null : 'ArcGIS fallback';

            if (mapStyle !== 'dark') {
                try {
                    const googleBasemap = await fetchGoogleBasemapMetadata(mapStyle, map);
                    if (cancelled) return;

                    nextStyle = buildGoogleStyle(mapStyle, googleBasemap.tileUrl, googleBasemap.tileSize);
                    nextMaxZoom = googleBasemap.safeMaxZoom;
                    nextProvider = 'google';
                    nextAttribution = mapStyle === 'hybrid'
                        ? [googleBasemap.copyright, '© OpenStreetMap contributors'].filter(Boolean).join(' | ')
                        : googleBasemap.copyright;
                    nextStatus = mapStyle === 'hybrid' ? 'Google Maps + label overlay' : 'Google Maps';
                } catch (error) {
                    console.warn('[Google basemap fallback]', error);
                }
            }

            if (cancelled) return;

            baseMapProviderRef.current = nextProvider;
            setBaseMapProvider(nextProvider);
            setBaseMapAttribution(nextAttribution);
            setBaseMapStatus(nextStatus);
            map.setMaxZoom(nextMaxZoom);
            if (map.getZoom() > nextMaxZoom) {
                map.jumpTo({ zoom: nextMaxZoom });
            }
            map.setStyle(nextStyle as any);
            waitForStyle();
        };

        applyBaseStyle();

        return () => {
            cancelled = true;
            if (frameId !== null) {
                window.cancelAnimationFrame(frameId);
            }
            if (timeoutId !== null) {
                window.clearTimeout(timeoutId);
            }
        };
    }, [bindCctvInteractions, bindDroneInteractions, fetchGoogleBasemapMetadata, mapStyle, routeMonitoringPlan, syncDomMarkers, syncDroneVisibility]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReadyRef.current) return;
        if (mapStyle === 'dark' || baseMapProvider !== 'google') return;
        let cancelled = false;

        const syncGoogleViewport = async () => {
            try {
                const googleBasemap = await fetchGoogleBasemapMetadata(mapStyle, map);
                if (cancelled) return;

                setBaseMapAttribution(googleBasemap.copyright);
                setBaseMapStatus('Google Maps');
                map.setMaxZoom(googleBasemap.safeMaxZoom);
                if (map.getZoom() > googleBasemap.safeMaxZoom) {
                    map.jumpTo({ zoom: googleBasemap.safeMaxZoom });
                }
            } catch (error) {
                if (cancelled) return;
                console.warn('[Google basemap viewport sync failed]', error);
            }
        };

        syncGoogleViewport();

        return () => {
            cancelled = true;
        };
    }, [baseMapProvider, baseMapViewportVersion, fetchGoogleBasemapMetadata, mapStyle]);

    // ─── 드론 레이어 가시성 ──────────────────────────────────────────────
    // ─── 위성 레이어 관리 ────────────────────────────────────────────────
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReadyRef.current) return;
        let cancelled = false;
        const abortController = new AbortController();

        // [동기화 흐름 1] React State(satelliteMode) 변경 감지 -> Maplibre 기존 Layer 완전 삭제
        removeSatLayers(map);
        revokeSatelliteObjectUrl();

        if (satelliteMode !== 'sentinel') {
            if (satelliteMode === 'off') {
                planetCoverageRef.current = null;
                onLoadingChange?.(false);
                onErrorChange?.(null);
                return () => {
                    cancelled = true;
                };
            }
        }

        if (satelliteMode === 'planet' && map.getZoom() < PLANET_MIN_ZOOM) {
            planetCoverageRef.current = null;
            onLoadingChange?.(false);
            onErrorChange?.('Planet SkySat는 동네 단위까지 확대한 뒤 사용하세요.');
            return () => {
                cancelled = true;
            };
        }

        if (satelliteMode === 'sentinel' && map.getZoom() >= SENTINEL_AUTO_HIDE_ZOOM) {
            onLoadingChange?.(false);
            onErrorChange?.(null);
            return () => {
                cancelled = true;
            };
        }

        // [동기화 흐름 2] 변경된 위성 모드에 맞춰 새로운 API 타일 소스 추가
        const applySatelliteLayer = async () => {
            try {
                onLoadingChange?.(true);
                onErrorChange?.(null);
                planetCoverageRef.current = null;
                let tileUrl = '';
                let imageUrl = '';
                let imageCoordinates:
                    | [[number, number], [number, number], [number, number], [number, number]]
                    | undefined;
                const query = buildSatelliteViewportQuery(map, sentinelDate ?? undefined);
                const metadataUrl = satelliteMode === 'planet'
                    ? `/api/satellite/planet?${query.toString()}`
                    : `/api/satellite/sentinel?${query.toString()}`;

                const res = await fetch(metadataUrl, {
                    cache: 'no-store',
                    signal: abortController.signal,
                });
                const data = await res.json() as {
                    mode?: 'tile' | 'image' | 'fallback';
                    provider?: string;
                    tileUrl?: string | null;
                    imageUrl?: string | null;
                    coordinates?: [[number, number], [number, number], [number, number], [number, number]];
                    date?: string;
                    coverageBbox?: [number, number, number, number] | null;
                    fallback?: boolean;
                    message?: string;
                    error?: string;
                };

                if (!res.ok) {
                    throw new Error(
                        data.error
                        ?? data.message
                        ?? `Sentinel metadata fetch failed: ${res.status}`
                    );
                }

                if (cancelled) return;

                if (data.fallback) {
                    throw new Error(data.message ?? 'Sentinel 위성 영상을 현재 사용할 수 없습니다.');
                }

                tileUrl = data.tileUrl ?? '';
                imageUrl = data.imageUrl ?? '';
                imageCoordinates = data.coordinates;
                planetCoverageRef.current = satelliteMode === 'planet'
                    ? (data.coverageBbox ?? null)
                    : null;
                if (data.date ?? sentinelDate) {
                    onLastUpdated?.(data.date ?? sentinelDate ?? '');
                }

                if (imageUrl && imageCoordinates) {
                    const imageResponse = await fetch(imageUrl, {
                        cache: 'no-store',
                        signal: abortController.signal,
                    });
                    if (!imageResponse.ok) {
                        let imageError = `Satellite image fetch failed: ${imageResponse.status}`;
                        try {
                            const errorPayload = await imageResponse.json() as { error?: string };
                            if (errorPayload.error) imageError = errorPayload.error;
                        } catch {
                            // Ignore JSON parse failures for non-JSON image responses.
                        }
                        throw new Error(imageError);
                    }

                    const imageBlob = await imageResponse.blob();
                    if (cancelled) return;
                    const objectUrl = URL.createObjectURL(imageBlob);
                    satelliteObjectUrlRef.current = objectUrl;

                    map.addSource(SAT_IMAGE_SOURCE, {
                        type: 'image',
                        url: objectUrl,
                        coordinates: imageCoordinates,
                    });

                    map.addLayer({
                        id: SAT_IMAGE_LAYER,
                        type: 'raster',
                        source: SAT_IMAGE_SOURCE,
                        paint: { 'raster-opacity': satelliteOpacity / 100 },
                    });
                    syncSentinelVisibility();
                    liftOperationalLayers(map);
                } else if (tileUrl) {
                    // [동기화 흐름 3] DOM과 MapLibre 객체를 동기화하고 레이어 주입
                    map.addSource(SAT_RASTER_SOURCE, {
                        type: 'raster',
                        tiles: [tileUrl],
                        tileSize: 256,
                    });

                    map.addLayer({
                        id: SAT_RASTER_LAYER,
                        type: 'raster',
                        source: SAT_RASTER_SOURCE,
                        paint: { 'raster-opacity': satelliteOpacity / 100 },
                    });
                    syncSentinelVisibility();
                    liftOperationalLayers(map);
                } else {
                    throw new Error('Sentinel 오버레이 소스를 생성하지 못했습니다.');
                }
                if (!cancelled) {
                    onLoadingChange?.(false);
                    onErrorChange?.(null);
                }
            } catch (error) {
                planetCoverageRef.current = null;
                if (abortController.signal.aborted) {
                    return;
                }
                console.error('[위성 레이어 추가 실패]', error);
                if (!cancelled) {
                    onLoadingChange?.(false);
                    onErrorChange?.(
                        error instanceof Error
                            ? error.message
                            : 'Sentinel 위성 영상을 불러오지 못했습니다.'
                    );
                }
            }
        };

        applySatelliteLayer();

        return () => {
            cancelled = true;
            abortController.abort();
        };

        // [동기화 흐름 4] 뎁스에 모드 및 투명도 명시해 UI 토글과 즉시 동기화 보장
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onErrorChange, revokeSatelliteObjectUrl, satelliteLayerVersion, satelliteMode, sentinelDate, syncSentinelVisibility]);

    // ─── 투명도 변경 시 즉시 반영 ────────────────────────────────────────
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !mapReadyRef.current) return;

        const opacity = satelliteOpacity / 100;
        if (map.getLayer(SAT_IMAGE_LAYER)) {
            map.setPaintProperty(SAT_IMAGE_LAYER, 'raster-opacity', opacity);
        }
        if (map.getLayer(SAT_RASTER_LAYER)) {
            map.setPaintProperty(SAT_RASTER_LAYER, 'raster-opacity', opacity);
        }
    }, [satelliteOpacity]);

    // ─── Deck.gl 레이어 정의 ────────────────────────────────────────────────
    const deckLayers = useMemo<LayersList>(() => {
        const layers: LayersList = [
            new ScatterplotLayer({
                id: 'satellites-layer',
                data: satPositions,
                getPosition: d => d.coordinates,
                getFillColor: [0, 230, 255, 180],
                getRadius: 6000,
                radiusUnits: 'meters'
            })
        ];

        return layers;
    }, [satPositions]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            {/* 1. 기본 MapLibre 컨테이너 (과거 기능 무결성 유지) */}
            <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0 }} />

            {/* 2. Deck.gl 오버레이 (위성 추적/3D 타일) */}
            <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                <DeckGL
                    viewState={viewState}
                    layers={deckLayers}
                    style={{ width: '100%', height: '100%' }}
                />
            </div>

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
                {DRONE_ZONE_ORDER.map((zone) => {
                    const cfg = ZONE_CFG[zone];
                    const active = showDrone && droneZones[zone];
                    return (
                        <button
                            key={zone}
                            onClick={() => toggleDroneZone(zone)}
                            style={{
                                padding: '5px 11px',
                                borderRadius: 6,
                                cursor: 'pointer',
                                fontSize: 10,
                                fontWeight: active ? 700 : 500,
                                transition: 'all 0.15s',
                                background: active ? `${cfg.fill}20` : 'rgba(6,13,32,0.82)',
                                border: `1px solid ${active ? `${cfg.stroke}99` : 'rgba(255,255,255,0.1)'}`,
                                color: active ? cfg.stroke : '#64748b',
                                backdropFilter: 'blur(10px)',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 7,
                                justifyContent: 'space-between',
                            }}
                        >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <span style={{
                                    width: 9,
                                    height: 9,
                                    borderRadius: 2,
                                    background: `${cfg.fill}22`,
                                    border: `1.5px solid ${cfg.stroke}`,
                                    flexShrink: 0,
                                }} />
                                {cfg.label}
                            </span>
                            <span style={{ fontSize: 9, letterSpacing: '0.08em' }}>{active ? 'ON' : 'OFF'}</span>
                        </button>
                    );
                })}
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

            {mapStyle !== 'dark' && (
                <div
                    style={{
                        position: 'absolute',
                        left: 12,
                        bottom: 40,
                        zIndex: 18,
                        maxWidth: 360,
                        padding: '6px 9px',
                        borderRadius: 8,
                        background: 'rgba(6,13,32,0.78)',
                        border: '1px solid rgba(255,255,255,0.08)',
                        backdropFilter: 'blur(10px)',
                        color: '#94a3b8',
                        fontSize: 9,
                        lineHeight: 1.4,
                    }}
                >
                    <div style={{ fontWeight: 700, color: baseMapProvider === 'google' ? '#e2e8f0' : '#94a3b8' }}>
                        {baseMapStatus ?? 'Basemap'}
                    </div>
                    {baseMapProvider === 'google' && baseMapAttribution && (
                        <div>{baseMapAttribution}</div>
                    )}
                    {baseMapProvider === 'arcgis' && (
                        <div>Google basemap unavailable. ArcGIS imagery fallback is active.</div>
                    )}
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
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', margin: '6px 0' }} />
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    marginBottom: 5,
                }}>
                    <div style={{
                        fontSize: 9, color: '#475569', fontWeight: 700,
                        letterSpacing: '0.08em',
                    }}>드론 운용 구역</div>
                    <span style={{
                        fontSize: 9,
                        color: showDrone ? '#818cf8' : '#475569',
                        fontWeight: 700,
                    }}>{showDrone ? 'GLOBAL ON' : 'GLOBAL OFF'}</span>
                </div>
                {DRONE_ZONE_ORDER.map((zone) => {
                    const cfg = ZONE_CFG[zone];
                    const active = showDrone && droneZones[zone];
                    return (
                        <button
                            key={zone}
                            type="button"
                            onClick={() => toggleDroneZone(zone)}
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 8,
                                marginBottom: 4,
                                padding: '4px 0',
                                color: active ? cfg.stroke : '#64748b',
                                fontSize: 10,
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                textAlign: 'left',
                                opacity: active ? 1 : 0.6,
                            }}
                        >
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 2,
                                    flexShrink: 0,
                                    background: `${cfg.fill}22`,
                                    border: `1.5px solid ${cfg.stroke}`,
                                }} />
                                {cfg.label}
                            </span>
                            <span style={{ fontSize: 9, letterSpacing: '0.08em' }}>{active ? 'ON' : 'OFF'}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
});

CctvMap.displayName = 'CctvMap';
export default CctvMap;
