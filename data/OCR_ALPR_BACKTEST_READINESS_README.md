# OCR/ALPR Backtest Readiness

- Runtime OCR health and accuracy validation are separate.
- This manifest stays `pending_review` until reviewed backtests exist for:
  - `night`
  - `backlight`
  - `long_distance`
  - `low_resolution`
- `active_report_count` must remain `0` until a reviewed backtest report is added.
- Runtime OCR may stay lazy-loaded or disabled without implying accuracy approval.

## Backtest Report Gate

- Sample template path: `data/ocr-alpr-backtest-samples.template.csv`
- Observation path: `data/ocr-alpr-backtest-observations.json`
- Observation template path: `data/ocr-alpr-backtest-observations.template.json`
- Production report path: `data/ocr-alpr-backtest-report.json`
- Fixture-only report path: `data/ocr-alpr-backtest-report.fixture.json`
- Active reports must cover all buckets: `night`, `backlight`, `long_distance`, `low_resolution`.
- Each active bucket must have `sampleCount >= 30`, `exactPlateAccuracy >= 0.85`, `candidateRecall >= 0.90`, and `falsePositiveRate <= 0.05`.
- When reviewed observations include multiple engines, the report also carries `engineComparisons` so EasyOCR, PaddleOCR, and dedicated ALPR runs can be compared side by side.
- When `data/ocr-alpr-backtest-observations.json` is absent, the builder falls back to the template file and keeps `active_report_count` at `0` until reviewed observations are written.
- Fixture reports are rejected unless the validator is run with `--allow-fixture`.
