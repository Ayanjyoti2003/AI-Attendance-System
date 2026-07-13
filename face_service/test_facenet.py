import cv2
import torch
from facenet_pytorch import MTCNN, InceptionResnetV1

print("Starting script...")

# Device setup
device = 'cuda' if torch.cuda.is_available() else 'cpu'
print("Using device:", device)

# Initialize models
mtcnn = MTCNN(keep_all=True, device=device)
resnet = InceptionResnetV1(pretrained='vggface2').eval().to(device)

print("Models loaded")

# Open camera (try 0 first)
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("[ERROR] Camera not opening")
    exit()

print("[SUCCESS] Camera opened")

while True:
    ret, frame = cap.read()

    if not ret:
        print("[ERROR] Failed to capture frame")
        break

    print("Frame captured")

    # Convert to RGB
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    # Single MTCNN call (optimized)
    faces = mtcnn(rgb)

    if faces is not None:
        print(f"[SUCCESS] Faces detected: {faces.shape[0]}")

        embeddings = resnet(faces.to(device))
        print("Embeddings shape:", embeddings.shape)

    else:
        print("[INFO] No face detected")

    # Show frame
    cv2.imshow("FaceNet Test", frame)

    # Press ESC to exit
    if cv2.waitKey(1) == 27:
        break

# Cleanup
cap.release()
cv2.destroyAllWindows()