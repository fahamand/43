with open('public/assets/index-CkX4BMne.js', 'r') as f:
    content = f.read()

import re
print("Occurrences of __commissionsLoaded:")
for m in re.finditer(r'__commissionsLoaded', content):
    start = max(0, m.start() - 250)
    end = min(len(content), m.end() + 250)
    print(f"Index {m.start()}:\n{content[start:end]}\n")
