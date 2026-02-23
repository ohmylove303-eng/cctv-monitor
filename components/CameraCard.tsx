'use client';

import { Camera } from '@/types';
import { getStatusColor, getStatusLabel } from '@/lib/utils';

interface Props {
    camera: Camera;
    selected: boolean;
    onClick: () => void;
}

export default function CameraCard({ camera, selected, onClick }: Props) {
    const color = getStatusColor(camera.status);

    return (
        <div
            onClick={onClick}
            style={{
                background: selected
                    ? 'rgba(59,130,246,0.12)'
                    : 'rgba(255,255,255,0.03)',
                border: `1px solid ${selected ? '#3b82f6' : 'rgba(255,255,255,0.08)'}`,
                borderRadius: 10,
                padding: '12px 14px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
            }}
        >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span
                    style={{
                        fontSize: 11,
                        fontFamily: 'monospace',
                        color: '#64748b',
                        background: 'rgba(255,255,255,0.05)',
                        padding: '1px 6px',
                        borderRadius: 4,
                    }}
                >
                    {camera.id}
                </span>
                <span
                    style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 10,
                        color,
                        fontWeight: 600,
                    }}
                >
                    <span
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: color,
                            boxShadow: camera.status !== 'offline' ? `0 0 5px ${color}` : 'none',
                        }}
                    />
                    {getStatusLabel(camera.status)}
                </span>
            </div>

            {/* Name */}
            <div
                style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#e2e8f0',
                    lineHeight: 1.3,
                }}
            >
                {camera.name}
            </div>

            {/* Location */}
            <div style={{ fontSize: 11, color: '#64748b' }}>{camera.location}</div>

            {/* Footer */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 10,
                    color: '#475569',
                    marginTop: 2,
                }}
            >
                <span>{camera.resolution}</span>
                <span>{camera.fps}fps</span>
            </div>
        </div>
    );
}
