import re

with open('./public/assets/index-CkX4BMne.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's find "فاصله بالای چاپ:" in the file and print 1000 characters before and after it.
matches = [m.start() for m in re.finditer("فاصله بالای چاپ:", content)]
for idx, m in enumerate(matches):
    print(f"Match {idx+1} (offset {m}):")
    start = max(0, m - 500)
    end = min(len(content), m + 1500)
    print(content[start:end])
    print("-" * 120)
