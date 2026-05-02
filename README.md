# cctv-monitor
김포·인천 CCTV 통합 관제 상황실 | MFSR 포렌식 · 생성형 AI 전면 배제 · Next.js 14 + MapLibre GL

## 운영 점검

```bash
npm run monitor:production-health
npm run monitor:production-health:json
npm run monitor:production-health:baseline
npm run status:at-a-glance
npm run monitor:production-health -- --help
```

- `monitor:production-health`: 운영 `/api/health`와 `/api/cctv` 집계를 이전 스냅샷과 비교합니다.
- `monitor:production-health:json`: 자동화와 CI에서 쓰기 쉬운 JSON 결과를 출력합니다.
- `monitor:production-health:baseline`: 현재 상태가 clean일 때만 기준 스냅샷을 갱신합니다.
- `status:at-a-glance`: 좌표, Vision calibration, OCR/ALPR, VMMR, ReID, 추적 저장소, 경로 감시 결과를 한 장으로 묶은 요약을 생성합니다.
- 감시 기준은 `total`, `region:*`, `type:*`, `coordinateQuality:*`, `source:*`, `trafficBySource:*`입니다.
- `coordinates:review-next`: 방범·소방 공식 좌표 CSV의 `active / review_needed / pending` 상태와 수동 검토 우선순위를 요약합니다. 자동 승격은 하지 않습니다.

## 구현 현실성 기준

- 운영 가능: CCTV 통합 지도, 공식·검증 좌표 우선 노출, National ITS 중복 보존, 도로축/출발지/도착지/속도 기반 경로 감시, Render YOLO 백엔드 연결.
- 부분 구현: 번호판 OCR은 EasyOCR lazy-load와 후보 진단까지 연결됐지만, 야간·원거리·저해상도 실전 검증은 계속 필요합니다.
- 부분 구현: OCR/ALPR 실전 백테스트 readiness 게이트는 분리했지만, 승인된 검증 리포트는 아직 없습니다.
- 부분 구현: 경로 감시는 ETA 순서와 식별 우선 후보를 함께 쓰지만, 교차로 지연·차로별 방향까지 포함한 내비 수준 모델은 아직 보강 대상입니다.
- 부분 구현: ReID 동일 차량 재식별은 readiness gate와 UI/health 상태 표시는 연결됐지만, 실제 임베딩 매칭 런타임은 아직 비활성입니다.
- 부분 구현: 추적 저장소는 memory/json_file 기본에 Postgres 어댑터와 fallback gate를 추가했지만, 운영용 외부 DB 활성화는 환경변수와 DB 준비가 필요합니다.
- 미완성: 방범·소방 근사 좌표의 1:1 공식 승격, ReID 임베딩 기반 동일 차량 매칭 엔진, 외부 DB/큐 기반 장기 추적 저장.
- 보강됨: 근사 좌표 승격 전 리뷰 하네스는 `coordinates:review-next`와 `test:coordinates-review`로 분리되어 있습니다.

## 하네스 기준

- 기존 기능을 지우지 않고 작은 레이어로 추가합니다.
- 근거 없는 좌표 승격이나 중복 제거는 금지합니다.
- 미확정 데이터는 `review_needed`, `pending`, `keep_hidden`으로 남깁니다.
- 변경 후에는 빌드, 재사용 가능한 스크립트, 운영 API 순서로 검증합니다.
