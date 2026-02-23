'use client';

import { Camera } from '@/types';
import { getStatusColor, getStatusLabel, formatTimestamp } from '@/lib/utils';

interface Props {
    camera: Camera;
    onClose: () => void;
}

export default function CameraDetail({ camera, onClose }: Props) {
    const color = getStatusColor(camera.status);

    return (
        <div
            style={{
                position: 'absolute',
                bottom: 20,
                right: 20,
                width: 320,
                background: 'rgba(8,14,38,0.96)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
                backdropFilter: 'blur(20px)',
                zIndex: 1000,
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <div
                style={{
                    padding: '14px 16px',
                    borderBottom: '1px solid rgba(255,255,255,0.07)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    background: `linear-gradient(135deg, ${color}11 0%, transparent 100%)`,
                }}
            >
                <div>
                    <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#64748b' }}>
                        {camera.id}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', marginTop: 2 }}>
                        {camera.name}
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span
                        style={{
                            fontSize: 11,
                            color,
                            fontWeight: 700,
                            background: `${color}22`,
                            padding: '2px 8px',
                            borderRadius: 5,
                        }}
                    >
                        {getStatusLabel(camera.status)}
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.07)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            borderRadius: 5,
                            color: '#94a3b8',
                            cursor: 'pointer',
                            fontSize: 14,
                            width: 26,
                            height: 26,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* CCTV feed placeholder */}
            <div
                style={{
                    background: '#0a0a0a',
                    height: 160,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    gap: 8,
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    position: 'relative',
                    overflow: 'hidden',
                }}
            >
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        backgroundImage:
                            'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.01) 2px, rgba(255,255,255,0.01) 4px)',
                    }}
                />
                <span style={{ fontSize: 32, opacity: 0.3 }}>📹</span>
                <span style={{ fontSize: 11, color: '#334155' }}>라이브 스트림 미리보기</span>
                {camera.status === 'offline' && (
                    <span
                        style={{
                            fontSize: 11,
                            color: '#ef4444',
                            background: 'rgba(239,68,68,0.15)',
                            padding: '2px 10px',
                            borderRadius: 4,
                        }}
                    >
                        오프라인
                    </span>
                )}
                {camera.status === 'recording' && (
                    <span
                        style={{
                            position: 'absolute',
                            top: 10,
                            left: 10,
                            fontSize: 10,
                            color: '#ef4444',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 4,
                            fontWeight: 700,
                        }}
                    >
                        <span
                            style={{
                                width: 7,
                                height: 7,
                                borderRadius: '50%',
                                background: '#ef4444',
                                animation: 'pulse 1s infinite',
                            }}
                        />
                        REC
                    </span>
                )}
            </div>

            {/* Details */}
            <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                    { label: '지역', value: `${camera.region}시` },
                    { label: '위치', value: camera.location },
                    { label: '해상도', value: camera.resolution },
                    { label: '프레임레이트', value: `${camera.fps} fps` },
                    { label: '좌표', value: `${camera.position.lat.toFixed(4)}, ${camera.position.lng.toFixed(4)}` },
                    { label: '설치일', value: formatTimestamp(camera.installedAt + 'T00:00:00.000Z').slice(0, 10) },
                    { label: '최근 점검', value: formatTimestamp(camera.lastMaintenance + 'T00:00:00.000Z').slice(0, 10) },
                ].map((row) => (
                    <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 11, color: '#64748b', flexShrink: 0 }}>{row.label}</span>
                        <span style={{ fontSize: 11, color: '#cbd5e1', textAlign: 'right' }}>{row.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
