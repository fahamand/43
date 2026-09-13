with open('/app/applet/public/assets/index-CkX4BMne.js', 'r') as f:
    content = f.read()

target = 'const Ae=await fetch("/api/db/load-key?key=category_quantity_commission_rules");if(Ae.ok){const we=await Ae.json();we&&we.status==="success"&&Array.isArray(we.data)&&Oe(we.data)}'

if target in content:
    print("TARGET FOUND IN PUBLIC BUNDLE!")
else:
    print("TARGET NOT FOUND IN PUBLIC BUNDLE!")
