import { CctvItem, CctvType, CctvStatus } from '@/types/cctv';

const YT = (id: string) =>
    `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&rel=0&modestbranding=1`;

type Seed = { district: string; address: string; lat: number; lng: number; };

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
    const gx = [0, 0.003, -0.003, 0.006, -0.006, 0.002, -0.002, 0.005, -0.005, 0.001, -0.001, 0.004, -0.004];
    const gy = [0, 0.002, -0.002, 0.004, -0.004, 0.003, -0.003, 0.001, -0.001, 0.005, -0.005, 0.002, -0.002];

    seeds.forEach(seed => {
        for (let k = 0; k < countPerSeed; k++) {
            items.push({
                id: `${prefix}${String(seq).padStart(3, '0')}`,
                name: `${seed.district} ${type === 'crime' ? '방범' : type === 'fire' ? '소방' : '교통'} CCTV${countPerSeed > 1 ? `-${k + 1}` : ''}`,
                type,
                status: status(seq),
                region: '인천',
                district: seed.district,
                address: seed.address,
                operator,
                streamUrl: streamUrl(seq),
                resolution,
                installedYear: installedYear(seq),
                lat: +(seed.lat + gy[k % gy.length]).toFixed(6),
                lng: +(seed.lng + gx[k % gx.length]).toFixed(6),
            });
            seq++;
        }
    });
    return items;
}

const crimeOp = '인천시청 안전관리과';
const fireOp = '인천소방본부';
const trafficOp = '인천시 교통정보센터';
const roadOp = '한국도로공사';

const st = (i: number): CctvStatus => {
    const r = i % 20;
    if (r === 4 || r === 13) return '점검중';
    if (r === 9) return '고장';
    return '정상';
};

const STREAMS = [
    YT('XiL5PEoEmx4'), YT('bqrDKBdx8Bo'), YT('rGvblMlXaP0'),
    YT('WiZ47KTkyTs'), YT('4Iu3N4JXFLE'), YT('aqz-KE-bpKQ'),
    '', '', '', '', '', '', '',
];
const sv = (i: number) => STREAMS[i % STREAMS.length];
const yr = (i: number) => 2018 + (i % 7);

