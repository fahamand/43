with open('public/assets/index-CkX4BMne.js', 'r') as f:
    content = f.read()

# Let's search for the text "save-key" or "saveGenericKeyToDb"
import re
print("Occurrences of 'save-key':")
for m in re.finditer(r'save-key', content):
    start = max(0, m.start() - 100)
    end = min(len(content), m.end() + 100)
    print(f"Index {m.start()}: {content[start:end]}")

print("\nOccurrences of 'commission_tags_list':")
for m in re.finditer(r'commission_tags_list', content):
    start = max(0, m.start() - 100)
    end = min(len(content), m.end() + 100)
    print(f"Index {m.start()}: {content[start:end]}")
