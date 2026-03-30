# Public Standard CCTV Import

남은 `김포/인천 로컬 방범·소방 260대`는 공공데이터포털 표준 `CCTV정보` CSV 또는 JSON 응답 파일을 내려받아 자동 반영할 수 있습니다.
입력은 로컬 파일 경로와 원격 `http/https` URL을 둘 다 지원합니다.

대상:

- `Gimpo-Local`
- `Incheon-Local`

제외:

- `Gimpo-Local-Traffic`
- `Incheon-Local-Traffic`

교통은 이미 공식 ITS/UTIC 피드로 직접 들어오므로 이 importer 대상이 아닙니다.

## 입력 파일

공공데이터 표준 `CCTV정보` CSV에서 아래 컬럼이 있으면 됩니다.

- `관리기관명`
- `설치목적구분`
- `소재지도로명주소`
- `소재지지번주소`
- `위도`
- `경도`

CSV는 CP949/EUC-KR, UTF-8 둘 다 읽습니다.
JSON은 공공데이터포털 OpenAPI 응답 파일을 그대로 받을 수 있습니다.

## 매칭 규칙

1. 지역: `김포` / `인천`
2. 목적: `범죄예방`, `방범`, `재난`, `재해`, `화재`, `안전`
3. 제외: `교통`, `주정차` 등 교통계열 목적
4. 주소 exact/contains 우선 매칭
5. `방범`은 범죄예방 계열 목적 가점
6. `소방`은 화재/재난/안전 계열 목적 가점

기존 exact/contains 매칭은 `active` 승격에 쓰이고, 애매한 로컬 방범·소방은 `semi-auto` 경로에서 `review_needed`까지 내려줍니다.

## 사용법

드라이런:

```bash
npx --yes tsx scripts/import-public-standard-cctv.ts /path/to/public-cctv.csv --dry-run
```

JSON 응답 파일 드라이런:

```bash
npx --yes tsx scripts/import-public-standard-cctv.ts /path/to/public-cctv.json --dry-run
```

원격 URL 드라이런:

```bash
npx --yes tsx scripts/import-public-standard-cctv.ts "https://example.com/public-cctv.json" --dry-run
```

실제 반영:

```bash
npx --yes tsx scripts/import-public-standard-cctv.ts /path/to/public-cctv.csv
```

행정안전부 OpenAPI를 직접 읽으려면:

```bash
PUBLIC_CCTV_SERVICE_KEY=발급받은키 \
npx --yes tsx scripts/import-mois-cctv-api.ts --dry-run
```

```bash
PUBLIC_CCTV_SERVICE_KEY=발급받은키 \
npx --yes tsx scripts/import-mois-cctv-api.ts
```

반자동 후보 생성만 하려면:

```bash
PUBLIC_CCTV_SERVICE_KEY=발급받은키 \
npx --yes tsx scripts/semi-auto-match-mois-cctv.ts --dry-run
```

실제 `review_needed` 상태를 CSV에 기록하려면:

```bash
PUBLIC_CCTV_SERVICE_KEY=발급받은키 \
npx --yes tsx scripts/semi-auto-match-mois-cctv.ts
```

백테스트는:

```bash
PUBLIC_CCTV_SERVICE_KEY=발급받은키 \
npx --yes tsx scripts/backtest-mois-matcher.ts --sample 120
```

반영 결과는 아래 파일에 씁니다.

- `data/official-cctv-coordinates.csv`

## 기대 결과

성공하면 해당 행이:

- `status=pending` -> `status=active`
- `lat/lng` 채움
- `source_document`에 파일명 기록
- `note`에 자동 매칭 근거 기록

반자동 경로에서는:

- `status=pending` -> `status=review_needed`
- `matched_mng_no`, `matched_score`, `matched_distance_m` 등 검토 메타데이터 기록
- 운영 지도에는 아직 반영되지 않음

그 뒤 운영에서 바로 확인할 곳:

- `/api/coordinates/status`
- `/api/health`
- `/api/cctv`

## 현재 판정

`행정안전부_CCTV정보 조회서비스`는 연결 가능하고, 현재 로컬 `방범·소방 260대`에 대해
`review_needed` 후보를 반자동으로 생성할 수 있습니다. 다만 보수적 기준상 자동 `active` 승격은 아직 막아둔 상태입니다.
