import os
from datetime import datetime

import wia_scan


# ==========================================
# RegisScan - Epson L5290 Scanner Test
# ==========================================

def main():
    print("=" * 50)
    print("       RegisScan Scanner Test")
    print("=" * 50)

    print("\nScanner devices detected by Windows WIA:")
    print("EPSON L5290 Series")
    print()

    print("A scanner-selection window will appear.")
    print("Select:")
    print("    EPSON L5290 Series")
    print()

    try:
        # Ask wia_scan to select and connect to a scanner
        device = wia_scan.prompt_choose_device_and_connect()

        if device is None:
            print("\nNo scanner was selected.")
            return

        print("\n✓ Scanner connected successfully!")

        # Create scans folder
        scans_folder = os.path.join(
            os.path.dirname(os.path.abspath(__file__)),
            "scans"
        )

        os.makedirs(scans_folder, exist_ok=True)

        # Create filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        filename = os.path.join(
            scans_folder,
            f"scan_{timestamp}.jpg"
        )

        print("\n" + "-" * 50)
        print("Place your document on the Epson L5290.")
        print("Press ENTER when you are ready to scan.")
        print("-" * 50)

        input()

        print("\nScanning...")
        print("Please wait...")

        # Start the actual scan
        image = wia_scan.scan_side(device=device)

        if image is None:
            print("\n✗ Scanner returned no image.")
            return

        # Save the scanned image
        image.save(
            filename,
            format="JPEG",
            quality=90
        )

        print("\n✓ SCAN SUCCESSFUL!")
        print()
        print("Saved file:")
        print(filename)
        print()
        print("You can now open the scans folder and check the result.")

    except Exception as e:
        print("\n" + "=" * 50)
        print("SCAN ERROR")
        print("=" * 50)
        print("Error type:", type(e).__name__)
        print("Error:", e)


if __name__ == "__main__":
    main()