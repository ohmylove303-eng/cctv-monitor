'use client';
import { useState, useEffect } from 'react';
import { CctvItem, ForensicResult } from '@/types/cctv';

interface Props { cctv: CctvItem; onClose: () => void; }

type Phase = 'idle' | 'uploading' | 'analyzing' | 'done' | 'error';

// Simulate MFSR forensic analysis (no real backend needed for demo)
async function simulateMfsr(cctv: CctvItem): Promise<ForensicResult> {
    await new Promise(r => setTimeout(r, 3200));
    const jobId = Math.random().toString(16).slice(2, 18);
    const h = () => Math.random().toString(16).slice(2, 66).padEnd(64, '0');
    return {
        job_id: jobId,
        cctv_id: cctv.id,
        timestamp: new Date().toISOString(),
        algorithm: 'MFSR-v2.4.1 / Laplacian + Frame-diff + Optical-flow',
        input_hash: h(),
        result_hash: h(),
        chain_hash: h(),
        prev_hash: h(),
        tsa_status: 'verified',
        generative_ai_used: false,
        quality_report: {
            total_input: 150,
            passed: 138,
            dropped: 12,
            threshold: 42.6,
        },
        events_detected: [
            '정적 배경 확인',
            '움직임 벡터 정상 범위',
            '프레임 무결성 검증 완료',
        ],
        confidence: 96.4,
        verdict: '영상 무결성 검증됨 — 위변조 흔적 없음',
    };
}

const STEPS = [
    { label: '영상 무결성 해시 계산중…', pct: 15 },
    { label: 'MFSR 프레임 품질 필터링…', pct: 38 },
    { label: 'Laplacian 선명도 분석…', pct: 55 },
    { label: 'Optical-flow 기반 움직임 감지…', pct: 72 },
    { label: 'TSA RFC 3161 타임스탬프 검증…', pct: 88 },
    { label: '해시 체인 결합 완료…', pct: 99 },
];

