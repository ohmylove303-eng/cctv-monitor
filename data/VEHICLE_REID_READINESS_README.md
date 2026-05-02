# Vehicle ReID Readiness

이 레이어는 동일 차량 재식별 임베딩 모델을 운영에 연결하기 전 검증 리포트만 관리합니다.

운영 원칙:

- YOLO 차량 검출, VMMR, 경로/ETA 추적을 삭제하거나 대체하지 않는다.
- 검증된 active ReID 모델 리포트가 없으면 동일 차량 판정은 항상 비활성으로 둔다.
- `vehicle-reid-readiness.json`의 active 모델은 런타임 연결 허가가 아니라 준비 상태 신호다.
- 실제 동일 차량 판정은 별도 임베딩 추론기와 실환경 백테스트가 연결된 뒤에만 활성화한다.

활성화 gate:

- `top1Accuracy >= 0.85`
- `crossCameraAccuracy >= 0.85`
- `falsePositiveRate <= 0.05`
- dataset/report evidence에 `reviewer`, `reviewedAt`, `datasetPath` 또는 `reportPath` 필수

검증:

```bash
npm run test:vehicle-reference
node scripts/validate-vehicle-reid-readiness.js
node scripts/validate-vehicle-reid-readiness.js data/vehicle-reid-readiness.fixture.json --allow-fixture
node scripts/build-vehicle-reid-readiness.js --check
node scripts/test-vehicle-reid-readiness-builder.js
```

현재 운영 readiness:

- active model: `0`
- same-vehicle ReID runtime: 비활성
