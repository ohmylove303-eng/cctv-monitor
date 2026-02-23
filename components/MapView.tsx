'use client';

import { useEffect, useRef } from 'react';
import { Camera } from '@/types';
import { getStatusColor } from '@/lib/utils';

interface Props {
    cameras: Camera[];
    selectedCamera: Camera | null;
    onSelectCamera: (camera: Camera) => void;
}

export default function MapView({ cameras, selectedCamera, onSelectCamera }: Props) {
    const mapRef = useRef<HTMLDivElement>(null);
    const mapInstance = useRef<unknown>(null);
    const markersRef = useRef<unknown[]>([]);

    useEffect(() => {
        if (!mapRef.current || mapInstance.current) return;

        import('maplibre-gl').then((ml) => {
            const maplibregl = ml.default;

            const map = new maplibregl.Map({
                container: mapRef.current!,
                style: {
                    version: 8,
                    sources: {
                        'osm-tiles': {
                            type: 'raster',
                            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                            tileSize: 256,
                            attribution: '© OpenStreetMap contributors',
                        },
                    },
                    layers: [
                        {
                            id: 'bg',
                            type: 'background',
                            paint: { 'background-color': '#060d20' },
                        },
                        {
                            id: 'osm-layer',
                            type: 'raster',
                            source: 'osm-tiles',
                            paint: {
                                'raster-opacity': 0.15,
                                'raster-saturation': -1,
                                'raster-brightness-min': 0,
                                'raster-brightness-max': 0.3,
                            },
                        },
                    ],
                },
                center: [126.72, 37.52],
                zoom: 10,
                attributionControl: false,
            });

            // Add dark filter layer
            map.on('load', () => {
                cameras.forEach((camera) => {
                    const color = getStatusColor(camera.status);

                    const el = document.createElement('div');
                    el.style.cssText = `
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: ${color}33;
            border: 2px solid ${color};
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: 0 0 12px ${color}66;
            font-size: 13px;
          `;
                    el.innerHTML = camera.status === 'offline' ? '⚫' : '📹';
                    el.title = camera.name;

                    el.addEventListener('click', () => onSelectCamera(camera));
                    el.addEventListener('mouseenter', () => {
                        el.style.transform = 'scale(1.2)';
                        el.style.zIndex = '10';
                    });
                    el.addEventListener('mouseleave', () => {
                        el.style.transform = 'scale(1)';
                        el.style.zIndex = '1';
                    });

                    const marker = new maplibregl.Marker({ element: el })
                        .setLngLat([camera.position.lng, camera.position.lat])
                        .addTo(map);

                    markersRef.current.push(marker);
                });
            });

            mapInstance.current = map;
        });

        return () => {
            if (mapInstance.current) {
                (mapInstance.current as { remove: () => void }).remove();
                mapInstance.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Fly to selected camera
    useEffect(() => {
        if (!mapInstance.current || !selectedCamera) return;
        const map = mapInstance.current as { flyTo: (opts: unknown) => void };
        map.flyTo({
            center: [selectedCamera.position.lng, selectedCamera.position.lat],
            zoom: 14,
            speed: 1.4,
        });
    }, [selectedCamera]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

            {/* Legend */}
            <div
                style={{
                    position: 'absolute',
                    top: 12,
                    left: 12,
                    background: 'rgba(6,13,32,0.88)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 8,
                    padding: '10px 14px',
                    backdropFilter: 'blur(12px)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    zIndex: 10,
                }}
            >
                {[
                    { color: '#22c55e', label: '정상' },
                    { color: '#f59e0b', label: '경보' },
                    { color: '#3b82f6', label: '녹화중' },
                    { color: '#6b7280', label: '오프라인' },
                ].map((l) => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                        <span
                            style={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                background: l.color,
                                boxShadow: `0 0 5px ${l.color}`,
                                flexShrink: 0,
                            }}
                        />
                        <span style={{ color: '#94a3b8' }}>{l.label}</span>
                    </div>
                ))}
            </div>

            {/* Region labels */}
            <div
                style={{
                    position: 'absolute',
                    top: 12,
                    right: 12,
                    display: 'flex',
                    gap: 8,
                    zIndex: 10,
                }}
            >
                {['김포', '인천'].map((r) => (
                    <div
                        key={r}
                        style={{
                            background: 'rgba(6,13,32,0.88)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 6,
                            padding: '4px 12px',
                            fontSize: 12,
                            color: '#64748b',
                            backdropFilter: 'blur(8px)',
                        }}
                    >
                        {r}
                    </div>
                ))}
            </div>
        </div>
    );
}
