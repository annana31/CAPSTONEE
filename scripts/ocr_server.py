import os
import re
import json
import traceback
import time
import tempfile
from difflib import SequenceMatcher
from pathlib import Path

import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from paddleocr import PaddleOCR
from document_classifier import (
    classify_document_type,
    get_document_types,
    SUPABASE_URL,
    SUPABASE_KEY,
)

app = Flask(__name__)
CORS(app)


@app.route("/classifier-status", methods=["GET"])
def classifier_status():
    docs = get_document_types()
    return jsonify(
        {
            "credentials_found": bool(SUPABASE_URL and SUPABASE_KEY),
            "documents_loaded": len(docs),
            "documents": [
                {"id": d["document_id"], "name": d["document_name"]}
                for d in docs
            ],
        }
    )


OCR_ENABLE_MKLDNN = os.environ.get("OCR_ENABLE_MKLDNN", "1") == "1"

try:
    OCR_CPU_THREADS = max(
        1,
        int(os.environ.get("OCR_CPU_THREADS", min(4, os.cpu_count() or 4)))
    )
except Exception:
    OCR_CPU_THREADS = 4

OCR_MAX_SIZE = int(os.environ.get("OCR_MAX_SIZE", "2200"))

OCR_TEXTLINE_ORIENTATION = (
    os.environ.get("OCR_TEXTLINE_ORIENTATION", "0") == "1"
)


# ============================================================
# PADDLEOCR
# ============================================================

OCR_DET_MODEL = os.environ.get("OCR_DET_MODEL", "PP-OCRv5_mobile_det")
OCR_REC_MODEL = os.environ.get("OCR_REC_MODEL", "PP-OCRv5_mobile_rec")
OCR_DOC_ORIENTATION = os.environ.get("OCR_DOC_ORIENTATION", "0") == "1"

_COMMON_ENGINE_KWARGS = dict(
    text_detection_model_name=OCR_DET_MODEL,
    text_recognition_model_name=OCR_REC_MODEL,
    device="cpu",
    use_doc_orientation_classify=OCR_DOC_ORIENTATION,
    use_doc_unwarping=False,
    use_textline_orientation=OCR_TEXTLINE_ORIENTATION,
    lang="en",
)


def _build_ocr_engine():
    attempts = [
        {
            **_COMMON_ENGINE_KWARGS,
            "enable_mkldnn": OCR_ENABLE_MKLDNN,
            "cpu_threads": OCR_CPU_THREADS,
        },
        {
            **_COMMON_ENGINE_KWARGS,
        },
        {
            "device": "cpu",
            "lang": "en",
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": False,
        },
    ]

    last_error = None

    for kwargs in attempts:
        try:
            print("[OCR] Initializing PaddleOCR...")
            engine = PaddleOCR(**kwargs)

            print("[OCR] PaddleOCR initialized successfully.")

            return engine

        except Exception as exc:
            last_error = exc

            print("[OCR] Initialization failed:")
            print(str(exc))

    raise RuntimeError(
        "Could not initialize PaddleOCR: "
        f"{last_error}"
    )


ocr_engine = _build_ocr_engine()


# ============================================================
# BASIC TEXT FUNCTIONS
# ============================================================

def clean_text(text):
    if text is None:
        return ""

    text = str(text)

    text = (
        text
        .replace("\n", " ")
        .replace("\r", " ")
        .replace("\t", " ")
    )

    text = re.sub(r"\s+", " ", text)

    return text.strip()


NON_NAME_FIELD_PATTERNS = [
    r"\bDATE\s+OF\s+BIRTH\b",
    r"\bPLACE\s+OF\s+BIRTH\b",
    r"\bSEX\b",
    r"\bCITIZENSHIP\b",
    r"\bRELIGION\b",
    r"\bOCCUPATION\b",
    r"\bRESIDENCE\b",
    r"\bHOSPITAL\b",
    r"\bCLINIC\b",
    r"\bINSTITUTION\b",
    r"\bCITY\s*/?\s*MUNICIPALITY\b",
    r"\bPROVINCE\b",
    r"\bFIRST\b",
    r"\bMIDDLE\b",
    r"\bLAST\b",
    r"\bNAME\s+IN\s+PRINT\b",
    r"\bSIGNATURE\b",
]


def is_non_name_field_text(value):
    text = clean_text(value or "").strip()

    if not text:
        return True

    # Normalize the text so OCR variations such as
    # "DATEOF BIRTH", "DATE OF BIRTH", and "3.DATEOF BIRTH"
    # are recognized as form labels.
    normalized = re.sub(r"[^A-Z]", "", text.upper())

    forbidden_labels = {
        "DATE",
        "DATEOFBIRTH",
        "PLACEOFBIRTH",
        "SEX",
        "MALE",
        "FEMALE",
        "CITIZENSHIP",
        "RELIGION",
        "OCCUPATION",
        "RESIDENCE",
        "HOSPITAL",
        "CLINIC",
        "INSTITUTION",
        "PROVINCE",
        "FIRST",
        "MIDDLE",
        "LAST",
        "SURNAME",
        "NAMEINPRINT",
        "SIGNATURE",
        "MONTH",
        "YEAR",
        "DAY",
    }

    if normalized in forbidden_labels:
        return True

    # Catch labels containing additional OCR-detected numbering,
    # punctuation, or combined words.
    forbidden_phrases = (
        "DATEOFBIRTH",
        "PLACEOFBIRTH",
        "NAMEINPRINT",
        "CITIZENSHIP",
        "OCCUPATION",
        "RESIDENCE",
        "HOSPITAL",
        "INSTITUTION",
        "SIGNATURE",
    )

    if any(phrase in normalized for phrase in forbidden_phrases):
        return True

    # Keep the existing form-label patterns as an additional check.
    for pattern in NON_NAME_FIELD_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            return True

    return False




def normalize_text(text):
    text = clean_text(text).upper()

    text = re.sub(r"[^A-Z0-9 ]", " ", text)

    text = re.sub(r"\s+", " ", text)

    return text.strip()


def clean_name(text):
    text = clean_text(text)

    text = re.sub(r"[^A-Za-zÀ-ÖØ-öø-ÿ' -]", " ", text)

    text = re.sub(r"\s+", " ", text)

    return text.strip()


# ============================================================
# GEOMETRY
# ============================================================

def polygon_to_box(polygon):
    try:
        arr = np.asarray(polygon, dtype=float)

        if arr.ndim == 2 and arr.shape[1] >= 2:
            return (
                float(np.min(arr[:, 0])),
                float(np.min(arr[:, 1])),
                float(np.max(arr[:, 0])),
                float(np.max(arr[:, 1]))
            )

    except Exception:
        pass

    return None


def box_center(box):
    return (
        (box[0] + box[2]) / 2.0,
        (box[1] + box[3]) / 2.0
    )


def box_width(box):
    return max(0.0, box[2] - box[0])


def box_height(box):
    return max(0.0, box[3] - box[1])


def horizontal_overlap(a, b):
    left = max(a[0], b[0])
    right = min(a[2], b[2])

    return max(0.0, right - left)


def vertical_overlap(a, b):
    top = max(a[1], b[1])
    bottom = min(a[3], b[3])

    return max(0.0, bottom - top)


# ============================================================
# IMAGE PREPARATION
# ============================================================

def resize_document(image):
    if image is None:
        return image

    h, w = image.shape[:2]

    largest = max(h, w)

    if largest <= OCR_MAX_SIZE:
        return image

    scale = OCR_MAX_SIZE / float(largest)

    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))

    return cv2.resize(
        image,
        (new_w, new_h),
        interpolation=cv2.INTER_AREA
    )


