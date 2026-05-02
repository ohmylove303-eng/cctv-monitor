# CCTV Vision Review Next

- generatedAt: 2026-04-29T11:10:41.575Z
- nextAction: open_review_packet_fill_missing_fields_and_line_zones
- activeCatalogEntries: 0
- activeGatePass: 0
- readyToMarkActive: 0
- blocked: 3
- sampleCaptured: 3
- sampleFrames: 9

## Open

- reviewPage: /Users/jungsunghoon/cctv-monitor/.vision-calibration-samples/2026-04-29T02-11-50-394Z/line-zone-review.html
- patchCsv: /Users/jungsunghoon/cctv-monitor/data/cctv-vision-line-zone-patch.csv
- checklist: /Users/jungsunghoon/cctv-monitor/data/cctv-vision-line-zone-patch-checklist.md

## Remaining Manual Inputs

| CCTV | Resolution | Max Tier | Status | Missing |
| --- | --- | --- | --- | --- |
| GTIC-X-100402011 스마트교차로_강화.검단방향 | 1920x1080 | tier_a_if_distance_<=20m | review_needed | visionTier, identificationUse, approachDistanceMeters, reviewer, reviewedAt, directionCalibrationStatus, lineZoneForward, lineZoneReverse |
| GTIC-X-102802102 스마트교차로_강화.김포시청방향 | 1280x720 | tier_b_or_lower | review_needed | visionTier, identificationUse, approachDistanceMeters, reviewer, reviewedAt, directionCalibrationStatus, lineZoneForward, lineZoneReverse |
| GTIC-X-101901068 스마트교차로_강화.서울방향 | 1920x1080 | tier_a_if_distance_<=20m | review_needed | visionTier, identificationUse, approachDistanceMeters, reviewer, reviewedAt, directionCalibrationStatus, lineZoneForward, lineZoneReverse |

## Guardrail

- Do not infer distance, tier, or line-zone coordinates without manual frame review.
- Use `npm run vision-calibration:review-apply-safe` after editing the patch CSV.
- Promote to the active catalog only after reviewer confirmation and gate pass.

