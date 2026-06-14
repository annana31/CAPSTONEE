from flask import Flask, request, jsonify
import torch
import os
import sys
import re
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

def extract_text(image_path):
    image = Image.open(image_path).convert("RGB")

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

def extract_text(image_path):
    image = Image.open(image_path).convert("RGB")

    # Resize large images to speed up inference
    max_size = 1200
    w, h = image.size
    if w > max_size or h > max_size:
        scale = max_size / max(w, h)
        image = image.resize((int(w * scale), int(h * scale)), Image.LANCZOS)

def parse_name(text):
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

    return {"first_name": first, "last_name": last, "middle_name": middle}

@app.route("/ocr", methods=["POST"])
def ocr():
    if "file" not in request.files:
        return jsonify({"success": False, "message": "No file provided"}), 400

    file = request.files["file"]
    temp_path = os.path.join(os.path.dirname(__file__), f"temp_{file.filename}")
    file.save(temp_path)

    try:
        text = extract_text(temp_path)
        result = parse_name(text)
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