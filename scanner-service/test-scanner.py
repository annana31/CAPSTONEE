import wia_scan

print("====================================")
print("   REGISSCAN WIA SCANNER TEST")
print("====================================")

try:

    # ----------------------------------------
    # Get WIA Device Manager
    # ----------------------------------------

    device_manager = wia_scan.get_device_manager()

    print("\n✓ WIA Device Manager connected")


    # ----------------------------------------
    # Display WIA devices
    # ----------------------------------------

    print("\nAvailable WIA devices:")
    print("------------------------------------")

    result = wia_scan.list_devices(device_manager)

    print("------------------------------------")

    print("\nlist_devices() returned:")
    print(result)


except Exception as e:

    print("\n====================================")
    print("ERROR")
    print("====================================")

    print("Type:", type(e).__name__)
    print("Message:", str(e))