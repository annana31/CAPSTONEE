import os
import time
from datetime import datetime

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


# Simple in-memory cache so opening the scan modal repeatedly doesn't
# re-probe every WIA device each time. The frontend's refresh (⟳) button
# passes ?force=1 to bypass this and get a fresh read.
_SCANNER_CACHE = {"scanners": None, "timestamp": 0}
_SCANNER_CACHE_TTL_SECONDS = 20


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
        "scanner_service": True
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
        device_uid = data.get("device_uid")

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
        # Save scanned image
        # ----------------------------------------------------

        image.save(
            filepath,
            format="JPEG",
            quality=90
        )

        print("Scan successful!")
        print(f"Saved: {filepath}")

        # ----------------------------------------------------
        # URL React can use to display the image
        # ----------------------------------------------------

        file_url = f"http://127.0.0.1:5000/scans/{filename}"

        return jsonify({
            "success": True,
            "message": "Document scanned successfully.",
            "filename": filename,
            "file_url": file_url,
            "scanner": {
                "id": device_uid
            }
        })

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
# SERVE SCANNED FILES
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
    print("Scanned files:")
    print("http://127.0.0.1:5000/scans/<filename>")

    print()
    print("=" * 60)

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False,
        threaded=True
    )