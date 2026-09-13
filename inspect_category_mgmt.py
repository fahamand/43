with open('./public/assets/index-CkX4BMne.js', 'r', encoding='utf-8') as f:
    content = f.read()

offset = 2410017
start = max(0, offset - 1000)
end = min(len(content), offset + 6000)
print(content[start:end])
