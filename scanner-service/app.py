import base64
import io
import os
import re
import time
import unicodedata
from datetime import datetime
import requests

from flask import Flask, jsonify, request
from flask_cors import CORS

import pythoncom
import wia_scan


# ============================================================
# REGISSCAN SCANNER SERVICE
# Windows WIA + wia_scan
# Documents are saved ONLY into the student's folder:
#   C:\StudentRecords\<College>\<ID>_<Name>\
# ============================================================

app = Flask(__name__)

# Allow your React application to communicate with Flask
CORS(app)

# Scans (base64 images) can be a few MB
app.config["MAX_CONTENT_LENGTH"] = 50 * 1024 * 1024


# ============================================================
# CONFIGURATION
# ============================================================

# Optional override: set STUDENT_BASE_FOLDER on a PC
STUDENT_RECORDS_ROOT = (
    os.environ.get("STUDENT_BASE_FOLDER", "").strip()
    or os.path.join(os.environ.get("SystemDrive", "C:") + "\\", "StudentRecords")
)

# Simple in-memory cache so opening the scan modal repeatedly doesn't
# re-probe every WIA device each time. The frontend's refresh button
# passes ?force=1 to bypass this and get a fresh read.
_SCANNER_CACHE = {"scanners": None, "timestamp": 0}
_SCANNER_CACHE_TTL_SECONDS = 20


# ============================================================
# HELPERS: FOLDER NAMES (same rules as folder-server.js)
# ============================================================

def safe_name(value):
    """Make a value safe to use as ONE Windows folder/file name part."""
    value = unicodedata.normalize("NFKC", str(value or ""))
    value = re.sub(r'[<>:"/\\|?*\x00-\x1F]', "_", value)
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"[. ]+$", "", value)
    return value[:120]


def build_student_folder(student):
    """
    C:\\StudentRecords\\<College>\\<ID>_<First_Middle_Last>
    Returns None if the student information is incomplete.
    """
    student_id = safe_name(student.get("student_id"))
    first = str(student.get("first_name") or "").strip()
    middle = str(student.get("middle_name") or "").strip()
    last = str(student.get("last_name") or "").strip()

    if not student_id or not first or not last:
        return None

    full_name = safe_name(" ".join(p for p in (first, middle, last) if p))
    student_folder = f"{student_id}_{full_name.replace(' ', '_')}"

    college_folder = safe_name(student.get("college_name")).replace(" ", "_")
    if not college_folder:
        college_folder = "Unassigned"

    return os.path.join(STUDENT_RECORDS_ROOT, college_folder, student_folder)


def is_inside(base, target):
    base = os.path.abspath(base).lower()
    target = os.path.abspath(target).lower()
    try:
        return os.path.commonpath([base, target]) == base
    except ValueError:
        return False


def save_to_student_folder(image_bytes, document_type, student):
    """
    Write the scanned image directly into the student's folder.
    Returns (saved_path, error_message).
    """
    if not image_bytes:
        return None, "There is no scanned image to store."

    folder = build_student_folder(student or {})
    if not folder:
        return None, "Student ID and name are required to store the document."

    if not is_inside(STUDENT_RECORDS_ROOT, folder):
        return None, "Invalid student folder."

    os.makedirs(folder, exist_ok=True)

    # File name: <Document_Type>_<timestamp>.jpg (never overwrites)
    doc_part = safe_name(document_type).replace(" ", "_") or "Unclassified"
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")

    destination = os.path.join(folder, f"{doc_part}_{stamp}.jpg")
    counter = 2
    while os.path.exists(destination):
        destination = os.path.join(folder, f"{doc_part}_{stamp}_{counter}.jpg")
        counter += 1

    with open(destination, "wb") as f:
        f.write(image_bytes)

    print(f"Stored document: {destination}")
    return destination, None


def decode_image_data(value):
    """Accepts raw base64 or a 'data:image/jpeg;base64,...' string."""
    if not value:
        return None
    value = str(value)
    if "," in value and value.lstrip().lower().startswith("data:"):
        value = value.split(",", 1)[1]
    try:
        return base64.b64decode(value, validate=False)
    except Exception:
        return None


# ============================================================
# HELPER: LIST WIA SCANNERS
# ============================================================

def discover_scanners():
    """
    Enumerates every WIA device currently registered with Windows and
    returns its id, name, description and manufacturer.
    """

    device_manager = wia_scan.get_device_manager()

    scanners = []
    count = device_manager.DeviceInfos.Count

    print(f"WIA devices found: {count}")

    for index in range(1, count + 1):
        try:
            device_info = device_manager.DeviceInfos(index)
            device_id = device_info.DeviceID

            try:
                name = device_info.Properties("Name").Value
            except Exception:
                name = None

            try:
                description = device_info.Properties("Description").Value
            except Exception:
                description = None

            try:
                manufacturer = device_info.Properties("Manufacturer").Value
            except Exception:
                manufacturer = None

            scanners.append({
                "id": device_id,
                "name": name or "Unknown Scanner",
                "description": description or "",
                "manufacturer": manufacturer or ""
            })

        except Exception as device_error:
            print(f"Could not read WIA device {index}: {device_error}")

    return scanners


