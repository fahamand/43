with open('public/assets/index-CkX4BMne.js', 'r') as f:
    content = f.read()

import re
print("Occurrences of '/api/db/':")
for m in re.finditer(r'/api/db/[a-zA-Z\-]+', content):
    start = max(0, m.start() - 100)
    end = min(len(content), m.end() + 100)
    print(f"Index {m.start()}: {content[start:end]}\n")
