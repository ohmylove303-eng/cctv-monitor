'use client';

import { CameraStatus } from '@/types';
import { getStatusColor, getStatusLabel } from '@/lib/utils';

interface Props {
    status: CameraStatus;
    pulse?: boolean;
}

export default function StatusBadge({ status, pulse = false }: Props) {
    const color = getStatusColor(status);
    const label = getStatusLabel(status);

    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '2px 10px',
                borderRadius: '9999px',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.05em',
                background: `${color}22`,
                color,
                border: `1px solid ${color}55`,
            }}
        >
            <span
                style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: color,
                    boxShadow: pulse ? `0 0 6px 2px ${color}88` : 'none',
                    animation: pulse && status !== 'offline' ? 'pulse 2s infinite' : 'none',
                }}
            />
            {label}
        </span>
    );
}
