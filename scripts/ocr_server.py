import os
import re
import time
import tempfile
from pathlib import Path

import cv2
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS
from paddleocr import PaddleOCR
from shapely import box


# ============================================================
# FLASK
# ============================================================

app = Flask(__name__)
CORS(app)


# ============================================================
# CONFIGURATION
# ============================================================

OCR_ENABLE_MKLDNN = os.environ.get("OCR_ENABLE_MKLDNN", "0") == "1"

try:
    OCR_CPU_THREADS = max(
        1,
        int(os.environ.get("OCR_CPU_THREADS", os.cpu_count() or 4))
    )
except Exception:
    OCR_CPU_THREADS = 4

OCR_MAX_SIZE = int(os.environ.get("OCR_MAX_SIZE", "3200"))

OCR_TEXTLINE_ORIENTATION = (
    os.environ.get("OCR_TEXTLINE_ORIENTATION", "0") == "1"
)


# ============================================================
# PADDLEOCR
# ============================================================

_COMMON_ENGINE_KWARGS = dict(
    text_detection_model_name="PP-OCRv6_small_det",
    text_recognition_model_name="PP-OCRv6_small_rec",
    device="cpu",
    use_doc_orientation_classify=False,
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


def normalize_text(text):
    text = clean_text(text).upper()

    text = re.sub(
        r"[^A-Z0-9 ]",
        " ",
        text
    )

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text.strip()


def clean_name(text):
    text = clean_text(text)

    text = re.sub(
        r"[^A-Za-zÀ-ÖØ-öø-ÿ' -]",
        " ",
        text
    )

    text = re.sub(
        r"\s+",
        " ",
        text
    )

    return text.strip()


# ============================================================
# GEOMETRY
# ============================================================

def polygon_to_box(polygon):
    try:
        arr = np.asarray(
            polygon,
            dtype=float
        )

        if (
            arr.ndim == 2
            and arr.shape[1] >= 2
        ):
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
    return max(
        0.0,
        box[2] - box[0]
    )


def box_height(box):
    return max(
        0.0,
        box[3] - box[1]
    )


def horizontal_overlap(a, b):
    left = max(
        a[0],
        b[0]
    )

    right = min(
        a[2],
        b[2]
    )

    return max(
        0.0,
        right - left
    )


def vertical_overlap(a, b):
    top = max(
        a[1],
        b[1]
    )

    bottom = min(
        a[3],
        b[3]
    )

    return max(
        0.0,
        bottom - top
    )


# ============================================================
# IMAGE PREPARATION
# ============================================================

def resize_document(image):
    if image is None:
        return image

    h, w = image.shape[:2]

    largest = max(
        h,
        w
    )

    if largest <= OCR_MAX_SIZE:
        return image

    scale = (
        OCR_MAX_SIZE
        / float(largest)
    )

    new_w = max(
        1,
        int(w * scale)
    )

    new_h = max(
        1,
        int(h * scale)
    )

    return cv2.resize(
        image,
        (new_w, new_h),
        interpolation=cv2.INTER_AREA
    )


def deskew_document(image):
    try:
        gray = cv2.cvtColor(
            image,
            cv2.COLOR_BGR2GRAY
        )

        _, threshold = cv2.threshold(
            gray,
            0,
            255,
            cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU
        )

        coords = np.column_stack(
            np.where(threshold > 0)
        )

        if len(coords) < 200:
            return image

        angle = cv2.minAreaRect(
            coords
        )[-1]

        if angle < -45:
            angle = -(90 + angle)
        else:
            angle = -angle

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
    try:
        if isinstance(obj, dict):
            return obj.get(
                key,
                default
            )

    except Exception:
        pass

    try:
        return getattr(
            obj,
            key
        )

    except Exception:
        return default


def parse_ocr_result(result):
    items = []

    if result is None:
        return items

    if isinstance(result, list):
        for element in result:
            items.extend(
                parse_ocr_result(element)
            )

        return items

    # --------------------------------------------------------
    # PaddleOCR v3 style result
    # --------------------------------------------------------

    rec_texts = safe_get(
        result,
        "rec_texts"
    )

    rec_scores = safe_get(
        result,
        "rec_scores"
    )

    dt_polys = safe_get(
        result,
        "dt_polys"
    )

    if rec_texts is not None:
        try:
            texts = list(rec_texts)
        except Exception:
            texts = []

        try:
            scores = (
                list(rec_scores)
                if rec_scores is not None
                else []
            )

        except Exception:
            scores = []

        try:
            polygons = (
                list(dt_polys)
                if dt_polys is not None
                else []
            )

        except Exception:
            polygons = []

        for i, text in enumerate(texts):
            text = clean_text(text)

            if not text:
                continue

            score = 0.0

            if i < len(scores):
                try:
                    score = float(
                        scores[i]
                    )
                except Exception:
                    score = 0.0

            box = None

            if i < len(polygons):
                box = polygon_to_box(
                    polygons[i]
                )

            items.append(
                {
                    "text": text,
                    "score": score,
                    "box": box
                }
            )

        return items

    nested = safe_get(
        result,
        "res"
    )

    if (
        nested is not None
        and nested is not result
    ):
        nested_items = parse_ocr_result(
            nested
        )

        if nested_items:
            return nested_items

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
        # Convert to grayscale for contrast enhancement.
        gray = cv2.cvtColor(
            image,
            cv2.COLOR_BGR2GRAY
        )

        # Improve local contrast, especially for faded text.
        clahe = cv2.createCLAHE(
            clipLimit=2.0,
            tileGridSize=(8, 8)
        )

        enhanced_gray = clahe.apply(
            gray
        )

        # Mild denoising to reduce scan noise.
        denoised = cv2.fastNlMeansDenoising(
            enhanced_gray,
            None,
            h=8,
            templateWindowSize=7,
            searchWindowSize=21
        )

        # Mild sharpening to make text edges clearer.
        blurred = cv2.GaussianBlur(
            denoised,
            (0, 0),
            1.0
        )

        sharpened = cv2.addWeighted(
            denoised,
            1.5,
            blurred,
            -0.5,
            0
        )

        # PaddleOCR expects a 3-channel image in this pipeline.
        enhanced_image = cv2.cvtColor(
            sharpened,
            cv2.COLOR_GRAY2BGR
        )

        return enhanced_image

    except Exception as exc:
        print(
            "[OCR ENHANCEMENT] Failed:",
            str(exc)
        )

        # Fall back to the original image.
        return image


# ============================================================
# ADDITIONAL OCR: UPPER NAME SECTION
# ============================================================

def crop_upper_name_section(image):
    """
    Return the upper 65% of the document.

    The crop gives OCR another opportunity to recognize
    the child's name without processing the entire page.

    The original full-document OCR is still retained.
    """

    if image is None or image.size == 0:
        return None, 0

    height, width = image.shape[:2]

    # Keep a generous area because certificate layouts
    # and scan margins can vary.
    crop_bottom = int(
        height * 0.65
    )

    crop_bottom = max(
        1,
        min(crop_bottom, height)
    )

    upper_crop = image[
        0:crop_bottom,
        0:width
    ].copy()

    return upper_crop, 0


# ============================================================
# ADDITIONAL OCR: COORDINATE ADJUSTMENT
# ============================================================

def shift_ocr_items(
    items,
    x_offset=0,
    y_offset=0
):
    """
    Convert crop-relative OCR boxes into full-document
    coordinates so existing name-selection logic can use
    both full-page and cropped OCR results.
    """

    shifted_items = []

    for item in items:
        new_item = dict(item)

        box = item.get(
            "box"
        )

        if box is not None:
            new_item["box"] = (
                float(box[0]) + x_offset,
                float(box[1]) + y_offset,
                float(box[2]) + x_offset,
                float(box[3]) + y_offset
            )

        shifted_items.append(
            new_item
        )

    return shifted_items


# ============================================================
# ADDITIONAL OCR: MERGE AND REMOVE DUPLICATES
# ============================================================

def merge_ocr_items(
    original_items,
    additional_items
):
    """
    Combine OCR results while avoiding duplicate detections
    of the same text in nearly identical locations.

    The original full-document OCR detections are kept.
    """

    merged = list(
        original_items
    )

    for candidate in additional_items:
        candidate_text = normalize_text(
            candidate.get(
                "text",
                ""
            )
        )

        candidate_box = candidate.get(
            "box"
        )

        if (
            not candidate_text
            or candidate_box is None
        ):
            continue

        duplicate_found = False

        for existing in merged:
            existing_text = normalize_text(
                existing.get(
                    "text",
                    ""
                )
            )

            existing_box = existing.get(
                "box"
            )

            if existing_box is None:
                continue

            # Same text is not enough by itself:
            # it must also be in approximately the same area.
            if candidate_text != existing_text:
                continue

            center_a = box_center(
                candidate_box
            )

            center_b = box_center(
                existing_box
            )

            distance = (
                abs(
                    center_a[0] - center_b[0]
                )
                +
                abs(
                    center_a[1] - center_b[1]
                )
            )

            max_height = max(
                1.0,
                box_height(candidate_box),
                box_height(existing_box)
            )

            if distance <= max_height * 1.5:
                duplicate_found = True

                # Keep whichever detection has higher confidence.
                if float(
                    candidate.get(
                        "score",
                        0
                    )
                ) > float(
                    existing.get(
                        "score",
                        0
                    )
                ):
                    existing["score"] = candidate.get(
                        "score",
                        0
                    )

                break

        if not duplicate_found:
            merged.append(
                candidate
            )

    return merged


# ============================================================
# ADDITIONAL OCR: FOCUSED NAME-SECTION PASS
# ============================================================

def run_upper_name_ocr(image):
    """
    Run OCR on an enhanced crop of the upper document.

    Returns detections using full-document coordinates.
    """

    if image is None or image.size == 0:
        return []

    print("")
    print("================================================")
    print("[UPPER NAME SECTION OCR]")
    print("================================================")

    upper_crop, y_offset = crop_upper_name_section(
        image
    )

    if (
        upper_crop is None
        or upper_crop.size == 0
    ):
        print(
            "[UPPER OCR] Could not create crop."
        )

        return []

    print(
        "[UPPER OCR] Crop dimensions:",
        upper_crop.shape[1],
        "x",
        upper_crop.shape[0]
    )

    enhanced_crop = enhance_image_for_ocr(
        upper_crop
    )

    # First pass: enhanced crop.
    enhanced_items = run_ocr(
        enhanced_crop
    )

    print(
        "[UPPER OCR] Enhanced detections:",
        len(enhanced_items)
    )

    # Second pass: original crop.
    #
    # This helps when enhancement makes faint text clearer
    # but changes the appearance of some printed characters.
    original_crop_items = run_ocr(
        upper_crop
    )

    print(
        "[UPPER OCR] Original crop detections:",
        len(original_crop_items)
    )

    # Both passes use the same crop coordinates.
    enhanced_items = shift_ocr_items(
        enhanced_items,
        x_offset=0,
        y_offset=y_offset
    )

    original_crop_items = shift_ocr_items(
        original_crop_items,
        x_offset=0,
        y_offset=y_offset
    )

    # Combine the two crop passes.
    focused_items = merge_ocr_items(
        enhanced_items,
        original_crop_items
    )

    print(
        "[UPPER OCR] Combined detections:",
        len(focused_items)
    )

    print(
        "================================================"
    )

    return focused_items


# ============================================================
# OCR RUNNER
# ============================================================

def run_ocr(image):
    if (
        image is None
        or image.size == 0
    ):
        return []

    try:
        result = ocr_engine.predict(
            image
        )

        return parse_ocr_result(
            result
        )

    except AttributeError:
        try:
            result = ocr_engine.ocr(
                image,
                cls=OCR_TEXTLINE_ORIENTATION
            )

            return parse_ocr_result(
                result
            )

        except Exception as exc:
            print(
                "[OCR] Error:",
                str(exc)
            )

            return []

    except Exception as exc:
        print(
            "[OCR] Error:",
            str(exc)
        )

        return []


# ============================================================
# LABEL IDENTIFICATION
# ============================================================

def classify_label(text):
    text = normalize_text(
        text
    )

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
        text = text.replace(
            old,
            new
        )

    if text in {
        "FIRST NAME",
        "FIRST",
        "GIVEN NAME"
    }:
        return "FIRST"

    if text in {
        "MIDDLE NAME",
        "MIDDLE"
    }:
        return "MIDDLE"

    if text in {
        "LAST NAME",
        "LAST",
        "SURNAME",
        "FAMILY NAME"
    }:
        return "LAST"

    return None


# ============================================================
# OWNER / CHILD SECTION DETECTION
# ============================================================

OWNER_ANCHORS = [
    "NAME OF CHILD",
    "NAME OF CHILD",
    "CHILD'S NAME",
    "CHILDS NAME",
    "NAME OF THE CHILD",
    "NAME",
    "CHILD",
]


def is_owner_anchor(text):
    normalized = normalize_text(
        text
    )

    # Strongest indicators first.
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


def is_parent_anchor(text):
    normalized = normalize_text(
        text
    )

    parent_patterns = [
        "MOTHER",
        "MOTHER'S NAME",
        "MOTHERS NAME",
        "FATHER",
        "FATHER'S NAME",
        "FATHERS NAME",
        "PARENT",
        "PARENTS",
    ]

    for pattern in parent_patterns:
        if pattern in normalized:
            return True

    return False


def find_owner_anchor(items):
    candidates = []

    for item in items:
        text = item.get(
            "text",
            ""
        )

        box = item.get(
            "box"
        )

        if (
            not text
            or box is None
        ):
            continue

        if is_owner_anchor(text):
            candidates.append(
                item
            )

    if not candidates:
        return None

    # Prefer highest OCR confidence.
    candidates.sort(
        key=lambda item: float(
            item.get(
                "score",
                0
            )
        ),
        reverse=True
    )

    return candidates[0]


# ============================================================
# FIND NAME LABELS
# ============================================================

def find_name_labels(items):
    labels = []

    for item in items:
        text = item.get(
            "text",
            ""
        )

        box = item.get(
            "box"
        )

        if (
            not text
            or box is None
        ):
            continue

        field = classify_label(
            text
        )

        if field is None:
            continue

        labels.append(
            {
                **item,
                "field": field
            }
        )

    return labels


# ============================================================
# OWNER SECTION SCORING
# ============================================================

def score_label_for_owner(
    label,
    owner_anchor,
    parent_anchors,
    image_height
):
    """
    Score a FIRST/MIDDLE/LAST label according to whether it
    appears in the child's/owner's section.

    Parent sections are actively penalized.
    """

    label_box = label.get(
        "box"
    )

    if label_box is None:
        return -999

    score = 0.0

    label_x, label_y = box_center(
        label_box
    )

    # --------------------------------------------------------
    # OCR confidence.
    # --------------------------------------------------------

    score += (
        float(
            label.get(
                "score",
                0
            )
        )
        * 2.0
    )

    # --------------------------------------------------------
    # Distance from explicit owner anchor.
    # --------------------------------------------------------

    if owner_anchor:
        owner_box = owner_anchor.get(
            "box"
        )

        if owner_box:
            owner_x, owner_y = box_center(
                owner_box
            )

            vertical_distance = abs(
                label_y - owner_y
            )

            # Closer to child name section = better.
            score += max(
                0,
                3.0
                - (
                    vertical_distance
                    / max(
                        1.0,
                        image_height * 0.20
                    )
                )
            )

    # --------------------------------------------------------
    # Parent section penalty.
    # --------------------------------------------------------

    for parent in parent_anchors:
        parent_box = parent.get(
            "box"
        )

        if parent_box is None:
            continue

        _, parent_y = box_center(
            parent_box
        )

        distance = abs(
            label_y - parent_y
        )

        # Strong penalty when label is close to a parent
        # section.
        if distance < (
            image_height * 0.18
        ):
            score -= 5.0

    return score


# ============================================================
# OWNER LABEL SELECTION
# ============================================================

def select_owner_labels(items):
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

        t = re.sub(
            r"[^a-z]",
            "",
            t
        )

                # ------------------------------------------------------------
        # OCR-TOLERANT LABEL NORMALIZATION
        #
        # Birth certificates may produce OCR variations such as:
        #   First   -> Firat / Fira / Frst / Firt
        #   Middle  -> Middie / Mddie / Midle
        #   Last    -> Lst / LaSt / Iast
        #
        # Do not rely only on exact spelling because PaddleOCR can
        # misread printed labels while correctly reading the actual
        # handwritten/typed name underneath.
        # ------------------------------------------------------------

        # Remove common OCR punctuation/brackets before matching.
        t = re.sub(
            r"[^a-z]",
            "",
            t
        )

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
            "firstname"
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
            "midele"
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
            "lats"
        }

        if t in last_variants:
            return "LAST"

        # ------------------------------------------------------------
        # FUZZY OCR FALLBACK
        #
        # This catches small OCR errors that are not explicitly
        # listed above. It is deliberately restricted to the three
        # expected field labels so ordinary certificate text will
        # not easily become a name-field label.
        # ------------------------------------------------------------

        try:
            from difflib import SequenceMatcher

            candidates = {
                "FIRST": [
                    "first",
                    "firstname"
                ],
                "MIDDLE": [
                    "middle",
                    "middlename"
                ],
                "LAST": [
                    "last",
                    "lastname",
                    "surname"
                ]
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

            # Require a reasonably close match.
            #
            # This is intentionally conservative so words such as
            # "birth", "name", "date", etc. are not accidentally
            # classified as FIRST/MIDDLE/LAST.
            if best_score >= 0.72:

                # Prevent very short OCR garbage from being accepted.
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
        return max(
            1.0,
            float(box[3]) - float(box[1])
        )

    def vertical_distance(a, b):
        _, ay = box_center(
            a["box"]
        )

        _, by = box_center(
            b["box"]
        )

        return abs(
            ay - by
        )

    # ------------------------------------------------------------
    # 1. Find all possible FIRST / MIDDLE / LAST labels
    # ------------------------------------------------------------

    labels = []

    for item in items:
        text = str(
            item.get(
                "text",
                ""
            )
        ).strip()

        box = item.get(
            "box"
        )

        if (
            not text
            or not box
            or len(box) != 4
        ):
            continue

                # ------------------------------------------------------------
        # IMPORTANT:
        # Section headers such as:
        #
        #     1. NAME
        #     6. MAIDEN NAME
        #     13. NAME
        #
        # are NOT FIRST/MIDDLE/LAST field labels.
        #
        # Some OCR passes may incorrectly classify "NAME" as LAST.
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

        # Reject generic NAME headers.
        # Examples:
        #   "1. NAME"
        #   "13. NAME"
        #   "NAME"
        #   "6. MAIDEN NAME"
        #
        # Do NOT reject actual labels such as:
        #   "(First)"
        #   "(Middle)"
        #   "(Last)"
        if (
            normalized_compact == "name"
            or normalized_compact == "firstname"
            or normalized_compact == "middlename"
            or normalized_compact == "lastname"
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

        label_type = normalize_label(
            text
        )

        if label_type is None:
            continue

        score = float(
            item.get(
                "score",
                0.0
            )
        )

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
        print(
            "[OWNER LABELS] No FIRST/MIDDLE/LAST labels found."
        )

        return {
            "FIRST": None,
            "MIDDLE": None,
            "LAST": None,
        }

    # ------------------------------------------------------------
    # 2. Print all detected labels
    # ------------------------------------------------------------

    print(
        f"[OWNER LABELS] Detected label candidates: {len(labels)}"
    )

    for label in labels:
        cx, cy = box_center(
            label["box"]
        )

        print(
            f" {label['type']}: "
            f"'{label['text']}' "
            f"box={label['box']} "
            f"center=({cx:.1f},{cy:.1f}) "
            f"score={label['score']:.3f}"
        )

    # ------------------------------------------------------------
    # 3. Group labels by vertical row
    #
    # Labels belonging to the same name section should have
    # approximately the same Y coordinate.
    # ------------------------------------------------------------

    rows = []

    # Process labels from top to bottom.
    labels_sorted = sorted(
        labels,
        key=lambda x: box_center(
            x["box"]
        )[1]
    )

    for label in labels_sorted:
        _, cy = box_center(
            label["box"]
        )

        h = box_height(
            label["box"]
        )

        placed = False

        for row in rows:
            # Compare against average Y of the current row.
            row_y = row["y"]

            # Allow OCR boxes to differ slightly vertically.
            tolerance = max(
                22.0,
                h * 0.75
            )

            if abs(
                cy - row_y
            ) <= tolerance:
                row["labels"].append(
                    label
                )

                # Update row center.
                ys = [
                    box_center(
                        x["box"]
                    )[1]
                    for x in row["labels"]
                ]

                row["y"] = (
                    sum(ys)
                    / len(ys)
                )

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
    #
    # Example:
    # (First)
    # (Fira)
    #
    # Keep the highest-confidence one.
    # ------------------------------------------------------------

    for row in rows:
        by_type = {
            "FIRST": [],
            "MIDDLE": [],
            "LAST": [],
        }

        for label in row["labels"]:
            by_type[
                label["type"]
            ].append(
                label
            )

        cleaned = []

        for label_type in (
            "FIRST",
            "MIDDLE",
            "LAST"
        ):
            candidates = by_type[
                label_type
            ]

            if not candidates:
                continue

            # --------------------------------------------------------
            # Prefer explicit field labels over generic/section labels.
            #
            # Example:
            #
            #   "1. NAME"  score=0.993
            #   "(Last)"   score=0.978
            #
            # The explicit "(Last)" label MUST win even if its OCR
            # confidence is slightly lower.
            # --------------------------------------------------------

            def label_priority(label):
                label_text = str(
                    label.get("text", "")
                ).strip().lower()

                compact = re.sub(
                    r"[^a-z]",
                    "",
                    label_text
                )

                # Explicit field labels get highest priority.
                if label_type == "FIRST":
                    if compact in {
                        "first",
                        "firstname",
                        "frist",
                        "firts",
                    }:
                        return 100

                elif label_type == "MIDDLE":
                    if compact in {
                        "middle",
                        "middlename",
                        "midle",
                        "midele",
                    }:
                        return 100

                elif label_type == "LAST":
                    if compact in {
                        "last",
                        "lastname",
                        "lst",
                        "surname",
                    }:
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
                    float(
                        x.get(
                            "score",
                            0.0
                        )
                    )
                ),
                reverse=True
            )

            cleaned.append(
                candidates[0]
            )

        row["labels"] = cleaned

    # ------------------------------------------------------------
    # 5. Show detected rows
    # ------------------------------------------------------------

    print(
        "\n[OWNER LABEL ROWS]"
    )

    for index, row in enumerate(rows):
        types = [
            label["type"]
            for label in sorted(
                row["labels"],
                key=lambda x: box_center(
                    x["box"]
                )[0]
            )
        ]

        texts = [
            label["text"]
            for label in sorted(
                row["labels"],
                key=lambda x: box_center(
                    x["box"]
                )[0]
            )
        ]

        print(
            f" Row {index}: "
            f"y={row['y']:.1f} "
            f"labels={types} "
            f"text={texts}"
        )

    # ------------------------------------------------------------
    # 6. Find complete FIRST + MIDDLE + LAST rows
    #
    # THIS IS THE IMPORTANT PART.
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
            for key in (
                "FIRST",
                "MIDDLE",
                "LAST"
            )
        ):
            continue

        first = label_map["FIRST"]
        middle = label_map["MIDDLE"]
        last = label_map["LAST"]

        first_x, _ = box_center(
            first["box"]
        )

        middle_x, _ = box_center(
            middle["box"]
        )

        last_x, _ = box_center(
            last["box"]
        )

        # FIRST should be left of MIDDLE,
        # and MIDDLE left of LAST.
        correct_order = (
            first_x
            < middle_x
            < last_x
        )

        if not correct_order:
            continue

        # Measure how vertically aligned the three labels are.
        y_values = [
            box_center(
                first["box"]
            )[1],
            box_center(
                middle["box"]
            )[1],
            box_center(
                last["box"]
            )[1],
        ]

        vertical_spread = (
            max(y_values)
            - min(y_values)
        )

        # The labels in one section should be tightly aligned.
        if vertical_spread > 35:
            continue

        # Horizontal spacing should also be reasonable.
        gap1 = (
            middle_x
            - first_x
        )

        gap2 = (
            last_x
            - middle_x
        )

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
    # 7. If complete rows exist, select the TOPMOST complete row.
    #
    # On the birth certificate:
    #
    # y ~ 400 = CHILD
    # y ~ 790 = MOTHER
    # y ~ 1150 = FATHER
    #
    # Therefore the topmost complete NAME row is the child's name.
    # ------------------------------------------------------------

    if complete_rows:
        complete_rows.sort(
            key=lambda x: x["row"]["y"]
        )

        selected = complete_rows[0]

        print(
            "\n[OWNER NAME SECTION]"
        )

        print(
            f"Complete name rows found: "
            f"{len(complete_rows)}"
        )

        for candidate in complete_rows:
            print(
                f" Row {candidate['index']} "
                f"y={candidate['row']['y']:.1f} "
                f"spread={candidate['vertical_spread']:.1f} "
                f"score={candidate['score_sum']:.3f}"
            )

        print(
            "\n[SELECTED CHILD NAME LABEL GROUP]"
        )

        print(
            f"Row {selected['index']} "
            f"y={selected['row']['y']:.1f}"
        )

        print(
            f"FIRST: "
            f"'{selected['FIRST']['text']}' "
            f"box={selected['FIRST']['box']} "
            f"score={selected['FIRST']['score']:.3f}"
        )

        print(
            f"MIDDLE: "
            f"'{selected['MIDDLE']['text']}' "
            f"box={selected['MIDDLE']['box']} "
            f"score={selected['MIDDLE']['score']:.3f}"
        )

        print(
            f"LAST: "
            f"'{selected['LAST']['text']}' "
            f"box={selected['LAST']['box']} "
            f"score={selected['LAST']['score']:.3f}"
        )

        return {
            "FIRST": selected["FIRST"],
            "MIDDLE": selected["MIDDLE"],
            "LAST": selected["LAST"],
        }

    # ------------------------------------------------------------
    # 8. Fallback
    #
    # If the document does not produce a complete row, choose
    # labels from the topmost reasonable row rather than mixing
    # different sections.
    # ------------------------------------------------------------

    print(
        "\n[OWNER LABELS] "
        "No complete FIRST/MIDDLE/LAST row found."
    )

    if rows:

        # ------------------------------------------------------------
        # SAFER FALLBACK
        #
        # Prefer a row containing the largest number of recognized
        # name labels. If multiple rows have the same number of
        # labels, prefer the uppermost row.
        #
        # This prevents a row containing only MIDDLE + LAST from
        # being treated as a complete owner-name structure.
        # ------------------------------------------------------------

        usable_rows = [
            row
            for row in rows
            if len(row["labels"]) >= 2
        ]

        if usable_rows:

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

                label_type = label.get(
                    "type"
                )

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
    label_box = label.get(
        "box"
    )

    if label_box is None:
        return []

    lx1, ly1, lx2, ly2 = (
        label_box
    )

    label_h = max(
        1.0,
        box_height(label_box)
    )

    label_cx, label_cy = box_center(
        label_box
    )

    candidates = []

    for item in items:
        box = item.get(
            "box"
        )

        text = item.get(
            "text",
            ""
        )

        if (
            box is None
            or not text
        ):
            continue

        # Never use another recognized label as value.
        if classify_label(text):
            continue

        # ----------------------------------------------------
        # Value must be BELOW the selected label.
        # ----------------------------------------------------

        cx, cy = box_center(
            box
        )

        if cy <= ly2:
            continue

        distance_y = (
            cy - ly2
        )

        # ------------------------------------------------------------
        # NAME VALUE PROTECTION
        #
        # The value of FIRST/MIDDLE/LAST is normally directly below
        # its field label. Keep the first candidate window tight.
        #
        # For poor-quality/scanned certificates, allow a larger
        # window, but score nearby values much higher.
        # ------------------------------------------------------------

        max_vertical_distance = max(
            70.0,
            label_h * 4.5
        )

        if distance_y > max_vertical_distance:
            continue

        # ----------------------------------------------------
        # Candidate must overlap the label's horizontal area.
        # ----------------------------------------------------

        overlap = horizontal_overlap(
            box,
            label_box
        )

        candidate_width = box_width(
            box
        )

        if (
            overlap <= 0
            and candidate_width > 0
        ):
            # Allow nearby text, but not text from far away.
            if cx < (
                lx1 - candidate_width
            ):
                continue

            if cx > (
                lx2 + candidate_width
            ):
                continue

        # ----------------------------------------------------
        # Avoid candidates sitting directly inside another
        # selected field's region.
        # ----------------------------------------------------

        belongs_to_other = False

        for other_field, other_label in (
            selected_other_labels.items()
        ):
            if other_label is label:
                continue

            other_box = other_label.get(
                "box"
            )

            if other_box is None:
                continue

            other_cx, other_cy = (
                box_center(
                    other_box
                )
            )

            # If candidate is much closer horizontally to
            # another field label, don't steal it.
            current_distance = abs(
                cx - label_cx
            )

            other_distance = abs(
                cx - other_cx
            )

            if (
                other_distance
                < current_distance * 0.55
            ):
                belongs_to_other = True
                break

        if belongs_to_other:
            continue

                # ------------------------------------------------------------
        # Calculate a geometry score.
        #
        # Text immediately below the field label is preferred.
        # This is especially important for:
        #
        #     (Last)
        #     DADES
        #
        # so unrelated text such as "SEX" cannot win.
        # ------------------------------------------------------------

        horizontal_distance = abs(
            cx - label_cx
        )

        vertical_score = 1.0 / (
            1.0 + distance_y
        )

        horizontal_score = 1.0 / (
            1.0 + horizontal_distance
        )

        geometry_score = (
            vertical_score * 0.65
            + horizontal_score * 0.35
        )

        candidates.append(
            {
                **item,
                "distance_y": distance_y,
                "distance_x": horizontal_distance,
                "geometry_score": geometry_score,
            }
        )

    return candidates


