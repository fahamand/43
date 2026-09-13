with open('public/assets/index-CkX4BMne.js', 'r') as f:
    content = f.read()

import re
print("Occurrences of window.addEventListener or storage event in bundle:")
for m in re.finditer(r'window\.addEventListener\("focus"|window\.addEventListener\("storage"', content):
    start = max(0, m.start() - 250)
    end = min(len(content), m.end() + 250)
    print(f"Index {m.start()}:\n{content[start:end]}\n")
