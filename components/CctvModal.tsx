'use client';
import { useState, useEffect } from 'react';
import { CctvItem, CctvType } from '@/types/cctv';
import ForensicModal from './ForensicModal';
import LivePlayer from './LivePlayer';
import { toMilitaryGrid } from '@/lib/military-grid';

const TYPE_CFG: Record<CctvType, { label: string; color: string; icon: string }> = {
  crime: { label: '방범 CCTV', color: '#60a5fa', icon: '📷' },
  fire: { label: '소방 CCTV', color: '#f87171', icon: '🚒' },
  traffic: { label: '교통 CCTV', color: '#34d399', icon: '🚦' },
};
const STATUS_COLOR: Record<string, string> = {
  '정상': '#22c55e', '점검중': '#f59e0b', '고장': '#ef4444',
};
const REGION_COLOR: Record<string, string> = {
  '김포': '#10b981', '인천': '#06b6d4',
  '서울': '#8b5cf6',
};

interface Props { cctv: CctvItem; onClose: () => void; }

export default function CctvModal({ cctv, onClose }: Props) {
  const [showForensic, setShowForensic] = useState(false);
  const [liveStreamUrl, setLiveStreamUrl] = useState<string | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState(false);
  const cfg = TYPE_CFG[cctv.type];
  const militaryGrid = toMilitaryGrid(cctv.lat, cctv.lng);

  // ─── gimpo.cctvstream.net URL → /api/hls-proxy 변환 ─────────────────────
  function toProxiedUrl(url: string): string | null {
    if (!url) return null;
    // https://gimpo.cctvstream.net:8443/c001/1080p.m3u8
    const m = url.match(/gimpo\.cctvstream\.net[:/\d]+(\/c\d+\/)/);
    if (m) {
      const channel = m[1].replace(/\//g, '');  // → c001
      return `/api/hls-proxy?channel=${channel}`;
    }
    // 이미 프록시 URL이거나 다른 HLS인 경우 그대로 사용
    if (url.endsWith('.m3u8') || url.includes('hls-proxy')) return url;
    return null;
  }

  useEffect(() => {
    setLiveStreamUrl(null);
    setStreamError(false);

    // 1순위: hlsUrl (ITS에서 받은 실제 스트림) → 프록시로 변환
    if (cctv.hlsUrl) {
      const proxied = toProxiedUrl(cctv.hlsUrl);
      if (proxied) { setLiveStreamUrl(proxied); return; }
    }

    // 2순위: 교통 CCTV → ITS API에서 스트림 fetch
    if (cctv.type === 'traffic' && !cctv.streamUrl) {
      setStreamLoading(true);
      fetch(`/api/its-stream?id=${encodeURIComponent(cctv.id)}`)
        .then(r => r.json())
        .then(data => {
          const proxied = data.streamUrl ? toProxiedUrl(data.streamUrl) : null;
          setLiveStreamUrl(proxied ?? data.demoStream ?? null);
        })
        .catch(() => setStreamError(true))
        .finally(() => setStreamLoading(false));
      return;
    }

    // 3순위: streamUrl (YouTube embed 등)
    if (cctv.streamUrl) {
      setLiveStreamUrl(cctv.streamUrl);
    }
  }, [cctv.id, cctv.type, cctv.streamUrl, cctv.hlsUrl]);

  const effectiveStreamUrl = liveStreamUrl;

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(2,6,17,0.8)',
        backdropFilter: 'blur(10px)', zIndex: 9000,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}>
        <div onClick={e => e.stopPropagation()}
          className="glass-panel"
          style={{
            borderRadius: 16, width: '100%', maxWidth: 480, overflow: 'hidden',
            boxShadow: `0 0 40px ${cfg.color}22`,
            border: `1px solid ${cfg.color}33`
          }}>
          {/* 헤더 */}
          <div style={{
            padding: '13px 16px',
            background: `linear-gradient(135deg, ${cfg.color}10, ${cfg.color}22)`,
            borderBottom: `1px solid ${cfg.color}30`,
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'
          }}>
            <div>
              <div style={{ display: 'flex', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                <span className="badge" style={{
                  color: cfg.color, background: `${cfg.color}18`,
                  borderColor: `${cfg.color}35`
                }}>
                  {cfg.icon} {cfg.label}
                </span>
                <span className="badge" style={{
                  color: REGION_COLOR[cctv.region],
                  background: `${REGION_COLOR[cctv.region]}15`,
                  borderColor: `${REGION_COLOR[cctv.region]}30`
                }}>
                  📍 {cctv.region} · {cctv.district}
                </span>
                <span className="badge" style={{
                  color: STATUS_COLOR[cctv.status],
                  background: `${STATUS_COLOR[cctv.status]}15`,
                  borderColor: `${STATUS_COLOR[cctv.status]}30`
                }}>
                  ● {cctv.status}
                </span>
              </div>
              <h3 style={{
                color: 'white', fontSize: 14, fontWeight: 800,
                margin: 0, letterSpacing: '0.02em'
              }}>
                {cctv.name}
              </h3>
            </div>
            <button onClick={onClose} style={{
              background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
              color: '#64748b', width: 28, height: 28, borderRadius: '50%',
              cursor: 'pointer', fontSize: 16, display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>✕</button>
          </div>

          {/* 영상 븷어 */}
          {effectiveStreamUrl ? (
            <LivePlayer
              streamUrl={effectiveStreamUrl}
              cctvId={cctv.id}
              onError={() => setStreamError(true)}
            />
          ) : streamLoading ? (
            <div style={{
              background: '#000814', aspectRatio: '16/9',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 10
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                border: '2px solid rgba(52,211,153,0.2)',
                borderTopColor: '#34d399',
                animation: 'spin 0.8s linear infinite'
              }} />
              <div style={{ fontSize: 10, color: '#475569' }}>ITS 스트림 연결 중...</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            <div style={{
              background: '#000814', aspectRatio: '16/9', position: 'relative',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '0 20px'
            }}>
              <div style={{ fontSize: 36, filter: 'grayscale(1) opacity(0.2)' }}>{cfg.icon}</div>
              <div style={{ fontSize: 11, color: streamError ? '#ef4444' : '#334155', fontWeight: 700 }}>
                {streamError ? '스트림 연결 실패' : '스트림 미연결'}
              </div>
              {cctv.type === 'traffic' && (
                <div style={{
                  fontSize: 10, color: '#1e293b', textAlign: 'center',
                  lineHeight: 1.7, background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  borderRadius: 6, padding: '7px 11px',
                }}>
                  ITS API 키 필요 — Vercel 환경변수 ITS_API_KEY 설정<br />
                  공공데이터포털 → 국가교통정보센터 API 신청
                </div>
              )}
            </div>
          )}

          {/* 상세정보 */}
          <div style={{ padding: '13px 15px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 9 }}>
              {[
                { label: 'CCTV ID', value: cctv.id },
                { label: '해상도', value: cctv.resolution ?? '-' },
                { label: '설치연도', value: cctv.installedYear ? `${cctv.installedYear}년` : '-' },
                { label: '관리기관', value: cctv.operator },
              ].map(item => (
                <div key={item.label} style={{
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)', borderRadius: 7, padding: '7px 10px'
                }}>
                  <div style={{ fontSize: 9, color: '#475569', marginBottom: 2 }}>{item.label}</div>
                  <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 700 }}>{item.value}</div>
                </div>
              ))}
            </div>
            {/* 위치 */}
            <div style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 7, padding: '8px 10px', marginBottom: 9
            }}>
              <div style={{ fontSize: 9, color: '#475569', marginBottom: 3 }}>설치위치</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 5 }}>{cctv.address}</div>
              <div style={{
                fontSize: 11,
                color: '#e2e8f0',
                fontFamily: 'monospace',
                fontWeight: 700,
                marginBottom: 6,
                letterSpacing: '0.02em'
              }}>
                MGRS {militaryGrid ?? '변환 불가'}
              </div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>
                  LAT {cctv.lat.toFixed(6)}
                </span>
                <span style={{ fontSize: 10, color: '#475569', fontFamily: 'monospace' }}>
                  LNG {cctv.lng.toFixed(6)}
                </span>
              </div>
            </div>
            {/* 포렌식 버튼 */}
            <button className="btn-forensic" onClick={() => setShowForensic(true)}
              style={{
                width: '100%', padding: '9px',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7
              }}>
              🚗 ITS 차량 분석 / 포렌식 추적
            </button>
            <button onClick={onClose} style={{
              width: '100%', marginTop: 7, padding: '8px',
              background: `${cfg.color}18`, color: cfg.color,
              border: `1px solid ${cfg.color}35`, borderRadius: 6,
              fontWeight: 700, cursor: 'pointer', fontSize: 12
            }}>
              닫기
            </button>
          </div>
        </div>
      </div>
      {showForensic && (
        <ForensicModal cctv={cctv} onClose={() => setShowForensic(false)} />
      )}
    </>
  );
}
