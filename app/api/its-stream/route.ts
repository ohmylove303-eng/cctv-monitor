import { NextRequest, NextResponse } from 'next/server';

// 국가교통정보센터(ITS) CCTV 스트림 프록시
// API 키: 공공데이터포털 발급 필요 (https://www.its.go.kr)
// 교통 CCTV HLS 스트림 URL 반환

const ITS_API_KEY = process.env.ITS_API_KEY ?? '';
const ITS_BASE = 'https://openapi.its.go.kr:9443/cctvInfo';

// 김포 주요 교통 CCTV 좌표 → ITS 카메라 매핑
// ITS API: minX, maxX, minY, maxY로 검색
const KIMPO_BOUNDS = {
  minX: 126.5,
  maxX: 126.85,
  minY: 37.5,
  maxY: 37.75,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const cctvId = searchParams.get('id');
  const type = searchParams.get('type') ?? '1'; // 1: 도로, 2: 돌발

  try {
    if (!ITS_API_KEY) {
      // API 키 없을 때 데모 스트림 반환
      // 국토부 공개 CCTV 샘플 스트림
      return NextResponse.json({
        streamUrl: null,
        message: 'ITS_API_KEY 환경변수 미설정 — 공공데이터포털에서 발급 후 Vercel 환경변수에 추가하세요',
        demoMode: true,
        // 데모: 공개 HLS 스트림 (테스트용)
        demoStream: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
      });
    }

    // ITS API 호출
    const params = new URLSearchParams({
      apiKey: ITS_API_KEY,
      type: '2', // 국도/도시
      cctvType: type,
      minX: KIMPO_BOUNDS.minX.toString(),
      maxX: KIMPO_BOUNDS.maxX.toString(),
      minY: KIMPO_BOUNDS.minY.toString(),
      maxY: KIMPO_BOUNDS.maxY.toString(),
      getType: 'json',
    });

    const res = await fetch(`${ITS_BASE}?${params}`, {
      next: { revalidate: 300 }, // 5분 캐시
    });

    if (!res.ok) {
      throw new Error(`ITS API error: ${res.status}`);
    }

    const data = await res.json();
    const cameras = data?.response?.data ?? [];

    // 특정 ID로 필터링
    if (cctvId) {
      const cam = cameras.find((c: { cctvname: string; streamurl: string; coordx: string; coordy: string }) =>
        c.cctvname?.includes(cctvId) ||
        c.streamurl?.includes(cctvId)
      );
      return NextResponse.json({
        streamUrl: cam?.streamurl ?? null,
        name: cam?.cctvname ?? null,
        lat: cam?.coordy ?? null,
        lng: cam?.coordx ?? null,
      });
    }

    // 전체 목록 반환
    return NextResponse.json({
      cameras: cameras.map((c: { cctvname: string; streamurl: string; coordx: string; coordy: string }) => ({
        name: c.cctvname,
        streamUrl: c.streamurl,
        lat: parseFloat(c.coordy),
        lng: parseFloat(c.coordx),
      })),
      total: cameras.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: String(err) },
      { status: 500 }
    );
  }
}
