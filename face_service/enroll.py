import cv2
import torch
import numpy as np
from facenet_pytorch import MTCNN, InceptionResnetV1
import os

# ===== CONFIG =====
camera_index = 1
person_name = input("Enter employee name: ")

save_path = f"../data/employees/{person_name}.npy"

device = 'cuda' if torch.cuda.is_available() else 'cpu'

mtcnn = MTCNN(keep_all=False, device=device)
resnet = InceptionResnetV1(pretrained='vggface2').eval().to(device)

cap = cv2.VideoCapture(camera_index)

embeddings_list = []

print("[CAMERA] Capturing faces... Look at the camera")

while len(embeddings_list) < 10:
    ret, frame = cap.read()
    if not ret:
        continue

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    face = mtcnn(rgb)

    if face is not None:
        emb = resnet(face.unsqueeze(0).to(device))
        embeddings_list.append(emb.detach().cpu().numpy())

        print(f"Captured {len(embeddings_list)}/10")

    cv2.imshow("Enroll - Press ESC to stop", frame)

    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()

# Save average embedding
final_embedding = np.mean(embeddings_list, axis=0)

os.makedirs("../data/employees", exist_ok=True)
np.save(save_path, final_embedding)

print(f"[SUCCESS] Saved embedding for {person_name}")