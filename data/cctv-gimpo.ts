import { CctvItem } from '@/types/cctv';

// YouTube Live 임베드 헬퍼
// autoplay=1&mute=1 → 자동재생 (브라우저 정책상 mute 필요)
const YT = (id: string) =>
    `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&rel=0&modestbranding=1`;

export const gimpoCctv: CctvItem[] = [
    // ── 방범 CCTV ─────────────────────────────────────────────────────────────
    {
        id: 'KP-CR-001', name: '김포시청 앞 방범 CCTV', type: 'crime', status: '정상',
        region: '김포', district: '사우동', address: '경기 김포시 사우중로 1',
        operator: '김포시청 안전관리과',
        // 서울 도심 공개 라이브캠 (영등포 시청 방향)
        streamUrl: YT('4Iu3N4JXFLE'),
        resolution: '4K UHD', installedYear: 2022,
        lat: 37.6152, lng: 126.7156,
    },
    {
        id: 'KP-CR-002', name: '풍무동 방범 CCTV', type: 'crime', status: '정상',
        region: '김포', district: '풍무동', address: '경기 김포시 풍무로 123',
        operator: '김포시청 안전관리과',
        streamUrl: YT('bqrDKBdx8Bo'), // 한강 라이브캠
        resolution: '2K QHD', installedYear: 2021,
        lat: 37.6089, lng: 126.7021,
    },
    {
        id: 'KP-CR-003', name: '고촌읍 방범 CCTV', type: 'crime', status: '정상',
        region: '김포', district: '고촌읍', address: '경기 김포시 고촌읍 아라육로',
        operator: '김포시청 안전관리과',
        streamUrl: '', resolution: '1080p', installedYear: 2020,
        lat: 37.6031, lng: 126.7623,
    },
    {
        id: 'KP-CR-004', name: '장기동 방범 CCTV', type: 'crime', status: '점검중',
        region: '김포', district: '장기동', address: '경기 김포시 장기동 한강중앙로',
        operator: '김포시청 안전관리과',
        streamUrl: '', resolution: '1080p', installedYear: 2019,
        lat: 37.6315, lng: 126.6872,
    },
    {
        id: 'KP-CR-005', name: '운양동 공원 방범 CCTV', type: 'crime', status: '정상',
        region: '김포', district: '운양동', address: '경기 김포시 운양동 한강로 100',
        operator: '김포시청 안전관리과',
        streamUrl: YT('XiL5PEoEmx4'), // 서울 한강 야경 라이브
        resolution: '2K QHD', installedYear: 2023,
        lat: 37.6231, lng: 126.6805,
    },
    {
        id: 'KP-CR-006', name: '양곡시장 방범 CCTV', type: 'crime', status: '고장',
        region: '김포', district: '양촌읍', address: '경기 김포시 양촌읍 양곡로 50',
        operator: '김포시청 안전관리과',
        streamUrl: '', resolution: '1080p', installedYear: 2018,
        lat: 37.5978, lng: 126.6247,
    },

    // ── 소방 CCTV ─────────────────────────────────────────────────────────────
    {
        id: 'KP-FI-001', name: '김포소방서 소방 CCTV', type: 'fire', status: '정상',
        region: '김포', district: '사우동', address: '경기 김포시 사우중로 67',
        operator: '경기도 김포소방서',
        streamUrl: YT('rGvblMlXaP0'), // 인천공항 라이브 공개 영상
        resolution: '4K UHD', installedYear: 2023,
        lat: 37.6181, lng: 126.7175,
    },
    {
        id: 'KP-FI-002', name: '통진119안전센터 소방 CCTV', type: 'fire', status: '정상',
        region: '김포', district: '통진읍', address: '경기 김포시 통진읍 도사로 200',
        operator: '경기도 김포소방서',
        streamUrl: '', resolution: '2K QHD', installedYear: 2021,
        lat: 37.6778, lng: 126.6423,
    },
    {
        id: 'KP-FI-003', name: '양촌119안전센터 소방 CCTV', type: 'fire', status: '정상',
        region: '김포', district: '양촌읍', address: '경기 김포시 양촌읍 학운로 150',
        operator: '경기도 김포소방서',
        streamUrl: '', resolution: '1080p', installedYear: 2020,
        lat: 37.5978, lng: 126.6247,
    },
    {
        id: 'KP-FI-004', name: '고촌119안전센터 소방 CCTV', type: 'fire', status: '점검중',
        region: '김포', district: '고촌읍', address: '경기 김포시 고촌읍 신곡수변로',
        operator: '경기도 김포소방서',
        streamUrl: '', resolution: '1080p', installedYear: 2019,
        lat: 37.5901, lng: 126.7688,
    },

    // ── 교통 CCTV ──────────────────────────────────────────────────────────────
    {
        id: 'KP-TR-001', name: '김포한강로 교통 CCTV', type: 'traffic', status: '정상',
        region: '김포', district: '사우동', address: '경기 김포시 김포한강로 (48번 국도)',
        operator: '경기도 교통정보센터(GITS)',
        streamUrl: YT('WiZ47KTkyTs'), // 서울 도로 교통 라이브
        resolution: '4K UHD', installedYear: 2022,
        lat: 37.6201, lng: 126.7312,
    },
    {
        id: 'KP-TR-002', name: '김포공항 진입로 교통 CCTV', type: 'traffic', status: '정상',
        region: '김포', district: '고촌읍', address: '경기 김포시 고촌읍 아라육로 (공항 방향)',
        operator: '경기도 교통정보센터(GITS)',
        streamUrl: YT('4Iu3N4JXFLE'), // 공항 뷰 라이브
        resolution: '2K QHD', installedYear: 2021,
        lat: 37.5985, lng: 126.7812,
    },
    {
        id: 'KP-TR-003', name: '김포IC 교통 CCTV', type: 'traffic', status: '정상',
        region: '김포', district: '사우동', address: '경기 김포시 사우동 제2자유로 김포IC',
        operator: '한국도로공사',
        streamUrl: '', resolution: '4K UHD', installedYear: 2023,
        lat: 37.6110, lng: 126.6943,
    },
    {
        id: 'KP-TR-004', name: '김포골드라인 교차로 교통 CCTV', type: 'traffic', status: '정상',
        region: '김포', district: '구래동', address: '경기 김포시 구래동 골드라인 교차로',
        operator: '경기도 교통정보센터(GITS)',
        streamUrl: '', resolution: '1080p', installedYear: 2020,
        lat: 37.6389, lng: 126.6721,
    },
    {
        id: 'KP-TR-005', name: '오전교차로 교통 CCTV', type: 'traffic', status: '고장',
        region: '김포', district: '오전동', address: '경기 김포시 오전동 양촌읍 교차로',
        operator: '경기도 교통정보센터(GITS)',
        streamUrl: '', resolution: '1080p', installedYear: 2018,
        lat: 37.6055, lng: 126.6521,
    },
];
