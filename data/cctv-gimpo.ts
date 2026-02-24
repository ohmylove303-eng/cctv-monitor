import { CctvItem, CctvType, CctvStatus } from '@/types/cctv';

const YT = (id: string) =>
    `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&rel=0&modestbranding=1`;

// ─── 구역 시드 정의 ──────────────────────────────────────────────────────────
type Seed = { district: string; address: string; lat: number; lng: number; };

// 좌표에 소규모 격자 오프셋을 더해 현실적인 배치 구현
function spread(
    seeds: Seed[],
    type: CctvType,
    status: (i: number) => CctvStatus,
    prefix: string,
    startSeq: number,
    operator: string,
    resolution: string,
    installedYear: (i: number) => number,
    streamUrl: (i: number) => string,
    countPerSeed = 1,
): CctvItem[] {
    const items: CctvItem[] = [];
    let seq = startSeq;
    const gridX = [0, 0.003, -0.003, 0.006, -0.006, 0.009, -0.009, 0.001, -0.001, 0.004];
    const gridY = [0, 0.002, -0.002, 0.004, -0.004, 0.001, -0.001, 0.005, -0.005, 0.003];

    seeds.forEach(seed => {
        for (let k = 0; k < countPerSeed; k++) {
            const sx = gridX[k % gridX.length];
            const sy = gridY[k % gridY.length];
            const suffix = countPerSeed > 1 ? `-${k + 1}` : '';
            items.push({
                id: `${prefix}${String(seq).padStart(3, '0')}`,
                name: `${seed.district} ${type === 'crime' ? '방범' : type === 'fire' ? '소방' : '교통'} CCTV${suffix}`,
                type,
                status: status(seq),
                region: '김포',
                district: seed.district,
                address: seed.address,
                operator,
                streamUrl: streamUrl(seq),
                resolution,
                installedYear: installedYear(seq),
                lat: +(seed.lat + sy).toFixed(6),
                lng: +(seed.lng + sx).toFixed(6),
            });
            seq++;
        }
    });
    return items;
}

const crimeOp = '김포시청 안전관리과';
const fireOp = '경기도 김포소방서';
const trafficOp = '경기도 교통정보센터(GITS)';

// 상태 분포: 85% 정상, 10% 점검중, 5% 고장
const st = (i: number): CctvStatus => {
    const r = i % 20;
    if (r === 3 || r === 11) return '점검중';
    if (r === 7) return '고장';
    return '정상';
};

// 스트림 URL — 방범/소방 카메라는 실제 스트림 없음 (교통 카메라만 ITS에서 실시간 연동)
const STREAMS: string[] = new Array(12).fill('');
const sv = (i: number) => STREAMS[i % STREAMS.length];
const yr = (i: number) => 2018 + (i % 7);      // 2018~2024

