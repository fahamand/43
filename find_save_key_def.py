import os

print("Searching for saveGenericKeyToDb definition in files:")
for root, dirs, files in os.walk('.'):
    for f in files:
        if f.endswith('.ts') or f.endswith('.tsx') or f.endswith('.js') or f.endswith('.jsx') or f.endswith('.php'):
            path = os.path.join(root, f)
            try:
                with open(path, 'r', errors='ignore') as file:
                    content = file.read()
                    if 'function saveGenericKeyToDb' in content or 'const saveGenericKeyToDb' in content or 'saveGenericKeyToDb = ' in content:
                        print(f"Found in: {path}")
            except:
                pass