def choose_one_value_line(candidates):
    if not candidates:
        return ""

    # --------------------------------------------------------
    # REMOVE OVERLAPPING OCR DUPLICATES
    #
    # PaddleOCR may return multiple readings of the same
    # printed name from the full-page OCR and the focused
    # upper-section OCR.
    #
    # Example:
    # ANHA MAY score=0.951
    # ANNA MAY score=0.993
    #
    # If the detections occupy almost the same physical
    # location, they are treated as alternate OCR readings
    # of the same printed text.
    #
    # The highest-confidence reading is kept.
    # --------------------------------------------------------

    filtered_candidates = []

    # Process highest-confidence detections first.
    candidates_sorted = sorted(
        candidates,
        key=lambda item: float(
            item.get(
                "score",
                0
            )
        ),
        reverse=True
    )

    for candidate in candidates_sorted:
        candidate_box = candidate.get(
            "box"
        )

        if candidate_box is None:
            continue

        candidate_cx, candidate_cy = box_center(
            candidate_box
        )

        candidate_width = max(
            1.0,
            box_width(candidate_box)
        )

        candidate_height = max(
            1.0,
            box_height(candidate_box)
        )

        duplicate_location = False

        for existing in filtered_candidates:
            existing_box = existing.get(
                "box"
            )

            if existing_box is None:
                continue

            existing_cx, existing_cy = box_center(
                existing_box
            )

            existing_width = max(
                1.0,
                box_width(existing_box)
            )

            existing_height = max(
                1.0,
                box_height(existing_box)
            )

            # ------------------------------------------------
            # 1. CENTER DISTANCE
            # ------------------------------------------------

            center_distance_x = abs(
                candidate_cx - existing_cx
            )

            center_distance_y = abs(
                candidate_cy - existing_cy
            )

            # ------------------------------------------------
            # 2. SIZE SIMILARITY
            # ------------------------------------------------

            width_difference = abs(
                candidate_width - existing_width
            )

            height_difference = abs(
                candidate_height - existing_height
            )

            similar_size = (
                width_difference
                <= max(
                    candidate_width,
                    existing_width
                ) * 0.40
                and
                height_difference
                <= max(
                    candidate_height,
                    existing_height
                ) * 0.60
            )

            # ------------------------------------------------
            # 3. ACTUAL BOX OVERLAP / IoU
            #
            # This is stronger than checking only the centers.
            # ------------------------------------------------

            intersection_left = max(
                candidate_box[0],
                existing_box[0]
            )

            intersection_top = max(
                candidate_box[1],
                existing_box[1]
            )

            intersection_right = min(
                candidate_box[2],
                existing_box[2]
            )

            intersection_bottom = min(
                candidate_box[3],
                existing_box[3]
            )

            intersection_width = max(
                0.0,
                intersection_right
                - intersection_left
            )

            intersection_height = max(
                0.0,
                intersection_bottom
                - intersection_top
            )

            intersection_area = (
                intersection_width
                * intersection_height
            )

            candidate_area = (
                candidate_width
                * candidate_height
            )

            existing_area = (
                existing_width
                * existing_height
            )

            union_area = (
                candidate_area
                + existing_area
                - intersection_area
            )

            if union_area > 0:
                iou = (
                    intersection_area
                    / union_area
                )
            else:
                iou = 0.0

            # ------------------------------------------------
            # 4. DETERMINE WHETHER THIS IS THE SAME PRINTED
            # TEXT.
            #
            # Condition A:
            # Very strong physical overlap.
            #
            # OR
            #
            # Condition B:
            # Almost identical center + similar size.
            # ------------------------------------------------

            strong_overlap = (
                iou >= 0.45
                and
                center_distance_y
                <= max(
                    candidate_height,
                    existing_height
                ) * 1.00
            )

            almost_same_detection = (
                center_distance_x
                <= max(
                    candidate_width,
                    existing_width
                ) * 0.20
                and
                center_distance_y
                <= max(
                    candidate_height,
                    existing_height
                ) * 0.75
                and
                similar_size
            )

            if (
                strong_overlap
                or almost_same_detection
            ):
                duplicate_location = True

                print(
                    "[VALUE OCR] Duplicate OCR "
                    "detection removed:"
                )

                print(
                    f" KEPT: "
                    f"'{existing.get('text', '')}' "
                    f"score="
                    f"{existing.get('score', 0):.3f} "
                    f"box="
                    f"{existing_box}"
                )

                print(
                    f" REMOVED: "
                    f"'{candidate.get('text', '')}' "
                    f"score="
                    f"{candidate.get('score', 0):.3f} "
                    f"box="
                    f"{candidate_box}"
                )

                print(
                    f" IoU={iou:.3f} "
                    f"center_dx={center_distance_x:.1f} "
                    f"center_dy={center_distance_y:.1f}"
                )

                break

        if not duplicate_location:
            filtered_candidates.append(
                candidate
            )

    # --------------------------------------------------------
    # DEBUG
    # --------------------------------------------------------

    print(
        f"[VALUE OCR] "
        f"Candidates before duplicate filtering: "
        f"{len(candidates)}"
    )

    print(
        f"[VALUE OCR] "
        f"Candidates after duplicate filtering: "
        f"{len(filtered_candidates)}"
    )

    candidates = filtered_candidates

    if not candidates:
        return ""

    # --------------------------------------------------------
    # CHOOSE THE NEAREST TEXT BELOW THE LABEL
    #
    # If multiple different pieces of text remain, prefer
    # the closest line below the selected label.
    # --------------------------------------------------------

    candidates.sort(
        key=lambda item: (
            item["distance_y"],
            -float(
                item.get(
                    "score",
                    0
                )
            )
        )
    )

    first = candidates[0]

    first_box = first.get(
        "box"
    )

    if first_box is None:
        return ""

    first_cy = box_center(
        first_box
    )[1]

    first_height = max(
        1.0,
        box_height(first_box)
    )

    # --------------------------------------------------------
    # KEEP ONLY TEXT ON THE SAME PHYSICAL LINE
    # --------------------------------------------------------

    same_line = []

    for item in candidates:
        box = item.get(
            "box"
        )

        if box is None:
            continue

        cy = box_center(
            box
        )[1]

        if abs(
            cy - first_cy
        ) <= first_height * 0.70:
            same_line.append(
                item
            )

    # Left-to-right ordering.
    same_line.sort(
        key=lambda item: item["box"][0]
    )

    parts = []

    seen = set()

    for item in same_line:
        text = clean_name(
            item.get(
                "text",
                ""
            )
        )

        if not text:
            continue

        key = text.upper()

        if key in seen:
            continue

        seen.add(
            key
        )

        parts.append(
            text
        )

    return " ".join(
        parts
    ).strip()


