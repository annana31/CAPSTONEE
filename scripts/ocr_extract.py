import sys
import json
import re
from PIL import Image

def extract_text(image_path):
    try:
        from surya.detection import batch_text_detection
        from surya.model.detection.model import load_model as load_det_model
        from surya.model.detection.model import load_processor as load_det_processor
        from surya.recognition import batch_recognition
        from surya.model.recognition.model import load_model as load_rec_model
        from surya.model.recognition.processor import load_processor as load_rec_processor
        import torch

        image = Image.open(image_path).convert("RGB")

        # Step 1: Detect text regions
        det_model = load_det_model()
        det_processor = load_det_processor()
        det_results = batch_text_detection([image], det_model, det_processor)

        bboxes = det_results[0].bboxes
        if not bboxes:
            sys.stderr.write("No bboxes detected\n")
            return ""

        # Step 2: Crop each detected region
        cropped_images = []
        for bbox in bboxes:
            x1, y1, x2, y2 = int(bbox.bbox[0]), int(bbox.bbox[1]), int(bbox.bbox[2]), int(bbox.bbox[3])
            cropped = image.crop((x1, y1, x2, y2))
            cropped_images.append(cropped)

        # Step 3: Recognize text in each cropped region
        rec_model = load_rec_model(device="cpu", dtype=torch.float32)
        rec_processor = load_rec_processor()
        langs = [["en"]] * len(cropped_images)
        output_text, _ = batch_recognition(cropped_images, langs, rec_model, rec_processor)

        return "\n".join([t for t in output_text if t.strip()])

    except Exception as e:
        sys.stderr.write(f"Error: {e}\n")
        import traceback
        traceback.print_exc(file=sys.stderr)
        return ""

def parse_name(text):
    first = ""
    last = ""
    middle = ""

    lines = [l.strip() for l in text.split("\n") if l.strip()]

    for i, line in enumerate(lines):
        # Match line that says "Name" then next line has "Last, First1 First2 Middle"
        if line.lower() == "name" and i + 1 < len(lines):
            next_line = lines[i + 1]
            m = re.match(r'^([A-Za-z\'\-]+),\s*(.+)$', next_line)
            if m:
                last = m.group(1).strip()
                rest = m.group(2).strip().split()
                # Last word is middle name, everything before is first name
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

if __name__ == "__main__":
    image_path = sys.argv[1]
    text = extract_text(image_path)
    result = parse_name(text)
    result["raw_text"] = text
    print(json.dumps(result))