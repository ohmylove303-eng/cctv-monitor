# cctv-monitor
김포·인천 CCTV 통합 관제 상황실 | MFSR 포렌식 · 생성형 AI 전면 배제 · Next.js 14 + MapLibre GL

## 운영 점검

```bash
npm run monitor:production-health
npm run monitor:production-health:json
npm run monitor:production-health:baseline
npm run monitor:production-health -- --help
```

- `monitor:production-health`: 운영 `/api/health`와 `/api/cctv` 집계를 이전 스냅샷과 비교합니다.
- `monitor:production-health:json`: 자동화와 CI에서 쓰기 쉬운 JSON 결과를 출력합니다.
- `monitor:production-health:baseline`: 현재 상태가 clean일 때만 기준 스냅샷을 갱신합니다.
- 감시 기준은 `total`, `region:*`, `type:*`, `coordinateQuality:*`, `source:*`, `trafficBySource:*`입니다.

## 구현 현실성 기준

- 운영 가능: CCTV 통합 지도, 공식·검증 좌표 우선 노출, National ITS 중복 보존, 도로축/출발지/도착지/속도 기반 경로 감시, Render YOLO 백엔드 연결.
- 부분 구현: 번호판 OCR은 EasyOCR lazy-load와 후보 진단까지 연결됐지만, 야간·원거리·저해상도 실전 검증은 계속 필요합니다.
- 부분 구현: 경로 감시는 ETA 순서와 식별 우선 후보를 함께 쓰지만, 교차로 지연·차로별 방향까지 포함한 내비 수준 모델은 아직 보강 대상입니다.
- 미완성: 방범·소방 근사 좌표의 1:1 공식 승격, ReID 임베딩 기반 동일 차량 재식별, 외부 DB/큐 기반 장기 추적 저장.

## 하네스 기준

- 기존 기능을 지우지 않고 작은 레이어로 추가합니다.
- 근거 없는 좌표 승격이나 중복 제거는 금지합니다.
- 미확정 데이터는 `review_needed`, `pending`, `keep_hidden`으로 남깁니다.
- 변경 후에는 빌드, 재사용 가능한 스크립트, 운영 API 순서로 검증합니다.
