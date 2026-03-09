'use client';

import React from 'react';
import { NormalizedCctv } from '@/app/types';

interface Props {
    cctv: NormalizedCctv | null;
    onClose: () => void;
}

export default function CctvDetailPanel({ cctv, onClose }: Props) {
    if (!cctv) {
        return (
            <div className="w-80 h-full bg-gray-900 border-l border-gray-800 p-6 flex flex-col items-center justify-center text-gray-500 text-sm italic">
                지도에서 CCTV 마커를 클릭하여
                <br /> 세부 정보를 확인하세요.
            </div>
        );
    }

    return (
        <div className="w-80 h-full bg-gray-900 border-l border-gray-800 p-5 flex flex-col gap-4 text-xs">
            <div className="flex items-center justify-between border-b border-gray-800 pb-3">
                <h3 className="text-sm font-bold text-white truncate max-w-[200px]">{cctv.name}</h3>
                <button onClick={onClose} className="text-gray-500 hover:text-white">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-gray-400">
                <div>지역</div>
                <div className="text-white">{cctv.region}</div>

                <div>상태</div>
                <div className={cctv.status === '정상' ? 'text-green-400' : 'text-red-400'}>
                    ● {cctv.status}
                </div>

                <div>데이터 소스</div>
                <div className="text-white">{cctv.source}</div>

                <div>ID</div>
                <div className="text-white font-mono">{cctv.id}</div>
            </div>

            <div className="mt-2 p-3 bg-gray-950 rounded border border-gray-800 flex flex-col gap-2">
                <div className="text-[10px] text-gray-600 font-mono uppercase tracking-widest">실시간 좌표 (ECEF)</div>
                <div className="flex justify-between">
                    <span className="text-gray-500">LNG:</span>
                    <span className="text-cyan-400 font-mono">{cctv.lng.toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-500">LAT:</span>
                    <span className="text-cyan-400 font-mono">{cctv.lat.toFixed(6)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-500">ALT:</span>
                    <span className="text-cyan-400 font-mono">30m</span>
                </div>
            </div>

            {cctv.streamUrl ? (
                <button className="mt-auto w-full py-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded shadow-lg shadow-cyan-900/20 transition-all flex items-center justify-center gap-2">
                    <span>▶</span> 실시간 영상 스트리밍 보기
                </button>
            ) : (
                <div className="mt-auto p-4 bg-gray-800/50 rounded text-center text-gray-500 border border-dashed border-gray-700">
                    스트리밍 주소가 제공되지 않는
                    <br /> 정적 데이터 지점입니다.
                </div>
            )}
        </div>
    );
}