// ─── 방범 CCTV 시드 (50개 구역) ──────────────────────────────────────────────
const CRIME_SEEDS: Seed[] = [
    // 부평구 (8개)
    { district: '부평구 부개동', address: '인천 부평구 부개동 부개로 50', lat: 37.5052, lng: 126.7231 },
    { district: '부평구 갈산동', address: '인천 부평구 갈산동 갈산로 80', lat: 37.5101, lng: 126.7288 },
    { district: '부평구 산곡동', address: '인천 부평구 산곡동 산곡로 120', lat: 37.5188, lng: 126.7152 },
    { district: '부평구 청천동', address: '인천 부평구 청천동 청천로 45', lat: 37.5249, lng: 126.7198 },
    { district: '부평구 부평동', address: '인천 부평구 부평대로 168', lat: 37.4960, lng: 126.7219 },
    { district: '부평구 십정동', address: '인천 부평구 십정동 십정로 33', lat: 37.4985, lng: 126.7185 },
    { district: '부평구 삼산동', address: '인천 부평구 삼산동 삼산로 90', lat: 37.5145, lng: 126.7312 },
    { district: '부평구 부평4동', address: '인천 부평구 부평4동 경인로 22', lat: 37.4921, lng: 126.7268 },
    // 미추홀구 (6개)
    { district: '미추홀구 주안동', address: '인천 미추홀구 주안동 경인로 80', lat: 37.4698, lng: 126.6728 },
    { district: '미추홀구 도화동', address: '인천 미추홀구 도화동 도화대로 50', lat: 37.4612, lng: 126.6589 },
    { district: '미추홀구 학익동', address: '인천 미추홀구 학익동 학익로 40', lat: 37.4421, lng: 126.6631 },
    { district: '미추홀구 용현동', address: '인천 미추홀구 용현동 용현로 60', lat: 37.4564, lng: 126.6516 },
    { district: '미추홀구 관교동', address: '인천 미추홀구 관교동 소성로 100', lat: 37.4512, lng: 126.6481 },
    { district: '미추홀구 숭의동', address: '인천 미추홀구 숭의동 숭의로 30', lat: 37.4672, lng: 126.6412 },
    // 연수구 (7개)
    { district: '연수구 송도동', address: '인천 연수구 송도동 국제대로 150', lat: 37.3894, lng: 126.6390 },
    { district: '연수구 송도1동', address: '인천 연수구 송도1동 아트센터대로 80', lat: 37.3932, lng: 126.6425 },
    { district: '연수구 청학동', address: '인천 연수구 청학동 청학로 28', lat: 37.4103, lng: 126.6786 },
    { district: '연수구 연수동', address: '인천 연수구 연수동 연수로 120', lat: 37.4185, lng: 126.6698 },
    { district: '연수구 옥련동', address: '인천 연수구 옥련동 옥련로 55', lat: 37.4231, lng: 126.6612 },
    { district: '연수구 동춘동', address: '인천 연수구 동춘동 동춘로 70', lat: 37.4021, lng: 126.6821 },
    { district: '연수구 선학동', address: '인천 연수구 선학동 선학로 45', lat: 37.4281, lng: 126.6751 },
    // 남동구 (7개)
    { district: '남동구 구월동', address: '인천 남동구 구월동 예술로 200', lat: 37.4563, lng: 126.7052 },
    { district: '남동구 간석동', address: '인천 남동구 간석동 인주대로 80', lat: 37.4721, lng: 126.7085 },
    { district: '남동구 만수동', address: '인천 남동구 만수동 만수로 55', lat: 37.4480, lng: 126.7198 },
    { district: '남동구 논현동', address: '인천 남동구 논현동 소래역로 120', lat: 37.4350, lng: 126.7312 },
    { district: '남동구 소래포구', address: '인천 남동구 소래동 소래포구로 30', lat: 37.4231, lng: 126.7421 },
    { district: '남동구 장수동', address: '인천 남동구 장수동 장수로 40', lat: 37.4601, lng: 126.7280 },
    { district: '남동구 서창동', address: '인천 남동구 서창동 서창동로 60', lat: 37.4389, lng: 126.6985 },
    // 계양구 (5개)
    { district: '계양구 계산동', address: '인천 계양구 계산동 계양대로 120', lat: 37.5421, lng: 126.7312 },
    { district: '계양구 임학동', address: '인천 계양구 임학동 임학로 55', lat: 37.5380, lng: 126.7421 },
    { district: '계양구 효성동', address: '인천 계양구 효성동 효성로 80', lat: 37.5318, lng: 126.7198 },
    { district: '계양구 귤현동', address: '인천 계양구 귤현동 계양대로 21', lat: 37.5371, lng: 126.7382 },
    { district: '계양구 작전동', address: '인천 계양구 작전동 작전로 44', lat: 37.5285, lng: 126.7280 },
    // 서구 (6개)
    { district: '서구 청라동', address: '인천 서구 청라동 청라로 100', lat: 37.5368, lng: 126.6478 },
    { district: '서구 검단동', address: '인천 서구 검단동 검단로 150', lat: 37.5698, lng: 126.6932 },
    { district: '서구 가좌동', address: '인천 서구 가좌동 경인로 200', lat: 37.5041, lng: 126.6712 },
    { district: '서구 석남동', address: '인천 서구 석남동 석남로 70', lat: 37.5122, lng: 126.6851 },
    { district: '서구 신현동', address: '인천 서구 신현동 신현로 45', lat: 37.5212, lng: 126.6651 },
    { district: '서구 당하동', address: '인천 서구 당하동 당하로 30', lat: 37.5520, lng: 126.7050 },
    // 중구·강화 (5개)
    { district: '중구 신흥동', address: '인천 중구 신흥동 신흥로 30', lat: 37.4755, lng: 126.6175 },
    { district: '중구 내동', address: '인천 중구 내동 인중로 50', lat: 37.4768, lng: 126.6212 },
    { district: '동구 송림동', address: '인천 동구 송림동 송림로 40', lat: 37.4743, lng: 126.6432 },
    { district: '강화군 강화읍', address: '인천 강화군 강화읍 중앙로 80', lat: 37.7468, lng: 126.4876 },
    { district: '강화군 불은면', address: '인천 강화군 불은면 불은로 50', lat: 37.7212, lng: 126.5012 },
    // 송도 추가 (6개)
    { district: '연수구 송도2동', address: '인천 연수구 송도2동 컨벤시아대로 50', lat: 37.3851, lng: 126.6428 },
    { district: '연수구 송도4동', address: '인천 연수구 송도4동 해돋이로 120', lat: 37.3812, lng: 126.6525 },
    { district: '연수구 송도6동', address: '인천 연수구 송도6동 송도국제대로', lat: 37.3721, lng: 126.6618 },
    { district: '연수구 송도7동', address: '인천 연수구 송도7동 첨단대로 150', lat: 37.3780, lng: 126.6701 },
    { district: '연수구 미추홀', address: '인천 연수구 연수동 연수로 200', lat: 37.4152, lng: 126.6710 },
    { district: '서구 루원시티', address: '인천 서구 루원시티대로 30', lat: 37.5045, lng: 126.6793 },
];

