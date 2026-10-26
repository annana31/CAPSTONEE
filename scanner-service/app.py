import os
import re
import shutil
import time
import unicodedata
from datetime import datetime
import requests

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

import pythoncom
import wia_scan


# ============================================================
# REGISSCAN SCANNER SERVICE
# Windows WIA + wia_scan
# ============================================================

app = Flask(__name__)

# Allow your React application to communicate with Flask
CORS(app)


# ============================================================
# CONFIGURATION
# ============================================================

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SCAN_FOLDER = os.path.join(BASE_DIR, "scans")

os.makedirs(SCAN_FOLDER, exist_ok=True)

# Permanent storage: C:\StudentRecords\<College>\<ID>_<Name>\
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


def store_scan_file(filename, document_type, student, move=True):
    """
    Put an already-scanned file (in the temporary scans folder) into the
    student's folder. Returns (saved_path, error_message).
    """
    # Only allow plain file names that exist in the temporary scans folder
    clean_name = os.path.basename(str(filename or ""))
    source = os.path.join(SCAN_FOLDER, clean_name)

    if not clean_name or not os.path.isfile(source):
        return None, "The scanned file was not found. Please scan again."

    folder = build_student_folder(student or {})
    if not folder:
        return None, "Student ID and name are required to store the document."

    if not is_inside(STUDENT_RECORDS_ROOT, folder):
        return None, "Invalid student folder."

    os.makedirs(folder, exist_ok=True)

    # File name: <Document_Type>_<timestamp>.jpg (never overwrites)
    doc_part = safe_name(document_type).replace(" ", "_") or "Unclassified"
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    extension = os.path.splitext(clean_name)[1] or ".jpg"

    destination = os.path.join(folder, f"{doc_part}_{stamp}{extension}")
    counter = 2
    while os.path.exists(destination):
        destination = os.path.join(
            folder, f"{doc_part}_{stamp}_{counter}{extension}"
        )
        counter += 1

    if move:
        shutil.move(source, destination)
    else:
        shutil.copy2(source, destination)

    print(f"Stored document: {destination}")
    return destination, None


# ============================================================
# HELPER: LIST WIA SCANNERS
# ============================================================

def discover_scanners():
    """
    Enumerates every WIA device currently registered with Windows and
    returns its id, name, description and manufacturer. Reading each
    property directly (by name) is much faster than looping through the
    full Properties collection for every device, since each property read
    can involve a round trip to the driver.
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

    # --------------------------------------------------------
    # SERVE FROM CACHE WHEN FRESH
    # --------------------------------------------------------

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

    # --------------------------------------------------------
    # DISCOVER SCANNERS
    # --------------------------------------------------------

    # Flask's dev server can hand this request to a fresh thread, and COM
    # objects (which win32com/wia_scan use under the hood) must be
    # initialized on every thread that touches them before first use.
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

        # Update cache
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
# ============================================================

@app.route("/scan", methods=["POST"])
def scan_document():

    pythoncom.CoInitialize()

    try:
        print("\n" + "=" * 60)
        print("REGISSCAN - SCAN REQUEST")
        print("=" * 60)

        # ----------------------------------------------------
        # Read the scanner chosen by the staff on the frontend
        # ----------------------------------------------------

        data = request.get_json(silent=True) or {}

        # Scanning only needs the scanner; the student is normally
        # confirmed afterwards on the OCR confirmation screen.
        device_uid = data.get("device_uid")

        # OPTIONAL: if the student is already known, the scan is filed
        # into the student's folder immediately after OCR.
        # {student_id, first_name, middle_name, last_name, college_name}
        known_student = data.get("student")

        print(f"Requested scanner: {device_uid}")

        if not device_uid:
            return jsonify({
                "success": False,
                "message": "No scanner was selected. Please select a scanner first."
            }), 400

        # ----------------------------------------------------
        # Connect directly to the chosen scanner
        # (no OS device-picker prompt)
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
        # Generate filename
        # ----------------------------------------------------

        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        filename = f"scan_{timestamp}.jpg"
        filepath = os.path.join(SCAN_FOLDER, filename)

        # ----------------------------------------------------
        # Start scanning
        # ----------------------------------------------------

        print("Starting scan...")
        print("Place the document on the scanner.")

        image = wia_scan.scan_side(device=device)

        if image is None:
            return jsonify({
                "success": False,
                "message": "The scanner did not return an image."
            }), 500

        # ----------------------------------------------------
        # Save scanned image (temporary copy in the scans folder)
        # ----------------------------------------------------

        image.save(
            filepath,
            format="JPEG",
            quality=90
        )

        print("Scan successful!")
        print(f"Saved: {filepath}")

        # ----------------------------------------------------
        # Build the scanned image URL
        # ----------------------------------------------------

        file_url = f"{request.host_url.rstrip('/')}/scans/{filename}"

        # ----------------------------------------------------
        # Send the ACTUAL SCANNED FILE to PaddleOCR
        # ----------------------------------------------------

        print("Sending scanned file to PaddleOCR...")
        print(f"OCR file: {filepath}")

        ocr_result = {}
        ocr_error = None

        try:
            with open(filepath, "rb") as scanned_file:
                ocr_response = requests.post(
                    "http://127.0.0.1:5001/ocr",
                    files={
                        "file": (
                            filename,
                            scanned_file,
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
        # If the student is already known, file the document now
        # ----------------------------------------------------

        stored_path = None
        store_error = None

        if isinstance(known_student, dict):
            stored_path, store_error = store_scan_file(
                filename,
                ocr_result.get("document_type", ""),
                known_student,
                move=False  # keep the temp file so the preview still works
            )

        # ----------------------------------------------------
        # Return scan information AND OCR results to React
        # ----------------------------------------------------

        response_data = {
            "success": True,
            "message": "Document scanned successfully.",
            "filename": filename,
            "file_url": file_url,
            "scanner": {
                "id": device_uid
            },

            # Permanent storage (only when a student was supplied)
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
# Call this after the staff confirms the student on the OCR screen.
#
# POST /store-scan
# {
#   "filename": "scan_20261026_153012_123456.jpg",
#   "document_type": "Birth Certificate",      (confirmed/edited by staff)
#   "student": {
#     "student_id": 2026302405,
#     "first_name": "Arielle",
#     "middle_name": "Vermoy",
#     "last_name": "Dades",
#     "college_name": "CEA"
#   },
#   "keep_temp": false                         (optional)
# }
# ============================================================

@app.route("/store-scan", methods=["POST"])
def store_scan():
    try:
        data = request.get_json(silent=True) or {}

        saved_path, error = store_scan_file(
            data.get("filename"),
            data.get("document_type"),
            data.get("student"),
            move=not bool(data.get("keep_temp", False))
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
# SERVE SCANNED FILES (temporary preview copies)
# ============================================================

@app.route("/scans/<filename>", methods=["GET"])
def get_scan(filename):
    return send_from_directory(
        SCAN_FOLDER,
        filename
    )


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
    print("Documents are stored in:")
    print(f"{STUDENT_RECORDS_ROOT}\\<College>\\<ID>_<Name>\\")

    print()
    print("=" * 60)

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False,
        threaded=True
    )