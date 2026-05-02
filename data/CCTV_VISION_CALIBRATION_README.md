# CCTV Vision Calibration

이 레이어는 CCTV별 시야 품질, 방향 계수선, 상행/하행 보정 상태를 운영 데이터 위에 얹는 검증 catalog입니다.

운영 원칙:

- 기존 CCTV 목록, 좌표, 경로 정렬, COCO YOLO 판정은 삭제하거나 대체하지 않는다.
- 검증 전 CCTV는 `review_needed`, `pending`, `keep_hidden`으로 남기며 운영에 반영하지 않는다.
- `visionTier`는 실제 샘플 프레임, 거리, 해상도, 수동 리뷰 근거가 있을 때만 `active`로 승격한다.
- `lineZoneForward`와 `lineZoneReverse`는 영상 픽셀 기준 `x1,y1;x2,y2` 형식이다.
- 방향 판정은 `directionCalibrationStatus=calibrated`이고 양방향 line zone이 모두 있을 때만 쓸 수 있다.

Tier 기준:

- `tier_a`: 교차로/진입로 근거리, 20m 이하, 1080p 이상. Fine-grained 차량 판정 후보.
- `tier_b`: 20m 초과 80m 이하. 차량 형태와 방향 판정 후보.
- `tier_c`: 80m 초과 또는 저해상도. 통행량/흐름 감시만 신뢰.

파일 용도:

- `cctv-vision-calibration.json`: 운영 catalog. 검증 전까지 비워 둔다.
- `cctv-vision-calibration-review-template.csv`: 검증 후보를 수동 리뷰로 모으는 입력 템플릿.
- `cctv-vision-calibration.fixture.json`: validator 양성 케이스 전용 fixture. 런타임에 연결하지 않는다.

검증 및 승격:

```bash
npm run vision-calibration:export-candidates
npm run vision-calibration:capture-samples -- --limit 5 --frames-per-camera 3
npm run vision-calibration:build-worklist
npm run vision-calibration:line-zone-review
npm run vision-calibration:apply-line-zone-patch
npm run vision-calibration:audit-worklist
npm run vision-calibration:review-packet
npm run vision-calibration:review-smoke
npm run vision-calibration:review-apply-safe
npm run vision-calibration:review-next
npm run test:vision-calibration
npm run vision-calibration:promote
```

`vision-calibration:promote`는 `reviewStatus=active`인 행만 catalog로 승격한다. 필수 증거 필드가 비어 있거나 Tier 기준을 만족하지 못하면 실패한다.

후보 추출:

- `vision-calibration:export-candidates`는 운영 CCTV 목록에서 라이브 교통 CCTV 후보를 추천한다.
- 출력은 `cctv-vision-calibration-candidates.csv`, `cctv-vision-calibration-review-seed.csv`, `cctv-vision-calibration-candidates.md`이다.
- 후보 파일은 `review_needed` 전용이며, 운영 catalog에는 아무 것도 쓰지 않는다.
- `vision-calibration:capture-samples`는 후보 상위 N개에서 카메라별 다중 샘플 프레임과 해상도 근거를 수집한다.
- 샘플 이미지는 `.vision-calibration-samples/`에 저장되며 git에 포함하지 않는다.
- 캡처 성공은 해상도 근거일 뿐, Tier active 승격은 거리, line zone, 리뷰어 검증을 더 채워야 가능하다.
- `vision-calibration:build-worklist`는 샘플 보고서를 검토 작업표로 바꾸며, 모든 행은 `review_needed`로 유지한다.
- `vision-calibration:line-zone-review`는 샘플 이미지 위에서 forward/reverse line zone 픽셀 좌표를 찍는 로컬 HTML 검토 페이지를 만든다. 입력값은 같은 샘플 폴더 기준 브라우저 localStorage에 저장되며, 전체 카메라용 CSV patch rows를 한 번에 출력한다. 페이지 안에서 현재 행의 active gate 상태를 확인하고 전체 CSV를 복사하거나 다운로드할 수 있다.
- `vision-calibration:apply-line-zone-patch`는 HTML에서 복사한 CSV patch row를 worklist에 병합한다. 기본은 dry-run이며, `--apply`를 붙여야 `cctv-vision-calibration-review-worklist.csv`가 갱신된다.
- patch row가 `active`여도 `--allow-active`를 붙이지 않으면 `review_needed`로 보존된다. 실제 운영 반영은 항상 `vision-calibration:promote`의 증거 gate를 통과해야 한다.
- `vision-calibration:audit-worklist`는 worklist를 점검해 active 승격 가능 행과 누락 필드를 `cctv-vision-calibration-review-audit.json/md`로 분리한다. 테스트에서는 `--check` 모드로 파일을 갱신하지 않고 gate만 검증한다.
- `vision-calibration:review-packet`은 audit 결과, 샘플 프레임, line-zone HTML 경로를 한 문서로 묶어 검토자가 다음 입력 필드만 보완하게 한다. 해상도 기반 가능 범위만 표시하며 거리/Tier는 추정하지 않는다.
- `vision-calibration:review-smoke`는 patch 병합 dry-run, audit, review packet, promote dry-run, catalog validator를 쓰기 없이 한 번에 점검한다.
- `vision-calibration:review-status`는 같은 점검 결과를 `cctv-vision-review-loop-status.json/md`로 저장한다.
- `vision-calibration:review-apply-safe`는 patch CSV를 worklist에 반영하고 audit, review packet, loop status를 재생성한다. 이 명령은 `--allow-active`를 거부하므로 운영 catalog 승격은 하지 않는다.
- `vision-calibration:review-next`는 현재 남은 수동 입력값, active gate 상태, 리뷰 페이지/체크리스트 경로만 짧게 `cctv-vision-review-next.json/md`로 요약한다.
- `test:vision-calibration`은 합성 fixture로 line-zone patch 병합, audit, active catalog 생성까지 end-to-end 하네스를 검증한다. 이 테스트는 운영 catalog를 쓰지 않는다.
