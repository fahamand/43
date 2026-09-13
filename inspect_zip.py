import zipfile
import json

# Check if index-CkX4BMne.js inside dist.zip contains "dialog-tag-picker"
with zipfile.ZipFile('/app/applet/dist.zip', 'r') as zip_ref:
    namelist = zip_ref.namelist()
    print("Files in dist.zip:")
    for name in namelist[:20]:
         print(name)
    
    # Check assets/index-CkX4BMne.js
    bundle_name = 'assets/index-CkX4BMne.js'
    if bundle_name in namelist:
         content = zip_ref.read(bundle_name).decode('utf-8')
         if 'dialog-tag-picker' in content:
              print("SUCCESS: Found dialog-tag-picker inside dist.zip!")
         else:
              print("ERROR: dialog-tag-picker NOT found inside dist.zip!")
         
         if '__commissionsLoaded' in content:
              print("SUCCESS: Found __commissionsLoaded inside dist.zip!")
         else:
              print("ERROR: __commissionsLoaded NOT found inside dist.zip!")
    else:
         print(f"ERROR: {bundle_name} not found in dist.zip")
