import pythoncom
import win32com.client

print("================================")
print("       DIRECT WIA TEST")
print("================================")

pythoncom.CoInitialize()

try:
    print("1. Creating WIA Device Manager...")
    manager = win32com.client.Dispatch("WIA.DeviceManager")
    print("2. WIA Device Manager: OK")

    print("3. Checking devices...")
    devices = manager.DeviceInfos

    print("4. Device count:", devices.Count)

    for i in range(1, devices.Count + 1):
        device = devices.Item(i)

        print("\nDevice", i)
        print("DeviceID:", device.DeviceID)

        try:
            print("Name:", device.Properties("Name").Value)
        except:
            print("Name: unavailable")

        try:
            print("Description:", device.Properties("Description").Value)
        except:
            print("Description: unavailable")

finally:
    pythoncom.CoUninitialize()

print("\nDONE")