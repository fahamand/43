with open('public/assets/index-CkX4BMne.js', 'r') as f:
    content = f.read()

import re
idx = content.find('async function u6(')
if idx != -1:
    # search for the next function declaration
    next_func_idx = content.find('function ', idx + 2000)
    print(content[next_func_idx:next_func_idx + 2000])
