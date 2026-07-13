import cv2
import requests
import time

camera_index = 1  # the index that worked for you
BACKEND_URL = "http://127.0.0.1:8000/api/frame"

cap = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)

while True:
    ret, frame = cap.read()

    if not ret:
        print("Failed to capture frame")
        break

    _, buffer = cv2.imencode(".jpg", frame)

    files = {"frame": buffer.tobytes()}

    try:
        response = requests.post(BACKEND_URL, files=files)
        print("Frame sent:", response.status_code)
    except Exception as e:
        print("Error:", e)

    time.sleep(2)
