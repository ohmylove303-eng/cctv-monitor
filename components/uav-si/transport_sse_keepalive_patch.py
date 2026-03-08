"""
backend/app/transport_sse.py 패치 — keepalive 추가
=================================================
[P0] 30초마다 ": keepalive\n\n" 전송 (연결 유지)
"""
import asyncio
from fastapi import Response
from starlette.responses import StreamingResponse

async def telemetry_stream(...):
    async def event_gen():
        last_keepalive = time.time()

        while not await request.is_disconnected():
            # 1. 텔레메트리 전송
            if queue.qsize() > 0:
                item = queue.get()
                yield f"data: {json.dumps(item)}\n\n"
                last_keepalive = time.time()

            # 2. keepalive (30초 간격)
            elif time.time() - last_keepalive > 30:
                yield ": keepalive\n\n"
                last_keepalive = time.time()

            await asyncio.sleep(0.1)

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # nginx 버퍼링 차단
        },
    )
