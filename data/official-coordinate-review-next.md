# Official Coordinate Review Next

- generatedAt: 2026-05-02T02:24:06.383Z
- nextAction: review_priority_rows_manually_before_any_active_promotion
- csv: /Users/jungsunghoon/cctv-monitor/data/official-cctv-coordinates.csv
- reviewRowsCsv: /Users/jungsunghoon/cctv-monitor/data/official-coordinate-review-next-rows.csv
- activeRows: 34
- reviewNeededRows: 172
- pendingRows: 54
- blockedFromRuntime: 226
- invalidActiveRows: 0
- autoPromotableRows: 0

## Guardrail

- `review_needed` and `pending` rows are not applied by the runtime official-coordinate override loader.
- This report never changes `status` and never promotes rows to `active`.
- Promotion still requires manual source review and the existing reviewed-promotion flow.

## Counts

- byStatus: {"active":34,"review_needed":172,"pending":54}
- byRegion: {"김포":80,"인천":180}
- byPurpose: {"생활방범":183,"차량방범":5,"blank":54,"재난재해":18}
- byReviewPriority: {"P1_manual_review":15,"P2_manual_review":29,"P3_manual_review":38,"P4_manual_review_low_confidence":90,"P5_source_evidence_required":54}
- byDistanceBucket: {"101_300m":61,"301_800m":32,"1501m_plus":21,"801_1500m":24,"0_100m":34}

## Top Manual Review Targets

| Priority | ID | Name | Region | Distance | Score | Purpose | Matched Address |
| --- | --- | --- | --- | ---: | ---: | --- | --- |
| P1_manual_review | IC-CR-071 | 남동구 만수동 방범 CCTV-2 | 인천 | 14 | 194 | 생활방범 | 인천광역시 남동구 인주대로748번길 20 |
| P1_manual_review | IC-CR-072 | 남동구 만수동 방범 CCTV-3 | 인천 | 14 | 194 | 생활방범 | 인천광역시 남동구 인주대로748번길 20 |
| P1_manual_review | IC-CR-095 | 계양구 귤현동 방범 CCTV-2 | 인천 | 25 | 194 | 생활방범 | 인천광역시 계양구 계산새로 88 |
| P1_manual_review | IC-CR-096 | 계양구 귤현동 방범 CCTV-3 | 인천 | 25 | 194 | 생활방범 | 인천광역시 계양구 계산새로 88 |
| P1_manual_review | IC-CR-014 | 부평구 부평동 방범 CCTV-2 | 인천 | 34 | 194 | 생활방범 | 인천광역시 부평구 부평문화로53번길 49 |
| P1_manual_review | IC-CR-015 | 부평구 부평동 방범 CCTV-3 | 인천 | 34 | 194 | 생활방범 | 인천광역시 부평구 부평문화로53번길 49 |
| P1_manual_review | IC-CR-017 | 부평구 십정동 방범 CCTV-2 | 인천 | 54 | 194 | 생활방범 | 인천광역시 부평구 부흥로 245 |
| P1_manual_review | IC-CR-018 | 부평구 십정동 방범 CCTV-3 | 인천 | 54 | 194 | 생활방범 | 인천광역시 부평구 부흥로 245 |
| P1_manual_review | IC-CR-023 | 부평구 부평4동 방범 CCTV-2 | 인천 | 73 | 194 | 생활방범 | 인천광역시 부평구 대정로82번길 11 |
| P1_manual_review | IC-CR-024 | 부평구 부평4동 방범 CCTV-3 | 인천 | 73 | 194 | 생활방범 | 인천광역시 부평구 대정로82번길 11 |