# ============================================================
# HOME / STATUS
# ============================================================

@app.route("/", methods=["GET"])
def home():
    return jsonify({
        "status": "online",
        "service": "RegisScan Scanner Service",
        "platform": "Windows WIA",
        "scanner_service": True,
        "storage_root": STUDENT_RECORDS_ROOT
    })


# ============================================================
# GET AVAILABLE SCANNERS
# ============================================================

@app.route("/scanners", methods=["GET"])
def get_scanners():

    force = request.args.get("force") in ("1", "true", "True")
    now = time.time()

    if (
        not force
        and _SCANNER_CACHE["scanners"] is not None
        and (now - _SCANNER_CACHE["timestamp"]) < _SCANNER_CACHE_TTL_SECONDS
    ):
        return jsonify({
            "success": True,
            "scanners": _SCANNER_CACHE["scanners"],
            "cached": True
        })

    # COM must be initialized on every thread that touches it
    pythoncom.CoInitialize()

    try:
        print("\n" + "=" * 60)
        print("REGISSCAN - SCANNER DISCOVERY")
        print("=" * 60)

        start = time.time()
        scanners = discover_scanners()
        elapsed = time.time() - start

        print(f"Found {len(scanners)} scanner(s) in {elapsed:.2f} seconds.")

        for scanner in scanners:
            print(f" - {scanner['name']}")
            print(f"   ID: {scanner['id']}")

        _SCANNER_CACHE["scanners"] = scanners
        _SCANNER_CACHE["timestamp"] = time.time()

        return jsonify({
            "success": True,
            "scanners": scanners,
            "cached": False
        })

    except Exception as e:
        print("\nSCANNER DISCOVERY ERROR")
        print(type(e).__name__)
        print(str(e))

        return jsonify({
            "success": False,
            "message": str(e),
            "error_type": type(e).__name__
        }), 500

    finally:
        pythoncom.CoUninitialize()


# ============================================================
# SCAN DOCUMENT
# Nothing is written to disk here unless "student" is supplied,
# and then it is written ONLY into that student's folder.
# ============================================================

