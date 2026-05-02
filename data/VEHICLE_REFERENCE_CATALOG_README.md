# Vehicle Reference Catalog

이 파일은 차량 제조사/모델/세부 차종 판정을 위한 검증 백데이터 계약입니다.

현재 운영 원칙:

- YOLO COCO 라벨만으로 제조사, 모델명, 국산차 여부, SUV/세단 세부 분류를 판정하지 않는다.
- 검증셋, 수동 검토, 출처, 샘플 수가 없는 항목은 catalog에 넣지 않는다.
- catalog가 비어 있으면 런타임은 `needs_reference_data` 상태를 유지한다.

필수 항목 예시는 `scripts/validate-vehicle-reference-catalog.js`의 검증 규칙을 따른다.

파일 용도:

- `vehicle-reference-catalog.json`: 운영 catalog. 검증 전까지 비워 둔다.
- `vehicle-reference-review-template.csv`: 검증 후보를 수동 리뷰로 모으는 입력 템플릿.
- `vehicle-reference-catalog.fixture.json`: validator 양성 케이스 전용 fixture. 런타임에 연결하지 않는다.
- `vehicle-vmmr-readiness.json`: Fine-grained YOLO/VMMR 모델 검증 리포트 계약. active 모델이 없으면 제조사/모델/세부 차종 추론은 계속 비활성이다.
- `vehicle-vmmr-readiness.fixture.json`: VMMR validator 양성 케이스 전용 fixture. 런타임에 연결하지 않는다.

승격 절차:

- 후보 행은 먼저 `vehicle-reference-review-template.csv`에 남긴다.
- 운영 반영은 `reviewStatus=active`인 행만 가능하다.
- `active` 행은 제조사, 모델, 시장, 출처, 검증 방법, 샘플 수, 데이터셋 경로, 리뷰어, 리뷰 일자를 모두 채워야 한다.
- 기본 샘플 수 기준은 3건 이상이며, `npm run test:vehicle-reference`가 이를 dry run으로 검사한다.
- 검증이 끝난 뒤 `npm run vehicle-reference:promote`를 실행하면 active 행만 `vehicle-reference-catalog.json`으로 승격된다.
- VMMR readiness의 active 모델은 전체 `mAP50 >= 0.85`와 클래스별 `map50 >= 0.85`, 데이터셋/리포트 증거를 모두 만족해야 한다. 이 임계값은 운영 활성화 gate이며, 통과 전에는 `vehicle_signature.make/model/subtype`을 열지 않는다.
