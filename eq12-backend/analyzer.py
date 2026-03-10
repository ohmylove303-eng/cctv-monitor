import cv2
import numpy as np
from ultralytics import YOLO
import easyocr
import asyncio

class CCTVAnalyzer:
    def __init__(self):
        # 1. N100 최적화 모델 로드
        self.model = YOLO("yolov8n.pt")
        self.model_name = "yolov8n (S-Loop)"
        self.reader = easyocr.Reader(['ko', 'en'], gpu=False)
        
        # 관심 객체 필터 (car, bus, truck, motorcycle)
        self.vehicle_classes = {2: "car", 5: "bus", 7: "truck", 3: "motorcycle"}

    async def analyze(self, frame: np.ndarray, target_plate=None, target_color=None) -> dict:
        """단일 프레임 비동기 분석 (OCR 병목 방어)"""
        # YOLO 추론 (블로킹이긴 하나 nano라 짧음)
        results = await asyncio.to_thread(self.model, frame, conf=0.4, verbose=False)
        results = results[0]
        
        vehicles = []
        matched = False

        for box in results.boxes:
            cls_id = int(box.cls[0])
            if cls_id not in self.vehicle_classes:
                continue

            x1, y1, x2, y2 = map(int, box.xyxy[0])
            confidence = float(box.conf[0])
            vehicle_type = self.vehicle_classes[cls_id]

            # 가로 60픽셀 이하인 차량은 번호판 인식 불가능 -> OCR 연산 스킵 (CPU 보호)
            crop = frame[y1:y2, x1:x2]
            width = x2 - x1
            
            plate = ""
            if width > 60:
                plate = await asyncio.to_thread(self._detect_plate, crop)

            color = await asyncio.to_thread(self._detect_color, crop)

            vehicle_info = {
                "type": vehicle_type,
                "confidence": round(confidence, 2),
                "color": color,
                "plate": plate,
                "bbox": [x1, y1, x2, y2]
            }
            vehicles.append(vehicle_info)

            # 매칭 로직
            if target_plate and plate:
                if target_plate.replace(" ", "") in plate.replace(" ", ""):
                    vehicle_info["is_target"] = True
                    matched = True

            if target_color and color:
                if target_color.lower() in color.lower():
                    vehicle_info["color_match"] = True

        return {"vehicles": vehicles, "matched": matched}

    def _detect_plate(self, crop: np.ndarray) -> str:
        try:
            if crop.size == 0: return ""
            h = crop.shape[0]
            plate_region = crop[int(h*0.6):, :]
            results = self.reader.readtext(plate_region, detail=0)
            text = " ".join(results).strip()
            return text[:10]
        except:
            return ""

    def _detect_color(self, crop: np.ndarray) -> str:
        try:
            if crop.size == 0: return "unknown"
            hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
            color_ranges = {
                "white":  ([0, 0, 200], [180, 40, 255]),
                "black":  ([0, 0, 0],   [180, 255, 60]),
            }
            detected = "unknown"
            max_cnt = 0
            for name, (l, u) in color_ranges.items():
                m = cv2.inRange(hsv, np.array(l), np.array(u))
                c = cv2.countNonZero(m)
                if c > max_cnt:
                    max_cnt = c
                    detected = name
            return detected
        except:
            return "unknown"

    async def track_across_cctvs_parallel(self, tracking_id: str, plate: str, color: str, cctv_list: list):
        """다중 CCTV 동시 병렬 추적 큐 (Timeout 해결)"""
        from forensic_log import ForensicLogger
        from hls_fetcher import HLSFetcher
        logger = ForensicLogger()
        logger.save_tracking(tracking_id, plate, color, []) # Init pending state
        
        async def fetch_and_analyze(cctv):
            frame = await HLSFetcher.get_latest_frame_ffmpeg(cctv["hls_url"], timeout=3.0)
            if frame is None: return None
            res = await self.analyze(frame, plate, color)
            if res["matched"]:
                from datetime import datetime
                return {"cctv_id": cctv["id"], "timestamp": datetime.now().isoformat(), "vehicles": res["vehicles"]}
            return None

        # Gather all CCTV tasks in PARALLEL limit concurrent to 4 for N100 CPU safe boundary
        sightings = []
        sem = asyncio.Semaphore(4)
        
        async def sem_task(cctv):
            async with sem:
                return await fetch_and_analyze(cctv)
                
        tasks = [sem_task(c) for c in cctv_list]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for r in results:
            if r and not isinstance(r, Exception):
                sightings.append(r)
                
        logger.save_tracking(tracking_id, plate, color, sightings)
