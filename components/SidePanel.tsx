'use client';
import { CctvItem, CctvType, LayerVisibility, RegionFilter } from '@/types/cctv';
import { getStatusColor, getStatusLabel } from '@/lib/utils';

interface Props {
    allCctv: CctvItem[];
    visible: LayerVisibility;
    regionFilter: RegionFilter;
    onVisibleChange: (v: LayerVisibility) => void;
    onRegionChange: (r: RegionFilter) => void;
    onSelect: (c: CctvItem) => void;
    onFlyTo: (c: CctvItem) => void;
}

const TYPE_CFG: Record<CctvType, { label: string; icon: string; color: string; accent: string }> = {
    crime: { label: '방범 CCTV', icon: '📷', color: '#60a5fa', accent: 'badge-blue' },
    fire: { label: '소방 CCTV', icon: '🚒', color: '#f87171', accent: 'badge-red' },
    traffic: { label: '교통 CCTV', icon: '🚦', color: '#34d399', accent: 'badge-green' },
};

export default function SidePanel({
    allCctv, visible, regionFilter,
    onVisibleChange, onRegionChange, onSelect,
}: Props) {
    const filteredList = allCctv.filter(
        c => visible[c.type] && regionFilter[c.region]
    );

    const toggle = <K extends keyof LayerVisibility>(k: K) =>
        onVisibleChange({ ...visible, [k]: !visible[k] });

    const toggleRegion = <K extends keyof RegionFilter>(k: K) =>
        onRegionChange({ ...regionFilter, [k]: !regionFilter[k] });

    return (
        <div className="glass-panel" style={{
            borderRadius: 12, display: 'flex', flexDirection: 'column',
            overflow: 'hidden', minHeight: 0,
        }}>
            {/* 레이어 필터 */}
            <div style={{
                padding: '12px 14px', borderBottom: '1px solid var(--border-glass)',
                background: 'rgba(13,25,48,0.85)'
            }}>
                <div style={{
                    fontSize: 10, color: '#475569', fontWeight: 800,
                    letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 9
                }}>
                    📹 CCTV 레이어
                </div>

                {/* CCTV 종류 */}
                {(Object.keys(TYPE_CFG) as CctvType[]).map(type => {
                    const cfg = TYPE_CFG[type];
                    const cnt = allCctv.filter(c => c.type === type).length;
                    return (
                        <label key={type} style={{
                            display: 'flex', alignItems: 'center', gap: 9,
                            cursor: 'pointer', marginBottom: 7, padding: '5px 8px',
                            borderRadius: 7,
                            background: visible[type] ? `${cfg.color}10` : 'transparent',
                            border: `1px solid ${visible[type] ? cfg.color + '33' : 'transparent'}`,
                            transition: 'all 0.15s',
                        }}>
                            <input type="checkbox" checked={visible[type]}
                                onChange={() => toggle(type)}
                                style={{ accentColor: cfg.color, width: 15, height: 15, cursor: 'pointer' }} />
                            <span style={{ flex: 1, fontSize: 12, color: visible[type] ? '#e2e8f0' : '#475569' }}>
                                <span style={{ color: cfg.color }}>{cfg.icon}</span> {cfg.label}
                            </span>
                            <span style={{ fontSize: 10, color: '#334155' }}>{cnt}</span>
                        </label>
                    );
                })}

                {/* 지역 필터 */}
                <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    marginTop: 8, paddingTop: 10
                }}>
                    <div style={{
                        fontSize: 9, color: '#334155', fontWeight: 700,
                        letterSpacing: '0.1em', marginBottom: 7
                    }}>
                        지역 필터
                    </div>
                    {(['김포', '인천'] as const).map(r => {
                        const rColor = r === '김포' ? '#10b981' : '#06b6d4';
                        return (
                            <label key={r} style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                cursor: 'pointer', marginBottom: 5, padding: '4px 6px',
                                borderRadius: 6,
                                background: regionFilter[r] ? `${rColor}10` : 'transparent',
                                border: `1px solid ${regionFilter[r] ? rColor + '33' : 'transparent'}`,
                            }}>
                                <input type="checkbox" checked={regionFilter[r]}
                                    onChange={() => toggleRegion(r)}
                                    style={{ accentColor: rColor, width: 14, height: 14, cursor: 'pointer' }} />
                                <span style={{ fontSize: 12, color: regionFilter[r] ? rColor : '#475569', fontWeight: 600 }}>
                                    {r}
                                </span>
                                <span style={{ fontSize: 10, color: '#334155', marginLeft: 'auto' }}>
                                    {allCctv.filter(c => c.region === r).length}대
                                </span>
                            </label>
                        );
                    })}
                </div>
            </div>

            {/* 카메라 목록 */}
            <div style={{
                flex: 1, overflowY: 'auto', padding: '8px 10px',
                display: 'flex', flexDirection: 'column', gap: 6
            }}>
                <div style={{
                    fontSize: 9, color: '#334155', padding: '2px 4px',
                    marginBottom: 2
                }}>
                    {filteredList.length}대 표시
                </div>
                {filteredList.map(cam => {
                    const cfg = TYPE_CFG[cam.type];
                    const sColor = getStatusColor(cam.status as 'normal');
                    return (
                        <div key={cam.id} onClick={() => onSelect(cam)}
                            style={{
                                padding: '9px 11px', borderRadius: 8, cursor: 'pointer',
                                background: 'rgba(255,255,255,0.025)',
                                border: '1px solid rgba(255,255,255,0.06)',
                                transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLDivElement).style.background = `${cfg.color}12`;
                                (e.currentTarget as HTMLDivElement).style.borderColor = `${cfg.color}40`;
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.025)';
                                (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(255,255,255,0.06)';
                            }}
                        >
                            <div style={{
                                display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', marginBottom: 4
                            }}>
                                <span style={{
                                    fontSize: 9, fontFamily: 'monospace',
                                    color: '#334155', background: 'rgba(255,255,255,0.04)',
                                    padding: '1px 5px', borderRadius: 3
                                }}>
                                    {cam.id}
                                </span>
                                <span style={{
                                    fontSize: 9, fontWeight: 700,
                                    color: cam.status === '정상' ? '#22c55e' : cam.status === '점검중' ? '#f59e0b' : '#ef4444',
                                }}>
                                    {cam.status === '정상' ? '●' : cam.status === '점검중' ? '◐' : '✕'} {cam.status}
                                </span>
                            </div>
                            <div style={{
                                fontSize: 11, fontWeight: 600, color: '#e2e8f0',
                                marginBottom: 3, lineHeight: 1.3
                            }}>
                                {cfg.icon} {cam.name}
                            </div>
                            <div style={{ fontSize: 9, color: '#475569' }}>{cam.district}</div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