def deskew_document(image):
    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        _, threshold = cv2.threshold(
            gray,
            0,
            255,
            cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
        )

        coords = np.column_stack(np.where(threshold > 0))

        if len(coords) < 200:
            return image

        angle = cv2.minAreaRect(coords)[-1]

# Normalize to (-45, 45] for all OpenCV versions
        if angle > 45:
            angle -= 90
        elif angle < -45:
            angle += 90
        angle = -angle   # rotate opposite to the detected skew

        # Never make a large rotation guess.
        if abs(angle) > 2.5:
            return image

        h, w = image.shape[:2]

        matrix = cv2.getRotationMatrix2D(
            (w // 2, h // 2),
            angle,
            1.0
        )

        return cv2.warpAffine(
            image,
            matrix,
            (w, h),
            flags=cv2.INTER_CUBIC,
            borderMode=cv2.BORDER_REPLICATE
        )

    except Exception:
        return image


def prepare_image(image):
    image = resize_document(image)

    image = deskew_document(image)

    return image





# ============================================================
# OCR RESULT PARSING
# ============================================================

def safe_get(obj, key, default=None):
    """
    Safely retrieve a value from:
    - dict
    - PaddleOCR Result object
    - objects exposing a json property
    """
    if obj is None:
        return default

    # Dictionary
    if isinstance(obj, dict):
        return obj.get(key, default)

    # Normal object attribute
    try:
        value = getattr(obj, key)
        return value
    except Exception:
        pass

    return default


def parse_ocr_result(result):
    """Parse PaddleOCR 3.x output across dict, JSON-string, list and iterator forms."""
    items = []

    if result is None:
        print("[OCR PARSER] ERROR: PaddleOCR returned None.")
        return items

    print("[OCR PARSER] Incoming result type:", type(result).__name__)

    # PaddleOCR 3.x Result objects expose a `.json` property. Depending on
    # package/model versions it may be a dictionary OR a JSON-encoded string.
    json_result = None
    try:
        json_result = result.json
    except Exception:
        json_result = None

    if json_result is not None:
        if isinstance(json_result, str):
            try:
                json_result = json.loads(json_result)
                print("[OCR PARSER] Decoded result.json string.")
            except Exception as exc:
                print("[OCR PARSER] Could not decode result.json:", exc)
        if isinstance(json_result, dict):
            result = json_result

    # Some Paddle versions return an iterator/generator from predict().
    if not isinstance(result, (dict, list, tuple, str, bytes)):
        if not hasattr(result, "json"):
            try:
                result = list(result)
            except (TypeError, Exception):
                pass

    if isinstance(result, (list, tuple)):
        print("[OCR PARSER] Result sequence length:", len(result))
        for element in result:
            items.extend(parse_ocr_result(element))
        return items

    if isinstance(result, str):
        try:
            result = json.loads(result)
        except Exception:
            print("[OCR PARSER] Result was text but not valid JSON.")
            return items

    if not isinstance(result, dict):
        # A result object may expose arrays as attributes even if `.json` failed.
        for key in ("rec_texts", "rec_scores", "rec_polys", "rec_boxes"):
            if safe_get(result, key) is not None:
                break
        else:
            print("[OCR PARSER] Unsupported result structure:", type(result).__name__)
            return items

    # Unwrap PaddleX/PaddleOCR's common {"res": {...}} envelope.
    if isinstance(result, dict) and isinstance(result.get("res"), dict):
        result = result["res"]

    rec_texts = safe_get(result, "rec_texts")
    rec_scores = safe_get(result, "rec_scores")
    rec_polys = safe_get(result, "rec_polys")
    if rec_polys is None:
        rec_polys = safe_get(result, "dt_polys")
    rec_boxes = safe_get(result, "rec_boxes")

    if rec_texts is None:
        print("[OCR PARSER] ERROR: rec_texts missing. Available keys:",
              list(result.keys()) if isinstance(result, dict) else "object attributes")
        return items

    try:
        texts = list(rec_texts)
    except Exception:
        texts = []
    try:
        scores = list(rec_scores) if rec_scores is not None else []
    except Exception:
        scores = []
    try:
        polygons = list(rec_polys) if rec_polys is not None else []
    except Exception:
        polygons = []
    try:
        boxes = list(rec_boxes) if rec_boxes is not None else []
    except Exception:
        boxes = []

    print(f"[OCR PARSER] Arrays: texts={len(texts)}, scores={len(scores)}, "
          f"polys={len(polygons)}, boxes={len(boxes)}")

    for i, raw_text in enumerate(texts):
        text = clean_text(raw_text)
        if not text:
            continue

        try:
            score = float(scores[i]) if i < len(scores) else 0.0
        except (TypeError, ValueError):
            score = 0.0

        box = None
        if i < len(polygons):
            try:
                box = polygon_to_box(polygons[i])
            except Exception:
                box = None
        if box is None and i < len(boxes):
            try:
                raw_box = np.asarray(boxes[i], dtype=float).flatten()
                if len(raw_box) >= 4:
                    box = tuple(float(v) for v in raw_box[:4])
            except Exception:
                box = None

        items.append({"text": text, "score": score, "box": box})

    print(f"[OCR PARSER] Parsed {len(items)} usable text detections.")
    if items:
        print("[OCR PARSER] First detections:", " | ".join(i["text"] for i in items[:12]))
    return items


# ============================================================
# ADDITIONAL OCR: IMAGE ENHANCEMENT
# ============================================================

def enhance_image_for_ocr(image):
    """
    Create an enhanced image to help OCR read faded,
    low-contrast, or slightly blurry text.

    The original image is not modified.
    """

    if image is None or image.size == 0:
        return image

    try:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)

        # Improve local contrast, especially for faded text.
        clahe = cv2.createCLAHE(
            clipLimit=2.0,
            tileGridSize=(8, 8)
        )

        enhanced_gray = clahe.apply(gray)

        # Mild denoising to reduce scan noise.
        denoised = cv2.fastNlMeansDenoising(
            enhanced_gray,
            None,
            h=8,
            templateWindowSize=7,
            searchWindowSize=21
        )

        # Mild sharpening to make text edges clearer.
        blurred = cv2.GaussianBlur(denoised, (0, 0), 1.0)

        sharpened = cv2.addWeighted(
            denoised,
            1.5,
            blurred,
            -0.5,
            0
        )

        # PaddleOCR expects a 3-channel image in this pipeline.
        return cv2.cvtColor(sharpened, cv2.COLOR_GRAY2BGR)

    except Exception as exc:
        print("[OCR ENHANCEMENT] Failed:", str(exc))

        # Fall back to the original image.
        return image


# ============================================================
# ADDITIONAL OCR: UPPER SECTION (name + document header)
# ============================================================

def crop_upper_name_section(image):
    """
    Return the upper 65% of the document.

    This gives OCR another opportunity to read the owner's name
    and the document header. The original full-document OCR is
    still retained.
    """

    if image is None or image.size == 0:
        return None, 0

    height, width = image.shape[:2]

    crop_bottom = int(height * 0.65)

    crop_bottom = max(1, min(crop_bottom, height))

    upper_crop = image[0:crop_bottom, 0:width].copy()

    return upper_crop, 0


def shift_ocr_items(items, x_offset=0, y_offset=0):
    """
    Convert crop-relative OCR boxes into full-document
    coordinates.
    """

    shifted_items = []

    for item in items:
        new_item = dict(item)

        box = item.get("box")

        if box is not None:
            new_item["box"] = (
                float(box[0]) + x_offset,
                float(box[1]) + y_offset,
                float(box[2]) + x_offset,
                float(box[3]) + y_offset
            )

        shifted_items.append(new_item)

    return shifted_items


