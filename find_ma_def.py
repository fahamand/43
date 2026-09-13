with open('public/assets/index-CkX4BMne.js', 'r') as f:
    content = f.read()

import re
target = 'if(l==="currentUser"||l==="primaryUserRole"||l==="isLoggedIn"||l==="currentSessionId"'
idx = content.find(target)
if idx != -1:
    print("Found target! Lines around:")
    print(content[idx-1000:idx+2000])
else:
    print("Target not found!")