@app.route("/scan", methods=["POST"])
def scan_document():

    pythoncom.CoInitialize()

    try:
        print("\n" + "=" * 60)
        print("REGISSCAN - SCAN REQUEST")
        print("=" * 60)

        data = request.get_json(silent=True) or {}

        device_uid = data.get("device_uid")

        # OPTIONAL: {student_id, first_name, middle_name, last_name, college_name}
        # If given, the document is filed into the student's folder right away.
        known_student = data.get("student")

        print(f"Requested scanner: {device_uid}")

        if not device_uid:
            return jsonify({
                "success": False,
                "message": "No scanner was selected. Please select a scanner first."
            }), 400

        # ----------------------------------------------------
        # Connect directly to the chosen scanner
        # ----------------------------------------------------

        print("Connecting to selected scanner...")

        try:
            device = wia_scan.connect_to_device_by_uid(
                device_uid,
                quiet=True
            )
        except Exception as connection_error:
            print("Scanner connection failed:")
            print(type(connection_error).__name__)
            print(str(connection_error))

            return jsonify({
                "success": False,
                "message": "Could not connect to the selected scanner.",
                "error": str(connection_error)
            }), 400

        if device is None:
            return jsonify({
                "success": False,
                "message": "The selected scanner could not be connected."
            }), 400

        print("Scanner connected successfully.")

        # ----------------------------------------------------
        # Scan (image stays in memory)
        # ----------------------------------------------------

        print("Starting scan...")
        print("Place the document on the scanner.")

        image = wia_scan.scan_side(device=device)

        if image is None:
            return jsonify({
                "success": False,
                "message": "The scanner did not return an image."
            }), 500

        if image.mode != "RGB":
            image = image.convert("RGB")

        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=90)
        image_bytes = buffer.getvalue()

        print(f"Scan successful! ({len(image_bytes) // 1024} KB, in memory)")

        # ----------------------------------------------------
        # Send the scanned image to PaddleOCR (from memory)
        # ----------------------------------------------------

        print("Sending scanned image to PaddleOCR...")

        ocr_result = {}
        ocr_error = None

        try:
            ocr_response = requests.post(
                "http://127.0.0.1:5001/ocr",
                files={
                    "file": (
                        "scan.jpg",
                        io.BytesIO(image_bytes),
                        "image/jpeg"
                    )
                },
                timeout=600
            )

            try:
                ocr_result = ocr_response.json()
            except ValueError:
                ocr_result = {}

            if not ocr_response.ok:
                ocr_error = (
                    ocr_result.get("error")
                    or ocr_result.get("message")
                    or f"OCR server returned HTTP {ocr_response.status_code}"
                )

            elif not ocr_result.get("success", False):
                ocr_error = (
                    ocr_result.get("error")
                    or ocr_result.get("message")
                    or "OCR could not extract the document."
                )

            else:
                print("PaddleOCR completed successfully.")
                print("Extracted name:",
                      ocr_result.get("first_name", ""),
                      ocr_result.get("middle_name", ""),
                      ocr_result.get("last_name", ""))
                print("Document type:",
                      ocr_result.get("document_type", ""))

        except requests.RequestException as ocr_exception:
            ocr_error = str(ocr_exception)
            print("PADDLEOCR CONNECTION ERROR:", ocr_error)

        # ----------------------------------------------------
        # Student known -> save straight into the student's folder
        # ----------------------------------------------------

        stored_path = None
        store_error = None

        if isinstance(known_student, dict):
            stored_path, store_error = save_to_student_folder(
                image_bytes,
                ocr_result.get("document_type", ""),
                known_student
            )

        # ----------------------------------------------------
        # Return scan + OCR results to React
        # The image is returned in memory for the preview and for
        # /store-scan; it is NOT saved anywhere else.
        # ----------------------------------------------------

        image_data_url = (
            "data:image/jpeg;base64,"
            + base64.b64encode(image_bytes).decode("ascii")
        )

        response_data = {
            "success": True,
            "message": "Document scanned successfully.",
            "scanner": {
                "id": device_uid
            },

            # Preview + data for /store-scan (nothing is on disk yet)
            "image_data_url": image_data_url,

            # Only set when a student was supplied
            "stored_path": stored_path,
            "store_error": store_error,

            # OCR status
            "ocr_success": ocr_error is None,
            "ocr_error": ocr_error,

            # Extracted information
            "first_name": ocr_result.get("first_name", ""),
            "middle_name": ocr_result.get("middle_name", ""),
            "last_name": ocr_result.get("last_name", ""),
            "birthdate": (
                ocr_result.get("birthdate")
                or ocr_result.get("birthday")
                or ""
            ),
            "document_type": ocr_result.get("document_type", ""),
            "document_type_confidence": (
                ocr_result.get("document_type_confidence")
            ),
            "document_type_suggestions": (
                ocr_result.get("document_type_suggestions", [])
            ),
            "document_id": ocr_result.get("document_id"),
            "raw_text": ocr_result.get("raw_text", "")
        }

        print("Returning scan and OCR response to React.")

        return jsonify(response_data), 200

    except Exception as e:
        print("\nSCAN ERROR")
        print("=" * 60)
        print("Type:", type(e).__name__)
        print("Message:", str(e))

        return jsonify({
            "success": False,
            "message": str(e),
            "error_type": type(e).__name__
        }), 500

    finally:
        pythoncom.CoUninitialize()


# ============================================================
# STORE A SCAN IN THE STUDENT'S FOLDER
# Call this after the staff confirms the student.
#
# POST /store-scan
# {
#   "image_data_url": "data:image/jpeg;base64,...",   (from /scan)
#   "document_type": "Birth Certificate",             (confirmed by staff)
#   "student": {
#     "student_id": 2026302405,
#     "first_name": "Arielle",
#     "middle_name": "Vermoy",
#     "last_name": "Dades",
#     "college_name": "CEA"
#   }
# }
# ============================================================

@app.route("/store-scan", methods=["POST"])
def store_scan():
    try:
        data = request.get_json(silent=True) or {}

        image_bytes = decode_image_data(data.get("image_data_url"))

        saved_path, error = save_to_student_folder(
            image_bytes,
            data.get("document_type"),
            data.get("student")
        )

        if error:
            return jsonify({"success": False, "message": error}), 400

        return jsonify({
            "success": True,
            "message": "Document stored successfully.",
            "stored_path": saved_path
        }), 200

    except Exception as e:
        print("\nSTORE SCAN ERROR")
        print("Type:", type(e).__name__)
        print("Message:", str(e))

        return jsonify({
            "success": False,
            "message": f"Could not store the document: {e}",
            "error_type": type(e).__name__
        }), 500


# ============================================================
# START SERVER
# ============================================================

if __name__ == "__main__":

    print("=" * 60)
    print("       REGISSCAN SCANNER SERVICE")
    print("=" * 60)

    print()
    print("Server:")
    print("http://127.0.0.1:5000")

    print()
    print("Scanner discovery:")
    print("GET /scanners")

    print()
    print("Scan:")
    print("POST /scan")

    print()
    print("Store a scan in the student's folder:")
    print("POST /store-scan")

    print()
    print("Documents are stored ONLY in:")
    print(f"{STUDENT_RECORDS_ROOT}\\<College>\\<ID>_<Name>\\")

    print()
    print("=" * 60)

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False,
        threaded=True
    )