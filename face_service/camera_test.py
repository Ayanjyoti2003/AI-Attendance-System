import cv2

cap = cv2.VideoCapture(1)

if not cap.isOpened():
    print("Camera could not be opened")
    exit()

while True:
    ret, frame = cap.read()

    print("Frame captured:", ret)

    if not ret:
        print("Failed to grab frame")
        break

    cv2.imshow("Camera Test", frame)

    if cv2.waitKey(1) == 27:
        break

cap.release()
cv2.destroyAllWindows()
