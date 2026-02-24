'use client';
import { useEffect, useRef, useState, useCallback } from 'react';

interface Props {
    src: string;           // HLS .m3u8 URL
    cameraId?: string;
    onFrame?: (canvas: HTMLCanvasElement) => void;
}

type StreamStatus = 'loading' | 'playing' | 'error' | 'offline';

export default function HlsPlayer({ src, cameraId, onFrame }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const hlsRef = useRef<import('hls.js').default | null>(null);
    const rafRef = useRef<number>(0);

    const [status, setStatus] = useState<StreamStatus>('loading');
    const [errMsg, setErrMsg] = useState('');
    const [quality, setQuality] = useState('');

    // ─── 프레임 캡처 루프 (onFrame 콜백이 있을 때만) ────────────────────────
    const captureLoop = useCallback(() => {
        const v = videoRef.current;
        const c = canvasRef.current;
        if (!v || !c || v.readyState < 2) { rafRef.current = requestAnimationFrame(captureLoop); return; }
        c.width = v.videoWidth || 1280;
        c.height = v.videoHeight || 720;
        c.getContext('2d')?.drawImage(v, 0, 0);
        onFrame?.(c);
        rafRef.current = requestAnimationFrame(captureLoop);
    }, [onFrame]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;
        setStatus('loading');
        setErrMsg('');

        let destroyed = false;

        import('hls.js').then(module => {
            const Hls = module.default;
            if (destroyed) return;

            // HLS.js 지원 여부 확인
            if (Hls.isSupported()) {
                const hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true,
                    backBufferLength: 30,
                    maxBufferLength: 20,
                    maxMaxBufferLength: 30,
                });
                hlsRef.current = hls;
                hls.loadSource(src);
                hls.attachMedia(video);

                hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
                    if (destroyed) return;
                    const lvl = data.levels[0]?.height;
                    setQuality(lvl ? `${lvl}p` : 'Live');
                    video.play().catch(() => { /* autoplay blocked */ });
                });

                hls.on(Hls.Events.ERROR, (_, data) => {
                    if (destroyed) return;
                    if (data.fatal) {
                        setStatus('error');
                        setErrMsg(data.reason ?? data.type ?? 'HLS 오류');
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Safari 네이티브 HLS
                video.src = src;
            } else {
                setStatus('offline');
                setErrMsg('HLS 미지원 브라우저');
            }
        });

        const onPlay = () => { setStatus('playing'); if (onFrame) { rafRef.current = requestAnimationFrame(captureLoop); } };
        const onError = () => { if (!destroyed) { setStatus('error'); setErrMsg('스트림 접속 실패'); } };
        const onWaiting = () => { if (!destroyed) setStatus('loading'); };
        const onPlaying = () => { if (!destroyed) setStatus('playing'); };

        video.addEventListener('play', onPlay);
        video.addEventListener('error', onError);
        video.addEventListener('waiting', onWaiting);
        video.addEventListener('playing', onPlaying);

        return () => {
            destroyed = true;
            cancelAnimationFrame(rafRef.current);
            hlsRef.current?.destroy();
            hlsRef.current = null;
            video.removeEventListener('play', onPlay);
            video.removeEventListener('error', onError);
            video.removeEventListener('waiting', onWaiting);
            video.removeEventListener('playing', onPlaying);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]);

    const statusColor = status === 'playing' ? '#22c55e' : status === 'error' ? '#ef4444' : '#f59e0b';
    const statusLabel = status === 'playing' ? 'LIVE' : status === 'error' ? 'ERROR' : status === 'offline' ? 'OFFLINE' : '연결중…';

    return (
        <div style={{
            position: 'relative', width: '100%', background: '#000814',
            aspectRatio: '16/9', overflow: 'hidden'
        }}>

            {/* 실제 HLS 비디오 */}
            <video
                ref={videoRef}
                muted autoPlay playsInline
                style={{
                    width: '100%', height: '100%', objectFit: 'contain',
                    display: status === 'error' || status === 'offline' ? 'none' : 'block'
                }}
            />

            {/* 프레임 캡처용 숨김 캔버스 */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* 스캔라인 효과 */}
            <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)',
            }} />

            {/* 상태 배지 */}
            <div style={{
                position: 'absolute', top: 9, left: 9, zIndex: 10,
                background: `${statusColor}22`, border: `1px solid ${statusColor}55`,
                backdropFilter: 'blur(6px)', color: statusColor,
                fontSize: 9, fontWeight: 900, padding: '2px 9px', borderRadius: 4,
                letterSpacing: '0.12em', display: 'flex', alignItems: 'center', gap: 5,
            }}>
                <span style={{
                    width: 6, height: 6, borderRadius: '50%', background: statusColor,
                    animation: status === 'playing' ? 'pulse 1.4s ease-in-out infinite' : 'none',
                }} />
                {statusLabel}
            </div>

            {/* 카메라 ID + 해상도 */}
            {cameraId && (
                <div style={{
                    position: 'absolute', bottom: 9, right: 9, zIndex: 10,
                    background: 'rgba(0,8,20,0.72)', color: '#475569',
                    fontSize: 9, fontFamily: 'monospace',
                    padding: '2px 7px', borderRadius: 3,
                    backdropFilter: 'blur(4px)',
                }}>
                    {cameraId}{quality ? ` · ${quality}` : ''}
                </div>
            )}

            {/* 오류·오프라인 화면 */}
            {(status === 'error' || status === 'offline') && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 8,
                    display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center',
                    color: '#334155',
                }}>
                    <div style={{ fontSize: 32, marginBottom: 8, filter: 'grayscale(1) opacity(0.2)' }}>📵</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#ef4444', marginBottom: 4 }}>
                        {status === 'offline' ? '스트림 오프라인' : '스트림 오류'}
                    </div>
                    <div style={{ fontSize: 9, color: '#1e293b', textAlign: 'center', maxWidth: 200 }}>
                        {errMsg || 'HLS 스트림에 연결할 수 없습니다'}
                    </div>
                </div>
            )}

            {/* 로딩 스피너 */}
            {status === 'loading' && (
                <div style={{
                    position: 'absolute', inset: 0, zIndex: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <div style={{
                        width: 28, height: 28,
                        border: '3px solid rgba(64,196,255,0.15)',
                        borderTopColor: '#40c4ff',
                        borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite',
                    }} />
                </div>
            )}
        </div>
    );
}
