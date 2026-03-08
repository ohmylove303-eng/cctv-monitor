'use client';

import React from 'react';
import { CctvEvent } from '@/app/types';

const MOCK_EVENTS: CctvEvent[] = [
    { id: '1', cctvId: 'G1', cctvName: '김포 한강로 1', type: 'online', message: 'CCTV 복구 완료', timestamp: '14:20:05' },
    { id: '2', cctvId: 'G2', cctvName: '장기동 사거리', type: 'offline', message: '네트워크 연결 끊김', timestamp: '15:10:12' },
    { id: '3', cctvId: 'G3', cctvName: '운양역 입구', type: 'alert', message: '비정상 움직임 감지', timestamp: '15:45:30' },
    { id: '4', cctvId: 'G4', cctvName: '풍무동 관제소', type: 'status_change', message: '야간 모드로 전환', timestamp: '16:00:00' },
];

interface Props {
    events?: CctvEvent[];
}

export default function EventFeedPanel({ events = MOCK_EVENTS }: Props) {
    const getTypeColor = (type: string) => {
        switch (type) {
            case 'offline': return 'bg-red-900/40 text-red-400 border-red-800';
            case 'online': return 'bg-green-900/40 text-green-400 border-green-800';
            case 'alert': return 'bg-yellow-900/40 text-yellow-500 border-yellow-800';
            case 'status_change': return 'bg-blue-900/40 text-blue-400 border-blue-800';
            default: return 'bg-gray-800 text-gray-400 border-gray-700';
        }
    };

    return (
        <div className="h-48 w-full bg-gray-950 border-t border-gray-800 flex flex-col overflow-hidden">
            <div className="px-4 py-2 bg-gray-900 border-b border-gray-800 text-[10px] font-bold text-gray-500 uppercase tracking-widest flex justify-between items-center">
                <span>최근 이벤트 로그 (ITS 실시간)</span>
                <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse"></span>
                    LIVE
                </span>
            </div>

            <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1 custom-scrollbar">
                {events.map((ev) => (
                    <div
                        key={ev.id}
                        className={`flex items-center gap-3 px-3 py-2 rounded border text-[11px] ${getTypeColor(ev.type)}`}
                    >
                        <span className="font-mono text-gray-500 whitespace-nowrap">{ev.timestamp}</span>
                        <span className="font-bold whitespace-nowrap">{ev.cctvName}</span>
                        <span className="flex-1 italic truncate">{ev.message}</span>
                        <span className="text-[9px] uppercase font-bold opacity-60">
                            {ev.type.replace('_', ' ')}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