# ============================================================
# OWNER NAME EXTRACTION
# ============================================================

def extract_owner_name(
    image,
    items
):
    image_height, image_width = (
        image.shape[:2]
    )

    selected = select_owner_labels(
        items
    )

    owner_anchor = find_owner_anchor(
        items
    )

    print("")
    print(
        "================================================"
    )
    print(
        "[SELECTED OWNER FIELDS]"
    )
    print(
        "================================================"
    )

    for field in (
        "FIRST",
        "MIDDLE",
        "LAST"
    ):
        if field in selected:
            item = selected[field]

            print(
                f"{field}: "
                f"'{item['text']}' "
                f"box={item['box']} "
                f"score={item.get('score', 0):.3f}"
            )

        else:
            print(
                f"{field}: NOT SELECTED"
            )

    # --------------------------------------------------------
    # If we cannot identify the owner-specific structure,
    # DO NOT guess.
    # --------------------------------------------------------

    if not selected:
        return {
            "first_name": "",
            "middle_name": "",
            "last_name": "",
            "owner_anchor_found": bool(
                owner_anchor
            )
        }

    result = {
        "first_name": "",
        "middle_name": "",
        "last_name": "",
        "owner_anchor_found": bool(
            owner_anchor
        )
    }

    # --------------------------------------------------------
    # Extract each field separately.
    # --------------------------------------------------------

    for field in (
        "FIRST",
        "MIDDLE",
        "LAST"
    ):
        label = selected.get(
            field
        )

        if label is None:
            continue

        candidates = find_value_items(
            items=items,
            label=label,
            selected_other_labels=selected,
            image_height=image_height
        )

        print("")

        print(
            f"[{field}] "
            f"Candidates:"
        )

        for candidate in candidates:
            print(
                f" '{candidate['text']}' "
                f"box={candidate['box']} "
                f"score={candidate.get('score', 0):.3f}"
            )

                # ------------------------------------------------------------
        # FIELD VALUE SELECTION
        #
        # Do NOT select purely by OCR confidence.
        #
        # A birth certificate contains many high-confidence words
        # near the name fields, e.g.:
        #
        #     SEX
        #     DATE OF BIRTH
        #     NAME
        #
        # The actual name value must be selected using geometry first.
        # ------------------------------------------------------------

        selected_value = ""

        if candidates:
            ranked_candidates = []

            for candidate in candidates:
                text_value = str(
                    candidate.get(
                        "text",
                        ""
                    )
                ).strip()

                if not text_value:
                    continue

                score = float(
                    candidate.get(
                        "score",
                        0.0
                    )
                )

                distance_y = float(
                    candidate.get(
                        "distance_y",
                        9999.0
                    )
                )

                distance_x = float(
                    candidate.get(
                        "distance_x",
                        9999.0
                    )
                )

                geometry_score = float(
                    candidate.get(
                        "geometry_score",
                        0.0
                    )
                )

                normalized_value = re.sub(
                    r"[^a-zA-ZÀ-ÿ'-]",
                    "",
                    text_value
                )

                # ----------------------------------------------------
                # Reject obvious form labels / unrelated fields.
                # ----------------------------------------------------

                normalized_lower = normalized_value.lower()

                forbidden_values = {
                    "sex",
                    "male",
                    "female",
                    "dateofbirth",
                    "birth",
                    "month",
                    "year",
                    "day",
                    "name",
                    "first",
                    "middle",
                    "last",
                    "surname",
                    "citizenship",
                    "religion",
                    "occupation",
                    "residence",
                    "mother",
                    "father",
                    "maiden",
                }

                if normalized_lower in forbidden_values:
                    continue

                # ----------------------------------------------------
                # Name-likeness.
                #
                # Names are normally alphabetic and contain at least
                # 2 characters.
                # ----------------------------------------------------

                alpha_chars = sum(
                    ch.isalpha()
                    for ch in text_value
                )

                digit_chars = sum(
                    ch.isdigit()
                    for ch in text_value
                )

                name_like = (
                    alpha_chars >= 2
                    and digit_chars == 0
                )

                if not name_like:
                    continue

                # ----------------------------------------------------
                # Strong preference for nearby text.
                # Geometry is more important than OCR confidence.
                # ----------------------------------------------------

                proximity_score = (
                    max(
                        0.0,
                        1.0 - (
                            distance_y / 100.0
                        )
                    )
                )

                horizontal_proximity = (
                    max(
                        0.0,
                        1.0 - (
                            distance_x / 250.0
                        )
                    )
                )

                final_score = (
                    score * 0.20
                    + geometry_score * 0.35
                    + proximity_score * 0.30
                    + horizontal_proximity * 0.15
                )

                ranked_candidates.append(
                    (
                        final_score,
                        candidate
                    )
                )

            ranked_candidates.sort(
                key=lambda pair: pair[0],
                reverse=True
            )

            if ranked_candidates:
                best_score, best_candidate = (
                    ranked_candidates[0]
                )

                selected_value = str(
                    best_candidate.get(
                        "text",
                        ""
                    )
                ).strip()

                print(
                    f"[{field}] GEOMETRY-AWARE SELECTED: "
                    f"'{selected_value}' "
                    f"score={best_candidate.get('score', 0):.3f} "
                    f"distance_y={best_candidate.get('distance_y', 0):.1f} "
                    f"distance_x={best_candidate.get('distance_x', 0):.1f} "
                    f"final={best_score:.4f}"
                )

        # ------------------------------------------------------------
        # Fallback to the original selector only when the
        # geometry-aware selector found nothing.
        # ------------------------------------------------------------

        if not selected_value:
            selected_value = choose_one_value_line(
                candidates
            )

            print(
                f"[{field}] FALLBACK VALUE SELECTED: "
                f"'{selected_value}'"
            )

        if field == "FIRST":
            result["first_name"] = selected_value

        elif field == "MIDDLE":
            result["middle_name"] = selected_value

        elif field == "LAST":
            result["last_name"] = selected_value

    # IMPORTANT: return the extracted fields to extract_document().
    return result


