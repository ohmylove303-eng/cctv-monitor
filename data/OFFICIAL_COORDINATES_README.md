# Official CCTV Coordinates

운영에서 근사 좌표를 실제 좌표로 승격하려면 아래 파일 중 하나를 채우면 됩니다.

- `data/official-cctv-coordinates.csv`
- `data/official-cctv-coordinates.json`
- `data/official-cctv-coordinates.geojson`

우선순위는 파일 형식과 무관하며, 매 요청 시 병합됩니다.

## CSV 스키마

```csv
id,name,address,region,source,seed_lat,seed_lng,lat,lng,status,source_document,note
KP-TR-013,통진읍 교통 CCTV,경기 김포시 통진읍 국도 48호선 통진,김포,Gimpo-Local-Traffic,37.675500,126.645500,37.676012,126.645931,active,김포시 교통 CCTV 목록 2026-03,공식 도면 기준
```

`seed_lat/seed_lng`는 현재 근사 좌표 참고값입니다. `lat/lng`에 공식값이 들어가고 `status=active`일 때만 운영에 반영됩니다.
`status=review_needed`는 반자동 매칭 후보를 뜻하며, 운영에는 아직 반영되지 않습니다.

김포/인천 `교통`은 이제 공식 ITS/UTIC 피드로 직접 들어오므로 CSV 수집 대상에서 제외됩니다. 현재 `data/official-cctv-coordinates.csv`에는 `김포/인천 로컬 방범·소방 260대`가 `pending` 상태로 템플릿 입력돼 있습니다. 해당 행의 `lat/lng`, `source_document`, `note`를 채우고 `status`를 `active`로 바꾸면 즉시 승격됩니다.

공공데이터포털 표준 `CCTV정보` CSV/JSON 또는 원격 URL을 자동 반영하려면 아래 문서를 보면 됩니다.

- `data/PUBLIC_STANDARD_IMPORT_README.md`
- `scripts/import-public-standard-cctv.ts`
- `scripts/import-mois-cctv-api.ts`
- `scripts/semi-auto-match-mois-cctv.ts`
- `scripts/backtest-mois-matcher.ts`
- `scripts/export-review-needed-report.ts`
- `scripts/export-p1-promotion-candidates.ts`
- `scripts/export-p1-approval-suggestions.ts`
- `scripts/apply-reviewed-promotions.ts`

보수적인 `P1 승인 추천안`을 따로 만들려면 아래 명령을 실행합니다.

```bash
npm run coordinates:approval-suggestions
```

출력 파일:

- `data/review-needed-p1-suggested-sites.csv`
- `data/review-needed-p1-suggested-rows.csv`
- `data/review-needed-p1-suggested.md`

`review_needed` 검토 결과를 실제 `active`로 승격하려면 `data/review-needed-p1-sites.csv` 또는 `data/review-needed-p1-rows.csv`의 `approve` 칼럼에 `Y`를 넣고 아래 명령을 실행합니다.

```bash
npx --yes tsx scripts/apply-reviewed-promotions.ts
```

기본값은 `dry-run`이며, 실제 CSV를 바꾸지 않고 요약만 만듭니다.

```bash
npx --yes tsx scripts/apply-reviewed-promotions.ts --apply
```

실행 결과는 아래 파일에 기록됩니다.

- `data/reviewed-promotions-summary.json`
- `data/reviewed-promotions-summary.md`

로컬 템플릿을 현재 시드 데이터와 다시 맞추려면 아래 명령으로 CSV를 재생성할 수 있습니다.

```bash
npx --yes tsx scripts/sync-official-coordinate-template.ts
```

이 명령은 `김포/인천 로컬 방범·소방` 전체를 `pending` 템플릿으로 다시 채우고, 기존 `active` 행의 `lat/lng`, `source_document`, `note`는 유지합니다.

## JSON 스키마

```json
[
  {
    "id": "KP-TR-013",
    "name": "통진읍 교통 CCTV",
    "address": "경기 김포시 통진읍 국도 48호선 통진",
    "region": "김포",
    "source": "Gimpo-Local-Traffic",
    "lat": 37.6755,
    "lng": 126.6455,
    "note": "공식 도면 기준"
  }
]
```

## GeoJSON 스키마

```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "id": "KP-TR-013",
        "name": "통진읍 교통 CCTV",
        "address": "경기 김포시 통진읍 국도 48호선 통진",
        "region": "김포",
        "source": "Gimpo-Local-Traffic",
        "note": "공식 도면 기준"
      },
      "geometry": {
        "type": "Point",
        "coordinates": [126.6455, 37.6755]
      }
    }
  ]
}
```

## 매칭 우선순위

아래 순서로 CCTV를 찾습니다.

1. `id`
2. `source + name`
3. `source + address`
4. `name + address`

## 운영 확인

- `/api/coordinates/status`
- `/api/health`

`/api/health.services.cctv.byCoordinateQuality`에서 `official / verified / approximate` 수치를 바로 볼 수 있습니다.
`/api/coordinates/status.inputSummary`에서는 `csvPendingRows`, `csvReviewRows`, `csvActiveRows`를 함께 볼 수 있습니다.

## 다음 검토 요약

근사 좌표를 자동 승격하지 않고 현재 `active / review_needed / pending` 상태와 수동 검토 우선순위만 다시 계산하려면 아래 명령을 실행합니다.

```bash
npm run coordinates:review-next
npm run test:coordinates-review
```

출력 파일:

- `data/official-coordinate-review-next.json`
- `data/official-coordinate-review-next.md`
- `data/official-coordinate-review-next-rows.csv`

이 요약은 `status`를 바꾸지 않습니다. `review_needed`와 `pending` 행은 런타임 공식 좌표 override에 반영되지 않으며, `autoPromotableRows`는 항상 `0`으로 유지됩니다.

`P1 third-wave` 분류를 다시 계산하려면 아래 명령을 실행합니다.

```bash
npm run coordinates:third-wave
```

출력 파일:

- `data/review-needed-p1-third-wave-sites.csv`
- `data/review-needed-p1-third-wave-rows.csv`
- `data/review-needed-p1-third-wave.md`
