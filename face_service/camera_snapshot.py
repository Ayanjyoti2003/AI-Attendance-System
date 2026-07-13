import cv2

cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)

ret, frame = cap.read()

if ret:
    print("Frame captured")
    cv2.imwrite("test_image.jpg", frame)
    print("Image saved as test_image.jpg")
else:
    print("Failed to capture frame")

cap.release()