def merge_ocr_items(original_items, additional_items):
    """
    Combine OCR results while avoiding duplicate detections
    of the same text in nearly identical locations.

    The original full-document OCR detections are kept.
    """

    merged = list(original_items)

    for candidate in additional_items:
        candidate_text = normalize_text(candidate.get("text", ""))

        candidate_box = candidate.get("box")

        if not candidate_text or candidate_box is None:
            continue

        duplicate_found = False

        for existing in merged:
            existing_text = normalize_text(existing.get("text", ""))

            existing_box = existing.get("box")

            if existing_box is None:
                continue

            # Same text is not enough by itself:
            # it must also be in approximately the same area.
            if candidate_text != existing_text:
                continue

            center_a = box_center(candidate_box)
            center_b = box_center(existing_box)

            distance = (
                abs(center_a[0] - center_b[0])
                + abs(center_a[1] - center_b[1])
            )

            max_height = max(
                1.0,
                box_height(candidate_box),
                box_height(existing_box)
            )

            if distance <= max_height * 1.5:
                duplicate_found = True

                # Keep whichever detection has higher confidence.
                if float(candidate.get("score", 0)) > float(
                    existing.get("score", 0)
                ):
                    existing["score"] = candidate.get("score", 0)

                break

        if not duplicate_found:
            merged.append(candidate)

    return merged


def run_upper_name_ocr(image):
    """
    Optional fallback pass: OCR only the upper part of the document.
    Called only if the full-page OCR did not identify first and last name.
    Uses the original crop and performs exactly one inference.
    """
    if image is None or image.size == 0:
        return []

    upper_crop, y_offset = crop_upper_name_section(image)
    if upper_crop is None or upper_crop.size == 0:
        return []

    print(
        f"[UPPER OCR] Fallback crop: {upper_crop.shape[1]} x "
        f"{upper_crop.shape[0]}"
    )
    items = run_ocr(upper_crop)
    return shift_ocr_items(items, x_offset=0, y_offset=y_offset)


# ============================================================
# OCR RUNNER
# ============================================================

# ============================================================
# OCR RUNNER
# ============================================================

def run_ocr(image):
    if image is None or image.size == 0:
        print("[OCR] Empty image received.")
        return []

    try:
        print("[OCR] Running PaddleOCR prediction...")

        result = ocr_engine.predict(image)

        print("[OCR] PaddleOCR prediction completed.")

        items = parse_ocr_result(result)

        print(
            f"[OCR] Parsed {len(items)} text detections."
        )

        return items

    except AttributeError as exc:
        print(
            "[OCR] PaddleOCR predict() unavailable. "
            "Trying legacy .ocr() API."
        )
        print("[OCR] AttributeError:", str(exc))

        try:
            result = ocr_engine.ocr(
                image,
                cls=OCR_TEXTLINE_ORIENTATION
            )

            items = parse_ocr_result(result)

            print(
                f"[OCR] Legacy API parsed "
                f"{len(items)} text detections."
            )

            return items

        except Exception as legacy_exc:
            print(
                "[OCR] Legacy OCR failed:",
                str(legacy_exc)
            )
            return []

    except Exception as exc:
        print("")
        print("================================================")
        print("[OCR] PREDICTION ERROR")
        print("================================================")
        print(str(exc))
        traceback.print_exc()
        print("================================================")

        return []


# ============================================================
# LABEL IDENTIFICATION
# ============================================================

