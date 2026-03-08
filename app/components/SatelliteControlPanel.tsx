'use client';

import React from 'react';
import { SatelliteMode } from '@/app/types';

interface Props {
    mode: SatelliteMode;
    onModeChange: (m: SatelliteMode) => void;
    opacity: number;
    onOpacityChange: (v: number) => void;
    sentinelDate: string;
    onSentinelDateChange: (d: string) => void;
    lastUpdated: string | null;
    isLoading: boolean;
}

export default function SatelliteControlPanel({
    mode, onModeChange, opacity, onOpacityChange,
    sentinelDate, onSentinelDateChange, lastUpdated, isLoading
}: Props) {
    return (
        <div className="absolute top-3 right-3 z-10 w-64 bg-gray-900/90 border border-gray-700 rounded-lg p-3 text-[11px] shadow-2xl backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-cyan-400 flex items-center gap-2">
                    🛰 위성 영상 융합
                </h3>
                {mode === 'gk2a' && (
                    <span className="text-[10px] text-gray-500">
                        {isLoading ? '갱신중 ⟳' : lastUpdated || '대기중'}
                    </span>
                )}
            </div>

            <div className="grid grid-cols-4 gap-1 mb-4">
                {(['off', 'gk2a', 'sentinel', 'planet'] as const).map(m => (
                    <button
                        key={m}
                        onClick={() => onModeChange(m)}
                        className={`py-1.5 rounded font-bold transition-all uppercase ${mode === m
                                ? 'bg-cyan-600 text-white border-cyan-400 border'
                                : 'bg-gray-800 text-gray-500 border border-gray-700 hover:border-gray-500'
                            }`}
                    >
                        {m === 'sentinel' ? 'S2' : m}
                    </button>
                ))}
            </div>

            <div className="flex flex-col gap-3 border-t border-gray-800 pt-3">
                <div className="flex items-center justify-between">
                    <span className="text-gray-400">투명도</span>
                    <span className="text-white font-mono">{opacity}%</span>
                </div>
                <input
                    type="range"
                    min="0"
                    max="100"
                    step="5"
                    value={opacity}
                    onChange={(e) => onOpacityChange(Number(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer h-1 bg-gray-800 rounded-lg appearance-none"
                />

                {mode === 'sentinel' && (
                    <div className="flex flex-col gap-1.5">
                        <span className="text-gray-400">관측 날짜 (S2)</span>
                        <input
                            type="date"
                            value={sentinelDate}
                            onChange={(e) => onSentinelDateChange(e.target.value)}
                            className="bg-gray-950 border border-gray-800 rounded p-1.5 text-white outline-none focus:border-cyan-500"
                        />
                    </div>
                )}
            </div>

            {mode === 'gk2a' && (
                <div className="mt-3 pt-2 border-t border-gray-800 text-[9px] text-gray-500 flex flex-col gap-0.5">
                    <p>* KMA_API_KEY 기반 2분 주기 실시간 갱신</p>
                    <p>* 천리안 2A호 (동북아 FD 영역)</p>
                </div>
            )}
        </div>
    );
}
