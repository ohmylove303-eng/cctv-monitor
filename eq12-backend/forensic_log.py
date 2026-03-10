import json
import hashlib
import os
from datetime import datetime
import cv2

class ForensicLogger:
    def __init__(self):
        os.makedirs("logs", exist_ok=True)
        os.makedirs("logs/frames", exist_ok=True)
        os.makedirs("logs/tracking", exist_ok=True)

    def save(self, cctv_id: str, result: dict, frame) -> dict:
        timestamp = datetime.now().isoformat()
        
        # 무결성 해시
        frame_bytes = cv2.imencode('.jpg', frame)[1].tobytes()
        frame_hash = hashlib.sha256(frame_bytes).hexdigest()
        
        frame_path = f"logs/frames/{cctv_id}_{timestamp[:19].replace(':','-')}.jpg"
        cv2.imwrite(frame_path, frame)

        log = {
            "cctv_id": cctv_id,
            "timestamp": timestamp,
            "hash": frame_hash[:16],
            "frame_path": frame_path,
            "result": result
        }
        
        log_path = f"logs/{cctv_id}_{timestamp[:10]}.json"
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(log, ensure_ascii=False) + "\n")
        
        return log

    def save_tracking(self, tracking_id: str, plate: str, color: str, sightings: list):
        result = {
            "tracking_id": tracking_id,
            "target_plate": plate,
            "target_color": color,
            "total_sightings": len(sightings),
            "sightings": sightings,
            "created_at": datetime.now().isoformat()
        }
        path = f"logs/tracking/{tracking_id}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

    def get_tracking(self, tracking_id: str) -> dict:
        path = f"logs/tracking/{tracking_id}.json"
        if not os.path.exists(path):
            return {"status": "pending", "tracking_id": tracking_id}
        with open(path, encoding="utf-8") as f:
            return json.load(f)
