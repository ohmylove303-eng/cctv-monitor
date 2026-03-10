import cv2
import numpy as np
import asyncio
import subprocess

class HLSFetcher:
    @staticmethod
    async def get_latest_frame_ffmpeg(hls_url: str, timeout: float = 3.0) -> np.ndarray | None:
        """
        OpenCV의 타임아웃 행(Hang) 결함을 우회하기 위해 
        ffmpeg 서브프로세스를 비동기로 호출하여 1 프레임만 강제 추출.
        """
        cmd = [
            # vframes 1: 1프레임만 추출
            # -t 3: 스트림 자체가 무한 대기할 경우 3초 뒤 강제 종료
            "ffmpeg", "-y", "-t", str(timeout), "-i", hls_url,
            "-vframes", "1", "-f", "image2pipe", "-vcodec", "mjpeg", "-"
        ]

        try:
            # ffmpeg 하위 프로세스 비동기 실행
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            # 지정된 타임아웃 내에 파이프 읽기
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout + 1.0)
            
            if process.returncode != 0 or not stdout:
                return None
            
            # 바이트 배열을 OpenCV 매트릭스로 변환
            image_array = np.frombuffer(stdout, dtype=np.uint8)
            frame = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
            return frame
            
        except asyncio.TimeoutError:
            try:
                process.kill()
            except:
                pass
            print(f"[Timeout] HLS Fetcher: {hls_url}")
            return None
        except Exception as e:
            print(f"[Fetcher Error] {e}")
            return None
