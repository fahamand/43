import re

with open('./public/assets/index-CkX4BMne.js', 'r', encoding='utf-8') as f:
    content = f.read()

print("File loaded. Length:", len(content))

# Let's search for "فاصله بالای چاپ"
matches = [m.start() for m in re.finditer("فاصله بالای چاپ", content)]
print(f"Matches for 'فاصله بالای چاپ': {len(matches)}")
for idx, m in enumerate(matches):
    start = max(0, m - 300)
    end = min(len(content), m + 300)
    print(f"Match {idx+1} (offset {m}):\n", content[start:end])
    print("-" * 100)
