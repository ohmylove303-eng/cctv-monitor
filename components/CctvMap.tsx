'use client';
import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { CctvItem } from '@/types/cctv';

export interface CctvMapHandle {
    flyTo: (lat: number, lng: number, zoom?: number) => void;
}

interface Props {
    items: CctvItem[];
    onSelect: (cctv: CctvItem) => void;
}

const TYPE_COLOR: Record<string, string> = {
    crime: '#60a5fa', fire: '#f87171', traffic: '#34d399',
};
const STATUS_BORDER: Record<string, string> = {
    '정상': 'rgba(0,230,118,0.6)',
    '점검중': 'rgba(255,179,0,0.75)',
    '고장': 'rgba(255,51,51,0.95)',
};

const CctvMap = forwardRef<CctvMapHandle, Props>(({ items, onSelect }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<unknown>(null);

    // Expose flyTo via ref
    useImperativeHandle(ref, () => ({
        flyTo: (lat: number, lng: number, zoom = 14) => {
            if (!mapRef.current) return;
            (mapRef.current as { flyTo: (o: unknown) => void }).flyTo({
                center: [lng, lat], zoom, duration: 900,
            });
        },
    }));

    useEffect(() => {
        if (!containerRef.current) return;

        import('maplibre-gl').then((ml) => {
            const maplibregl = ml.default;

            const map = new maplibregl.Map({
                container: containerRef.current!,
                style: {
                    version: 8,
                    glyphs: 'https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf',
                    sources: {
                        'osm': {
                            type: 'raster',
                            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                            tileSize: 256,
                        },
                    },
                    layers: [
                        { id: 'bg', type: 'background', paint: { 'background-color': '#060d20' } },
                        {
                            id: 'osm-layer', type: 'raster', source: 'osm',
                            paint: { 'raster-opacity': 0.12, 'raster-saturation': -1 }
                        },
                    ],
                },
                center: [126.680, 37.520],
                zoom: 10, minZoom: 7, maxZoom: 18,
                attributionControl: false,
            });

            map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'bottom-right');
            map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

            mapRef.current = map;
        });

        return () => {
            if (mapRef.current) {
                (mapRef.current as { remove: () => void }).remove();
                mapRef.current = null;
            }
        };
    }, []);

    // Update markers when items change
    useEffect(() => {
        const map = mapRef.current;
        if (!map) return;

        const m = map as {
            isStyleLoaded: () => boolean;
            on: (e: string, fn: () => void) => void;
        };

        const addMarkers = () => {
            import('maplibre-gl').then((ml) => {
                const maplibregl = ml.default;
                const mapInstance = map as maplibregl.Map;

                // Clear existing custom markers
                document.querySelectorAll('.cctv-custom-marker').forEach(el => {
                    el.remove();
                });

                items.forEach(cam => {
                    const typeColor = TYPE_COLOR[cam.type] ?? '#94a3b8';
                    const statusBorder = STATUS_BORDER[cam.status] ?? 'rgba(148,163,184,0.3)';

                    const icon = cam.type === 'crime' ? '📷' : cam.type === 'fire' ? '🚒' : '🚦';

                    const el = document.createElement('div');
                    el.className = 'cctv-custom-marker';
                    el.style.cssText = `
            width: 32px; height: 32px;
            background: ${typeColor}25;
            border: 2.5px solid ${statusBorder};
            border-radius: 50% 50% 50% 0;
            transform: rotate(-45deg);
            cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            box-shadow: 0 0 12px ${typeColor}66, 0 2px 8px rgba(0,0,0,0.5);
            transition: transform 0.15s ease;
          `;

                    const inner = document.createElement('div');
                    inner.style.cssText = 'transform: rotate(45deg); font-size: 14px; line-height:1;';
                    inner.textContent = icon;
                    el.appendChild(inner);

                    if (cam.status === '고장') {
                        el.style.animation = 'blink 1.5s ease-in-out infinite';
                    }

                    el.addEventListener('mouseenter', () => {
                        el.style.transform = 'rotate(-45deg) scale(1.25)';
                        el.style.zIndex = '999';
                    });
                    el.addEventListener('mouseleave', () => {
                        el.style.transform = 'rotate(-45deg) scale(1)';
                        el.style.zIndex = '';
                    });
                    el.addEventListener('click', (e) => {
                        e.stopPropagation();
                        onSelect(cam);
                    });

                    new maplibregl.Marker({ element: el })
                        .setLngLat([cam.lng, cam.lat])
                        .addTo(mapInstance);
                });
            });
        };

        if (m.isStyleLoaded()) {
            addMarkers();
        } else {
            m.on('load', addMarkers);
        }
    }, [items, onSelect]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

            {/* 범례 */}
            <div className="glass-panel" style={{
                position: 'absolute', bottom: 48, right: 12,
                borderRadius: 9, padding: '10px 13px', fontSize: 11, zIndex: 10,
            }}>
                {[
                    { label: '방범 CCTV', color: '#60a5fa' },
                    { label: '소방 CCTV', color: '#f87171' },
                    { label: '교통 CCTV', color: '#34d399' },
                ].map(l => (
                    <div key={l.label} style={{
                        display: 'flex', alignItems: 'center',
                        gap: 7, marginBottom: 5, color: '#94a3b8'
                    }}>
                        <span style={{
                            width: 9, height: 9, borderRadius: '50%', background: l.color,
                            flexShrink: 0, boxShadow: `0 0 6px ${l.color}`
                        }} />
                        {l.label}
                    </div>
                ))}
                <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.07)',
                    marginTop: 5, paddingTop: 7
                }}>
                    {[
                        { label: '정상', color: 'rgba(0,230,118,0.8)' },
                        { label: '점검중', color: 'rgba(255,179,0,0.8)' },
                        { label: '고장', color: 'rgba(255,51,51,0.9)' },
                    ].map(s => (
                        <div key={s.label} style={{
                            display: 'flex', alignItems: 'center',
                            gap: 6, marginBottom: 4, color: '#64748b', fontSize: 10
                        }}>
                            <span style={{
                                width: 7, height: 7, borderRadius: '50%',
                                border: `2px solid ${s.color}`, flexShrink: 0
                            }} />
                            {s.label}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
});

CctvMap.displayName = 'CctvMap';
export default CctvMap;
