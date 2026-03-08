'use client';

import React from 'react';
import { StatusSummary } from '@/app/types';

interface Props {
    summary: StatusSummary;
    regionFilter: string;
    onRegionChange: (r: string) => void;
}

export default function StatusBar({ summary, regionFilter, onRegionChange }: Props) {
    return (
        <div className="flex items-center justify-between h-10 px-4 bg-gray-900 border-b border-gray-800 text-xs text-gray-300">
            <div className="flex items-center gap-4">
                <span className="font-bold text-cyan-400">🛰 CCTV 통합 관제 상황실</span>
                <div className="flex items-center gap-3">
                    <span>전체: <b className="text-white">{summary.total}</b></span>
                    <span>온라인: <b className="text-green-400">{summary.online}</b></span>
                    <span>오프라인: <b className="text-red-400">{summary.offline}</b></span>
                    <span>불명: <b className="text-gray-500">{summary.unknown}</b></span>
                </div>
            </div>

            <div className="flex items-center gap-1 bg-gray-800 p-1 rounded">
                {['전체', '김포', '인천'].map(r => (
                    <button
                        key={r}
                        onClick={() => onRegionChange(r)}
                        className={`px-3 py-1 rounded transition-colors ${regionFilter === r ? 'bg-cyan-600 text-white' : 'hover:bg-gray-700'
                            }`}
                    >
                        {r}
                    </button>
                ))}
            </div>
        </div>
    );
}
