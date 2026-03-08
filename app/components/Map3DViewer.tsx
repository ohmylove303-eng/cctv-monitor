'use client';

import React, { useRef, useEffect, useState, useMemo } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, IconLayer } from '@deck.gl/layers';
import { Tile3DLayer } from '@deck.gl/geo-layers';
import { MapView } from '@deck.gl/core';
import { Map } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { NormalizedCctv, SatellitePosition, SatelliteMode } from '@/app/types';

interface Props {
    cctvPoints: NormalizedCctv[];
    selectedCctv: NormalizedCctv | null;
    onSelectCctv: (c: NormalizedCctv) => void;
    satelliteMode: SatelliteMode;
    satelliteOpacity: number;
    sentinelDate: string;
    onLastUpdated: (t: string) => void;
    onLoadingChange: (v: boolean) => void;
}

const INITIAL_VIEW_STATE = {
    longitude: 126.7126,
    latitude: 37.6256,
    zoom: 12,
    pitch: 60,
    bearing: 0
};

export default function Map3DViewer({
    cctvPoints, selectedCctv, onSelectCctv,
    satelliteMode, satelliteOpacity, sentinelDate,
    onLastUpdated, onLoadingChange
}: Props) {
    const mapRef = useRef<maplibregl.Map | null>(null);
    const [satPositions, setSatPositions] = useState<SatellitePosition[]>([]);
    const workerRef = useRef<Worker | null>(null);

    // 1. Web Worker for Satellites
    useEffect(() => {
        async function initSatellites() {
            const res = await fetch('/api/tle');
            const tles = await res.json();

            workerRef.current = new Worker('/workers/satelliteWorker.js');
            workerRef.current.postMessage({ type: 'INIT', tles });
            workerRef.current.onmessage = (e) => {
                if (e.data.type === 'UPDATE') setSatPositions(e.data.positions);
            };
        }
        initSatellites();
        return () => workerRef.current?.terminate();
    }, []);

    // 2. Satellite Image Layers (MapLibre Control)
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.loaded()) return;

        const cleanup = () => {
            ['sat-src', 'sat-raster-src'].forEach(s => map.getSource(s) && map.removeSource(s));
            ['sat-lyr', 'sat-raster-lyr'].forEach(l => map.getLayer(l) && map.removeLayer(l));
        };

        async function updateLayers() {
            cleanup();
            if (satelliteMode === 'off') return;

            onLoadingChange(true);
            try {
                if (satelliteMode === 'gk2a') {
                    const res = await fetch('/api/satellite/gk2a');
                    const { imageUrl } = await res.json();
                    if (imageUrl && map) {
                        map.addSource('sat-src', {
                            type: 'image', url: imageUrl,
                            coordinates: [[116, 40], [132, 40], [132, 30], [116, 30]]
                        });
                        map.addLayer({
                            id: 'sat-lyr', type: 'raster', source: 'sat-src',
                            paint: { 'raster-opacity': satelliteOpacity / 100 }
                        });
                        onLastUpdated(new Date().toLocaleTimeString());
                    }
                } else if (satelliteMode === 'sentinel' || satelliteMode === 'planet') {
                    const route = satelliteMode === 'sentinel' ? `sentinel?date=${sentinelDate}` : 'planet';
                    const res = await fetch(`/api/satellite/${route}`);
                    const { tileUrl } = await res.json();
                    if (tileUrl && map) {
                        map.addSource('sat-raster-src', { type: 'raster', tiles: [tileUrl], tileSize: 256 });
                        map.addLayer({
                            id: 'sat-raster-lyr', type: 'raster', source: 'sat-raster-src',
                            paint: { 'raster-opacity': satelliteOpacity / 100 }
                        });
                    }
                }
            } catch (err) { console.error(err); }
            onLoadingChange(false);
        }

        updateLayers();
    }, [satelliteMode, sentinelDate]); // Opacity handled separately for performance

    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;
        ['sat-lyr', 'sat-raster-lyr'].forEach(id => {
            if (map.getLayer(id)) map.setPaintProperty(id, 'raster-opacity', satelliteOpacity / 100);
        });
    }, [satelliteOpacity]);

    // 3. Deck.gl Layers
    const layers = useMemo(() => [
        new Tile3DLayer({
            id: 'google-3d-tiles',
            data: 'https://tile.googleapis.com/v1/3dtiles/root.json',
            loadOptions: { fetch: { headers: { 'X-GOOG-API-KEY': process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '' } } },
            onTilesetLoad: (tileset) => { tileset.setProps({ maximumScreenSpaceError: 16 }); }
        }),
        new ScatterplotLayer({
            id: 'satellites',
            data: satPositions,
            getPosition: d => d.coordinates,
            getFillColor: [0, 255, 220, 160],
            getRadius: 5000,
            radiusUnits: 'meters'
        }),
        new IconLayer({
            id: 'cctv-icons',
            data: cctvPoints,
            pickable: true,
            iconAtlas: '/icons/cctv-marker.png',
            iconMapping: { marker: { x: 0, y: 0, width: 128, height: 128, anchorY: 128 } },
            getIcon: () => 'marker',
            getPosition: d => d.coordinates,
            getSize: d => d.id === selectedCctv?.id ? 45 : 30,
            onClick: ({ object }) => object && onSelectCctv(object),
            updateTriggers: { getSize: [selectedCctv?.id] }
        })
    ], [satPositions, cctvPoints, selectedCctv]);

    return (
        <DeckGL
            initialViewState={INITIAL_VIEW_STATE}
            controller={true}
            layers={layers}
            getTooltip={({ object }: any) => object?.name ? `${object.name} (${object.status})` : null}
        >
            <Map
                mapLib={maplibregl}
                mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json"
                onLoad={(e: any) => { mapRef.current = e.target; }}
            />
        </DeckGL>
    );
}