# ============================================================
# BIRTHDATE EXTRACTION
# ============================================================

MONTHS = {
    "JANUARY": 1,
    "JAN": 1,
    "FEBRUARY": 2,
    "FEB": 2,
    "MARCH": 3,
    "MAR": 3,
    "APRIL": 4,
    "APR": 4,
    "MAY": 5,
    "JUNE": 6,
    "JUN": 6,
    "JULY": 7,
    "JUL": 7,
    "AUGUST": 8,
    "AUG": 8,
    "SEPTEMBER": 9,
    "SEP": 9,
    "SEPT": 9,
    "OCTOBER": 10,
    "OCT": 10,
    "NOVEMBER": 11,
    "NOV": 11,
    "DECEMBER": 12,
    "DEC": 12,
}


def normalize_year(year):
    """
    Convert a 2-digit year into a reasonable 4-digit year.
    """

    try:
        year = int(
            year
        )

        if year < 100:
            if year <= 30:
                return 2000 + year

            return 1900 + year

        return year

    except Exception:
        return None


def make_birthdate(
    year,
    month,
    day
):
    """
    Validate and return a birthdate in YYYY-MM-DD format.
    """

    try:
        year = normalize_year(
            year
        )

        month = int(
            month
        )

        day = int(
            day
        )

        if year is None:
            return None

        if not (
            1 <= month <= 12
        ):
            return None

        if not (
            1 <= day <= 31
        ):
            return None

        # Use Python datetime for actual calendar validation.
        from datetime import date

        value = date(
            year,
            month,
            day
        )

        return value.strftime(
            "%Y-%m-%d"
        )

    except Exception:
        return None


