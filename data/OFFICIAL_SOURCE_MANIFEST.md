# Official Source Manifest

현재 코드베이스에서 확인한 공식 원본과 적용 상태입니다.

## 적용 완료

### 김포 교통

- 원본: `https://its.gimpo.go.kr/traf/selectMainCCTVList.do`
- 성격: 김포시교통정보센터 공식 CCTV 목록
- 상태: 운영 적용 완료
- 코드:
  - `lib/gimpo-its.ts`
  - `app/api/gimpo-cctv/route.ts`
  - `app/api/cctv/route.ts`

### 인천 교통

- 원본 1: `https://www.utic.go.kr/map/mapcctv.do`
- 원본 2: `https://www.utic.go.kr/map/getCctvInfoById.do`
- 스트림 패턴: `https://cctv.fitic.go.kr/cctv/{ID}.stream/playlist.m3u8`
- 성격: UTIC 인천교통정보센터 공식 CCTV 목록 및 HLS 스트림
- 상태: 운영 적용 완료
- 코드:
  - `lib/incheon-utic.ts`
  - `app/api/incheon-cctv/route.ts`
  - `app/api/cctv/route.ts`

## 다음 원본

### 전국 CCTV 표준 OpenAPI

- 페이지: `https://www.data.go.kr/data/15155042/openapi.do`
- 명칭: `행정안전부_CCTV정보 조회서비스`
- 용도: 남은 `김포/인천 로컬 방범·소방 260대` 승격용
- 상태: 서비스 확인 및 `serviceKey` 연동 완료
- 비고:
  - 호스트: `https://apis.data.go.kr/1741000/cctv_info`
  - 경로:
    - `/info`
    - `/history`
  - 좌표계: WGS84
  - 설치목적, 주소, 위도/경도 포함
  - importer:
    - 로컬 `CSV/JSON` 및 원격 `URL`: `scripts/import-public-standard-cctv.ts`
    - 직접 `serviceKey` 연동: `scripts/import-mois-cctv-api.ts`
  - 검증 결과:
    - `김포 road LIKE`: `1345`
    - `인천 road LIKE`: `12053`
    - 자동 매칭: `0`
  - 현재 해석:
    - 로컬 `260대`의 시드 주소/명칭은 공식 원본과 직접 join 가능한 키가 아님

### 인천 방범 통계 파일

- 페이지: `https://www.data.go.kr/data/15104287/fileData.do`
- 명칭: `인천광역시_방범 CCTV 설치현황_20250930`
- 상태: 확인 완료, 하지만 `전체 행 11` 통계성 데이터라 개별 좌표 원본으로는 부적합

### 인천 UTIS 파일데이터

- 페이지: `https://www.data.go.kr/data/15089344/fileData.do`
- 명칭: `인천광역시_UTIS_CCTV 정보_20250918`
- 상태: 확인 완료
- 비고:
  - `전체 행 143`
  - UTIC 직접 연동보다 적은 표본이라 운영은 직접 UTIC 연동을 유지하는 편이 맞음

## 가져오기 도구

- 템플릿 재생성:
  - `scripts/sync-official-coordinate-template.ts`
- 공공데이터 표준 CSV/JSON import:
  - `scripts/import-public-standard-cctv.ts`
- 입력 가이드:
  - `data/PUBLIC_STANDARD_IMPORT_README.md`
