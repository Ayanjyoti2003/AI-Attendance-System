import cv2
import torch
import numpy as np
import os
import requests
from datetime import datetime
from facenet_pytorch import MTCNN, InceptionResnetV1

CAMERA_ID = int(os.getenv("CAMERA_ID", "1"))


def cosine_distance(a, b):
    a = np.squeeze(a)
    b = np.squeeze(b)
    return 1 - (np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))
# CONFIG
camera_index = 1
THRESHOLD = 0.6  # lower = stricter

device = 'cuda' if torch.cuda.is_available() else 'cpu'

mtcnn = MTCNN(keep_all=False, device=device)
resnet = InceptionResnetV1(pretrained='vggface2').eval().to(device)

# Load known embeddings
known_embeddings = {}
data_path = "data/employees"

for file in os.listdir(data_path):
    if file.endswith(".npy"):
        name = file.replace(".npy", "")
        emb = np.load(os.path.join(data_path, file))
        known_embeddings[name] = emb.squeeze()

print("Loaded employees:", list(known_embeddings.keys()))

cap = cv2.VideoCapture(camera_index)

while True:
    ret, frame = cap.read()
    if not ret:
        continue

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    face = mtcnn(rgb)

    if face is not None:
        emb = resnet(face.unsqueeze(0).to(device))
        emb = emb.detach().cpu().numpy().squeeze()

        best_match = None
        best_score = 1.0

        for name, known_emb in known_embeddings.items():
            score = cosine_distance(emb, known_emb)

            if score < best_score:
                best_score = score
                best_match = name

        if best_score < THRESHOLD:
            print(f"[SUCCESS] Recognized: {best_match} ({best_score:.2f})")

            payload = {
                "name": best_match,
                "timestamp": datetime.now().isoformat(),
                "camera_id": CAMERA_ID
            }

            try:
                # Note: We should verify the port/URL
                response = requests.post(
                    "http://127.0.0.1:8000/api/attendance",
                    json=payload
                )
                print("[SEND] Sent to backend:", response.json())
            except Exception as e:
                print("[ERROR] Failed to send:", e)

            break
        else:
            print("[INFO] Unknown face")

    cv2.imshow("Recognition", frame)

    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()