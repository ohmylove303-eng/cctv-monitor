# Next Session Handoff

이 문서는 컨텍스트가 가득 찼을 때 새 Codex 창에서 같은 프로젝트를 바로 이어가기 위한 인수인계 문서다.

## 새 창 첫 메시지

```text
/Users/jungsunghoon/cctv-monitor 프로젝트를 이어서 진행해줘.
먼저 아래 3개 파일만 읽고 하네스 기준으로 현재 상태를 파악해.

1. /Users/jungsunghoon/cctv-monitor/PROJECT_EXECUTION_RULES.md
2. /Users/jungsunghoon/cctv-monitor/README.md
3. /Users/jungsunghoon/cctv-monitor/NEXT_SESSION_HANDOFF.md

대원칙:
- 기존 기능을 날리지 말고 작은 레이어로 추가/보완한다.
- 근거 없는 좌표 승격, 근거 없는 중복 제거는 금지한다.
- 토큰 낭비를 줄이기 위해 필요한 파일만 읽고, 같은 검증은 반복하지 않는다.
- 브라우저를 띄워야 하면 Safari를 기본으로 쓴다.
- 미구현/미현실 항목을 하나씩 구현하고 검증한 뒤 커밋/푸시한다.

먼저 git status, npm run build, npm run monitor:production-health 결과로 현재 상태를 확인하고,
그 다음 미구현 목록 중 가장 안전한 1개부터 구현해줘.
```

## 현재 브랜치와 원격

- 작업 경로: `/Users/jungsunghoon/cctv-monitor`
- 브랜치: `codex/render-forensic-backend`
- 원격: `https://github.com/ohmylove303-eng/cctv-monitor.git`
- 프론트 운영: `https://cctv-monitor.vercel.app`
- Render 포렌식 API: `https://its-forensic-api.onrender.com`

## 최근 기준 커밋

- `17db530 Align route tracking order with ETA`
- `9a866e3 Add health monitor npm shortcuts`
- `07ead17 Add help text for health monitor`
- `7bfeba3 Show source deltas in health monitor`
- `8a8a46e Add JSON output for health monitor`

## 구현 완료 기준

- CCTV 통합 지도는 운영 가능하다.
- 공식/검증 좌표 우선 노출과 근사 좌표 숨김 기준이 적용되어 있다.
- National ITS 중복 보존 회귀 테스트가 있다.
- 도로축, 출발지, 도착지, 속도 기반 경로 감시가 적용되어 있다.
- 경로 감시 후보는 ETA/거리 기반 이동 순서가 우선이다.
- 집중 감시 후보는 식별 가능성/축 정렬 점수로 선별하되 표시 순서는 이동 순서로 정렬한다.
- Render YOLO 백엔드는 연결되어 있고 `/`에서 `{"status":"ok","mode":"yolo"}` 형태로 응답한다.
- EasyOCR hook/diagnostics는 연결되어 있지만 실전 OCR 정확도는 계속 검증 대상이다.
- 현재 실행 결과 한눈에 보기: [`data/execution-status-at-a-glance.md`](/Users/jungsunghoon/cctv-monitor/data/execution-status-at-a-glance.md)

## 운영 점검 명령

```bash
cd /Users/jungsunghoon/cctv-monitor
npm run build
npm run test:regression:national-its
npm run monitor:production-health
npm run monitor:production-health:json
npm run status:at-a-glance
```

최근 운영 집계 기준:

- total: `792`
- byRegion: `김포 293`, `인천 471`, `서울 28`
- byType: `crime 200`, `fire 60`, `traffic 532`
- byCoordinateQuality: `approximate 227`, `official 454`, `verified 111`
- bySource: `gimpo-its-cross 133`, `gimpo-its-main 66`, `Gimpo-Local 80`, `Incheon-Local 180`, `incheon-utic 222`, `National-ITS 111`
- trafficBySource: `gimpo-its-cross 133`, `gimpo-its-main 66`, `incheon-utic 222`, `National-ITS 111`

