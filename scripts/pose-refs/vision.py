"""Yes / no checks with the local vision LLM (LM Studio, OpenAI-compatible). Answers are cached
by (question, image hash), so a rerun with new thresholds asks nothing twice."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import urllib.request
from pathlib import Path

import cv2
import numpy as np

BASE_URL = os.environ.get("POSE_REFS_VLM_URL", "http://127.0.0.1:1234/v1")
MODEL = os.environ.get("POSE_REFS_VLM_MODEL", "nsfwvision-qwen3-vl-8b-v3")


def _encode(img_bgr: np.ndarray, longest: int = 768) -> bytes:
    h, w = img_bgr.shape[:2]
    scale = min(1.0, longest / max(h, w))
    if scale < 1.0:
        img_bgr = cv2.resize(img_bgr, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    ok, buf = cv2.imencode(".jpg", img_bgr, [cv2.IMWRITE_JPEG_QUALITY, 88])
    assert ok
    return buf.tobytes()


class Vision:
    def __init__(self, cache: Path):
        self.cache = cache
        self.cache.mkdir(parents=True, exist_ok=True)

    def ask(self, img_bgr: np.ndarray, question: str) -> str:
        """'yes' | 'no' | 'unsure' (anything that isn't a clear yes or no)."""
        jpeg = _encode(img_bgr)
        key = hashlib.sha1(jpeg + b"|" + question.encode() + MODEL.encode()).hexdigest()
        path = self.cache / f"{key}.json"
        if path.exists():
            return json.loads(path.read_text())["answer"]
        body = {
            "model": MODEL,
            "temperature": 0,
            "max_tokens": 8,
            "messages": [
                {
                    "role": "system",
                    "content": "You check photos. Reply with exactly one word: yes, no, or unsure.",
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": "data:image/jpeg;base64," + base64.b64encode(jpeg).decode()
                            },
                        },
                        {"type": "text", "text": question + " Answer yes, no, or unsure."},
                    ],
                },
            ],
        }
        request = urllib.request.Request(
            f"{BASE_URL}/chat/completions",
            data=json.dumps(body).encode(),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=180) as response:
            reply = json.loads(response.read())
        text = (reply["choices"][0]["message"].get("content") or "").strip().lower()
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.S).strip()
        word = re.match(r"[a-z]+", text)
        answer = word.group(0) if word and word.group(0) in ("yes", "no") else "unsure"
        path.write_text(json.dumps({"question": question, "raw": text, "answer": answer}))
        return answer
