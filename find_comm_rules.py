with open('src/components/CommissionReport.tsx', 'r') as f:
    content = f.read()

import re
print("Occurrences of setInterval or fetch in CommissionReport.tsx:")
for m in re.finditer(r'setInterval|fetch', content):
    start = max(0, m.start() - 150)
    end = min(len(content), m.end() + 150)
    print(f"Index {m.start()}:\n{content[start:end]}\n")