def classify_label(text):
    text = normalize_text(text)

    # Common OCR variations.
    replacements = {
        "1ST NAME": "FIRST NAME",
        "F1RST NAME": "FIRST NAME",
        "F1RST": "FIRST",
        "M1DDLE NAME": "MIDDLE NAME",
        "M1DDLE": "MIDDLE",
        "LAST N4ME": "LAST NAME",
        "L4ST NAME": "LAST NAME",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    if text in {"FIRST NAME", "FIRST", "GIVEN NAME"}:
        return "FIRST"

    if text in {"MIDDLE NAME", "MIDDLE"}:
        return "MIDDLE"

    if text in {"LAST NAME", "LAST", "SURNAME", "FAMILY NAME"}:
        return "LAST"

    return None


# ============================================================
# OWNER / CHILD SECTION DETECTION
# ============================================================

def is_owner_anchor(text):
    normalized = normalize_text(text)

    strong_patterns = [
        "NAME OF CHILD",
        "CHILD'S NAME",
        "CHILDS NAME",
        "NAME OF THE CHILD",
    ]

    for pattern in strong_patterns:
        if pattern in normalized:
            return True

    return False


def find_owner_anchor(items):
    candidates = []

    for item in items:
        text = item.get("text", "")
        box = item.get("box")

        if not text or box is None:
            continue

        if is_owner_anchor(text):
            candidates.append(item)

    if not candidates:
        print("[OWNER ANCHOR] No child-name section anchor found.")
        return None

    # Prefer the highest-confidence anchor.
    candidates.sort(
        key=lambda item: float(item.get("score", 0)),
        reverse=True
    )

    selected = candidates[0]

    print(
        f"[OWNER ANCHOR] Selected: '{selected['text']}' "
        f"box={selected['box']} "
        f"score={selected.get('score', 0):.3f}"
    )

    return selected


# ============================================================
# OWNER LABEL SELECTION
# ============================================================

def select_owner_labels(items, owner_anchor=None):
    """
    Select FIRST / MIDDLE / LAST labels belonging to the
    SAME NAME section.

    Birth certificate layout:

    1. Child name
    6. Mother's maiden name
    13. Father's name

    The three labels in one section are horizontally aligned.

    Therefore, FIRST/MIDDLE/LAST must be selected as a group.
    """

    def normalize_label(text):
        t = (text or "").strip().lower()

        # Remove common OCR punctuation/brackets before matching.
        t = re.sub(r"[^a-z]", "", t)

        # Exact and common OCR variants for FIRST.
        first_variants = {
            "first",
            "firstname",
            "frist",
            "firts",
            "firt",
            "firat",
            "fira",
            "frst",
            "firs",
            "fist",
            "firtsname",
        }

        if t in first_variants:
            return "FIRST"

        # Exact and common OCR variants for MIDDLE.
        middle_variants = {
            "middle",
            "middlename",
            "midle",
            "midele",
            "middie",
            "middlle",
            "middl",
            "mddie",
            "midde",
        }

        if t in middle_variants:
            return "MIDDLE"

        # Exact and common OCR variants for LAST.
        last_variants = {
            "last",
            "lastname",
            "lst",
            "surname",
            "laast",
            "las",
            "lat",
            "lstname",
            "lats",
        }

        if t in last_variants:
            return "LAST"

        # ------------------------------------------------------------
        # FUZZY OCR FALLBACK
        #
        # Restricted to the three expected field labels so ordinary
        # certificate text will not easily become a name-field label.
        # ------------------------------------------------------------

        try:
            candidates = {
                "FIRST": ["first", "firstname"],
                "MIDDLE": ["middle", "middlename"],
                "LAST": ["last", "lastname", "surname"],
            }

            best_type = None
            best_score = 0.0

            for label_type, variants in candidates.items():
                for variant in variants:
                    similarity = SequenceMatcher(
                        None,
                        t,
                        variant
                    ).ratio()

                    if similarity > best_score:
                        best_score = similarity
                        best_type = label_type

            # Conservative so words such as "birth", "name",
            # "date", etc. are not classified as name labels.
            if best_score >= 0.72:
                if len(t) >= 3:
                    return best_type

        except Exception:
            pass

        return None

    def box_center(box):
        x1, y1, x2, y2 = box

        return (
            (x1 + x2) / 2.0,
            (y1 + y2) / 2.0
        )

    def box_height(box):
        return max(1.0, float(box[3]) - float(box[1]))

    # ------------------------------------------------------------
    # 1. Find all possible FIRST / MIDDLE / LAST labels
    # ------------------------------------------------------------

    labels = []

    for item in items:
        text = str(item.get("text", "")).strip()

        box = item.get("box")

        if not text or not box or len(box) != 4:
            continue

        # ------------------------------------------------------------
        # Section headers such as "1. NAME", "6. MAIDEN NAME",
        # "13. NAME" are NOT FIRST/MIDDLE/LAST field labels.
        # Never allow a generic NAME header to become a LAST label.
        # The actual field label "(Last)" must be preferred.
        # ------------------------------------------------------------

        raw_label_lower = re.sub(
            r"[^a-z0-9]+",
            " ",
            text.lower()
        ).strip()

        normalized_compact = re.sub(
            r"[^a-z]",
            "",
            text.lower()
        )

        
        if (
            normalized_compact == "name"
            or (
                "name" in raw_label_lower
                and not any(
                    word in raw_label_lower
                    for word in (
                        "first",
                        "middle",
                        "last",
                        "surname",
                    )
                )
            )
        ):
            print(
                f"[OWNER LABELS] Ignoring section/header label: "
                f"'{text}'"
            )
            continue


        label_type = normalize_label(text)

        if label_type is None:
            continue

        score = float(item.get("score", 0.0))

        labels.append(
            {
                "type": label_type,
                "text": text,
                "box": box,
                "score": score,
                "item": item,
            }
        )

    if not labels:
        print("[OWNER LABELS] No FIRST/MIDDLE/LAST labels found.")

        return {
            "FIRST": None,
            "MIDDLE": None,
            "LAST": None,
        }

    # ------------------------------------------------------------
    # FILTER LABELS USING THE CHILD-NAME SECTION ANCHOR
    # ------------------------------------------------------------

    if owner_anchor and owner_anchor.get("box"):
        anchor_box = owner_anchor["box"]
        anchor_bottom = anchor_box[3]

        anchor_filtered_labels = []

        for label in labels:
            label_center_y = box_center(label["box"])[1]

            # Only consider name-field labels at or below
            # the child-name section heading.
            if label_center_y >= anchor_bottom - 10:
                anchor_filtered_labels.append(label)

        if anchor_filtered_labels:
            labels = anchor_filtered_labels

            print(
                f"[OWNER LABELS] Using child-name anchor. "
                f"Remaining labels: {len(labels)}"
            )
        else:
            print(
                "[OWNER LABELS] No labels below child-name anchor. "
                "Using all detected labels as fallback."
            )

    # ------------------------------------------------------------
    # 2. Print all detected labels
    # ------------------------------------------------------------

    print(f"[OWNER LABELS] Detected label candidates: {len(labels)}")

    for label in labels:
        cx, cy = box_center(label["box"])

        print(
            f" {label['type']}: "
            f"'{label['text']}' "
            f"box={label['box']} "
            f"center=({cx:.1f},{cy:.1f}) "
            f"score={label['score']:.3f}"
        )

    # ------------------------------------------------------------
    # 3. Group labels by vertical row
    # ------------------------------------------------------------

    rows = []

    # Process labels from top to bottom.
    labels_sorted = sorted(
        labels,
        key=lambda x: box_center(x["box"])[1]
    )

    for label in labels_sorted:
        _, cy = box_center(label["box"])

        h = box_height(label["box"])

        placed = False

        for row in rows:
            row_y = row["y"]

            # Allow OCR boxes to differ slightly vertically.
            tolerance = max(22.0, h * 0.75)

            if abs(cy - row_y) <= tolerance:
                row["labels"].append(label)

                # Update row center.
                ys = [
                    box_center(x["box"])[1]
                    for x in row["labels"]
                ]

                row["y"] = sum(ys) / len(ys)

                placed = True
                break

        if not placed:
            rows.append(
                {
                    "y": cy,
                    "labels": [label],
                }
            )

    # ------------------------------------------------------------
    # 4. Remove duplicate labels within each row
    # ------------------------------------------------------------

    for row in rows:
        by_type = {
            "FIRST": [],
            "MIDDLE": [],
            "LAST": [],
        }

        for label in row["labels"]:
            by_type[label["type"]].append(label)

        cleaned = []

        for label_type in ("FIRST", "MIDDLE", "LAST"):
            candidates = by_type[label_type]

            if not candidates:
                continue

            # --------------------------------------------------------
            # Prefer explicit field labels over generic/section labels.
            # --------------------------------------------------------

            def label_priority(label):
                label_text = str(label.get("text", "")).strip().lower()

                compact = re.sub(r"[^a-z]", "", label_text)

                # Explicit field labels get highest priority.
                if label_type == "FIRST":
                    if compact in {"first", "firstname", "frist", "firts"}:
                        return 100

                elif label_type == "MIDDLE":
                    if compact in {"middle", "middlename", "midle", "midele"}:
                        return 100

                elif label_type == "LAST":
                    if compact in {"last", "lastname", "lst", "surname"}:
                        return 100

                # Generic NAME headers are never preferred.
                if compact == "name":
                    return -100

                if "name" in label_text:
                    return -50

                return 0

            candidates.sort(
                key=lambda x: (
                    label_priority(x),
                    float(x.get("score", 0.0))
                ),
                reverse=True
            )

            cleaned.append(candidates[0])

        row["labels"] = cleaned

    # ------------------------------------------------------------
    # 5. Show detected rows
    # ------------------------------------------------------------

    print("\n[OWNER LABEL ROWS]")

    for index, row in enumerate(rows):
        ordered = sorted(
            row["labels"],
            key=lambda x: box_center(x["box"])[0]
        )

        types = [label["type"] for label in ordered]
        texts = [label["text"] for label in ordered]

        print(
            f" Row {index}: "
            f"y={row['y']:.1f} "
            f"labels={types} "
            f"text={texts}"
        )

    # ------------------------------------------------------------
    # 6. Find complete FIRST + MIDDLE + LAST rows
    #
    # A valid owner-name section must contain all three labels
    # in the SAME row.
    # ------------------------------------------------------------

    complete_rows = []

    for index, row in enumerate(rows):
        label_map = {
            label["type"]: label
            for label in row["labels"]
        }

        if not all(
            key in label_map
            for key in ("FIRST", "MIDDLE", "LAST")
        ):
            continue

        first = label_map["FIRST"]
        middle = label_map["MIDDLE"]
        last = label_map["LAST"]

        first_x, _ = box_center(first["box"])
        middle_x, _ = box_center(middle["box"])
        last_x, _ = box_center(last["box"])

        # FIRST should be left of MIDDLE, and MIDDLE left of LAST.
        if not (first_x < middle_x < last_x):
            continue

        # Measure how vertically aligned the three labels are.
        y_values = [
            box_center(first["box"])[1],
            box_center(middle["box"])[1],
            box_center(last["box"])[1],
        ]

        vertical_spread = max(y_values) - min(y_values)

        # The labels in one section should be tightly aligned.
        if vertical_spread > 35:
            continue

        # Horizontal spacing should also be reasonable.
        gap1 = middle_x - first_x
        gap2 = last_x - middle_x

        if gap1 < 40 or gap2 < 40:
            continue

        complete_rows.append(
            {
                "index": index,
                "row": row,
                "FIRST": first,
                "MIDDLE": middle,
                "LAST": last,
                "vertical_spread": vertical_spread,
                "score_sum": (
                    first["score"]
                    + middle["score"]
                    + last["score"]
                ),
            }
        )

    
    # ------------------------------------------------------------
    # 7. If complete rows exist, select the closest complete row
    #    below the child-name section anchor.
    # ------------------------------------------------------------

    if complete_rows:
        if owner_anchor and owner_anchor.get("box"):
            anchor_bottom = owner_anchor["box"][3]

            complete_rows.sort(
                key=lambda x: max(
                    0,
                    x["row"]["y"] - anchor_bottom
                )
            )
        else:
            complete_rows.sort(
                key=lambda x: x["row"]["y"]
            )

        selected = complete_rows[0]

        print("\n[OWNER NAME SECTION]")
        print(f"Complete name rows found: {len(complete_rows)}")

        for candidate in complete_rows:
            print(
                f" Row {candidate['index']} "
                f"y={candidate['row']['y']:.1f} "
                f"spread={candidate['vertical_spread']:.1f} "
                f"score={candidate['score_sum']:.3f}"
            )

        print("\n[SELECTED OWNER NAME LABEL GROUP]")
        print(f"Row {selected['index']} y={selected['row']['y']:.1f}")

        for key in ("FIRST", "MIDDLE", "LAST"):
            print(
                f"{key}: "
                f"'{selected[key]['text']}' "
                f"box={selected[key]['box']} "
                f"score={selected[key]['score']:.3f}"
            )

        return {
            "FIRST": selected["FIRST"],
            "MIDDLE": selected["MIDDLE"],
            "LAST": selected["LAST"],
        }

    # ------------------------------------------------------------
    # 8. Fallback
    #
    # If no complete row exists, select the row containing the
    # largest number of recognized name labels.
    # ------------------------------------------------------------

    print("\n[OWNER LABELS] No complete FIRST/MIDDLE/LAST row found.")

    usable_rows = [
        row
        for row in rows
        if len(row["labels"]) >= 2
    ]

    if usable_rows:
        if owner_anchor and owner_anchor.get("box"):
            anchor_bottom = owner_anchor["box"][3]

            usable_rows.sort(
                key=lambda row: (
                    -len(row["labels"]),
                    max(0, row["y"] - anchor_bottom)
                )
            )
        else:
            usable_rows.sort(
                key=lambda row: (
                    -len(row["labels"]),
                    row["y"]
                )
            )

        selected_row = usable_rows[0]

        result = {
            "FIRST": None,
            "MIDDLE": None,
            "LAST": None,
        }

        for label in selected_row["labels"]:
            label_type = label.get("type")

            if label_type in result:
                result[label_type] = label

        print(
            f"[OWNER LABELS] Fallback row "
            f"y={selected_row['y']:.1f} "
            f"labels={list(result.keys())}"
        )

        return result

    print("[OWNER LABELS] No usable fallback row found.")

    return {
        "FIRST": None,
        "MIDDLE": None,
        "LAST": None,
    }


    # ------------------------------------------------------------
    # 8. Fallback
    #
    # If the document does not produce a complete row, prefer a
    # row containing the largest number of recognized name labels
    # (uppermost on ties) rather than mixing different sections.
    # ------------------------------------------------------------

    print("\n[OWNER LABELS] No complete FIRST/MIDDLE/LAST row found.")

    if rows:
        usable_rows = [
            row
            for row in rows
            if len(row["labels"]) >= 2
        ]

    if owner_anchor and owner_anchor.get("box"):
        anchor_bottom = owner_anchor["box"][3]

        usable_rows.sort(
                key=lambda row: (
                    -len(row["labels"]),
                    max(0, row["y"] - anchor_bottom)
                )
            )
    else:
            usable_rows.sort(
                    key=lambda row: (
                        -len(row["labels"]),
                        row["y"]
                    )
                )

            selected_row = usable_rows[0]

            result = {
                "FIRST": None,
                "MIDDLE": None,
                "LAST": None,
            }

            for label in selected_row["labels"]:
                label_type = label.get("type")

                if label_type in result:
                    result[label_type] = label

            print(
                f"[OWNER LABELS] "
                f"Fallback row y={selected_row['y']:.1f} "
                f"labels={list(result.keys())}"
            )

            return result

    return {
        "FIRST": None,
        "MIDDLE": None,
        "LAST": None,
    }


# ============================================================
# VALUE EXTRACTION
# ============================================================


def find_value_items(
    items,
    label,
    selected_other_labels,
    image_height
):
    label_box = label.get("box")

    if label_box is None:
        return []

    lx1, ly1, lx2, ly2 = label_box
    label_h = max(1.0, box_height(label_box))
    label_cx, label_cy = box_center(label_box)

    candidates = []

    is_middle = label is selected_other_labels.get("MIDDLE")

    for item in items:
        box = item.get("box")
        text = clean_text(item.get("text", ""))

        if box is None or not text:
            continue

        # Never use another name label or form label as a name.
        if classify_label(text) or is_non_name_field_text(text):
            continue

        cx, cy = box_center(box)

        # The value must be below its own field label.
        if cy <= ly2:
            continue

        distance_y = cy - ly2

        # Keep the middle-name search area especially tight.
                # Keep the middle-name search area very strict.
        # A middle-name value must be close to its own label.
        if is_middle:
            max_vertical_distance = max(18.0, label_h * 1.0)
        else:
            max_vertical_distance = max(48.0, label_h * 3.2)

        if distance_y > max_vertical_distance:
            continue

        # The candidate must be horizontally close to its label.
        overlap = horizontal_overlap(box, label_box)
        candidate_width = max(1.0, box_width(box))

        if is_middle:
            # Middle-name text must be horizontally aligned
            # with the MIDDLE label itself.
            if overlap <= 0:
                continue

            overlap_ratio = overlap / candidate_width

            if overlap_ratio < 0.30:
                continue

            # Reject text whose center is far outside the
            # horizontal area of the MIDDLE label.
            allowed_horizontal_margin = max(
                10.0,
                box_width(label_box) * 0.15
            )

            if (
                cx < lx1 - allowed_horizontal_margin
                or cx > lx2 + allowed_horizontal_margin
            ):
                continue

        else:
            if overlap <= 0:
                if cx < lx1 - candidate_width * 0.35:
                    continue

                if cx > lx2 + candidate_width * 0.35:
                    continue
        # Do not allow another field to claim this candidate.
        belongs_to_other = False

        for other_field, other_label in selected_other_labels.items():
            if other_label is None or other_label is label:
                continue

            other_box = other_label.get("box")

            if other_box is None:
                continue

            other_cx, _ = box_center(other_box)

            current_distance = abs(cx - label_cx)
            other_distance = abs(cx - other_cx)

            if other_distance < current_distance * 0.55:
                belongs_to_other = True
                break

        if belongs_to_other:
            continue

        horizontal_distance = abs(cx - label_cx)

        vertical_score = 1.0 / (1.0 + distance_y)
        horizontal_score = 1.0 / (1.0 + horizontal_distance)

        geometry_score = (
            vertical_score * 0.65
            + horizontal_score * 0.35
        )

        candidates.append({
            **item,
            "distance_y": distance_y,
            "distance_x": horizontal_distance,
            "geometry_score": geometry_score,
        })

    return candidates



def choose_one_value_line(candidates):
    if not candidates:
        return ""

    # --------------------------------------------------------
    # REMOVE OVERLAPPING OCR DUPLICATES
    #
    # PaddleOCR may return multiple readings of the same
    # printed name from the full-page OCR and the focused
    # upper-section OCR. If detections occupy almost the same
    # physical location they are alternate readings of the same
    # text, and the highest-confidence reading is kept.
    # --------------------------------------------------------

    filtered_candidates = []

    # Process highest-confidence detections first.
    candidates_sorted = sorted(
        candidates,
        key=lambda item: float(item.get("score", 0)),
        reverse=True
    )

    for candidate in candidates_sorted:
        candidate_box = candidate.get("box")

        if candidate_box is None:
            continue

        candidate_cx, candidate_cy = box_center(candidate_box)

        candidate_width = max(1.0, box_width(candidate_box))
        candidate_height = max(1.0, box_height(candidate_box))

        duplicate_location = False

        for existing in filtered_candidates:
            existing_box = existing.get("box")

            if existing_box is None:
                continue

            existing_cx, existing_cy = box_center(existing_box)

            existing_width = max(1.0, box_width(existing_box))
            existing_height = max(1.0, box_height(existing_box))

            # 1. Center distance
            center_distance_x = abs(candidate_cx - existing_cx)
            center_distance_y = abs(candidate_cy - existing_cy)

            # 2. Size similarity
            width_difference = abs(candidate_width - existing_width)
            height_difference = abs(candidate_height - existing_height)

            similar_size = (
                width_difference
                <= max(candidate_width, existing_width) * 0.40
                and
                height_difference
                <= max(candidate_height, existing_height) * 0.60
            )

            # 3. Actual box overlap / IoU
            intersection_left = max(candidate_box[0], existing_box[0])
            intersection_top = max(candidate_box[1], existing_box[1])
            intersection_right = min(candidate_box[2], existing_box[2])
            intersection_bottom = min(candidate_box[3], existing_box[3])

            intersection_width = max(
                0.0,
                intersection_right - intersection_left
            )

            intersection_height = max(
                0.0,
                intersection_bottom - intersection_top
            )

            intersection_area = intersection_width * intersection_height

            candidate_area = candidate_width * candidate_height
            existing_area = existing_width * existing_height

            union_area = (
                candidate_area
                + existing_area
                - intersection_area
            )

            if union_area > 0:
                iou = intersection_area / union_area
            else:
                iou = 0.0

            # 4. Is this the same printed text?
            strong_overlap = (
                iou >= 0.45
                and
                center_distance_y
                <= max(candidate_height, existing_height) * 1.00
            )

            almost_same_detection = (
                center_distance_x
                <= max(candidate_width, existing_width) * 0.20
                and
                center_distance_y
                <= max(candidate_height, existing_height) * 0.75
                and
                similar_size
            )

            if strong_overlap or almost_same_detection:
                duplicate_location = True

                print("[VALUE OCR] Duplicate OCR detection removed:")

                print(
                    f" KEPT: "
                    f"'{existing.get('text', '')}' "
                    f"score={existing.get('score', 0):.3f} "
                    f"box={existing_box}"
                )

                print(
                    f" REMOVED: "
                    f"'{candidate.get('text', '')}' "
                    f"score={candidate.get('score', 0):.3f} "
                    f"box={candidate_box}"
                )

                print(
                    f" IoU={iou:.3f} "
                    f"center_dx={center_distance_x:.1f} "
                    f"center_dy={center_distance_y:.1f}"
                )

                break

        if not duplicate_location:
            filtered_candidates.append(candidate)

    print(
        f"[VALUE OCR] "
        f"Candidates before duplicate filtering: {len(candidates)}"
    )

    print(
        f"[VALUE OCR] "
        f"Candidates after duplicate filtering: {len(filtered_candidates)}"
    )

    candidates = filtered_candidates

    if not candidates:
        return ""

    # --------------------------------------------------------
    # CHOOSE THE NEAREST TEXT BELOW THE LABEL
    # --------------------------------------------------------

    candidates.sort(
        key=lambda item: (
            item["distance_y"],
            -float(item.get("score", 0))
        )
    )

    first = candidates[0]

    first_box = first.get("box")

    if first_box is None:
        return ""

    first_cy = box_center(first_box)[1]

    first_height = max(1.0, box_height(first_box))

    # --------------------------------------------------------
    # KEEP ONLY TEXT ON THE SAME PHYSICAL LINE
    # --------------------------------------------------------

    same_line = []

    for item in candidates:
        box = item.get("box")

        if box is None:
            continue

        cy = box_center(box)[1]

        if abs(cy - first_cy) <= first_height * 0.70:
            same_line.append(item)

    # Left-to-right ordering.
    same_line.sort(key=lambda item: item["box"][0])

    parts = []

    seen = set()

    for item in same_line:
        text = clean_name(item.get("text", ""))

        if not text:
            continue

        key = text.upper()

        if key in seen:
            continue

        seen.add(key)

        parts.append(text)

    return " ".join(parts).strip()



def is_valid_middle_name_value(value):
    text = clean_name(value)

    if not text:
        return False

    if is_non_name_field_text(text):
        return False

    # Middle names should contain letters only.
    # Reject numbers and mixed form-field content.
    if any(char.isdigit() for char in text):
        return False

    words = text.split()

    if not words or len(words) > 4:
        return False

    # Reject single-character OCR fragments.
    if any(len(word) < 2 for word in words):
        return False

    if not all(
        re.fullmatch(
            r"[A-Za-zÀ-ÖØ-öø-ÿ'-]+",
            word
        )
        for word in words
    ):
        return False

    normalized = re.sub(
        r"[^a-z]",
        "",
        text.lower()
    )

    forbidden = {
        "date",
        "dateofbirth",
        "placeofbirth",
        "birth",
        "sex",
        "male",
        "female",
        "month",
        "year",
        "day",
        "first",
        "firstname",
        "middle",
        "middlename",
        "last",
        "lastname",
        "surname",
        "mother",
        "father",
        "mothersname",
        "fathersname",
        "informant",
        "signature",
        "occupation",
        "citizenship",
        "religion",
        "residence",
        "province",
        "hospital",
        "clinic",
        "institution",
    }

    if normalized in forbidden:
        return False

    return True


# ============================================================
# OWNER NAME EXTRACTION
# ============================================================


def extract_owner_name(image, items):
    image_height, image_width = image.shape[:2]

        # Detect the child-name section first so label selection
    # can use it as a reference.
    owner_anchor = find_owner_anchor(items)

    selected = select_owner_labels(
        items,
        owner_anchor=owner_anchor
    )

    print("")
    print("================================================")
    print("[SELECTED OWNER FIELDS]")
    print("================================================")

    for field in ("FIRST", "MIDDLE", "LAST"):
        item = selected.get(field)

        if item:
            print(
                f"{field}: '{item['text']}' "
                f"box={item['box']} "
                f"score={item.get('score', 0):.3f}"
            )
        else:
            print(f"{field}: NOT SELECTED")

    result = {
        "first_name": "",
        "middle_name": "",
        "last_name": "",
        "owner_anchor_found": bool(owner_anchor),
    }

    # Do not guess if no name-field labels were detected.
    if not any(selected.get(f) for f in ("FIRST", "MIDDLE", "LAST")):
        print("[OWNER NAME] No owner name labels selected.")
        return result

    # Process each field independently.
    for field in ("FIRST", "MIDDLE", "LAST"):
        label = selected.get(field)

        if label is None:
            continue

        candidates = find_value_items(
            items=items,
            label=label,
            selected_other_labels=selected,
            image_height=image_height,
        )

        print("")
        print(f"[{field}] Candidates:")

        for candidate in candidates:
            print(
                f" '{candidate['text']}' "
                f"box={candidate['box']} "
                f"score={candidate.get('score', 0):.3f}"
            )

        selected_value = ""

        # Rank plausible name values using OCR confidence
        # and their position relative to the selected label.
        ranked_candidates = []

        for candidate in candidates:
            text_value = clean_text(candidate.get("text", ""))

            if not text_value:
                continue

            if field == "MIDDLE":
                if not is_valid_middle_name_value(text_value):
                    continue

            # Reject form labels, dates, and unrelated fields.
            if is_non_name_field_text(text_value):
                continue

            normalized_value = re.sub(
                r"[^a-z]",
                "",
                text_value.lower(),
            )

            forbidden_values = {
                "sex",
                "male",
                "female",
                "date",
                "dateofbirth",
                "birth",
                "placeofbirth",
                "month",
                "year",
                "day",
                "name",
                "firstname",
                "middlename",
                "lastname",
                "first",
                "middle",
                "last",
                "surname",
                "citizenship",
                "religion",
                "occupation",
                "residence",
                "hospital",
                "clinic",
                "institution",
                "province",
                "mother",
                "father",
                "maiden",
                "signature",
                "nameinprint",
            }

            if normalized_value in forbidden_values:
                continue

            alpha_chars = sum(ch.isalpha() for ch in text_value)
            digit_chars = sum(ch.isdigit() for ch in text_value)

            # Names must contain letters and no digits.
            if alpha_chars < 2 or digit_chars > 0:
                continue

            score = float(candidate.get("score", 0.0))
            distance_y = float(candidate.get("distance_y", 9999.0))
            distance_x = float(candidate.get("distance_x", 9999.0))
            geometry_score = float(candidate.get("geometry_score", 0.0))

            proximity_score = max(
                0.0,
                1.0 - distance_y / 100.0,
            )

            horizontal_proximity = max(
                0.0,
                1.0 - distance_x / 250.0,
            )

            final_score = (
                score * 0.20
                + geometry_score * 0.35
                + proximity_score * 0.30
                + horizontal_proximity * 0.15
            )

            ranked_candidates.append((final_score, candidate))

        ranked_candidates.sort(
            key=lambda pair: pair[0],
            reverse=True,
        )

        if ranked_candidates:
            best_score, best_candidate = ranked_candidates[0]
            selected_value = clean_name(best_candidate.get("text", ""))

            print(
                f"[{field}] GEOMETRY-AWARE SELECTED: "
                f"'{selected_value}' "
                f"score={best_candidate.get('score', 0):.3f} "
                f"final={best_score:.4f}"
            )

        # Fallback is initialized for EVERY field. It cannot
        # cause an UnboundLocalError when no candidate exists.
                # --------------------------------------------------------
        # FALLBACK
        #
        # FIRST and LAST may use the existing line-based fallback.
        # MIDDLE must NOT use this fallback because it can select
        # unrelated text from another field.
        # --------------------------------------------------------

        if not selected_value and field == "MIDDLE":
            print(
                "[MIDDLE] No confidently identified middle name. "
                "Keeping the value blank."
            )

            selected_value = ""

        elif not selected_value:
            fallback_value = choose_one_value_line(candidates)
            fallback_value = clean_name(fallback_value)

            if fallback_value and is_non_name_field_text(fallback_value):
                print(
                    f"[{field}] FALLBACK REJECTED NON-NAME TEXT: "
                    f"{fallback_value!r}"
                )
                fallback_value = ""

            if fallback_value:
                fallback_normalized = re.sub(
                    r"[^a-z]",
                    "",
                    fallback_value.lower(),
                )

                fallback_forbidden = {
                    "date",
                    "dateofbirth",
                    "placeofbirth",
                    "sex",
                    "male",
                    "female",
                    "month",
                    "year",
                    "day",
                    "first",
                    "middle",
                    "last",
                    "surname",
                    "citizenship",
                    "religion",
                    "occupation",
                    "residence",
                    "hospital",
                    "clinic",
                    "institution",
                    "province",
                    "signature",
                    "nameinprint",
                }

                has_digits = any(
                    ch.isdigit()
                    for ch in fallback_value
                )

                if (
                    fallback_normalized in fallback_forbidden
                    or has_digits
                    or sum(
                        ch.isalpha()
                        for ch in fallback_value
                    ) < 2
                ):
                    print(
                        f"[{field}] FALLBACK REJECTED: "
                        f"{fallback_value!r}"
                    )
                    fallback_value = ""

            selected_value = fallback_value

            if selected_value:
                print(
                    f"[{field}] FALLBACK VALUE SELECTED: "
                    f"'{selected_value}'"
                )
            else:
                print(f"[{field}] No valid name value found.")

        # Save the result INSIDE the loop so every field
        # receives its own value.
        if field == "FIRST":
            result["first_name"] = selected_value
        elif field == "MIDDLE":
            result["middle_name"] = selected_value
        elif field == "LAST":
            result["last_name"] = selected_value

    print("")
    print("[OWNER NAME EXTRACTION COMPLETE]")
    print("FIRST :", result["first_name"])
    print("MIDDLE:", result["middle_name"])
    print("LAST  :", result["last_name"])

    return result




NAME_LABEL_RE = re.compile(
    r"^\s*(?:NAME OF (?:THE )?(?:STUDENT|PUPIL|LEARNER|CHILD)|"
    r"(?:STUDENT|PUPIL|LEARNER|FULL)(?:'?S)? NAME|NAME)\s*[:;\-]?\s*(.*)$",
    re.IGNORECASE,
)
COMMA_NAME_RE = re.compile(
    r"^([A-Za-zÀ-ÿ'\-]+(?: [A-Za-zÀ-ÿ'\-]+)?),\s*"
    r"([A-Za-zÀ-ÿ'\-]+(?: [A-Za-zÀ-ÿ'\-]+)*)\.?\s*([A-Za-zÀ-ÿ'\-\.]*)$"
)



def _split_full_name(full):
    full = clean_name(full)

    if not full:
        return "", "", ""

    match = COMMA_NAME_RE.match(full)

    if match:
        first_name = match.group(2).strip()
        last_name = match.group(1).strip()

        # Do not assume that unstructured text contains
        # a verified middle name.
        return first_name, "", last_name

    parts = full.split()

    if len(parts) == 1:
        return parts[0], "", ""

    if len(parts) == 2:
        return parts[0], "", parts[1]

    # Without separate FIRST / MIDDLE / LAST labels,
    # do not guess which word is the middle name.
    return " ".join(parts[:-1]), "", parts[-1]



def extract_name_generic(items):
    """Fallback for non-birth-certificate documents."""
    boxed = [i for i in items if i.get("box") and i.get("text")]
    boxed.sort(key=lambda i: (i["box"][1], i["box"][0]))

    for item in boxed:
        m = NAME_LABEL_RE.match(item["text"])
        if not m:
            continue

        value = clean_name(m.group(1))

        # Value is on the same text line as the label
        if len(value) >= 4:
            return _split_full_name(value)

        # Otherwise: nearest text to the right, then below
        lb = item["box"]
        lh = max(1.0, box_height(lb))
        best, best_d = None, 1e9

        for other in boxed:
            if other is item or NAME_LABEL_RE.match(other["text"]):
                continue
            ob = other["box"]
            text = clean_name(other["text"])
            if sum(c.isalpha() for c in text) < 3:
                continue

            same_row = vertical_overlap(lb, ob) > lh * 0.5 and ob[0] >= lb[2] - 5
            below = (
                0 < ob[1] - lb[3] < lh * 3
                and horizontal_overlap(lb, ob) > 0
            )
            if not (same_row or below):
                continue

            d = abs(ob[0] - lb[2]) + abs(ob[1] - lb[1])
            if d < best_d:
                best, best_d = text, d

        if best:
            return _split_full_name(best)

    return "", "", ""



# ============================================================
# DOCUMENT OCR
# ============================================================

def extract_document(image_path):
    start = time.time()
    image = cv2.imread(image_path)

    if image is None:
        raise ValueError("Unable to read uploaded image.")

    original_h, original_w = image.shape[:2]
    print("\n================================================")
    print(" REGISSCAN OCR - FAST MODE")
    print("================================================")
    print(f"Original: {original_w} x {original_h}")

    image = prepare_image(image)
    h, w = image.shape[:2]
    print(f"Processed: {w} x {h}")

    # Fast path: one OCR inference over the full image.
    ocr_start = time.time()
    items = run_ocr(image)
    ocr_seconds = time.time() - ocr_start
    upper_ocr_seconds = 0.0

    def sorted_boxed_items(source_items):
        result = [item for item in source_items if item.get("box") is not None]
        result.sort(key=lambda item: (item["box"][1], item["box"][0]))
        return result

    # Extract the name before considering another OCR pass.
    name_start = time.time()
    owner_name = extract_owner_name(image, items)
    name_source = "owner_labels"

    if not (owner_name["first_name"] and owner_name["last_name"]):
        f, m, l = extract_name_generic(items)
        if f and l:
            owner_name["first_name"] = owner_name["first_name"] or f
            owner_name["middle_name"] = owner_name["middle_name"] or m
            owner_name["last_name"] = owner_name["last_name"] or l
            name_source = "generic_label"
    
    # ----------------------------------------------------
    # ENHANCED OCR FALLBACK
    # Run only if the original OCR did not identify
    # both the first name and last name.
    # ----------------------------------------------------

    enhanced_ocr_seconds = 0.0

    if not (owner_name["first_name"] and owner_name["last_name"]):
        print("\n[ENHANCED OCR] Running enhanced image pass...")

        enhanced_start = time.time()

        enhanced_image = enhance_image_for_ocr(image)

        if enhanced_image is not None:
            enhanced_items = run_ocr(enhanced_image)

            if enhanced_items:
                items = merge_ocr_items(items, enhanced_items)

                owner_name = extract_owner_name(image, items)
                name_source = "enhanced_owner_labels"

                if not (
                    owner_name["first_name"]
                    and owner_name["last_name"]
                ):
                    f, m, l = extract_name_generic(items)

                    if f and l:
                        owner_name["first_name"] = (
                            owner_name["first_name"] or f
                        )
                        owner_name["last_name"] = (
                            owner_name["last_name"] or l
                        )

                        # Do not populate middle name through
                        # generic full-name inference.
                        name_source = "enhanced_generic_label"

        enhanced_ocr_seconds = time.time() - enhanced_start

        print(
            f"[ENHANCED OCR] Completed in "
            f"{enhanced_ocr_seconds:.3f} seconds."
        )


    # Slow fallback only when the full-page result did not find both names.
    if not (owner_name["first_name"] and owner_name["last_name"]):
        upper_start = time.time()
        upper_items = run_upper_name_ocr(image)
        upper_ocr_seconds = time.time() - upper_start
        if upper_items:
            items = merge_ocr_items(items, upper_items)
            owner_name = extract_owner_name(image, items)
            name_source = "owner_labels_retry"

            if not (owner_name["first_name"] and owner_name["last_name"]):
                f, m, l = extract_name_generic(items)
                if f and l:
                    owner_name["first_name"] = owner_name["first_name"] or f
                    owner_name["middle_name"] = owner_name["middle_name"] or m
                    owner_name["last_name"] = owner_name["last_name"] or l
                    name_source = "generic_label_retry"

    if not (owner_name["first_name"] and owner_name["last_name"]):
        name_source = "none"

    name_seconds = time.time() - name_start
    ordered_items = sorted_boxed_items(items)

    print("\n================================================")
    print("[OCR DETECTIONS]")
    print("================================================")
    for index, item in enumerate(ordered_items):
        print(
            f"{index:03d} | '{item.get('text', '')}' | "
            f"score={item.get('score', 0):.3f} | box={item.get('box')}"
        )

    raw_text = " ".join(item.get("text", "") for item in ordered_items).strip()
    print(f"[OCR SUMMARY] detections={len(ordered_items)}; raw_text_chars={len(raw_text)}")
    if raw_text:
        print("[OCR RAW TEXT]", raw_text[:2500])
    else:
        print("[OCR WARNING] PaddleOCR produced no parsed text. Check the [OCR PARSER] lines above.")
    document_classification = classify_document_type(raw_text, items, h)
    total_seconds = time.time() - start

    result = {
        "success": bool(raw_text.strip()),
        "first_name": owner_name["first_name"],
        "middle_name": owner_name["middle_name"],
        "last_name": owner_name["last_name"],
        "document_type": document_classification["document_type"],
        "document_type_key": document_classification["document_type_key"],
        "document_type_confidence": document_classification["document_type_confidence"],
        "document_type_score": document_classification["document_type_score"],
        "document_type_source": document_classification["document_type_source"],
        "document_type_matches": document_classification["document_type_matches"],
        "document_type_suggestions": document_classification["document_type_suggestions"],
        "document_id": document_classification["document_id"],
        "header_text": document_classification["header_text"],
        "document_type_label": document_classification["document_type"] or "",
        "document_type_found": document_classification["document_id"] is not None,
        "raw_text": raw_text,
        "ocr_items": len(ordered_items),
        "timing": {
            "full_ocr_seconds": round(ocr_seconds, 3),
            "enhanced_ocr_seconds": round(enhanced_ocr_seconds, 3),
            "upper_ocr_seconds": round(upper_ocr_seconds, 3),
            "name_extraction_seconds": round(name_seconds, 3),
            "total_seconds": round(total_seconds, 3),
        },
        "debug": {
            "owner_anchor_found": owner_name["owner_anchor_found"],
            "name_source": name_source,
            "header_text": document_classification["header_text"],
        },
    }

    print("\n[FINAL RESULT]")
    print("FIRST NAME :", result["first_name"])
    print("MIDDLE NAME:", result["middle_name"])
    print("LAST NAME  :", result["last_name"])
    print("DOCUMENT   :", result["document_type"])
    print("TIMING      :", result["timing"])
    print("================================================")
    return result


# ============================================================
# FLASK /OCR
# ============================================================

@app.route("/ocr", methods=["POST"])
def ocr_endpoint():
    temp_path = None

    try:
        if "file" not in request.files:
            return jsonify(
                {
                    "success": False,
                    "error": "No file uploaded."
                }
            ), 400

        uploaded_file = request.files["file"]

        if not uploaded_file.filename:
            return jsonify(
                {
                    "success": False,
                    "error": "No filename provided."
                }
            ), 400

        extension = Path(uploaded_file.filename).suffix.lower()

        allowed_extensions = {
            ".jpg",
            ".jpeg",
            ".png",
            ".webp",
            ".bmp",
            ".tif",
            ".tiff"
        }

        if extension not in allowed_extensions:
            return jsonify(
                {
                    "success": False,
                    "error": "Unsupported image format."
                }
            ), 400

        # ----------------------------------------------------
        # Save upload.
        # ----------------------------------------------------

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=extension
        ) as temp_file:
            uploaded_file.save(temp_file.name)

            temp_path = temp_file.name

        print("[UPLOAD]", temp_path)

        # ----------------------------------------------------
        # Process.
        # ----------------------------------------------------

        result = extract_document(temp_path)

        return jsonify(result), 200

    except Exception as exc:
        print("")
        print("================================================")
        print("[OCR ERROR]")
        print("================================================")
        print(str(exc))
        print("================================================")

        return jsonify(
            {
                "success": False,
                "error": str(exc)
            }
        ), 500

    finally:
        if temp_path:
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)

            except Exception as exc:
                print("[CLEANUP ERROR]", str(exc))


# ============================================================
# HEALTH
# ============================================================

@app.route("/health", methods=["GET"])
def health():
    return jsonify(
        {
            "success": True,
            "service": "RegisScan OCR Server",
            "status": "running"
        }
    )


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":
    print("")
    print("================================================")
    print(" RegisScan OCR Server - PARSER FIXED / FAST MODE")
    print("================================================")
    print("Build  : 2026-10-10 parser-fix")
    print("OCR    : http://127.0.0.1:5001/ocr")
    print("Health : http://127.0.0.1:5001/health")
    print("Target : Owner name + document type")
    print("Fields : First / Middle / Last")
    print("================================================")
    print("")

    app.run(
        host="0.0.0.0",
        port=5001,
        debug=False,
        threaded=True
    )