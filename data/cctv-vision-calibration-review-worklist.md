# CCTV Vision Calibration Review Worklist

- generatedAt: 2026-04-29T02:11:58.915Z
- sampleReport: /Users/jungsunghoon/cctv-monitor/data/cctv-vision-calibration-sample-report.json
- sampleDir: /Users/jungsunghoon/cctv-monitor/.vision-calibration-samples/2026-04-29T02-11-50-394Z
- rows: 3

## Rule

- 이 파일은 검토 작업표이며 운영 active 승격이 아니다.
- `reviewStatus`는 모두 `review_needed`로 유지된다.
- Tier-A 승격은 1080p 이상만으로 부족하며, 20m 이하 거리와 line zone, 리뷰어 검증이 추가로 필요하다.
- `sampleCount`가 3 이상이어도 거리, line zone, 리뷰어 검증이 없으면 active로 바꾸면 안 된다.

## Rows

| ID | Name | Resolution | Samples | Direction | Evidence | Next |
| --- | --- | --- | ---: | --- | --- | --- |
| GTIC-X-100402011 | 스마트교차로_강화.검단방향 | 1920x1080 | 3 | pending | sample_frame_capture | capture=ok; suggested=tier_a_review_candidate; resolution_supports_tier_a_if_distance_and_line_zone_pass; frames=/Users/jungsunghoon/cctv-monitor/.vision-calibration-samples/2026-04-29T02-11-50-394Z/01_GTIC-X-100402011_f01.jpg \| /Users/jungsunghoon/cctv-monitor/.vision-calibration-samples/2026-04-29T02-11-50-394Z/01_GTIC-X-100402011_f02.jpg \| /Users/jungsunghoon/cctv-monitor/.vision-calibration-samples/2026-04-29T02-11-50-394Z/01_GTIC-X-100402011_f03.jpg; needs_distance_line_zone_reviewer_reviewedAt |
| GTIC-X-102802102 | 스마트교차로_강화.김포시청방향 | 1280x720 | 3 | pending | sample_frame_capture | capture=ok; suggested=tier_a_review_candidate; resolution_supports_tier_b_review_not_tier_a; frames=/Users/jungsunghoon/cctv-monitor/.vision-calibration-samples/2026-04-29T02-11-50-394Z/02_GTIC-X-102802102_f01.jpg \| /Users/jungsunghoon/cctv-monitor/.vision-calibration-samples/2026-04-29T02-11-50-394Z/02_GTIC-X-102802102_f02.jpg \| /Users/jungsunghoon/cctv-monitor/.vision-calibration-samples/2026-04-29T02-11-50-394Z/02_GTIC-X-102802102_f03.jpg; needs_distance_line_zone_reviewer_reviewedAt |
| GTIC-X-101901068 | 스마트교차로_강화.서울방향 | 1920x1080 | 3 | pending | sample_frame_capture | capture=ok; suggested=tier_a_review_candidate; resolution_supports_tier_a_if_distance_and_line_zone_pass; frames=/Users/jungsunghoon/cctv-monitor/.vision-calibration-samples/2026-04-29T02-11-50-394Z/03_GTIC-X-101901068_f01.jpg \| /Users/jungsunghoon/cctv-monitor/.vision-calibration-samples/2026-04-29T02-11-50-394Z/03_GTIC-X-101901068_f02.jpg \| /Users/jungsunghoon/cctv-monitor/.vision-calibration-samples/2026-04-29T02-11-50-394Z/03_GTIC-X-101901068_f03.jpg; needs_distance_line_zone_reviewer_reviewedAt |