// ─── 방범 CCTV 시드 (35개 구역) ─────────────────────────────────────────────
const CRIME_SEEDS: Seed[] = [
    { district: '사우동', address: '경기 김포시 사우중로 1', lat: 37.6152, lng: 126.7156 },
    { district: '사우동', address: '경기 김포시 사우로 45', lat: 37.6175, lng: 126.7112 },
    { district: '사우동', address: '경기 김포시 감암로 22', lat: 37.6128, lng: 126.7198 },
    { district: '풍무동', address: '경기 김포시 풍무로 123', lat: 37.6089, lng: 126.7021 },
    { district: '풍무동', address: '경기 김포시 풍무천로 88', lat: 37.6065, lng: 126.6988 },
    { district: '고촌읍', address: '경기 김포시 고촌읍 아라육로', lat: 37.6031, lng: 126.7623 },
    { district: '고촌읍', address: '경기 김포시 고촌읍 신곡수변로', lat: 37.5958, lng: 126.7701 },
    { district: '장기동', address: '경기 김포시 장기동 한강중앙로', lat: 37.6315, lng: 126.6872 },
    { district: '장기동', address: '경기 김포시 장기동 장기로 200', lat: 37.6289, lng: 126.6921 },
    { district: '운양동', address: '경기 김포시 운양동 한강로 100', lat: 37.6231, lng: 126.6805 },
    { district: '운양동', address: '경기 김포시 운양동 운양로 50', lat: 37.6198, lng: 126.6780 },
    { district: '구래동', address: '경기 김포시 구래동 하성로 60', lat: 37.6389, lng: 126.6721 },
    { district: '구래동', address: '경기 김포시 구래동 구레로 150', lat: 37.6421, lng: 126.6755 },
    { district: '마산동', address: '경기 김포시 마산동 마산로 30', lat: 37.6512, lng: 126.6801 },
    { district: '양촌읍', address: '경기 김포시 양촌읍 양곡로 50', lat: 37.5978, lng: 126.6247 },
    { district: '양촌읍', address: '경기 김포시 양촌읍 학운로 90', lat: 37.5943, lng: 126.6189 },
    { district: '양촌읍', address: '경기 김포시 양촌읍 누산리로', lat: 37.6003, lng: 126.6312 },
    { district: '통진읍', address: '경기 김포시 통진읍 도사로 100', lat: 37.6778, lng: 126.6423 },
    { district: '통진읍', address: '경기 김포시 통진읍 통진대로 70', lat: 37.6821, lng: 126.6380 },
    { district: '대곶면', address: '경기 김포시 대곶면 대곶로 200', lat: 37.6507, lng: 126.5724 },
    { district: '월곶면', address: '경기 김포시 월곶면 염하로 55', lat: 37.7155, lng: 126.6153 },
    { district: '하성면', address: '경기 김포시 하성면 하성로 80', lat: 37.7233, lng: 126.6743 },
    { district: '걸포동', address: '경기 김포시 걸포동 걸포로 30', lat: 37.6271, lng: 126.7085 },
    { district: '북변동', address: '경기 김포시 북변동 북변로 45', lat: 37.6195, lng: 126.7198 },
    { district: '감정동', address: '경기 김포시 감정동 감정로 20', lat: 37.6145, lng: 126.6950 },
];

// ─── 소방 CCTV 시드 (15개) ────────────────────────────────────────────────────
const FIRE_SEEDS: Seed[] = [
    { district: '사우동', address: '경기 김포시 사우중로 67 (김포소방서)', lat: 37.6181, lng: 126.7175 },
    { district: '풍무동', address: '경기 김포시 풍무로 200 (풍무119안전센터)', lat: 37.6101, lng: 126.7055 },
    { district: '고촌읍', address: '경기 김포시 고촌읍 신곡수변로 (고촌119)', lat: 37.5901, lng: 126.7688 },
    { district: '통진읍', address: '경기 김포시 통진읍 도사로 200', lat: 37.6778, lng: 126.6423 },
    { district: '양촌읍', address: '경기 김포시 양촌읍 학운로 150', lat: 37.5978, lng: 126.6247 },
    { district: '장기동', address: '경기 김포시 장기동 한강파크웨이 소방초소', lat: 37.6325, lng: 126.6840 },
    { district: '운양동', address: '경기 김포시 운양동 운양119안전센터', lat: 37.6210, lng: 126.6820 },
    { district: '구래동', address: '경기 김포시 구래동 한강신도시 소방초소', lat: 37.6380, lng: 126.6740 },
    { district: '마산동', address: '경기 김포시 마산동 마산소방초소', lat: 37.6505, lng: 126.6785 },
    { district: '대곶면', address: '경기 김포시 대곶면 대곶119안전센터', lat: 37.6498, lng: 126.5698 },
    { district: '월곶면', address: '경기 김포시 월곶면 월곶119안전센터', lat: 37.7140, lng: 126.6120 },
    { district: '하성면', address: '경기 김포시 하성면 하성119안전센터', lat: 37.7218, lng: 126.6712 },
    { district: '걸포동', address: '경기 김포시 걸포동 걸포119', lat: 37.6258, lng: 126.7070 },
    { district: '감정동', address: '경기 김포시 감정동 감정소방초소', lat: 37.6131, lng: 126.6935 },
    { district: '북변동', address: '경기 김포시 북변동 북변소방초소', lat: 37.6178, lng: 126.7180 },
];

