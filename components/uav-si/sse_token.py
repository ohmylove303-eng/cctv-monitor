"""
backend/app/sse_token.py — SSE 전용 Short-lived Token (Grace Period 적용)
=========================================================================
보안 원칙:
  1. SSE stream 전용 토큰 (60초 TTL)
  2. Grace Period 10초 — 재발급 네트워크 지연 허용
  3. 오버랩 구간 보장 (기존 스트림 강제 종료 방지)

[L1-A 맹점 보완]:
  문제: 50초 재발급 요청이 네트워크 스파이크로 10초 이상 지연 →
        기존 토큰 exp 초과 → 스트림 강제 종료 → 텔레메트리 유실
  해결: exp 체크 시 GRACE_PERIOD_SEC(10초) 추가 허용
        → 오버랩 구간(60초 TTL + 10초 유예 = 최대 70초 유효)
"""
import time
from datetime import datetime, timedelta
from jose import jwt, JWTError
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from .auth import get_current_user, SECRET_KEY, ALGORITHM

router = APIRouter(prefix="/auth", tags=["auth"])

# ── 상수 ─────────────────────────────────────────────────────
TOKEN_TTL_SEC    = 60   # 토큰 유효 시간
GRACE_PERIOD_SEC = 10   # 만료 후 허용 유예 시간 (L1-A 보완)
REFRESH_BEFORE   = 10   # 만료 N초 전 클라이언트 재발급 트리거


class SSETokenResponse(BaseModel):
    sse_token:     str
    expires_at:    int   # Unix ms
    ttl_sec:       int   # 60
    refresh_after: int   # 50 (50초 후 재발급 권장)


@router.post("/sse-token", response_model=SSETokenResponse)
async def issue_sse_token(user: dict = Depends(get_current_user)):
    """
    SSE stream 전용 단기 토큰 발급 (60초 TTL + 10초 Grace)

    - 클라이언트는 refresh_after(50초) 시점에 재발급 시도
    - 네트워크 지연 시 Grace Period(10초) 내에서 기존 토큰 유효
    - 오버랩 구간: 기존 스트림 유지 + 신규 토큰 발급 동시 진행
    """
    now = datetime.utcnow()
    exp = now + timedelta(seconds=TOKEN_TTL_SEC)

    payload = {
        "sub":  user["sub"],
        "type": "sse_stream",
        "exp":  int(exp.timestamp()),
        "iat":  int(now.timestamp()),
    }
    sse_token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    return SSETokenResponse(
        sse_token=sse_token,
        expires_at=int(exp.timestamp() * 1000),
        ttl_sec=TOKEN_TTL_SEC,
        refresh_after=TOKEN_TTL_SEC - REFRESH_BEFORE,  # 50
    )


def verify_sse_token(token: str) -> dict:
    """
    SSE 토큰 검증 — Grace Period 10초 허용

    [L1-A 핵심 보완]:
      - 표준 jose 검증은 exp 초과 시 즉시 JWTError 발생
      - options={"leeway": GRACE_PERIOD_SEC} 으로 10초 유예
      - 결과: 네트워크 스파이크 상황에서 스트림 유지 보장

    Raises:
        HTTPException 401: Grace Period 초과 시
    """
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"leeway": GRACE_PERIOD_SEC},  # ← L1-A 핵심
        )

        if payload.get("type") != "sse_stream":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
        return payload

    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"SSE token expired (grace period exhausted): {e}",
        )