def parse_date_text(text):
    """
    Try to extract a date from OCR text.

    Supported examples:
    April 10, 2005
    April 10 2005
    Apr 10, 2005
    04/10/2005
    04-10-2005
    04.10.2005
    10/04/2005

    Returns:
    YYYY-MM-DD or ""
    """

    if not text:
        return ""

    original = clean_text(
        text
    )

    if not original:
        return ""

    # --------------------------------------------------------
    # Normalize common OCR date characters.
    # --------------------------------------------------------

    text = original.upper()

    text = text.replace(
        "O",
        "0"
    )

    text = text.replace(
        "I",
        "1"
    )

    text = re.sub(
        r"\s+",
        " ",
        text
    ).strip()

    # --------------------------------------------------------
    # MONTH NAME FORMAT
    #
    # Example:
    # APRIL 10, 2005
    # APR 10 2005
    # --------------------------------------------------------

    month_pattern = (
        r"\b("
        + "|".join(
            sorted(
                MONTHS.keys(),
                key=len,
                reverse=True
            )
        )
        + r")\s+"
        r"([0-3]?\d)"
        r"(?:ST|ND|RD|TH)?"
        r"(?:\s*,?\s*)"
        r"((?:19|20)\d{2})\b"
    )

    match = re.search(
        month_pattern,
        text,
        re.IGNORECASE
    )

    if match:
        month_name = match.group(
            1
        ).upper()

        day = match.group(
            2
        )

        year = match.group(
            3
        )

        month = MONTHS.get(
            month_name
        )

        if month:
            result = make_birthdate(
                year,
                month,
                day
            )

            if result:
                return result

    # --------------------------------------------------------
    # NUMERIC DATE FORMAT
    #
    # Example:
    # 04/10/2005
    # 04-10-2005
    # 04.10.2005
    # --------------------------------------------------------

    numeric_pattern = (
        r"\b"
        r"([0-3]?\d)"
        r"\s*[/\-\.]\s*"
        r"([0-1]?\d)"
        r"\s*[/\-\.]\s*"
        r"((?:19|20)\d{2})"
        r"\b"
    )

    match = re.search(
        numeric_pattern,
        text
    )

    if match:
        first = int(
            match.group(1)
        )

        second = int(
            match.group(2)
        )

        year = match.group(
            3
        )

        # ----------------------------------------------------
        # Philippine birth certificates commonly use
        # month/day/year when numeric.
        #
        # If the first number is > 12, it cannot be a month,
        # so treat it as day/month/year.
        # ----------------------------------------------------

        if (
            first > 12
            and second <= 12
        ):
            day = first
            month = second

        else:
            month = first
            day = second

        result = make_birthdate(
            year,
            month,
            day
        )

        if result:
            return result

    return ""


def is_birthdate_label(text):
    """
    Identify OCR text that is likely a birthdate/date-of-birth label.
    """

    normalized = normalize_text(
        text
    )

    normalized = normalized.replace(
        "0",
        "O"
    )

    patterns = [
        "DATE OF BIRTH",
        "DATE OF BIRTH:",
        "BIRTH DATE",
        "BIRTHDATE",
        "DATE BIRTH",
        "DATE OF BIRTH OF CHILD",
        "CHILD DATE OF BIRTH",
        "DATE OF BIRTH CHILD",
        "DOB",
        "D O B",
    ]

    for pattern in patterns:
        if pattern in normalized:
            return True

    return False


