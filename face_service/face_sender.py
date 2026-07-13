import cv2
import requests
import time

camera_index = 1  # your working camera index
BACKEND_URL = "http://127.0.0.1:8000/api/frame"

cap = cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)

face_detector = cv2.CascadeClassifier(
    "haarcascade_frontalface_default.xml"
)

while True:
    ret, frame = cap.read()

    if not ret:
        print("Failed to capture frame")
        break

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

    faces = face_detector.detectMultiScale(
        gray,
        scaleFactor=1.3,
        minNeighbors=5
    )

    for (x, y, w, h) in faces:

        face_img = frame[y:y+h, x:x+w]

        _, buffer = cv2.imencode(".jpg", face_img)

        files = {"frame": buffer.tobytes()}

        try:
            response = requests.post(BACKEND_URL, files=files)
            print("Face sent:", response.status_code)
        except Exception as e:
            print("Error:", e)

    time.sleep(2)
