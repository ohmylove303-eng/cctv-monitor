# CCTV Vision Line-Zone Patch Checklist

이 파일은 `cctv-vision-line-zone-patch.csv`를 채울 때 쓰는 수동 검토 체크리스트입니다.
운영 catalog를 직접 바꾸지 않으며, 확인된 샘플/해상도 근거 위에 사람이 판단해야 하는 값만 채웁니다.

## 현재 리뷰 대상

| CCTV ID | 이름 | 해상도 | 현재 제한 |
| --- | --- | --- | --- |
| GTIC-X-100402011 | 스마트교차로_강화.검단방향 | 1920x1080 | 거리, line zone, 리뷰어 확인 전까지 review_needed |
| GTIC-X-102802102 | 스마트교차로_강화.김포시청방향 | 1280x720 | 해상도상 tier_a 불가, tier_b 이하만 검토 |
| GTIC-X-101901068 | 스마트교차로_강화.서울방향 | 1920x1080 | 거리, line zone, 리뷰어 확인 전까지 review_needed |

## 채워야 하는 필드

- `visionTier`: `tier_a`, `tier_b`, `tier_c` 중 하나
- `identificationUse`: Tier에 맞춰 아래 값만 사용
- `approachDistanceMeters`: 실제 근접/중거리/원거리 판단 근거가 되는 양수
- `directionCalibrationStatus`: 방향 기준선이 확정되면 `calibrated`, 아니면 `pending`
- `lineZoneForward`: `x1,y1;x2,y2`
- `lineZoneReverse`: `x1,y1;x2,y2`
- `reviewer`: 검토자 이름 또는 식별자
- `reviewedAt`: 검토 일시. 예: `2026-04-29`

## Tier별 허용 조합

| Tier | identificationUse | 거리/해상도 gate |
| --- | --- | --- |
| `tier_a` | `fine_grained_vehicle` | `approachDistanceMeters <= 20`, `resolutionHeight >= 1080` |
| `tier_b` | `vehicle_shape_direction` | `20 < approachDistanceMeters <= 80` |
| `tier_c` | `traffic_flow_only` | `approachDistanceMeters > 80` 또는 `resolutionHeight < 720` |

## Line Zone 규칙

- 좌표는 샘플 이미지 픽셀 기준입니다.
- 형식은 반드시 `x1,y1;x2,y2`입니다.
- `directionCalibrationStatus=calibrated`이면 `lineZoneForward`와 `lineZoneReverse`가 모두 필요합니다.
- 좌표는 이미지 해상도 범위 안이어야 합니다.

## 안전 적용 순서

```bash
npm run vision-calibration:review-apply-safe
npm run vision-calibration:audit-worklist
npm run vision-calibration:review-packet
npm run test:vision-calibration
```

`review-apply-safe`는 `active` 승격을 하지 않습니다. 운영 catalog 반영은 감사 리포트에서 gate 통과를 확인한 뒤 별도 승인으로만 진행합니다.