## 남은 미구현/미완성

1. 방범/소방 근사 좌표 227대의 공식 좌표 승격
   - 원칙: 행안부/기관 원본 관리번호 또는 높은 precision 매칭 없이는 자동 승격 금지.
   - 상태: 운영 노출은 official/verified 중심, approximate는 숨김/검토 상태 유지.
   - 보강됨: `npm run coordinates:review-next`와 `npm run test:coordinates-review`가 현재 `official-cctv-coordinates.csv`의 active/review_needed/pending 상태와 수동 검토 우선순위를 요약한다.
   - 최근 로컬 CSV 기준: active `29`, review_needed `177`, pending `54`, blockedFromRuntime `231`, autoPromotableRows `0`.

2. ReID 임베딩 기반 동일 차량 재식별
   - 현재: 도로축/ETA/OCR/색상/차종 증거 기반 후보 정렬.
   - 보강됨: `vehicle-reid-readiness.json`, validator, fixture, `test:vehicle-reference` 하네스, `/healthz.vehicle_reid_readiness`, UI `ReID 동일차량` 상태 카드가 추가됐다.
   - 현재: active ReID model `0`, sameVehicleReidReady `false`.
   - 미완성: 차량 외형 임베딩 추론기 저장, 다중 CCTV 간 동일 차량 유사도 계산 엔진, 실환경 ReID 백테스트.

3. OCR/ALPR 실전 정확도 검증
   - 현재: EasyOCR lazy-load와 후보 진단 UI/응답 스키마 연결.
   - 보강됨: `ocr-alpr-backtest-readiness.json`, validator, fixture, `test:ocr-backtest` 하네스가 추가됐다.
   - 미완성: 야간, 역광, 원거리, 저해상도 구간별 품질 스코어와 PaddleOCR/ALPR 전용 엔진 비교.

4. 운영 추적 저장소
   - 현재: 백엔드 내부 store와 optional persistence 중심.
   - 보강됨: `/healthz.tracking_store`와 프론트 `/api/health.services.forensic.trackingStore`에 `memory/json_file/postgres`, requested backend, durable, persisted_results, external_db 상태를 노출한다.
   - 보강됨: `TRACK_STORE_BACKEND=postgres` + `TRACK_STORE_DSN`일 때 Postgres 어댑터를 우선 시도하고, 실패하면 기존 json_file/memory fallback으로 내려간다.
   - 미완성: Redis/Postgres 같은 외부 큐/DB 기반 장기 추적 저장의 운영 검증과 스케일링.

5. 경로 감시 고도화
   - 현재: 도로축, 출발지, 도착지, 방향, 속도, ETA 기반 집중 후보.
   - 미완성: 교차로 지연, 차로별 방향, 실시간 혼잡도, 경로 이탈 후보까지 포함한 내비 수준 모델.

## 다음 작업 추천 순서

1. `data/execution-status-at-a-glance.md`를 먼저 보고 현재 상태를 빠르게 훑는다.
2. approximate 좌표는 `coordinates:review-next` 결과에서 P1/P2부터 수동 검토하고, 자동 승격은 계속 금지한다.
3. ReID/OCR는 실데이터가 들어올 때만 active 쪽으로 올린다.
4. Render/프론트 운영 점검은 `monitor:production-health` 결과가 clean인지 먼저 본다.

## 작업 시 주의

- `.codex-*` 이미지와 `.codex-backups/`는 검증 산출물/로컬 백업이므로 임의 삭제하지 않는다.
- `.monitoring/`은 `.gitignore` 대상이다. 필요할 때 로컬 기준 스냅샷만 갱신한다.
- 환경변수, API 키, OCI/Render 비밀값은 문서나 커밋에 넣지 않는다.
- 좌표와 CCTV 중복은 거짓 정합보다 숨김이 우선이다.
