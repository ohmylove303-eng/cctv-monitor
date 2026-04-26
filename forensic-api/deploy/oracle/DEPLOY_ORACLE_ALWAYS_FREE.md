# Oracle Always Free VM 배포 가이드

`2026-03-15` 기준 이 백엔드를 장기적으로 무료에 가깝게 운영하려면 Oracle Always Free VM이 가장 현실적입니다.

## 왜 Oracle 쪽이 맞는가

- Oracle Always Free는 계정 수명 동안 무료 리소스를 제공합니다.
- 공식 문서 기준:
  - `VM.Standard.E2.1.Micro` 최대 2대
  - `VM.Standard.A1.Flex` 월 `3,000 OCPU hours / 18,000 GB hours`
  - Always Free 기준으로 `최대 4 OCPU / 24GB RAM` 상당
- 단, 공식 문서상 `out of host capacity`가 날 수 있고, `7일 동안 CPU/네트워크/메모리 사용량이 매우 낮으면 idle reclaim` 될 수 있습니다.

참고:
- https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm

## 추천 VM 사양

- 1순위: `VM.Standard.A1.Flex`
  - `1 OCPU / 6GB RAM`
  - Ubuntu 24.04
- 대안: `VM.Standard.E2.1.Micro`
  - 성능은 더 낮음
  - YOLO 실험용에는 비추천

## 1. OCI VM 생성

1. Oracle Cloud Console 로그인
2. Home Region에서 Compute Instance 생성
3. Shape:
   - `VM.Standard.A1.Flex` 선택
   - `1 OCPU / 6GB RAM`
4. Image:
   - Ubuntu 24.04
5. Public IPv4 할당
6. SSH key 등록

## 2. 방화벽 열기

보안 목록 또는 NSG에서 아래 포트를 엽니다.

- `22/tcp`
- `8000/tcp`

운영에서 직접 노출하지 않을 거면 `8000`은 임시 확인 후 닫고 Nginx `80/443`만 열어도 됩니다.

## 3. 서버 준비

```bash
sudo apt update
sudo apt install -y python3.13 python3.13-venv python3-pip git
```

로컬에서 OCI CLI로 먼저 검증하려면:

```bash
oci setup config
```

공식 문서 기준 CLI 설정 파일 기본 위치는 `~/.oci/config` 입니다.

## 4. 코드 배치

```bash
sudo mkdir -p /opt/its-forensic-api
sudo chown -R ubuntu:ubuntu /opt/its-forensic-api
cd /opt/its-forensic-api
```

가장 단순하게는 현재 `forensic-api` 디렉터리만 업로드하면 됩니다.

필요 파일:

- `app/`
- `requirements.txt`
- `start.sh`
- `.env`

## 5. 가상환경과 의존성 설치

```bash
cd /opt/its-forensic-api
python3.13 -m venv .venv313
./.venv313/bin/pip install --upgrade pip
./.venv313/bin/pip install -r requirements.txt
chmod +x start.sh
```

## 6. 환경변수 파일 작성

`/opt/its-forensic-api/.env`

```env
FORENSIC_DEMO_MODE=true
YOLO_MODEL_PATH=yolov8n.pt
YOLO_CONFIDENCE=0.25
ANALYZE_FRAME_LIMIT=18
TRACK_CAMERA_LIMIT=24
TRACK_HIT_LIMIT=12
```

처음에는 `FORENSIC_DEMO_MODE=true`로 붙이는 게 맞습니다.

프론트 연결 확인 후에만:

```env
FORENSIC_DEMO_MODE=false
```

## 7. systemd 서비스 등록

```bash
sudo cp deploy/oracle/forensic-api.service /etc/systemd/system/forensic-api.service
sudo systemctl daemon-reload
sudo systemctl enable forensic-api
sudo systemctl start forensic-api
sudo systemctl status forensic-api
```

## 8. 동작 확인

```bash
curl http://127.0.0.1:8000/
curl http://127.0.0.1:8000/healthz
```

외부에서도 확인:

```bash
curl http://YOUR_PUBLIC_IP:8000/healthz
```

## 9. Vercel 연결

Vercel 환경변수:

```env
FORENSIC_API_URL=http://YOUR_PUBLIC_IP:8000
```

중요:

- origin만 넣습니다.
- `/api/analyze` 같은 path를 붙이면 안 됩니다.

## 10. 권장 마무리

직접 `8000`을 노출하기보다 Nginx + 도메인 + HTTPS를 붙이는 게 낫습니다.

추천 순서:

1. Oracle VM에 `demo mode` 배포
2. Vercel `FORENSIC_API_URL` 연결
3. 운영 프론트 실검증
4. 이후 Nginx/HTTPS 적용
5. 마지막에 `FORENSIC_DEMO_MODE=false` 전환

## 11. 권한 위임 검증과 CLI 스크립트

이 디렉터리에 바로 실행 가능한 파일을 넣어뒀습니다.

- 정책 템플릿: `OCI_IAM_POLICY_TEMPLATE.md`
- 환경변수 예시: `cli.env.example`
- 접근 검증: `validate-oci-access.sh`
- VM 생성: `launch-always-free-instance.sh`

예시:

```bash
cd deploy/oracle
cp cli.env.example .env.cli
source .env.cli
bash validate-oci-access.sh
```

## 주의사항

- Oracle Always Free는 지역별 수용량 부족이 자주 납니다.
- 장시간 완전 idle이면 reclaim될 수 있습니다.
- YOLO 실운용은 ARM A1에서도 가능하지만, 처리량은 낮습니다.
- 번호판 OCR은 EasyOCR hook/diagnostics까지 연결됐지만 실전 정확도 검증은 진행 중입니다.
- ReID 임베딩 기반 동일 차량 재식별은 아직 미구현입니다.
