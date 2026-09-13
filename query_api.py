import urllib.request
import json

try:
    url = "http://localhost:3000/api/db/status"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req) as response:
        html = response.read().decode('utf-8')
        print("API Response:")
        print(html)
except Exception as e:
    print("ERROR calling API:", e)
