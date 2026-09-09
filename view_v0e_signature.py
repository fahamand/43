with open('./public/assets/index-CkX4BMne.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Let's find "function v0e"
idx = content.find("function v0e")
print(content[idx:idx+1500])
