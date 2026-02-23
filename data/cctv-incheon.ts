import { CctvItem } from '@/types/cctv';

export const incheonCctv: CctvItem[] = [
    // ── 방범 CCTV ─────────────────────────────────────────────────────────────
    {
        id: 'IC-CR-001', name: '부평구청 방범 CCTV', type: 'crime', status: '정상',
        region: '인천', district: '부평구', address: '인천 부평구 부평대로 168',
        operator: '부평구청 안전관리과', streamUrl: '', resolution: '4K UHD', installedYear: 2023,
        lat: 37.4960, lng: 126.7219,
    },
    {
        id: 'IC-CR-002', name: '미추홀구 방범 CCTV', type: 'crime', status: '정상',
        region: '인천', district: '미추홀구', address: '인천 미추홀구 소성로 163',
        operator: '미추홀구청 안전관리과', streamUrl: '', resolution: '2K QHD', installedYear: 2022,
        lat: 37.4564, lng: 126.6516,
    },
    {
        id: 'IC-CR-003', name: '연수구청 방범 CCTV', type: 'crime', status: '정상',
        region: '인천', district: '연수구', address: '인천 연수구 청학로 28',
        operator: '연수구청 안전관리과', streamUrl: '', resolution: '2K QHD', installedYear: 2022,
        lat: 37.4103, lng: 126.6786,
    },
    {
        id: 'IC-CR-004', name: '송도국제도시 방범 CCTV', type: 'crime', status: '정상',
        region: '인천', district: '연수구', address: '인천 연수구 송도동 국제대로',
        operator: '연수구청 안전관리과', streamUrl: '', resolution: '4K UHD', installedYear: 2023,
        lat: 37.3894, lng: 126.6390,
    },
    {
        id: 'IC-CR-005', name: '인천시청 방범 CCTV', type: 'crime', status: '정상',
        region: '인천', district: '남동구', address: '인천 남동구 정각로 29',
        operator: '인천시청 안전관리과', streamUrl: '', resolution: '4K UHD', installedYear: 2021,
        lat: 37.4563, lng: 126.7052,
    },
    {
        id: 'IC-CR-006', name: '계양구 방범 CCTV', type: 'crime', status: '점검중',
        region: '인천', district: '계양구', address: '인천 계양구 계양대로 21',
        operator: '계양구청 안전관리과', streamUrl: '', resolution: '1080p', installedYear: 2020,
        lat: 37.5371, lng: 126.7382,
    },
    {
        id: 'IC-CR-007', name: '중구 차이나타운 방범 CCTV', type: 'crime', status: '정상',
        region: '인천', district: '중구', address: '인천 중구 차이나타운로 12',
        operator: '중구청 안전관리과', streamUrl: '', resolution: '2K QHD', installedYear: 2022,
        lat: 37.4755, lng: 126.6175,
    },
    {
        id: 'IC-CR-008', name: '강화도 방범 CCTV', type: 'crime', status: '정상',
        region: '인천', district: '강화군', address: '인천 강화군 강화읍 중앙로',
        operator: '강화군청 안전관리과', streamUrl: '', resolution: '1080p', installedYear: 2021,
        lat: 37.7468, lng: 126.4876,
    },

    // ── 소방 CCTV ─────────────────────────────────────────────────────────────
    {
        id: 'IC-FI-001', name: '인천소방본부 소방 CCTV', type: 'fire', status: '정상',
        region: '인천', district: '남동구', address: '인천 남동구 소래역로 100',
        operator: '인천소방본부', streamUrl: '', resolution: '4K UHD', installedYear: 2023,
        lat: 37.4498, lng: 126.7362,
    },
    {
        id: 'IC-FI-002', name: '부평소방서 소방 CCTV', type: 'fire', status: '정상',
        region: '인천', district: '부평구', address: '인천 부평구 부평대로 217',
        operator: '인천소방본부', streamUrl: '', resolution: '2K QHD', installedYear: 2022,
        lat: 37.5082, lng: 126.7249,
    },
    {
        id: 'IC-FI-003', name: '연수소방서 소방 CCTV', type: 'fire', status: '정상',
        region: '인천', district: '연수구', address: '인천 연수구 앵고개로 98',
        operator: '인천소방본부', streamUrl: '', resolution: '2K QHD', installedYear: 2021,
        lat: 37.4141, lng: 126.6921,
    },
    {
        id: 'IC-FI-004', name: '송도119안전센터 소방 CCTV', type: 'fire', status: '정상',
        region: '인천', district: '연수구', address: '인천 연수구 송도과학로 16',
        operator: '인천소방본부', streamUrl: '', resolution: '4K UHD', installedYear: 2023,
        lat: 37.3928, lng: 126.6292,
    },
    {
        id: 'IC-FI-005', name: '인천공항 소방 CCTV', type: 'fire', status: '정상',
        region: '인천', district: '중구', address: '인천 중구 공항로 424',
        operator: '인천국제공항공사 소방대', streamUrl: '', resolution: '4K UHD', installedYear: 2023,
        lat: 37.4490, lng: 126.4510,
    },

    // ── 교통 CCTV ──────────────────────────────────────────────────────────────
    {
        id: 'IC-TR-001', name: '인천대교 교통 CCTV', type: 'traffic', status: '정상',
        region: '인천', district: '중구', address: '인천 중구 인천대교 진입로',
        operator: '한국도로공사', streamUrl: '', resolution: '4K UHD', installedYear: 2022,
        lat: 37.4210, lng: 126.5210,
    },
    {
        id: 'IC-TR-002', name: '경인고속도로 남청라IC 교통 CCTV', type: 'traffic', status: '정상',
        region: '인천', district: '서구', address: '인천 서구 경인고속도로 남청라IC',
        operator: '한국도로공사', streamUrl: '', resolution: '2K QHD', installedYear: 2021,
        lat: 37.5210, lng: 126.6720,
    },
    {
        id: 'IC-TR-003', name: '부평역 교차로 교통 CCTV', type: 'traffic', status: '정상',
        region: '인천', district: '부평구', address: '인천 부평구 부평대로 교차로',
        operator: '인천시 교통정보센터', streamUrl: '', resolution: '2K QHD', installedYear: 2021,
        lat: 37.4888, lng: 126.7232,
    },
    {
        id: 'IC-TR-004', name: '송도대로 교통 CCTV', type: 'traffic', status: '정상',
        region: '인천', district: '연수구', address: '인천 연수구 송도대로 주요 교차로',
        operator: '인천시 교통정보센터', streamUrl: '', resolution: '4K UHD', installedYear: 2023,
        lat: 37.3990, lng: 126.6401,
    },
    {
        id: 'IC-TR-005', name: '청라국제도시 교통 CCTV', type: 'traffic', status: '점검중',
        region: '인천', district: '서구', address: '인천 서구 청라로 교차로',
        operator: '인천시 교통정보센터', streamUrl: '', resolution: '1080p', installedYear: 2020,
        lat: 37.5368, lng: 126.6478,
    },
];
