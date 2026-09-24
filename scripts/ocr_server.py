from flask import Flask, request, jsonify
import torch
import os
import sys
import re
import cv2
import numpy as np
from PIL import Image

app = Flask(__name__)

# ── Load models ONCE at startup — stays in memory ──
print("Loading Surya models... please wait")

from surya.detection import batch_text_detection
from surya.model.detection.model import load_model as load_det_model
from surya.model.detection.model import load_processor as load_det_processor
from surya.recognition import batch_recognition
from surya.model.recognition.model import load_model as load_rec_model
from surya.model.recognition.processor import load_processor as load_rec_processor

det_model = load_det_model()
det_processor = load_det_processor()
rec_model = load_rec_model(device="cpu", dtype=torch.float32)
rec_processor = load_rec_processor()

print("✅ Models loaded and ready on http://127.0.0.1:5001")


# ────────────────────────────────────────────────
# IMAGE PREPROCESSING
# ────────────────────────────────────────────────

def deskew(pil_image):
    """Straighten a crooked/rotated scan."""
    img = np.array(pil_image.convert("L"))
    img_inv = cv2.bitwise_not(img)
    coords = np.column_stack(np.where(img_inv > 0))
    if coords.size == 0:
        return pil_image

    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle

    # Skip tiny/no-op rotations
    if abs(angle) < 0.5:
        return pil_image

    (h, w) = img.shape
    center = (w // 2, h // 2)
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    rotated = cv2.warpAffine(
        np.array(pil_image), M, (w, h),
        flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE
    )
    return Image.fromarray(rotated)


def remove_lines(pil_image):
    """Strip out table/ruling lines common in TOR forms."""
    img = np.array(pil_image.convert("L"))
    thresh = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]

    horizontal = cv2.morphologyEx(
        thresh, cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (40, 1))
    )
    vertical = cv2.morphologyEx(
        thresh, cv2.MORPH_OPEN,
        cv2.getStructuringElement(cv2.MORPH_RECT, (1, 40))
    )

    lines_mask = cv2.add(horizontal, vertical)
    cleaned = cv2.inpaint(
        np.array(pil_image.convert("RGB")), lines_mask, 3, cv2.INPAINT_TELEA
    )
    return Image.fromarray(cleaned)


def enhance_image(pil_image):
    """Denoise and boost contrast for faint/blurry printing."""
    img = np.array(pil_image.convert("L"))
    img = cv2.fastNlMeansDenoising(img, h=15)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    img = clahe.apply(img)
    return Image.fromarray(img).convert("RGB")


def preprocess_image(pil_image):
    """Full preprocessing pipeline before OCR."""
    image = deskew(pil_image)
    image = remove_lines(image)
    image = enhance_image(image)
    return image


# ────────────────────────────────────────────────
# TEXT POST-PROCESSING
# ────────────────────────────────────────────────

def clean_ocr_text(text):
    """Remove stray OCR noise and normalize common misreads."""
    text = re.sub(r'[|_~`^]', '', text)
    text = re.sub(r'[ \t]+', ' ', text)
    # Fix common OCR letter confusions inside name-like tokens
    text = re.sub(r'(?<=[A-Za-z])0(?=[A-Za-z])', 'O', text)
    text = re.sub(r'(?<=[A-Za-z])1(?=[A-Za-z])', 'I', text)
    return text


def is_valid_name_part(s):
    """Reject junk that doesn't look like a real name fragment."""
    return bool(re.fullmatch(r"[A-Za-z'\-\. ]{2,40}", s.strip()))


# ────────────────────────────────────────────────
# OCR EXTRACTION
# ────────────────────────────────────────────────

def extract_text(image_path):
    image = Image.open(image_path).convert("RGB")
    image = preprocess_image(image)

    # Resize large images to speed up inference
    max_size = 1200
    w, h = image.size
    if w > max_size or h > max_size:
        scale = max_size / max(w, h)
        image = image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

    det_results = batch_text_detection([image], det_model, det_processor)
    bboxes = det_results[0].bboxes
    if not bboxes:
        return ""

    cropped_images = []
    for bbox in bboxes:
        x1, y1, x2, y2 = int(bbox.bbox[0]), int(bbox.bbox[1]), int(bbox.bbox[2]), int(bbox.bbox[3])
        cropped_images.append(image.crop((x1, y1, x2, y2)))

    langs = [["en"]] * len(cropped_images)
    output_text, _ = batch_recognition(cropped_images, langs, rec_model, rec_processor)

    return "\n".join([t for t in output_text if t.strip()])


def parse_name(text):
    text = clean_ocr_text(text)

    first = ""
    last = ""
    middle = ""

    lines = [l.strip() for l in text.split("\n") if l.strip()]

    for i, line in enumerate(lines):
        # Match line that says "Name" then next line has "Last, First Middle"
        if line.lower() == "name" and i + 1 < len(lines):
            next_line = lines[i + 1]
            m = re.match(r'^([A-Za-z\'\-]+),\s*(.+)$', next_line)
            if m:
                last = m.group(1).strip()
                rest = m.group(2).strip().split()
                if len(rest) >= 2:
                    middle = rest[-1]
                    first = " ".join(rest[:-1])
                elif len(rest) == 1:
                    first = rest[0]
                    middle = ""
                break

        # Match "Last, First Middle" directly on same line
        m = re.match(r'^([A-Za-z\'\-]+),\s*(.+)$', line)
        if m:
            last = m.group(1).strip()
            rest = m.group(2).strip().split()
            if len(rest) >= 2:
                middle = rest[-1]
                first = " ".join(rest[:-1])
            elif len(rest) == 1:
                first = rest[0]
                middle = ""
            break

    # Validate before returning — reject garbled OCR noise
    if last and not is_valid_name_part(last):
        last = ""
    if first and not is_valid_name_part(first):
        first = ""
    if middle and not is_valid_name_part(middle):
        middle = ""

    return {"first_name": first, "last_name": last, "middle_name": middle}


# ────────────────────────────────────────────────
# ROUTES
# ────────────────────────────────────────────────

@app.route("/ocr", methods=["POST"])
def ocr():
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file provided"}), 400

    file = request.files["file"]
    temp_path = os.path.join(os.path.dirname(__file__), f"temp_{file.filename}")
    file.save(temp_path)

    try:
        text = extract_text(temp_path)

        if not text:
            return jsonify({
                "success": False,
                "message": "No text could be detected in this document",
                "raw_text": ""
            }), 200

        result = parse_name(text)

        if not result["first_name"] and not result["last_name"]:
            return jsonify({
                "success": False,
                "message": "No name detected in document. Please fill in manually.",
                "raw_text": text
            }), 200

        result["success"] = True
        result["raw_text"] = text
        return jsonify(result)

    except Exception as e:
        return jsonify({"success": False, "message": str(e)}), 500
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001, debug=False)