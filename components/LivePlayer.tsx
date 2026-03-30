'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { toPlayableStreamUrl } from '@/lib/stream';

interface Props {
  streamUrl: string;
  title?: string;
  cctvId?: string;
  onError?: () => void;
}

type PlayerStatus = 'loading' | 'playing' | 'error' | 'no-stream';

export default function LivePlayer({ streamUrl, title, cctvId, onError }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<import('hls.js').default | null>(null);
  const [status, setStatus] = useState<PlayerStatus>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  // ── URL 타입 판별 ───────────────────────────────────────────────────────────
  const isYouTube = streamUrl.includes('youtube.com/embed') || streamUrl.includes('youtu.be');
  const effectiveUrl = toPlayableStreamUrl(streamUrl);
  const initPlayer = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !effectiveUrl) {
      setStatus('no-stream');
      return;
    }

    setStatus('loading');
    setErrorMsg('');

    const Hls = (await import('hls.js')).default;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 30,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 10,
        fragLoadingTimeOut: 20000,
        manifestLoadingTimeOut: 15000,
        levelLoadingTimeOut: 15000,
      });

      hlsRef.current = hls;

      hls.loadSource(effectiveUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus('playing');
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => setStatus('error'));
        });
      });

      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          const msg = `${data.type}: ${data.details}`;
          setErrorMsg(msg);
          setStatus('error');
          onError?.();
        }
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = effectiveUrl;
      video.addEventListener('loadedmetadata', () => {
        setStatus('playing');
        video.play().catch(() => {
          video.muted = true;
          video.play().catch(() => setStatus('error'));
        });
      }, { once: true });
      video.addEventListener('error', () => {
        setStatus('error');
        setErrorMsg('Safari HLS 로드 실패');
        onError?.();
      }, { once: true });
    } else {
      setStatus('error');
      setErrorMsg('이 브라우저는 HLS를 지원하지 않습니다');
    }
  }, [effectiveUrl, onError]);

  useEffect(() => {
    if (!isYouTube) {
      initPlayer();
    }
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [initPlayer, isYouTube]);

  if (isYouTube) {
    return (
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000814', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)'
        }} />
        <iframe
          src={streamUrl}
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={title ?? cctvId ?? 'CCTV'}
        />
        <div style={{
          position: 'absolute', top: 9, left: 9, zIndex: 10,
          background: '#ef4444', color: 'white', fontSize: 9, fontWeight: 900,
          padding: '2px 8px', borderRadius: 4, letterSpacing: '0.12em',
          display: 'flex', alignItems: 'center', gap: 5,
          boxShadow: '0 0 10px rgba(239,68,68,0.55)'
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%', background: 'white',
            animation: 'pulse 1s ease-in-out infinite'
          }} />
          LIVE
        </div>
        {cctvId && (
          <div style={{
            position: 'absolute', bottom: 9, right: 9, zIndex: 10,
            background: 'rgba(0,0,0,0.65)', color: '#475569',
            fontSize: 9, fontFamily: 'monospace', padding: '2px 7px', borderRadius: 3
          }}>
            {cctvId}
          </div>
        )}
        <style>{`@keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }`}</style>
      </div>
    );
  }


  const handleRetry = () => {
    setRetryCount(c => c + 1);
    initPlayer();
  };

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000814', overflow: 'hidden' }}>
      {/* 스쯼라인 오버레이 */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none',
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 4px)',
      }} />

      {/* 비디오 */}
      <video
        ref={videoRef}
        style={{
          width: '100%', height: '100%', display: 'block',
          objectFit: 'cover',
          opacity: status === 'playing' ? 1 : 0,
          transition: 'opacity 0.5s',
        }}
        autoPlay
        muted
        playsInline
      />

      {/* 로딩 스피너 */}
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 10,
        }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '3px solid rgba(96,165,250,0.2)',
            borderTopColor: '#60a5fa',
            animation: 'spin 0.8s linear infinite',
          }} />
          <div style={{ fontSize: 10, color: '#475569', letterSpacing: '0.1em' }}>
            스트림 연결 중...
          </div>
        </div>
      )}

      {/* 에러 */}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '0 20px', gap: 10,
        }}>
          <div style={{ fontSize: 28, filter: 'grayscale(1) opacity(0.3)' }}>📷</div>
          <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 700 }}>
            스트림 연결 실패
          </div>
          {errorMsg && (
            <div style={{ fontSize: 9, color: '#334155', textAlign: 'center', fontFamily: 'monospace', lineHeight: 1.6 }}>
              {errorMsg}
            </div>
          )}
          <button
            onClick={handleRetry}
            style={{
              marginTop: 6, padding: '5px 16px',
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#ef4444', borderRadius: 5,
              fontSize: 10, cursor: 'pointer', fontWeight: 700,
            }}
          >
            재연결 ({retryCount})
          </button>
        </div>
      )}

      {/* LIVE 배지 */}
      {status === 'playing' && (
        <div style={{
          position: 'absolute', top: 9, left: 9, zIndex: 15,
          background: '#ef4444', color: 'white',
          fontSize: 9, fontWeight: 900,
          padding: '2px 8px', borderRadius: 4,
          letterSpacing: '0.12em',
          display: 'flex', alignItems: 'center', gap: 5,
          boxShadow: '0 0 10px rgba(239,68,68,0.55)',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'white',
            animation: 'pulse 1s ease-in-out infinite',
          }} />
          LIVE
        </div>
      )}

      {/* CCTV ID */}
      {cctvId && (
        <div style={{
          position: 'absolute', bottom: 9, right: 9, zIndex: 15,
          background: 'rgba(0,0,0,0.65)', color: '#475569',
          fontSize: 9, fontFamily: 'monospace',
          padding: '2px 7px', borderRadius: 3,
        }}>
          {cctvId}
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
      `}</style>
    </div>
  );
}