def extract_birthdate(
    ocr_items,
    image_height,
    image_width
):
    """
    Extract the child's birthdate from Philippine birth certificates.

    Handles different certificate layouts where the date of birth may appear:

    - to the right of the DATE OF BIRTH label
    - directly below the DATE OF BIRTH label
    - on the same line as the label
    - as separate OCR tokens: 10 | APRIL | 2005
    - as separate OCR tokens: 25 | MAY | 2005
    - as separate OCR tokens: 31 | MAY | 2005
    - as one OCR text item: APRIL 10, 2005
    - as numeric dates: 04/10/2005, 10/04/2005

    Returns:
    YYYY-MM-DD or "" if no valid birthdate is found.
    """

    if not ocr_items:
        return ""

    # ========================================================
    # GEOMETRY
    # ========================================================

    def geometry(item):
        raw_box = item.get(
            "box"
        )

        if raw_box is None:
            return None

        try:
            # ------------------------------------------------
            # (x1, y1, x2, y2)
            # ------------------------------------------------

            if (
                len(raw_box) == 4
                and not isinstance(
                    raw_box[0],
                    (list, tuple)
                )
            ):
                x1 = float(
                    raw_box[0]
                )

                y1 = float(
                    raw_box[1]
                )

                x2 = float(
                    raw_box[2]
                )

                y2 = float(
                    raw_box[3]
                )

                left = min(
                    x1,
                    x2
                )

                right = max(
                    x1,
                    x2
                )

                top = min(
                    y1,
                    y2
                )

                bottom = max(
                    y1,
                    y2
                )

                return {
                    "left": left,
                    "right": right,
                    "top": top,
                    "bottom": bottom,
                    "cx": (
                        left + right
                    ) / 2,
                    "cy": (
                        top + bottom
                    ) / 2,
                    "width": right - left,
                    "height": bottom - top,
                }

            # ------------------------------------------------
            # [[x,y], [x,y], ...]
            # ------------------------------------------------

            if (
                len(raw_box) >= 4
                and isinstance(
                    raw_box[0],
                    (list, tuple)
                )
            ):
                xs = [
                    float(
                        point[0]
                    )
                    for point in raw_box
                ]

                ys = [
                    float(
                        point[1]
                    )
                    for point in raw_box
                ]

                left = min(
                    xs
                )

                right = max(
                    xs
                )

                top = min(
                    ys
                )

                bottom = max(
                    ys
                )

                return {
                    "left": left,
                    "right": right,
                    "top": top,
                    "bottom": bottom,
                    "cx": (
                        left + right
                    ) / 2,
                    "cy": (
                        top + bottom
                    ) / 2,
                    "width": right - left,
                    "height": bottom - top,
                }

            # ------------------------------------------------
            # [x1,y1,x2,y2,x3,y3,x4,y4]
            # ------------------------------------------------

            if len(raw_box) >= 8:
                values = [
                    float(value)
                    for value in raw_box[:8]
                ]

                xs = values[
                    0::2
                ]

                ys = values[
                    1::2
                ]

                left = min(
                    xs
                )

                right = max(
                    xs
                )

                top = min(
                    ys
                )

                bottom = max(
                    ys
                )

                return {
                    "left": left,
                    "right": right,
                    "top": top,
                    "bottom": bottom,
                    "cx": (
                        left + right
                    ) / 2,
                    "cy": (
                        top + bottom
                    ) / 2,
                    "width": right - left,
                    "height": bottom - top,
                }

        except (
            TypeError,
            ValueError,
            IndexError
        ):
            return None

        return None

    # ========================================================
    # TEXT CLEANING
    # ========================================================

    def clean_date_text(text):
        if text is None:
            return ""

        text = str(
            text
        ).strip()

        text = (
            text
            .replace(
                "–",
                "-"
            )
            .replace(
                "—",
                "-"
            )
            .replace(
                "|",
                " "
            )
        )

        return text.strip(
            ".,:;()[]{}"
        )

    # ========================================================
    # NORMALIZE OCR DATE TEXT
    # ========================================================

    def normalize_date_text(text):
        text = clean_date_text(
            text
        )

        if not text:
            return ""

        text = text.upper()

        # Common OCR substitutions.
        text = text.replace(
            "O",
            "0"
        )

        # Do NOT globally replace I -> 1 here.
        # The letter I can occur in month names.
        # Numeric cleaning is handled separately.

        text = re.sub(
            r"\s+",
            " ",
            text
        ).strip()

        return text

    # ========================================================
    # MONTH DETECTION
    # ========================================================

    month_map = {
        "JAN": 1,
        "JANUARY": 1,
        "FEB": 2,
        "FEBRUARY": 2,
        "MAR": 3,
        "MARCH": 3,
        "APR": 4,
        "APRIL": 4,
        "MAY": 5,
        "JUN": 6,
        "JUNE": 6,
        "JUL": 7,
        "JULY": 7,
        "AUG": 8,
        "AUGUST": 8,
        "SEP": 9,
        "SEPT": 9,
        "SEPTEMBER": 9,
        "OCT": 10,
        "OCTOBER": 10,
        "NOV": 11,
        "NOVEMBER": 11,
        "DEC": 12,
        "DECEMBER": 12,
    }

    def get_month(text):
        normalized = normalize_date_text(
            text
        )

        # First try exact match.
        if normalized in month_map:
            return month_map[
                normalized
            ]

        # Handle OCR punctuation.
        normalized = re.sub(
            r"[^A-Z]",
            "",
            normalized
        )

        return month_map.get(
            normalized
        )

    # ========================================================
    # DAY DETECTION
    # ========================================================

    def get_day(text):
        normalized = clean_date_text(
            text
        )

        normalized = normalized.upper()

        # Only allow a standalone 1-2 digit number.
        if not re.fullmatch(
            r"\d{1,2}",
            normalized
        ):
            return None

        try:
            value = int(
                normalized
            )

            if 1 <= value <= 31:
                return value

        except ValueError:
            pass

        return None

    # ========================================================
    # YEAR DETECTION
    # ========================================================

    def get_year(text):
        normalized = clean_date_text(
            text
        )

        normalized = normalized.upper()

        # OCR sometimes reads O as 0.
        normalized = normalized.replace(
            "O",
            "0"
        )

        if not re.fullmatch(
            r"\d{4}",
            normalized
        ):
            return None

        try:
            value = int(
                normalized
            )

            if 1900 <= value <= 2100:
                return value

        except ValueError:
            pass

        return None

    # ========================================================
    # DATE VALIDATION
    # ========================================================

    def build_date(
        year,
        month,
        day
    ):
        if (
            year is None
            or month is None
            or day is None
        ):
            return ""

        try:
            from datetime import date

            value = date(
                int(year),
                int(month),
                int(day)
            )

            return value.strftime(
                "%Y-%m-%d"
            )

        except (
            ValueError,
            TypeError
        ):
            return ""

    # ========================================================
    # PARSE A COMPLETE DATE STRING
    # ========================================================

        # ========================================================
    # PARSE A COMPLETE DATE STRING
    # ========================================================

    def parse_complete_date(text):
        """
        Parse a complete birthdate from OCR text.

        Supported formats include:

            APRIL 10 2005
            APRIL 10, 2005
            APR 10 2005

            10 APRIL 2005
            25 MAY 2005
            25May 2005
            25 May 2005

            MAY 25, 2005
            MAY 25 2005

            04/10/2005
            10/04/2005
            04-10-2005
            10-04-2005
            04.10.2005
            10.04.2005

        Returns:
            YYYY-MM-DD
            or ""
        """

        if not text:
            return ""

        original = clean_date_text(
            text
        )

        if not original:
            return ""

        upper = original.upper()

        # ----------------------------------------------------
        # OCR CLEANING
        # ----------------------------------------------------

        upper = upper.replace(
            "–",
            "-"
        )

        upper = upper.replace(
            "—",
            "-"
        )

        # OCR may read O as zero in numeric portions.
        # Do not replace I globally because I occurs in
        # month names such as APRIL.
        upper = upper.replace(
            "O",
            "0"
        )

        upper = re.sub(
            r"\s+",
            " ",
            upper
        ).strip()

        # ----------------------------------------------------
        # MONTH NAME LIST
        # ----------------------------------------------------

        month_names = "|".join(
            sorted(
                month_map.keys(),
                key=len,
                reverse=True
            )
        )

        # ====================================================
        # 1. MONTH + DAY + YEAR
        #
        # Examples:
        #
        # APRIL 10 2005
        # APRIL 10, 2005
        # APR 10 2005
        # MAY 25, 2005
        # ====================================================

        month_first_pattern = (
            r"(?<![A-Z])"
            r"("
            + month_names
            + r")"
            r"\s*"
            r"([0-3]?\d)"
            r"(?:ST|ND|RD|TH)?"
            r"\s*[,.]?\s*"
            r"((?:19|20)\d{2})"
            r"(?!\d)"
        )

        match = re.search(
            month_first_pattern,
            upper,
            re.IGNORECASE
        )

        if match:
            month = month_map.get(
                match.group(1).upper()
            )

            day = int(
                match.group(2)
            )

            year = int(
                match.group(3)
            )

            result = build_date(
                year,
                month,
                day
            )

            if result:
                return result

        # ====================================================
        # 2. DAY + MONTH + YEAR
        #
        # IMPORTANT:
        #
        # \s* is intentional here.
        #
        # It allows both:
        #
        #     25 MAY 2005
        #
        # and:
        #
        #     25May 2005
        #
        # which is exactly what the OCR is currently producing.
        # ====================================================

        day_first_pattern = (
            r"(?<!\d)"
            r"([0-3]?\d)"
            r"(?:ST|ND|RD|TH)?"
            r"\s*"
            r"("
            + month_names
            + r")"
            r"\s*[,.]?\s*"
            r"((?:19|20)\d{2})"
            r"(?!\d)"
        )

        match = re.search(
            day_first_pattern,
            upper,
            re.IGNORECASE
        )

        if match:
            day = int(
                match.group(1)
            )

            month = month_map.get(
                match.group(2).upper()
            )

            year = int(
                match.group(3)
            )

            result = build_date(
                year,
                month,
                day
            )

            if result:
                return result

        # ====================================================
        # 3. NUMERIC DATE
        #
        # Examples:
        #
        # 04/10/2005
        # 10/04/2005
        # 04-10-2005
        # 10-04-2005
        # 04.10.2005
        # 10.04.2005
        # ====================================================

        numeric_pattern = (
            r"(?<!\d)"
            r"([0-3]?\d)"
            r"\s*[/\-\.]\s*"
            r"([0-1]?\d)"
            r"\s*[/\-\.]\s*"
            r"((?:19|20)\d{2})"
            r"(?!\d)"
        )

        match = re.search(
            numeric_pattern,
            upper
        )

        if match:
            first = int(
                match.group(1)
            )

            second = int(
                match.group(2)
            )

            year = int(
                match.group(3)
            )

            # Philippine birth certificates commonly use
            # month/day/year for numeric dates.
            #
            # If the first number is greater than 12,
            # it cannot be a month, so interpret it as:
            #
            #     DAY / MONTH / YEAR
            #
            # Otherwise use:
            #
            #     MONTH / DAY / YEAR

            if (
                first > 12
                and second <= 12
            ):
                day = first
                month = second

            else:
                month = first
                day = second

            result = build_date(
                year,
                month,
                day
            )

            if result:
                return result

        return ""

    # ========================================================
    # FIND DATE OF BIRTH LABELS
    # ========================================================

    birth_labels = []

    print(
        "\n[BIRTHDATE EXTRACTION]"
    )

    for item in ocr_items:
        text = clean_date_text(
            item.get(
                "text",
                ""
            )
        )

        if not text:
            continue

        normalized = re.sub(
            r"[^A-Z]",
            "",
            text.upper()
        )

        # Accept:
        #
        # DATE OF BIRTH
        # 3. DATE OF BIRTH
        # DATE-OF-BIRTH
        # DATE OF BIRTH

        if "DATEOFBIRTH" in normalized:
            geo = geometry(
                item
            )

            if geo:
                birth_labels.append(
                    {
                        "item": item,
                        "text": text,
                        "geo": geo,
                    }
                )

                print(
                    f"FOUND LABEL: "
                    f"'{text}' "
                    f"box=("
                    f"{geo['left']:.1f}, "
                    f"{geo['top']:.1f}, "
                    f"{geo['right']:.1f}, "
                    f"{geo['bottom']:.1f})"
                )

    if not birth_labels:
        print(
            "[BIRTHDATE] "
            "No DATE OF BIRTH label found."
        )

    # ========================================================
    # SEARCH NEAR EACH DATE OF BIRTH LABEL
    # ========================================================

    for label in birth_labels:
        label_geo = label[
            "geo"
        ]

        label_height = max(
            label_geo["height"],
            20
        )

        nearby = []

        for item in ocr_items:
            if item is label["item"]:
                continue

            text = clean_date_text(
                item.get(
                    "text",
                    ""
                )
            )

            if not text:
                continue

            geo = geometry(
                item
            )

            if not geo:
                continue

            # ------------------------------------------------
            # Distance from label.
            # ------------------------------------------------

            dx = abs(
                geo["cx"]
                - label_geo["cx"]
            )

            dy = abs(
                geo["cy"]
                - label_geo["cy"]
            )

            # ------------------------------------------------
            # Ignore items that are too far away vertically.
            # ------------------------------------------------

            if dy > max(
                180.0,
                image_height * 0.12
            ):
                continue

            # ------------------------------------------------
            # Ignore items far to the left.
            # ------------------------------------------------

            if (
                geo["right"]
                < label_geo["left"]
                - 50
            ):
                continue

            # ------------------------------------------------
            # Ignore items extremely far to the right.
            # ------------------------------------------------

            if (
                geo["left"]
                > label_geo["right"]
                + image_width * 0.50
            ):
                continue

            complete_date = parse_complete_date(
                text
            )

            day = get_day(
                text
            )

            month = get_month(
                text
            )

            year = get_year(
                text
            )

            if (
                complete_date
                is None
                and day is None
                and month is None
                and year is None
            ):
                continue

            nearby.append(
                {
                    "item": item,
                    "text": text,
                    "geo": geo,
                    "complete_date": complete_date,
                    "day": day,
                    "month": month,
                    "year": year,
                    "dx": dx,
                    "dy": dy,
                }
            )

        # ----------------------------------------------------
        # Print candidates.
        # ----------------------------------------------------

        print(
            f"Nearby date candidates: "
            f"{len(nearby)}"
        )

        for candidate in nearby:
            geo = candidate[
                "geo"
            ]

            print(
                f" '{candidate['text']}' "
                f"center=("
                f"{geo['cx']:.1f}, "
                f"{geo['cy']:.1f}) "
                f"day={candidate['day']} "
                f"month={candidate['month']} "
                f"year={candidate['year']} "
                f"complete="
                f"'{candidate['complete_date']}'"
            )

        # ====================================================
        # DIRECT COMPLETE-DATE MATCH
        # ====================================================

        complete_candidates = [
            candidate
            for candidate in nearby
            if candidate[
                "complete_date"
            ]
        ]

        if complete_candidates:
            complete_candidates.sort(
                key=lambda candidate: (
                    abs(
                        candidate["dy"]
                    )
                    +
                    abs(
                        candidate["dx"]
                    ) * 0.20
                )
            )

            result = complete_candidates[
                0
            ][
                "complete_date"
            ]

            if result:
                print(
                    f"\n[BIRTHDATE] SUCCESS "
                    f"(complete OCR item): "
                    f"{result}"
                )

                return result

        # ====================================================
        # SEPARATE DAY / MONTH / YEAR TOKENS
        # ====================================================

        day_candidates = [
            candidate
            for candidate in nearby
            if candidate["day"] is not None
        ]

        month_candidates = [
            candidate
            for candidate in nearby
            if candidate["month"] is not None
        ]

        year_candidates = [
            candidate
            for candidate in nearby
            if candidate["year"] is not None
        ]

        # ----------------------------------------------------
        # Try every reasonable combination.
        #
        # This is intentionally NOT limited to the first
        # detected day/month/year.
        #
        # That prevents unrelated numbers from winning simply
        # because PaddleOCR detected them first.
        # ----------------------------------------------------

        combinations = []

        for day_candidate in day_candidates:
            for month_candidate in month_candidates:
                for year_candidate in year_candidates:
                    day_geo = day_candidate[
                        "geo"
                    ]

                    month_geo = month_candidate[
                        "geo"
                    ]

                    year_geo = year_candidate[
                        "geo"
                    ]

                    # ----------------------------------------
                    # All three should belong to approximately
                    # the same physical date line.
                    # ----------------------------------------

                    y_values = [
                        day_geo["cy"],
                        month_geo["cy"],
                        year_geo["cy"],
                    ]

                    y_spread = (
                        max(y_values)
                        - min(y_values)
                    )

                    line_height = max(
                        day_geo["height"],
                        month_geo["height"],
                        year_geo["height"],
                        15.0
                    )

                    if y_spread > max(
                        45.0,
                        line_height * 2.5
                    ):
                        continue

                    # ----------------------------------------
                    # Date parts should be reasonably close.
                    # ----------------------------------------

                    x_values = [
                        day_geo["cx"],
                        month_geo["cx"],
                        year_geo["cx"],
                    ]

                    x_spread = (
                        max(x_values)
                        - min(x_values)
                    )

                    if x_spread > max(
                        500.0,
                        image_width * 0.25
                    ):
                        continue

                    # ----------------------------------------
                    # The date parts should normally appear
                    # left-to-right:
                    #
                    # 10 | APRIL | 2005
                    #
                    # or:
                    #
                    # APRIL | 10 | 2005
                    #
                    # Therefore simply check that they are not
                    # stacked in a completely unrelated way.
                    # ----------------------------------------

                    positions = sorted(
                        [
                            (
                                day_geo["cx"],
                                "day"
                            ),
                            (
                                month_geo["cx"],
                                "month"
                            ),
                            (
                                year_geo["cx"],
                                "year"
                            ),
                        ]
                    )

                    # Year should generally be at or near the
                    # right side of the date group.

                    year_position = year_geo[
                        "cx"
                    ]

                    if (
                        year_position
                        <
                        min(
                            day_geo["cx"],
                            month_geo["cx"]
                        )
                        - 80
                    ):
                        continue

                    # ----------------------------------------
                    # Distance from DOB label.
                    #
                    # Prefer candidates near the label.
                    # ----------------------------------------

                    average_x_distance = (
                        abs(
                            day_geo["cx"]
                            - label_geo["cx"]
                        )
                        +
                        abs(
                            month_geo["cx"]
                            - label_geo["cx"]
                        )
                        +
                        abs(
                            year_geo["cx"]
                            - label_geo["cx"]
                        )
                    ) / 3.0

                    average_y_distance = (
                        abs(
                            day_geo["cy"]
                            - label_geo["cy"]
                        )
                        +
                        abs(
                            month_geo["cy"]
                            - label_geo["cy"]
                        )
                        +
                        abs(
                            year_geo["cy"]
                            - label_geo["cy"]
                        )
                    ) / 3.0

                    # ----------------------------------------
                    # Score the combination.
                    #
                    # Smaller is better.
                    # ----------------------------------------

                    score = (
                        average_y_distance
                        +
                        average_x_distance * 0.20
                        +
                        y_spread * 1.5
                    )

                    combinations.append(
                        {
                            "score": score,
                            "day": day_candidate,
                            "month": month_candidate,
                            "year": year_candidate,
                        }
                    )

        # ====================================================
        # SELECT BEST DATE COMBINATION
        # ====================================================

        combinations.sort(
            key=lambda combination:
                combination["score"]
        )

        for combination in combinations:
            day_candidate = combination[
                "day"
            ]

            month_candidate = combination[
                "month"
            ]

            year_candidate = combination[
                "year"
            ]

            result = build_date(
                year_candidate["year"],
                month_candidate["month"],
                day_candidate["day"]
            )

            if result:
                print(
                    "\nSelected birthdate parts:"
                )

                print(
                    " DAY :",
                    day_candidate["text"]
                )

                print(
                    " MONTH :",
                    month_candidate["text"]
                )

                print(
                    " YEAR :",
                    year_candidate["text"]
                )

                print(
                    f"\n[BIRTHDATE] SUCCESS: "
                    f"{day_candidate['text']} + "
                    f"{month_candidate['text']} + "
                    f"{year_candidate['text']} "
                    f"=> {result}"
                )

                return result

    # ========================================================
    # GLOBAL FALLBACK
    #
    # If the DATE OF BIRTH label was detected but the geometry
    # did not allow a match, inspect the OCR text itself.
    #
    # This is useful when PaddleOCR gives unusual bounding boxes.
    # ========================================================

    print(
        "\n[BIRTHDATE] "
        "Trying global date-text fallback..."
    )

    # --------------------------------------------------------
    # Do NOT accept a complete date from anywhere on the page.
    # It may belong to a parent or attendant section.
    # The line fallback below only considers lines near the
    # detected DATE OF BIRTH label.
    # --------------------------------------------------------

    # --------------------------------------------------------
    # Second: construct lines from OCR items and search each
    # line for a date.
    # --------------------------------------------------------

    geometric_items = []

    for item in ocr_items:
        text = clean_date_text(
            item.get(
                "text",
                ""
            )
        )

        geo = geometry(
            item
        )

        if (
            not text
            or not geo
        ):
            continue

        geometric_items.append(
            {
                "text": text,
                "geo": geo,
            }
        )

    geometric_items.sort(
        key=lambda item: (
            item["geo"]["cy"],
            item["geo"]["left"]
        )
    )

    # Group OCR items into approximate horizontal lines.

    lines = []

    for item in geometric_items:
        placed = False

        item_cy = item[
            "geo"
        ][
            "cy"
        ]

        item_height = max(
            item["geo"]["height"],
            15.0
        )

        for line in lines:
            line_cy = line[
                "cy"
            ]

            if abs(
                item_cy - line_cy
            ) <= max(
                25.0,
                item_height * 1.5
            ):
                line["items"].append(
                    item
                )

                # Update line center.
                line["cy"] = (
                    sum(
                        x["geo"]["cy"]
                        for x in line["items"]
                    )
                    /
                    len(
                        line["items"]
                    )
                )

                placed = True

                break

        if not placed:
            lines.append(
                {
                    "cy": item_cy,
                    "items": [item],
                }
            )

    # Search lines that are near a DATE OF BIRTH label.

    for label in birth_labels:
        label_cy = label[
            "geo"
        ][
            "cy"
        ]

        for line in lines:
            if (
                abs(
                    line["cy"]
                    - label_cy
                )
                >
                max(
                    180.0,
                    image_height * 0.12
                )
            ):
                continue

            line_items = sorted(
                line["items"],
                key=lambda item:
                    item["geo"]["left"]
            )

            line_text = " ".join(
                item["text"]
                for item in line_items
            )

            result = parse_complete_date(
                line_text
            )

            if result:
                print(
                    f"[BIRTHDATE] "
                    f"LINE FALLBACK SUCCESS: "
                    f"'{line_text}' => {result}"
                )

                return result

    print(
        "\n[BIRTHDATE] "
        "No valid birthdate found."
    )

    return ""

    # --------------------------------------------------------
    # Helper: identify date parts
    # --------------------------------------------------------

    def is_day(text):
        text = clean_text(
            text
        ).upper().strip(
            ".,:;()[]{}"
        )

        if not re.fullmatch(
            r"\d{1,2}",
            text
        ):
            return False

        try:
            value = int(
                text
            )

            return 1 <= value <= 31

        except ValueError:
            return False

    def is_month(text):
        text = clean_text(
            text
        ).upper().strip(
            ".,:;()[]{}"
        )

        return text in MONTHS

    def is_year(text):
        text = clean_text(
            text
        ).upper().strip(
            ".,:;()[]{}"
        )

        if not re.fullmatch(
            r"\d{4}",
            text
        ):
            return False

        try:
            value = int(
                text
            )

            return 1900 <= value <= 2100

        except ValueError:
            return False

    # --------------------------------------------------------
    # Helper: parse combined date text
    # --------------------------------------------------------

    def parse_combined_date(parts):
        if not parts:
            return ""

        cleaned_parts = []

        for part in parts:
            text = clean_text(
                part
            ).upper()

            # Remove common OCR punctuation.
            text = text.strip(
                ".,:;()[]{}"
            )

            if text:
                cleaned_parts.append(
                    text
                )

        if not cleaned_parts:
            return ""

        combined = " ".join(
            cleaned_parts
        )

        # First try the existing parser.
        parsed = parse_date_text(
            combined
        )

        if parsed:
            return parsed

        # ----------------------------------------------------
        # Extract DAY + MONTH + YEAR
        #
        # Example:
        # 31 MAY 2005
        # ----------------------------------------------------

        day = None
        month = None
        year = None

        for part in cleaned_parts:
            if (
                day is None
                and is_day(part)
            ):
                day = int(
                    part
                )
                continue

            if (
                month is None
                and is_month(part)
            ):
                month = MONTHS[
                    part
                ]
                continue

            if (
                year is None
                and is_year(part)
            ):
                year = int(
                    part
                )
                continue

        if (
            day
            and month
            and year
        ):
            return make_birthdate(
                year,
                month,
                day
            )

        # ----------------------------------------------------
        # Also handle MONTH + DAY + YEAR
        #
        # Example:
        # MAY 31 2005
        # ----------------------------------------------------

        day = None
        month = None
        year = None

        for part in cleaned_parts:
            if (
                month is None
                and is_month(part)
            ):
                month = MONTHS[
                    part
                ]

            elif (
                day is None
                and is_day(part)
            ):
                day = int(
                    part
                )

            elif (
                year is None
                and is_year(part)
            ):
                year = int(
                    part
                )

        if (
            day
            and month
            and year
        ):
            return make_birthdate(
                year,
                month,
                day
            )

        return ""

    # --------------------------------------------------------
    # 2. Search dates near each DATE OF BIRTH label
    # --------------------------------------------------------

    for label in birth_labels:
        label_geo = geometry(
            label
        )

        if not label_geo:
            continue

        label_height = max(
            label_geo["height"],
            20
        )

        nearby_items = []

        for item in ocr_items:
            if item is label:
                continue

            text = clean_text(
                item.get(
                    "text",
                    ""
                )
            )

            if not text:
                continue

            geo = geometry(
                item
            )

            if not geo:
                continue

            # ----------------------------------------------
            # Vertical distance from the label
            # ----------------------------------------------

            vertical_distance = abs(
                geo["cy"]
                - label_geo["cy"]
            )

            # Date parts should be on approximately the
            # same horizontal line as the label.

            if vertical_distance > max(
                45,
                label_height * 2.0
            ):
                continue

            # ----------------------------------------------
            # Ignore things far to the left
            # ----------------------------------------------

            if (
                geo["cx"]
                <
                label_geo["left"] - 20
            ):
                continue

            # ----------------------------------------------
            # Avoid searching too far across the document
            # ----------------------------------------------

            if (
                geo["cx"]
                >
                label_geo["right"]
                + image_width * 0.45
            ):
                continue

            nearby_items.append(
                {
                    "item": item,
                    "geo": geo,
                    "text": text,
                }
            )

        # Sort from left to right.
        nearby_items.sort(
            key=lambda x: (
                x["geo"]["cy"],
                x["geo"]["left"]
            )
        )

        # ----------------------------------------------------
        # 3. Try to build a date from nearby OCR tokens
        # ----------------------------------------------------

        if nearby_items:
            # We specifically want a sequence such as:
            #
            # 31 | May | 2005
            #
            # so try combinations of nearby items.

            max_group_size = min(
                8,
                len(nearby_items)
            )

            for group_size in range(
                3,
                max_group_size + 1
            ):
                for start in range(
                    0,
                    len(nearby_items)
                    - group_size
                    + 1
                ):
                    group = nearby_items[
                        start:
                        start + group_size
                    ]

                    # Ensure the group is approximately
                    # on one line.

                    group_y = [
                        x["geo"]["cy"]
                        for x in group
                    ]

                    if (
                        max(group_y)
                        - min(group_y)
                        >
                        max(
                            35,
                            label_height * 1.5
                        )
                    ):
                        continue

                    # Require at least one day, month, and year.

                    has_day = any(
                        is_day(
                            x["text"]
                        )
                        for x in group
                    )

                    has_month = any(
                        is_month(
                            x["text"]
                        )
                        for x in group
                    )

                    has_year = any(
                        is_year(
                            x["text"]
                        )
                        for x in group
                    )

                    if not (
                        has_day
                        and has_month
                        and has_year
                    ):
                        continue

                    parts = [
                        x["text"]
                        for x in group
                    ]

                    result = parse_combined_date(
                        parts
                    )

                    if result:
                        return result

        # ----------------------------------------------------
        # 4. Try the whole nearby line
        # ----------------------------------------------------

        if nearby_items:
            parts = [
                x["text"]
                for x in nearby_items
            ]

            result = parse_combined_date(
                parts
            )

            if result:
                return result

    # --------------------------------------------------------
    # 5. Final fallback
    #
    # Only use individual OCR items here. This preserves the
    # original behavior for documents where the complete date
    # is recognized as one OCR item.
    # --------------------------------------------------------

    for item in ocr_items:
        text = clean_text(
            item.get(
                "text",
                ""
            )
        )

        if not text:
            continue

        result = parse_date_text(
            text
        )

        if result:
            return result

    return ""


