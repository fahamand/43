import re

with open('./public/assets/index-CkX4BMne.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Find all occurrences of "مشاهده وضعیت بدهکاران و بستانکاران"
for match in re.finditer(r"مشاهده وضعیت بدهکاران و بستانکاران", content):
    start = max(0, match.start() - 2500)
    end = min(len(content), match.end() + 2500)
    print(f"--- Occurrence at index {match.start()} ---")
    print(content[start:end])
    print("\n" + "="*80 + "\n")