// ─── 소방 CCTV 시드 (30개) ───────────────────────────────────────────────────
const FIRE_SEEDS: Seed[] = [
    { district: '부평구', address: '인천 부평구 부평대로 217 (부평소방서)', lat: 37.5082, lng: 126.7249 },
    { district: '부평구', address: '인천 부평구 산곡동 (산곡119안전센터)', lat: 37.5188, lng: 126.7152 },
    { district: '미추홀구', address: '인천 미추홀구 주안동 (주안119안전센터)', lat: 37.4698, lng: 126.6728 },
    { district: '미추홀구', address: '인천 미추홀구 학익동 (학익119안전센터)', lat: 37.4421, lng: 126.6631 },
    { district: '연수구', address: '인천 연수구 앵고개로 98 (연수소방서)', lat: 37.4141, lng: 126.6921 },
    { district: '연수구', address: '인천 연수구 송도과학로 16 (송도119안전센터)', lat: 37.3928, lng: 126.6292 },
    { district: '연수구', address: '인천 연수구 동춘동 (동춘119안전센터)', lat: 37.4021, lng: 126.6821 },
    { district: '남동구', address: '인천 남동구 소래역로 100 (인천소방본부)', lat: 37.4498, lng: 126.7362 },
    { district: '남동구', address: '인천 남동구 구월동 (구월119안전센터)', lat: 37.4563, lng: 126.7052 },
    { district: '남동구', address: '인천 남동구 논현동 (논현119안전센터)', lat: 37.4350, lng: 126.7312 },
    { district: '계양구', address: '인천 계양구 계양대로 (계양소방서)', lat: 37.5421, lng: 126.7312 },
    { district: '계양구', address: '인천 계양구 귤현동 (귤현119안전센터)', lat: 37.5371, lng: 126.7382 },
    { district: '서구', address: '인천 서구 가좌동 (서부소방서)', lat: 37.5041, lng: 126.6712 },
    { district: '서구', address: '인천 서구 청라동 (청라119안전센터)', lat: 37.5368, lng: 126.6478 },
    { district: '서구', address: '인천 서구 검단동 (검단119안전센터)', lat: 37.5698, lng: 126.6932 },
    { district: '중구', address: '인천 중구 공항로 424 (인천공항소방대)', lat: 37.4490, lng: 126.4510 },
    { district: '중구', address: '인천 중구 신흥동 (중부소방서)', lat: 37.4755, lng: 126.6175 },
    { district: '동구', address: '인천 동구 금창동 (동부소방서)', lat: 37.4780, lng: 126.6512 },
    { district: '강화군', address: '인천 강화군 강화읍 (강화소방서)', lat: 37.7468, lng: 126.4876 },
    { district: '강화군', address: '인천 강화군 불은면 (불은119안전센터)', lat: 37.7212, lng: 126.5012 },
    { district: '연수구', address: '인천 연수구 송도1동 (송도1동119안전센터)', lat: 37.3932, lng: 126.6425 },
    { district: '부평구', address: '인천 부평구 부개동 (부개119안전센터)', lat: 37.5052, lng: 126.7231 },
    { district: '미추홀구', address: '인천 미추홀구 용현동 (용현119안전센터)', lat: 37.4564, lng: 126.6516 },
    { district: '계양구', address: '인천 계양구 임학동 (임학119안전센터)', lat: 37.5380, lng: 126.7421 },
    { district: '서구', address: '인천 서구 당하동 (검단2119안전센터)', lat: 37.5520, lng: 126.7050 },
    { district: '남동구', address: '인천 남동구 간석동 (간석119안전센터)', lat: 37.4721, lng: 126.7085 },
    { district: '연수구', address: '인천 연수구 옥련동 (옥련119안전센터)', lat: 37.4231, lng: 126.6612 },
    { district: '서구', address: '인천 서구 석남동 (석남119안전센터)', lat: 37.5122, lng: 126.6851 },
    { district: '부평구', address: '인천 부평구 효성동 (효성119안전센터)', lat: 37.5318, lng: 126.7198 },
    { district: '중구', address: '인천 중구 운서동 (공항항공대119)', lat: 37.4690, lng: 126.4812 },
];

