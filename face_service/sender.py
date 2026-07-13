import requests
import time
import random

BACKEND_URL = "http://127.0.0.1:8000/api/recognition"

while True:
    fake_embedding = [random.random() for _ in range(128)]

    payload = {
        "camera_id": 1,
        "embedding": fake_embedding
    }

    try:
        response = requests.post(BACKEND_URL, json=payload)
        print("Status:", response.status_code)
        print("Response:", response.text)
    except Exception as e:
        print("Error:", e)

    time.sleep(5)
