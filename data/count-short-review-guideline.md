# Count-Short Review Guideline

- generatedAt: 2026-03-27
- targetSites: 5
- targetRows: 15

## Why This Bucket Is Different

이 5개 사이트는 `거리`와 `점수`는 충분히 괜찮지만, `공식 카메라 수 < 로컬 시드 수`라서 자동 승격을 멈춘 케이스입니다.  
즉 좌표 오차보다 `로컬 시드가 한 장소를 과분할했을 가능성`이 더 큽니다.

## Decision Rule

### 공식 1 / 로컬 3

대상:
- `202535300000800319`
- `202535500000800431`
- `202435400000801742`

판단 기준:
- 문서나 지도에서 실제 CCTV가 1개로 보이면:
  - `대표 1개만 active`
  - 나머지 2개는 `keep_hidden`
- 실제로 2개 이상으로 확인되면:
  - `보류`
  - 공식 원본 추가 확인 전까지 전부 `keep_hidden`

### 공식 2 / 로컬 3

대상:
- `202435400000802017`
- `202435400000802530`

판단 기준:
- 실제 CCTV가 2개로 확인되면:
  - `대표 2개 active`
  - 나머지 1개 `keep_hidden`
- 실제 3개로 보이지만 공식 원본이 2개뿐이면:
  - 성급히 승격하지 않음
  - 전부 `keep_hidden`
  - 원본 문서 재확인

## What Counts As Enough Evidence

아래 중 2개 이상이면 충분 근거로 봅니다.

- 행안부 공식 주소와 현장/문서 위치가 사실상 동일
- 지자체 공개 문서에서 설치 지점이 1개 또는 2개로 명확
- 지도/위성 기준으로 동일 폴 또는 동일 교차로에 겹침
- 설치 수량 설명이 로컬 시드 수보다 적게 나옴

## What Not To Do

- `로컬 3개`라고 해서 3개를 모두 살리지 않음
- `공식 1개`를 근거 없이 `3개 active`로 복제하지 않음
- 애매하면 승격하지 않음

## Recommended Output Convention

`count-short-review-sites.csv`에서 아래처럼 기록합니다.

- `decision=promote_1_hide_2`
- `decision=promote_2_hide_1`
- `decision=keep_hidden`

`review_note`에는 근거를 짧게 남깁니다.

예:
- `행안부 1개, 거리 14m, 현장 문서상 단일 교차로`
- `행안부 2개, 로컬 3개는 시드 중복으로 판단`

## Current Sites

| MNG_NO | Local IDs | Official Count | Local Count | Dist(m) | Suggested Rule |
| --- | --- | ---: | ---: | ---: | --- |
| 202535300000800319 | IC-CR-070, IC-CR-071, IC-CR-072 | 1 | 3 | 14 | promote_1_hide_2 or keep_hidden |
| 202535500000800431 | IC-CR-094, IC-CR-095, IC-CR-096 | 1 | 3 | 25 | promote_1_hide_2 or keep_hidden |
| 202435400000801742 | IC-CR-013, IC-CR-014, IC-CR-015 | 1 | 3 | 34 | promote_1_hide_2 or keep_hidden |
| 202435400000802017 | IC-CR-016, IC-CR-017, IC-CR-018 | 2 | 3 | 54 | promote_2_hide_1 or keep_hidden |
| 202435400000802530 | IC-CR-022, IC-CR-023, IC-CR-024 | 2 | 3 | 73 | promote_2_hide_1 or keep_hidden |
