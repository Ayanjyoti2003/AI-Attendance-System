import cv2

for i in range(5):
    cap = cv2.VideoCapture(i, cv2.CAP_DSHOW)
    if cap.isOpened():
        ret, frame = cap.read()
        if ret:
            print(f"Camera {i} works")
            cv2.imshow(f"Camera {i}", frame)
            cv2.waitKey(2000)
        cap.release()

cv2.destroyAllWindows()
