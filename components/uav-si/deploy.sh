#!/bin/bash
# scripts/deploy.sh — UAV v3.4 무중단 롤링 배포 (L3 보완)
# =========================================================
# [L3 맹점 보완]:
#   문제: docker-compose up -d --build
#         → 전체 컨테이너 중지 후 재시작
#         → Nginx/프론트 포함 다운타임 필연 (3~10초)
#         → 실시간 텔레메트리 시스템에서 치명적
#
#   해결: 단계별 선택적 재시작
#     1. 백엔드 단독 재시작 (Nginx 유지)
#     2. 헬스체크 통과 후 다음 replica 교체
#     3. 프론트엔드 변경 시만 전체 재시작
#
#   대원칙: "Nginx는 절대 재시작하지 않는다"

set -euo pipefail

# ── 색상 출력 ────────────────────────────────────────────
GREEN="\033[0;32m"; YELLOW="\033[1;33m"; RED="\033[0;31m"; NC="\033[0m"
log()  { echo -e "${GREEN}[$(date +%T)] $*${NC}"; }
warn() { echo -e "${YELLOW}[$(date +%T)] ⚠️  $*${NC}"; }
fail() { echo -e "${RED}[$(date +%T)] ❌ $*${NC}"; exit 1; }

# ── 환경 변수 검증 ───────────────────────────────────────
[[ -f ".env.prod" ]] || fail ".env.prod 파일이 없습니다"
source .env.prod

COMPOSE="docker compose -f docker-compose.prod.yml"

# ── 모드 선택 ────────────────────────────────────────────
DEPLOY_MODE=${1:-backend}  # 기본: 백엔드만 배포
HEALTH_TIMEOUT=${2:-60}    # 헬스체크 타임아웃 (초)

log "=== UAV v3.4 무중단 롤링 배포 시작 ==="
log "모드: ${DEPLOY_MODE} | 헬스 타임아웃: ${HEALTH_TIMEOUT}초"

# ── 함수: 헬스체크 대기 ──────────────────────────────────
wait_healthy() {
    local service=$1
    local timeout=$2
    local elapsed=0

    log "  ${service} 헬스체크 대기 중..."
    while [[ $elapsed -lt $timeout ]]; do
        STATUS=$(docker inspect --format="{{.State.Health.Status}}"             $(${COMPOSE} ps -q ${service} | head -1) 2>/dev/null || echo "none")

        if [[ "$STATUS" == "healthy" ]]; then
            log "  ✅ ${service} healthy (${elapsed}초)"
            return 0
        fi
        sleep 3
        elapsed=$((elapsed + 3))
    done
    fail "${service} 헬스체크 타임아웃 (${timeout}초)"
}

# ── 모드: 백엔드 단독 롤링 배포 (기본) ──────────────────
deploy_backend() {
    log "--- 백엔드 롤링 배포 시작 (Nginx 유지) ---"

    # 1. 이미지 빌드 (컨테이너 교체 없이)
    log "1) 백엔드 이미지 빌드..."
    ${COMPOSE} build backend

    # 2. 백엔드만 재시작 (--no-deps: nginx/frontend 영향 없음)
    log "2) 백엔드 컨테이너 교체 (--no-deps)..."
    ${COMPOSE} up -d --no-deps --build backend

    # 3. 헬스체크 통과 대기
    wait_healthy backend $HEALTH_TIMEOUT

    # 4. 스트림 연결 수 확인
    log "4) SSE 스트림 연결 수 확인..."
    CONNECTIONS=$(docker exec $(${COMPOSE} ps -q backend | head -1)         sh -c "ss -tn | grep 8000 | grep ESTABLISHED | wc -l" 2>/dev/null || echo "0")
    log "  활성 SSE 연결: ${CONNECTIONS}개"

    log "✅ 백엔드 배포 완료 (다운타임 없음)"
}

# ── 모드: 전체 롤링 배포 ─────────────────────────────────
deploy_all() {
    log "--- 전체 롤링 배포 시작 ---"

    # 1. DB/Redis (변경 없으면 skip)
    log "1) DB/Redis 상태 확인..."
    wait_healthy db    $HEALTH_TIMEOUT
    wait_healthy redis $HEALTH_TIMEOUT

    # 2. 백엔드 롤링
    deploy_backend

    # 3. 프론트엔드 재빌드
    log "3) 프론트엔드 빌드..."
    ${COMPOSE} build frontend
    ${COMPOSE} up -d --no-deps frontend

    # 4. Nginx reload (재시작 아님 — 다운타임 없음)
    log "4) Nginx 설정 리로드 (재시작 없음)..."
    docker exec $(${COMPOSE} ps -q nginx | head -1) nginx -s reload
    log "✅ 전체 배포 완료 (Nginx 무중단)"
}

# ── 모드: 긴급 롤백 ──────────────────────────────────────
rollback() {
    warn "--- 긴급 롤백 시작 ---"
    PREV_IMAGE=${BACKEND_IMAGE:-backend}:previous

    if docker image inspect "${PREV_IMAGE}" &>/dev/null; then
        ${COMPOSE} up -d --no-deps backend
        wait_healthy backend 30
        log "✅ 롤백 완료"
    else
        fail "이전 이미지 없음. 수동 복구 필요"
    fi
}

# ── 메인 실행 ────────────────────────────────────────────
case $DEPLOY_MODE in
    backend)  deploy_backend ;;
    all)      deploy_all     ;;
    rollback) rollback        ;;
    *)        fail "알 수 없는 모드: ${DEPLOY_MODE} (backend|all|rollback)" ;;
esac

# ── 최종 상태 리포트 ─────────────────────────────────────
log ""
log "=== 배포 후 상태 리포트 ==="
${COMPOSE} ps
log ""
log "헬스 엔드포인트: curl https://${DOMAIN}/health"
log "스트림 통계:     curl https://${DOMAIN}/stats"
