import os

print("Searching for stateManager in files:")
for root, dirs, files in os.walk('.'):
    for f in files:
        if 'statemanager' in f.lower():
            print(os.path.join(root, f))