// ─── 교통 CCTV 시드 (20개) ───────────────────────────────────────────────────
const TRAFFIC_SEEDS: Seed[] = [
    { district: '사우동', address: '경기 김포시 김포한강로 (48번 국도 사우)', lat: 37.6201, lng: 126.7312 },
    { district: '사우동', address: '경기 김포시 제2자유로 김포IC', lat: 37.6110, lng: 126.6943 },
    { district: '사우동', address: '경기 김포시 사우대교 진입로', lat: 37.6088, lng: 126.7280 },
    { district: '고촌읍', address: '경기 김포시 고촌읍 아라육로 (공항방향)', lat: 37.5985, lng: 126.7812 },
    { district: '고촌읍', address: '경기 김포시 고촌읍 김포한강로 고촌', lat: 37.6010, lng: 126.7750 },
    { district: '장기동', address: '경기 김포시 장기동 한강중앙로 교차로', lat: 37.6310, lng: 126.6885 },
    { district: '장기동', address: '경기 김포시 장기동 김포골드라인 장기역', lat: 37.6330, lng: 126.6840 },
    { district: '운양동', address: '경기 김포시 운양동 한강로 교차로', lat: 37.6225, lng: 126.6820 },
    { district: '구래동', address: '경기 김포시 구래동 골드라인 구래역', lat: 37.6389, lng: 126.6721 },
    { district: '마산동', address: '경기 김포시 마산동 김포한강로 교차로', lat: 37.6498, lng: 126.6780 },
    { district: '풍무동', address: '경기 김포시 풍무동 풍무교차로', lat: 37.6075, lng: 126.7010 },
    { district: '걸포동', address: '경기 김포시 걸포동 48번국도 걸포교차로', lat: 37.6265, lng: 126.7095 },
    { district: '통진읍', address: '경기 김포시 통진읍 국도 48호선 통진', lat: 37.6755, lng: 126.6455 },
    { district: '양촌읍', address: '경기 김포시 양촌읍 양곡교차로', lat: 37.5958, lng: 126.6210 },
    { district: '대곶면', address: '경기 김포시 대곶면 大串교차로', lat: 37.6495, lng: 126.5680 },
    { district: '월곶면', address: '경기 김포시 월곶면 염하로 교차로', lat: 37.7121, lng: 126.6105 },
    { district: '하성면', address: '경기 김포시 하성면 하성로 교차로', lat: 37.7198, lng: 126.6710 },
    { district: '감정동', address: '경기 김포시 감정동 감정교차로', lat: 37.6112, lng: 126.6940 },
    { district: '북변동', address: '경기 김포시 북변동 48번국도 북변', lat: 37.6162, lng: 126.7210 },
    { district: '고촌읍', address: '경기 김포시 고촌읍 아라IC 진입로', lat: 37.5932, lng: 126.7875 },
];

// ─── 실제 데이터 생성 ────────────────────────────────────────────────────────
// 방범 25개 시드 × 2대 = 50대
const crime = spread(CRIME_SEEDS, 'crime', st, 'KP-CR-', 1, crimeOp, '2K QHD', yr, sv, 2);

// 소방 15개 시드 × 2대 = 30대
const fire = spread(FIRE_SEEDS, 'fire', st, 'KP-FI-', 1, fireOp, '4K UHD', yr, sv, 2);

// 교통 20개 시드 × 1대 = 20대 (교차로당 1대)
const traffic = spread(TRAFFIC_SEEDS, 'traffic', st, 'KP-TR-', 1, trafficOp, '4K UHD', yr, sv, 1);

export const gimpoCctv: CctvItem[] = [...crime, ...fire, ...traffic];
// 총 100대: 방범 50 + 소방 30 + 교통 20