// ─── 교통 CCTV 시드 (35개) ───────────────────────────────────────────────────
const TRAFFIC_SEEDS: Seed[] = [
    { district: '중구', address: '인천 중구 인천대교 진입로', lat: 37.4210, lng: 126.5210 },
    { district: '중구', address: '인천 중구 제2연륙교 교량부', lat: 37.4180, lng: 126.4950 },
    { district: '서구', address: '인천 서구 경인고속도로 남청라IC', lat: 37.5210, lng: 126.6720 },
    { district: '서구', address: '인천 서구 인천국제공항고속도로 검단', lat: 37.5480, lng: 126.6812 },
    { district: '부평구', address: '인천 부평구 경인로 부평역 교차로', lat: 37.4888, lng: 126.7232 },
    { district: '부평구', address: '인천 부평구 굴포천로 교차로', lat: 37.5015, lng: 126.7280 },
    { district: '부평구', address: '인천 부평구 부평대로 삼산교차로', lat: 37.5145, lng: 126.7312 },
    { district: '남동구', address: '인천 남동구 소래IC 진입로', lat: 37.4180, lng: 126.7512 },
    { district: '남동구', address: '인천 남동구 제2경인고속도로 인천IC', lat: 37.4480, lng: 126.7480 },
    { district: '남동구', address: '인천 남동구 논현로 교차로', lat: 37.4350, lng: 126.7420 },
    { district: '계양구', address: '인천 계양구 계양IC (경인고속도로)', lat: 37.5312, lng: 126.7412 },
    { district: '계양구', address: '인천 계양구 계양대로 주요교차로', lat: 37.5380, lng: 126.7285 },
    { district: '연수구', address: '인천 연수구 송도대로 주요교차로', lat: 37.3990, lng: 126.6401 },
    { district: '연수구', address: '인천 연수구 컨벤시아대로 교차로', lat: 37.3851, lng: 126.6428 },
    { district: '연수구', address: '인천 연수구 아암대로 교차로', lat: 37.4021, lng: 126.6821 },
    { district: '서구', address: '인천 서구 원당IC 진입로', lat: 37.5690, lng: 126.7120 },
    { district: '서구', address: '인천 서구 청라IC (제2경인)', lat: 37.5120, lng: 126.6580 },
    { district: '서구', address: '인천 서구 수도권 1순환고속도로 서인천IC', lat: 37.4980, lng: 126.6570 },
    { district: '중구', address: '인천 중구 공항대로 주요 교차로', lat: 37.4690, lng: 126.4900 },
    { district: '중구', address: '인천 중구 자유무역도로 교차로', lat: 37.4821, lng: 126.5890 },
    { district: '미추홀구', address: '인천 미추홀구 경인로 주안교차로', lat: 37.4698, lng: 126.6728 },
    { district: '미추홀구', address: '인천 미추홀구 염전로 교차로', lat: 37.4512, lng: 126.6580 },
    { district: '동구', address: '인천 동구 동부간선도로 교차로', lat: 37.4780, lng: 126.6512 },
    { district: '강화군', address: '인천 강화군 강화대교 진입로', lat: 37.7480, lng: 126.5012 },
    { district: '강화군', address: '인천 강화군 강화초지대교', lat: 37.6598, lng: 126.5120 },
    { district: '연수구', address: '인천 연수구 인천대교고속도로 송도IC', lat: 37.3880, lng: 126.6351 },
    { district: '서구', address: '인천 서구 루원시티 교차로', lat: 37.5045, lng: 126.6793 },
    { district: '부평구', address: '인천 부평구 십정IC (수도권 제1순환)', lat: 37.4985, lng: 126.7185 },
    { district: '계양구', address: '인천 계양구 귤현IC', lat: 37.5371, lng: 126.7382 },
    { district: '남동구', address: '인천 남동구 장수IC', lat: 37.4601, lng: 126.7280 },
    { district: '연수구', address: '인천 연수구 해양대로 교차로', lat: 37.4141, lng: 126.6921 },
    { district: '서구', address: '인천 서구 검단IC (수도권 1순환)', lat: 37.5698, lng: 126.6932 },
    { district: '부평구', address: '인천 부평구 작전교차로', lat: 37.5058, lng: 126.7368 },
    { district: '계양구', address: '인천 계양구 박촌교차로', lat: 37.5480, lng: 126.7212 },
    { district: '서구', address: '인천 서구 아라뱃길 교차로', lat: 37.5621, lng: 126.6551 },
];

// ─── 실제 데이터 생성 ────────────────────────────────────────────────────────
// 방범 50개 시드 × 3대 = 150대
const crime = spread(CRIME_SEEDS, 'crime', st, 'IC-CR-', 1, crimeOp, '2K QHD', yr, sv, 3);

// 소방 30개 시드 × 1대 = 30대
const fire = spread(FIRE_SEEDS, 'fire', st, 'IC-FI-', 1, fireOp, '4K UHD', yr, sv, 1);

// 교통 35개 시드 × 1대 = 35대 (교차로당 1대)
const trafficHwy = spread(TRAFFIC_SEEDS, 'traffic', st, 'IC-TR-', 1, roadOp, '4K UHD', yr, sv, 1);

export const incheonCctv: CctvItem[] = [...crime, ...fire, ...trafficHwy];
// 총 215대: 방범 150 + 소방 30 + 교통 35
