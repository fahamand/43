import urllib.request
import json

try:
    url = "http://localhost:3000/api.php?action=db/save-key"
    payload = {
        "key": "acc_app_commission_tags_list",
        "data": [
            {"id": "1", "name": "مهر دو رنگ", "type": "fixed", "value": 2000, "description": "تست"}
        ],
        "forceOverwrite": True
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        print("Save Response:")
        print(html)
except Exception as e:
    print("ERROR calling save API:", e)
