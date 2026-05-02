# CCTV Vision Review Loop Status

- generatedAt: 2026-04-29T11:08:24.959Z
- mode: write
- nextAction: open_review_packet_fill_missing_fields_and_line_zones

## Inputs

- catalog: /Users/jungsunghoon/cctv-monitor/data/cctv-vision-calibration.json
- patchCsv: /Users/jungsunghoon/cctv-monitor/data/cctv-vision-line-zone-patch.csv
- reviewCsv: /Users/jungsunghoon/cctv-monitor/data/cctv-vision-calibration-review-worklist.csv
- sampleReport: /Users/jungsunghoon/cctv-monitor/data/cctv-vision-calibration-sample-report.json

## Checks

| Step | Result |
| --- | --- |
| catalog | ok: {"activeEntries":0,"path":"/Users/jungsunghoon/cctv-monitor/data/cctv-vision-calibration.json"} |
| patchDryRun | ok: {"activeBlocked":0,"applied":3,"outputReviewStatus":"active_forced_to_review_needed","patchedIds":["GTIC-X-100402011","GTIC-X-102802102","GTIC-X-101901068"],"worklistRows":3} |
| audit | ok: {"rows":3,"counts":{"review_needed":3},"activeGatePass":0,"readyToMarkActive":0,"blocked":3} |
| reviewPacket | ok: {"rows":3,"counts":{"review_needed":3},"activeGatePass":0,"readyToMarkActive":0,"blocked":3,"sampleCaptured":3,"sampleFrames":9} |
| promoteDryRun | ok: {"activeRows":0} |

