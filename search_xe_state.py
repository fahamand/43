import re

with open('./public/assets/index-CkX4BMne.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's search for any occurrence of ",Xe]" or ",Xe =" or "Xe," inside index-CkX4BMne.js
# to see where Xe is defined as a state updater
matches = [m.start() for m in re.finditer(r"\bXe\b", content)]
print(f"Total occurrences of Xe: {len(matches)}")

# Let's search for "useState" in the range of 1900000 to 1950000
segment = content[1850000:1950000]
use_states = [m.start() + 1850000 for m in re.finditer(r"useState", segment)]
print(f"useState occurrences in segment: {len(use_states)}")
for u in use_states:
    print(content[u-100:u+150])
    print("-" * 100)
