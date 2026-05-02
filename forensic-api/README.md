# Forensic API

ITS 차량 분석과 포렌식 추적을 위한 FastAPI 백엔드 골격입니다.

## 목적

- `POST /api/analyze`: 단일 ITS 실시간 스트림 차량 분석
- `POST /api/track`: 다중 ITS 카메라 대상 차량 추적 작업 생성
- `GET /api/track/{tracking_id}`: 추적 결과 조회

프론트엔드 [cctv-monitor.vercel.app](https://cctv-monitor.vercel.app) 가 바로 붙을 수 있는 응답 스키마로 맞춰져 있습니다.

## 모드

- `FORENSIC_DEMO_MODE=true`
  - 엔드투엔드 UI 검증용
  - YOLO 의존성이 없어도 작동
  - 결과는 구조 검증용 synthetic 응답
- `FORENSIC_DEMO_MODE=false`
  - OpenCV + 최신 Ultralytics YOLO 사용
  - HLS/영상 스트림에서 샘플 프레임을 읽어 차량 검출 시도
  - `OCR_ENGINE=easyocr`일 때 차량 검출 박스 crop 우선 OCR hook 활성화
  - 기본 모델은 Render Starter 기준 경량 최신 라인인 `yolo26n.pt`
  - 기본값은 `disabled`라서 번호판 OCR 없이 차량 검출만 수행
  - 제조사/모델/SUV 세부 분류는 `vehicle-vmmr-readiness.json`에 active 검증 모델이 있어도 현재 런타임 분류기 미연결 상태에서는 `null`로 유지
  - ReID runtime backtest report는 `vehicle-reid-runtime-backtest-report.json`에서 읽고, `pending_review` 상태일 때는 운영 승인으로 간주하지 않습니다

## 실행

```bash
cd forensic-api
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

OCR 최소 활성화 예시:

```env
FORENSIC_DEMO_MODE=false
YOLO_MODEL_PATH=yolo26n.pt
OCR_ENGINE=easyocr
OCR_LANG_LIST=ko,en
OCR_FRAME_LIMIT=4
OCR_ALPR_BACKTEST_PATH=data/ocr-alpr-backtest-readiness.json
TRACK_STORE_BACKEND=auto
TRACK_STORE_PATH=
TRACK_STORE_DSN=
TRACK_STORE_TABLE=tracking_results
VEHICLE_REFERENCE_CATALOG_PATH=data/vehicle-reference-catalog.json
VEHICLE_VMMR_READINESS_PATH=data/vehicle-vmmr-readiness.json
VEHICLE_REID_READINESS_PATH=data/vehicle-reid-readiness.json
```

차량 세분화 gate:
- `VEHICLE_REFERENCE_CATALOG_PATH`: 검증된 제조사/모델 백데이터 catalog 경로입니다.
- `VEHICLE_VMMR_READINESS_PATH`: Fine-grained VMMR 모델 검증 리포트 경로입니다.
- `VEHICLE_REID_READINESS_PATH`: 동일 차량 ReID 임베딩 모델 검증 리포트 경로입니다.
- `VEHICLE_REID_RUNTIME_BACKEND=baseline`: crop-based embedding runtime을 켭니다. 현재는 baseline gallery search가 기본이며, learned checkpoint backend는 후속 연결용입니다.
- `VEHICLE_REID_GALLERY_PATH`: ReID embedding gallery JSON 경로입니다.
- `VEHICLE_REID_MATCH_THRESHOLD`: 동일차량 매칭 임계값입니다.
- `VEHICLE_REID_RUNTIME_BACKTEST_PATH`: reviewed ReID runtime backtest report 경로입니다.
- `OCR_ALPR_BACKTEST_PATH`: 야간/역광/원거리/저해상도 OCR·ALPR 실전 백테스트 readiness 경로입니다.
- `TRACK_STORE_BACKEND=auto|memory|json_file|postgres`로 저장소 우선순위를 고를 수 있습니다. `postgres`는 `TRACK_STORE_DSN`이 있어야 하며, 실패하면 기존 `json_file` 또는 `memory`로 자동 fallback 됩니다.
- `TRACK_STORE_TABLE`은 Postgres 테이블명을 지정합니다. 기본값은 `tracking_results`입니다.
- active VMMR 모델은 전체 `mAP50 >= 0.85`와 클래스별 `map50 >= 0.85`를 통과해야 readiness가 `active_report_ready`가 됩니다.
- readiness 상태는 `/healthz`와 분석 결과 `vehicle_signature`에 노출되지만, 실제 VMMR 분류기 연결 전까지 `make/model/subtype`은 `null`입니다.
- active ReID 모델은 `top1Accuracy >= 0.85`, `crossCameraAccuracy >= 0.85`, `falsePositiveRate <= 0.05`를 통과해야 readiness가 `active_report_ready`가 됩니다. 실제 임베딩 매칭 런타임 연결 전까지 동일 차량 판정은 비활성입니다.
- ReID runtime은 readiness와 별도입니다. `VEHICLE_REID_RUNTIME_ENABLED=true` + `VEHICLE_REID_RUNTIME_BACKEND=baseline`이면 차량 crop을 embedding으로 바꿔 gallery JSON에 저장하고 cosine similarity로 검색합니다. `VEHICLE_REID_MATCH_THRESHOLD`를 넘을 때만 `reid_match_status=matched`가 됩니다.
- `vehicle_signature`에는 `reid_runtime_status`, `reid_match_status`, `reid_match_score`가 함께 노출됩니다.
- `/healthz.vehicle_reid_runtime_backtest`는 ReID runtime backtest report 상태를 반환합니다. 이 값은 reviewed observations 기반 운영 지표를 보여줄 뿐이며, 실제 ReID runtime 승인 이전에는 `pending_review`를 유지합니다.
- `/healthz.ocr`는 `operational_scope`, `verification_status`, `validation_note`를 함께 반환합니다. 이 값은 런타임 준비 상태를 설명할 뿐이며 야간·역광·원거리·저해상도 ALPR 정확도 검증을 대체하지 않습니다.
- `/healthz.ocr`는 `backtest_status`, `backtest_required_buckets`, `backtest_completed_buckets`도 함께 반환합니다. 이 값은 백테스트 readiness를 보여줄 뿐이며 실전 승인으로 간주하지 않습니다.
- `/healthz.tracking_store`는 현재 추적 저장소가 `memory`인지 `json_file`인지 `postgres`인지, durable 여부와 external DB 연결 여부를 반환합니다. Postgres는 `TRACK_STORE_BACKEND=postgres` 또는 `auto` + `TRACK_STORE_DSN`일 때만 활성화되며, 실패 시 기존 fallback으로 내려갑니다.
- `/healthz.execution_harness`는 현재 작업 단계와 권장 모델 버전을 표시합니다. 설계/구현/검증/백테스트는 표시용 메타데이터이며 런타임 판정 로직은 아닙니다.

## 프론트 연동

Vercel 또는 로컬 `.env` 에 아래처럼 넣습니다.

```env
FORENSIC_API_URL=http://localhost:8000
```

중요:
- 값은 origin 만 넣습니다.
- `/api/analyze` 같은 path 를 붙이면 안 됩니다.

## Oracle Always Free 배포

장기 무료 운영이 목표면 Oracle Always Free VM 기준 문서를 따르는 게 가장 현실적입니다.

- [Oracle Always Free 배포 가이드](/Users/jungsunghoon/cctv-monitor/forensic-api/deploy/oracle/DEPLOY_ORACLE_ALWAYS_FREE.md)

## Render 배포

Oracle capacity가 막힐 때는 Render로 먼저 외부 백엔드를 올려 연결 확인하는 게 가장 빠릅니다.

- [Render 배포 가이드](/Users/jungsunghoon/cctv-monitor/forensic-api/deploy/render/DEPLOY_RENDER.md)
- Blueprint: [/Users/jungsunghoon/cctv-monitor/forensic-api/render.yaml](/Users/jungsunghoon/cctv-monitor/forensic-api/render.yaml)

## 실제 운용 전 남는 작업

- EasyOCR 결과 품질 측정 및 plate regex 보강
- 필요 시 PaddleOCR/ALPR 전용 엔진 비교
- 차량 ReID 또는 다중 카메라 추적 로직 고도화
- Fine-grained VMMR 분류기 런타임 연결 및 실환경 백테스트
- HLS 인증/프록시 전략 정리
- Redis 같은 외부 저장소로 추적 job 상태 영속화
