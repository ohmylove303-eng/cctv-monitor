"""
backend/app/sse_token.py — SSE 전용 Short-lived Token 발급
==========================================================
보안 원칙:
  1. SSE stream 전용 토큰 (60초 TTL)
  2. query string 노출 최소화 (단일 목적 토큰)
  3. 자동 재발급 클라이언트 지원
"""
import time
from datetime import datetime, timedelta
from typing import Optional
from jose import jwt, JWTError
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from .auth import get_current_user, SECRET_KEY, ALGORITHM

router = APIRouter(prefix="/auth", tags=["auth"])


class SSETokenResponse(BaseModel):
    sse_token:  str
    expires_at: int      # Unix timestamp (ms)
    ttl_sec:    int      # 60초


@router.post("/sse-token", response_model=SSETokenResponse)
async def issue_sse_token(user: dict = Depends(get_current_user)):
    """
    SSE stream 전용 단기 토큰 발급 (60초 TTL)

    용도:
      - EventSource URL query string에 포함
      - 로그/프록시 노출 최소화 (짧은 TTL)
      - 자동 재발급 플로우 지원

    Returns:
      sse_token:  JWT (exp=60초 후)
      expires_at: 만료 시각 (Unix ms)
      ttl_sec:    60
    """
    now = datetime.utcnow()
    exp = now + timedelta(seconds=60)

    payload = {
        "sub":  user["sub"],
        "type": "sse_stream",    # 토큰 타입 명시
        "exp":  int(exp.timestamp()),
        "iat":  int(now.timestamp()),
    }

    sse_token = jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

    return SSETokenResponse(
        sse_token=sse_token,
        expires_at=int(exp.timestamp() * 1000),  # ms
        ttl_sec=60,
    )


def verify_sse_token(token: str) -> dict:
    """
    SSE 토큰 검증 (query string에서 수신)

    Raises:
        HTTPException: 만료/무효 시 401
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

        # 토큰 타입 확인
        if payload.get("type") != "sse_stream":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type (not sse_stream)",
            )

        # 만료 확인 (jose가 자동 처리하나 명시적 체크)
        exp = payload.get("exp")
        if exp and time.time() > exp:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="SSE token expired",
            )

        return payload

    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid SSE token: {str(e)}",
        )