# ============================================================
# DOCUMENT OCR
# ============================================================

def extract_document(
    image_path
):
    start = time.time()

    image = cv2.imread(
        image_path
    )

    if image is None:
        raise ValueError(
            "Unable to read uploaded image."
        )

    original_h, original_w = (
        image.shape[:2]
    )

    print("")

    print(
        "================================================"
    )

    print(
        " REGISSCAN OCR"
    )

    print(
        " BIRTH CERTIFICATE OWNER NAME"
    )

    print(
        "================================================"
    )

    print(
        f"Original: "
        f"{original_w} x "
        f"{original_h}"
    )

    image = prepare_image(
        image
    )

    h, w = image.shape[:2]

    print(
        f"Processed: "
        f"{w} x {h}"
    )

    # --------------------------------------------------------
    # FULL DOCUMENT OCR
    #
    # Used for STRUCTURE and POSITION.
    # --------------------------------------------------------

    ocr_start = time.time()

    items = run_ocr(
        image
    )

    ocr_seconds = (
        time.time()
        - ocr_start
    )

    # --------------------------------------------------------
    # ADDITIONAL UPPER NAME SECTION OCR
    #
    # The original full-document OCR is preserved.
    # This extra pass focuses on the upper part of the
    # certificate, where the child's name is expected.
    # --------------------------------------------------------

    upper_ocr_start = time.time()

    upper_items = run_upper_name_ocr(
        image
    )

    upper_ocr_seconds = (
        time.time()
        - upper_ocr_start
    )

    print(
        f"[UPPER OCR] Additional items detected: "
        f"{len(upper_items)}"
    )

    print(
        f"[UPPER OCR] Time: "
        f"{upper_ocr_seconds:.2f}s"
    )

    # --------------------------------------------------------
    # MERGE FULL DOCUMENT + UPPER SECTION RESULTS
    # --------------------------------------------------------

    items = merge_ocr_items(
        items,
        upper_items
    )

    print(
        f"[OCR] Total merged items: "
        f"{len(items)}"
    )

    # --------------------------------------------------------
    # Print OCR detections.
    #
    # This is extremely useful for determining whether the
    # certificate's owner-name section is being detected
    # correctly.
    # --------------------------------------------------------

    print("")

    print(
        "================================================"
    )

    print(
        "[FULL DOCUMENT OCR DETECTIONS]"
    )

    print(
        "================================================"
    )

    ordered_items = [
        item
        for item in items
        if item.get(
            "box"
        ) is not None
    ]

    ordered_items.sort(
        key=lambda item: (
            item["box"][1],
            item["box"][0]
        )
    )

    for index, item in enumerate(
        ordered_items
    ):
        print(
            f"{index:03d} | "
            f"'{item.get('text', '')}' | "
            f"score="
            f"{item.get('score', 0):.3f} | "
            f"box="
            f"{item.get('box')}"
        )

    print(
        "================================================"
    )

    # --------------------------------------------------------
    # OWNER NAME ONLY
    # --------------------------------------------------------

    name_start = time.time()

    owner_name = extract_owner_name(
        image,
        items
    )

    birthdate_start = time.time()

    birthdate = extract_birthdate(
        items,
        h,
        w
    )

    birthdate_seconds = (
        time.time()
        - birthdate_start
    )

    name_seconds = (
        time.time()
        - name_start
    )

    total_seconds = (
        time.time()
        - start
    )

    # --------------------------------------------------------
    # FINAL RESPONSE
    # --------------------------------------------------------

    raw_text = " ".join(
        item.get("text", "")
        for item in ordered_items
    )   

    document_classification = classify_document_type(raw_text)

    result = {
    "success": True,

    # EXISTING ADD STUDENT MODAL OCR
    "first_name": owner_name["first_name"],
    "middle_name": owner_name["middle_name"],
    "last_name": owner_name["last_name"],
    "birthday": birthdate,
    "birthdate": birthdate,

    # NEW DOCUMENT CLASSIFICATION
    "document_type": document_classification["document_type"],
    "document_type_key": document_classification["document_type_key"],
    "document_type_confidence": document_classification["document_type_confidence"],
    "document_type_matches": document_classification["document_type_matches"],

    # EXISTING OCR TEXT
    "raw_text": raw_text,
}


    result = {
        "success": True,

        "first_name": owner_name[
            "first_name"
        ],

        "middle_name": owner_name[
            "middle_name"
        ],

        "last_name": owner_name[
            "last_name"
        ],

        # Birthday intentionally ignored.
        "birthday": birthdate,

        "birthdate": birthdate,

        "raw_text": " ".join(
            item.get(
                "text",
                ""
            )
            for item in ordered_items
        ),

        "ocr_items": len(
            ordered_items
        ),

        "timing": {
            "full_ocr_seconds": round(
                ocr_seconds,
                3
            ),

            "upper_ocr_seconds": round(
                upper_ocr_seconds,
                3
            ),

            "name_extraction_seconds": round(
                name_seconds,
                3
            ),

            "total_seconds": round(
                total_seconds,
                3
            )
        },

        "debug": {
            "owner_anchor_found": (
                owner_name[
                    "owner_anchor_found"
                ]
            )
        }
    }

    print("")

    print(
        "================================================"
    )

    print(
        "[FINAL RESULT]"
    )

    print(
        "================================================"
    )

    print(
        "FIRST NAME :",
        result["first_name"]
    )

    print(
        "MIDDLE NAME:",
        result["middle_name"]
    )

    print(
        "LAST NAME :",
        result["last_name"]
    )

    print(
        "BIRTHDATE :",
        result["birthdate"]
    )

    print(
        "================================================"
    )

    return result

