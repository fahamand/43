with open('public/assets/index-CkX4BMne.js', 'r') as f:
    content = f.read()

# Let's search around index 3673436
start = max(0, 3673436 - 1500)
end = min(len(content), 3673436 + 1500)
print(content[start:end])
