import os

print("Searching for files containing 'saveGenericKeyToDb':")
for root, dirs, files in os.walk('.'):
    for f in files:
        path = os.path.join(root, f)
        try:
            with open(path, 'r', errors='ignore') as file:
                content = file.read()
                if 'saveGenericKeyToDb' in content:
                    print(path)
        except:
            pass