# ============================================================
# DOCUMENT TYPE CLASSIFICATION
# ============================================================

def classify_document_type(raw_text):
    """
    Classify the scanned document based on OCR text.
    This is a rule-based classifier.
    """

    if not raw_text:
        return {
            "document_type": "Unknown",
            "document_type_key": "unknown",
            "document_type_confidence": "low",
            "document_type_matches": []
        }

    # Normalize OCR text
    text = raw_text.upper()
    text = re.sub(r"\s+", " ", text).strip()
    text = re.sub(r"[^A-Z0-9 ]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    document_rules = {
        "Birth Certificate": {
            "key": "birth_certificate",
            "strong": [
                "CERTIFICATE OF LIVE BIRTH",
                "CERTIFICATE OF BIRTH",
                "BIRTH CERTIFICATE",
                "LIVE BIRTH"
            ],
            "normal": [
                "LOCAL CIVIL REGISTRAR",
                "PHILIPPINE STATISTICS AUTHORITY",
                "PSA"
            ]
        },

        "Form 137": {
            "key": "form_137",
            "strong": [
                "FORM 137",
                "SCHOOL FORM 10",
                "SF10",
                "PERMANENT RECORD",
                "SECONDARY STUDENT S PERMANENT RECORD"
            ],
            "normal": [
                "STUDENT S PERMANENT RECORD",
                "LEARNER S PERMANENT RECORD"
            ]
        },

        "Form 138": {
            "key": "form_138",
            "strong": [
                "FORM 138",
                "SCHOOL FORM 9",
                "SF9",
                "REPORT CARD",
                "LEARNER S PROGRESS REPORT CARD"
            ],
            "normal": [
                "PROGRESS REPORT"
            ]
        },

        "Good Moral": {
            "key": "good_moral",
            "strong": [
                "CERTIFICATE OF GOOD MORAL CHARACTER",
                "GOOD MORAL CHARACTER",
                "GOOD MORAL"
            ],
            "normal": [
                "MORAL CHARACTER"
            ]
        },

        "Transcript of Records": {
            "key": "transcript_of_records",
            "strong": [
                "TRANSCRIPT OF RECORDS",
                "OFFICIAL TRANSCRIPT"
            ],
            "normal": [
                "TRANSCRIPT",
                "ACADEMIC RECORD"
            ]
        },

        "Grades": {
            "key": "grades",
            "strong": [
                "REPORT OF GRADES",
                "GRADE REPORT"
            ],
            "normal": [
                "FINAL GRADES",
                "SEMESTER GRADES"
            ]
        },

        "Leave of Absence": {
            "key": "leave_of_absence",
            "strong": [
                "LEAVE OF ABSENCE",
                "LEAVE OF ABSENCE FORM"
            ],
            "normal": [
                "LOA"
            ]
        },

        "Withdrawal": {
            "key": "withdrawal",
            "strong": [
                "WITHDRAWAL FORM",
                "WITHDRAWAL",
                "WITHDRAWAL OF ENROLLMENT"
            ],
            "normal": [
                "HONORABLE DISMISSAL"
            ]
        }
    }

    scores = {}

    for document_type, rules in document_rules.items():
        score = 0
        matches = []

        for phrase in rules["strong"]:
            if phrase in text:
                score += 5
                matches.append(phrase)

        for phrase in rules["normal"]:
            if phrase in text:
                score += 2
                matches.append(phrase)

        if score > 0:
            scores[document_type] = {
                "score": score,
                "matches": matches,
                "key": rules["key"]
            }

    # Nothing matched
    if not scores:
        return {
            "document_type": "Unknown",
            "document_type_key": "unknown",
            "document_type_confidence": "low",
            "document_type_matches": []
        }

    # Get highest-scoring document
    ranked = sorted(
        scores.items(),
        key=lambda item: item[1]["score"],
        reverse=True
    )

    best_type, best_result = ranked[0]
    best_score = best_result["score"]

    # Confidence level
    if best_score >= 5:
        confidence = "high"
    elif best_score >= 2:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "document_type": best_type,
        "document_type_key": best_result["key"],
        "document_type_confidence": confidence,
        "document_type_matches": best_result["matches"]
    }

# ============================================================
# FLASK /OCR
# ============================================================

@app.route(
    "/ocr",
    methods=["POST"]
)
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

        uploaded_file = request.files[
            "file"
        ]

        if not uploaded_file.filename:
            return jsonify(
                {
                    "success": False,
                    "error": "No filename provided."
                }
            ), 400

        extension = Path(
            uploaded_file.filename
        ).suffix.lower()

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
                    "error": (
                        "Unsupported image format."
                    )
                }
            ), 400

        # ----------------------------------------------------
        # Save upload.
        # ----------------------------------------------------

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=extension
        ) as temp_file:
            uploaded_file.save(
                temp_file.name
            )

            temp_path = (
                temp_file.name
            )

        print(
            "[UPLOAD]",
            temp_path
        )

        # ----------------------------------------------------
        # Process.
        # ----------------------------------------------------

        result = extract_document(
            temp_path
        )

        return jsonify(
            result
        ), 200

    except Exception as exc:
        print("")

        print(
            "================================================"
        )

        print(
            "[OCR ERROR]"
        )

        print(
            "================================================"
        )

        print(
            str(exc)
        )

        print(
            "================================================"
        )

        return jsonify(
            {
                "success": False,
                "error": str(exc)
            }
        ), 500

    finally:
        if temp_path:
            try:
                if os.path.exists(
                    temp_path
                ):
                    os.remove(
                        temp_path
                    )

            except Exception as exc:
                print(
                    "[CLEANUP ERROR]",
                    str(exc)
                )


# ============================================================
# HEALTH
# ============================================================

@app.route(
    "/health",
    methods=["GET"]
)
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

    print(
        "================================================"
    )

    print(
        " RegisScan OCR Server"
    )

    print(
        "================================================"
    )

    print(
        "OCR : "
        "http://127.0.0.1:5001/ocr"
    )

    print(
        "Health : "
        "http://127.0.0.1:5001/health"
    )

    print(
        "Target : Birth Certificate Owner Name"
    )

    print(
        "Fields : First / Middle / Last"
    )

    print(
        "Date : Enabled"
    )

    print(
        "================================================"
    )

    print("")

    app.run(
        host="0.0.0.0",
        port=5001,
        debug=False,
        threaded=True
    )