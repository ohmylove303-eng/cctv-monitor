# Official Coordinate Review Next

- generatedAt: 2026-05-01T23:44:01.311Z
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
| P1_manual_review | IC-CR-118 | 중구 신흥동 방범 CCTV-1 | 인천 | 81 | 191 | 생활방범 | 인천광역시 중구 제물량로 271 |
| P1_manual_review | IC-CR-119 | 중구 신흥동 방범 CCTV-2 | 인천 | 81 | 191 | 생활방범 | 인천광역시 중구 제물량로 271 |
| P1_manual_review | IC-CR-120 | 중구 신흥동 방범 CCTV-3 | 인천 | 81 | 191 | 생활방범 | 인천광역시 중구 제물량로 271 |
| P1_manual_review | KP-CR-045 | 걸포동 방범 CCTV-1 | 김포 | 94 | 191 | 생활방범 | 경기도 김포시 걸포동 4-170(걸포동 마을회관 인근) |
| P1_manual_review | KP-CR-046 | 걸포동 방범 CCTV-2 | 김포 | 94 | 191 | 생활방범 | 경기도 김포시 걸포동 4-170(걸포동 마을회관 인근) |
| P2_manual_review | KP-CR-013 | 고촌읍 방범 CCTV-1 | 김포 | 115 | 191 | 생활방범 | 경기도 김포시 고촌읍 신곡리 1260(힐스테이트2단지 공원) |
| P2_manual_review | KP-CR-014 | 고촌읍 방범 CCTV-2 | 김포 | 115 | 191 | 생활방범 | 경기도 김포시 고촌읍 신곡리 1260(힐스테이트2단지 공원) |
| P2_manual_review | IC-CR-085 | 계양구 계산동 방범 CCTV-1 | 인천 | 143 | 191 | 생활방범 | 인천광역시 계양구 경명대로 1142번길 7 |
| P2_manual_review | IC-CR-086 | 계양구 계산동 방범 CCTV-2 | 인천 | 143 | 191 | 생활방범 | 인천광역시 계양구 경명대로 1142번길 7 |
| P2_manual_review | IC-CR-087 | 계양구 계산동 방범 CCTV-3 | 인천 | 143 | 191 | 생활방범 | 인천광역시 계양구 경명대로 1142번길 7 |
| P2_manual_review | KP-CR-003 | 사우동 방범 CCTV-1 | 김포 | 145 | 191 | 생활방범 | 경기도 김포시 사우동 1223 (김포여중 뒷길) |
| P2_manual_review | KP-CR-004 | 사우동 방범 CCTV-2 | 김포 | 145 | 191 | 생활방범 | 경기도 김포시 사우동 1223 (김포여중 뒷길) |
| P2_manual_review | KP-CR-011 | 고촌읍 방범 CCTV-1 | 김포 | 158 | 171 | 생활방범 | 경기도 김포시 고촌읍 풍곡리 228-1 (새한솔어린이집) |
| P2_manual_review | KP-CR-012 | 고촌읍 방범 CCTV-2 | 김포 | 158 | 171 | 생활방범 | 경기도 김포시 고촌읍 풍곡리 228-1 (새한솔어린이집) |
| P2_manual_review | KP-CR-047 | 북변동 방범 CCTV-1 | 김포 | 185 | 171 | 생활방범 | 경기도 김포시 북변동 814(풍년마을,김포고) |

