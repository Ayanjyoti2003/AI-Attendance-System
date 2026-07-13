"""
Embedding generation utility.

Models are lazy-loaded on first use to avoid blocking backend startup
with multi-second model initialization and ~500 MB memory allocation.
"""

# Configure environment (TORCH_HOME) before any torch imports
import backend.runtime

import threading
import torch
import cv2
import numpy as np

device = "cuda" if torch.cuda.is_available() else "cpu"

# Lazy-load models (thread-safe, matching camera_worker.py pattern)
_mtcnn = None
_resnet = None
_models_lock = threading.Lock()


def _get_models():
    """Thread-safe lazy initialization of face models."""
    global _mtcnn, _resnet
    if _mtcnn is None:
        with _models_lock:
            if _mtcnn is None:
                backend.runtime.validate_ai_model()
                from facenet_pytorch import MTCNN, InceptionResnetV1
                _mtcnn = MTCNN(keep_all=False, device=device)
                _resnet = InceptionResnetV1(
                    pretrained="vggface2"
                ).eval().to(device)
    return _mtcnn, _resnet


def generate_embedding(image_path):
    mtcnn, resnet = _get_models()

    img = cv2.imread(image_path)
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    face = mtcnn(rgb)

    if face is None:
        return None

    embedding = resnet(
        face.unsqueeze(0).to(device)
    )

    return embedding.detach()\
        .cpu()\
        .numpy()\
        .squeeze()