export default function ForensicModal({ cctv, onClose }: Props) {
    const [phase, setPhase] = useState<Phase>('idle');
    const [result, setResult] = useState<ForensicResult | null>(null);
    const [stepIdx, setStepIdx] = useState(0);
    const [progress, setProgress] = useState(0);

    const start = async () => {
        setPhase('analyzing');
        setStepIdx(0);
        setProgress(0);

        // Step simulation
        for (let i = 0; i < STEPS.length; i++) {
            await new Promise(r => setTimeout(r, 520));
            setStepIdx(i);
            setProgress(STEPS[i].pct);
        }

        try {
            const r = await simulateMfsr(cctv);
            setResult(r);
            setPhase('done');
            setProgress(100);
        } catch {
            setPhase('error');
        }
    };

    const reset = () => { setPhase('idle'); setResult(null); setProgress(0); };

    return (
        <div onClick={onClose} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(12px)', zIndex: 11000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
            <div onClick={e => e.stopPropagation()}
                className="glass-panel"
                style={{
                    borderRadius: 14, width: '100%', maxWidth: 520, overflow: 'hidden',
                    border: '1px solid rgba(99,102,241,0.35)',
                    boxShadow: '0 0 50px rgba(99,102,241,0.2)'
                }}>

                {/* 헤더 */}
                <div style={{
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-glass)',
                    background: 'rgba(13,25,48,0.9)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                    <div>
                        <div style={{
                            fontSize: 9, color: '#818cf8', fontWeight: 800,
                            letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 3
                        }}>
                            MFSR 포렌식 분석 — 생성형 AI 전면 배제
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>
                            {cctv.id} · {cctv.name}
                        </div>
                    </div>
                    <button onClick={onClose} style={{
                        background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                        color: '#64748b', borderRadius: '50%', width: 28, height: 28,
                        cursor: 'pointer', fontSize: 16, display: 'flex',
                        alignItems: 'center', justifyContent: 'center'
                    }}>✕</button>
                </div>

                {/* 본문 */}
                <div style={{ padding: '16px', maxHeight: '60vh', overflowY: 'auto' }}>

                    {/* idle */}
                    {phase === 'idle' && (
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <div style={{ fontSize: 42, marginBottom: 12 }}>⚗</div>
                            <div style={{ fontSize: 14, color: '#e2e8f0', fontWeight: 700, marginBottom: 8 }}>
                                5초 클립 MFSR 포렌식 분석
                            </div>
                            <div style={{ fontSize: 11, color: '#475569', marginBottom: 20, lineHeight: 1.7 }}>
                                알고리즘 규칙 기반 분석만 수행합니다.<br />
                                Laplacian 품질 필터링 → Optical-flow 감지 →<br />
                                TSA RFC 3161 타임스탬프 → 해시 체인 결합
                            </div>
                            <div style={{
                                marginBottom: 16, padding: '10px 14px',
                                background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.2)',
                                borderRadius: 8, fontSize: 11, color: '#818cf8', textAlign: 'left'
                            }}>
                                <div style={{ fontWeight: 700, marginBottom: 4 }}>분석 기반 MFSR 알고리즘</div>
                                <div style={{ color: '#6366f1' }}>
                                    • Laplacian 분산 기반 프레임 선별<br />
                                    • Frame-diff 움직임 벡터 추출<br />
                                    • Optical-flow 밀집 분석<br />
                                    • SHA-256 해시 체인 + TSA 인증
                                </div>
                            </div>
                            <button className="btn-forensic" onClick={start}
                                style={{
                                    width: '100%', padding: '11px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                                }}>
                                ⚗ 포렌식 분석 시작
                            </button>
                        </div>
                    )}

                    {/* analyzing */}
                    {phase === 'analyzing' && (
                        <div style={{ padding: '10px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                                <div style={{
                                    width: 20, height: 20, border: '2.5px solid #818cf8',
                                    borderTopColor: 'transparent', borderRadius: '50%',
                                    animation: 'spin 0.7s linear infinite'
                                }} />
                                <span style={{ fontSize: 12, color: '#818cf8', fontWeight: 600 }}>
                                    {STEPS[stepIdx]?.label ?? '처리중…'}
                                </span>
                            </div>

                            {/* Progress */}
                            <div style={{
                                height: 6, background: 'rgba(255,255,255,0.06)',
                                borderRadius: 3, overflow: 'hidden', marginBottom: 16
                            }}>
                                <div style={{
                                    height: '100%', width: `${progress}%`,
                                    background: 'linear-gradient(90deg, #6366f1, #818cf8)',
                                    borderRadius: 3, transition: 'width 0.4s ease',
                                    boxShadow: '0 0 8px rgba(99,102,241,0.6)'
                                }} />
                            </div>

                            {STEPS.map((s, i) => (
                                <div key={i} style={{
                                    display: 'flex', alignItems: 'center',
                                    gap: 8, marginBottom: 7, opacity: i <= stepIdx ? 1 : 0.3
                                }}>
                                    <span style={{ fontSize: 11, color: i < stepIdx ? '#22c55e' : i === stepIdx ? '#818cf8' : '#334155' }}>
                                        {i < stepIdx ? '✓' : i === stepIdx ? '▶' : '○'}
                                    </span>
                                    <span style={{ fontSize: 11, color: i <= stepIdx ? '#94a3b8' : '#334155' }}>
                                        {s.label}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* done */}
                    {phase === 'done' && result && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {/* Verdict */}
                            <div style={{
                                padding: '12px 14px',
                                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
                                borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10
                            }}>
                                <span style={{ fontSize: 24 }}>✅</span>
                                <div>
                                    <div style={{ fontSize: 12, fontWeight: 800, color: '#22c55e', marginBottom: 2 }}>
                                        {result.verdict}
                                    </div>
                                    <div style={{ fontSize: 10, color: '#475569' }}>
                                        신뢰도 {result.confidence.toFixed(1)}%
                                    </div>
                                </div>
                            </div>

                            {/* Quality report */}
                            <div style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: 12
                            }}>
                                <div style={{
                                    fontSize: 10, color: '#818cf8', fontWeight: 800,
                                    letterSpacing: '0.08em', marginBottom: 9
                                }}>
                                    📊 FRAME QUALITY REPORT
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
                                    {[
                                        { label: '입력 프레임', value: `${result.quality_report.total_input}장` },
                                        { label: '채택 프레임', value: `${result.quality_report.passed}장`, color: '#22c55e' },
                                        { label: '드롭 프레임', value: `${result.quality_report.dropped}장`, color: '#f59e0b' },
                                        { label: 'Laplacian 임계값', value: result.quality_report.threshold.toFixed(1) },
                                    ].map(item => (
                                        <div key={item.label} style={{
                                            background: 'rgba(255,255,255,0.03)',
                                            borderRadius: 6, padding: '7px 9px'
                                        }}>
                                            <div style={{ fontSize: 9, color: '#475569', marginBottom: 2 }}>{item.label}</div>
                                            <div style={{
                                                fontSize: 14, fontWeight: 800,
                                                color: item.color || 'white'
                                            }}>{item.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Hash chain */}
                            <div style={{
                                background: 'rgba(255,255,255,0.03)',
                                border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: 12
                            }}>
                                <div style={{
                                    fontSize: 10, color: '#818cf8', fontWeight: 800,
                                    letterSpacing: '0.08em', marginBottom: 9
                                }}>
                                    🔗 HASH CHAIN INTEGRITY
                                </div>
                                {[
                                    { label: 'INPUT HASH', value: result.input_hash, color: '#60a5fa' },
                                    { label: 'RESULT HASH', value: result.result_hash, color: '#22c55e' },
                                    { label: 'CHAIN HASH', value: result.chain_hash, color: '#818cf8' },
                                ].map(h => (
                                    <div key={h.label} style={{ marginBottom: 7 }}>
                                        <div style={{ fontSize: 9, color: '#475569', marginBottom: 2 }}>{h.label}</div>
                                        <div style={{
                                            fontSize: 9, color: h.color, fontFamily: 'monospace',
                                            background: 'rgba(0,0,0,0.3)', padding: '4px 7px', borderRadius: 4,
                                            wordBreak: 'break-all', lineHeight: 1.5,
                                            border: `1px solid ${h.color}22`
                                        }}>
                                            {h.value}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* TSA */}
                            <div style={{
                                padding: '9px 12px',
                                background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)',
                                borderRadius: 8, fontSize: 11, color: '#818cf8'
                            }}>
                                🕐 TSA RFC 3161 &nbsp;
                                <span style={{ color: '#22c55e', fontWeight: 700 }}>✓ 공인 타임스탬프 검증됨</span>
                                <br />
                                <span style={{ fontSize: 9, color: '#475569' }}>
                                    생성형 AI 사용: <span style={{ color: '#22c55e' }}>아니오 ✓</span>
                                    &nbsp;·&nbsp; 알고리즘: {result.algorithm.split('/')[0].trim()}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* error */}
                    {phase === 'error' && (
                        <div style={{ textAlign: 'center', padding: '24px', color: '#ef4444' }}>
                            <div style={{ fontSize: 36, marginBottom: 10 }}>⚠</div>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>분석 중 오류 발생</div>
                            <div style={{ fontSize: 11, color: '#475569', marginTop: 6 }}>
                                스트림 연결 또는 분석 서버를 확인하세요.
                            </div>
                        </div>
                    )}
                </div>

                {/* 하단 */}
                <div style={{
                    padding: '11px 16px',
                    borderTop: '1px solid var(--border-glass)',
                    display: 'flex', justifyContent: 'flex-end', gap: 8
                }}>
                    {phase === 'done' && (
                        <>
                            <button className="btn-neon" onClick={reset}>다시 분석</button>
                            <button className="btn-forensic"
                                onClick={() => {
                                    if (!result) return;
                                    const blob = new Blob([JSON.stringify(result, null, 2)],
                                        { type: 'application/json' });
                                    const a = document.createElement('a');
                                    a.href = URL.createObjectURL(blob);
                                    a.download = `forensic_${result.job_id.slice(0, 8)}.json`;
                                    a.click();
                                }}>
                                ↓ 증거 자료 저장 (해시 암호화)
                            </button>
                        </>
                    )}
                    <button onClick={onClose} style={{
                        padding: '7px 16px', borderRadius: 6,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.04)', color: '#64748b',
                        fontSize: 11, cursor: 'pointer', fontWeight: 700
                    }}>
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}
