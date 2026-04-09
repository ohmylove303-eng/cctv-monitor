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
```

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
- HLS 인증/프록시 전략 정리
- Redis 같은 외부 저장소로 추적 job 상태 영속화
