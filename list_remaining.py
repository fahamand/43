import re

with open('src/components/InvoiceManager.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

lines = text.split('\n')
patterns = [
    'وارد یکار', 'این (مشتری)', 'هماز', 'آیازب', 'آیاازبی', 'اینازکه', 'بیتا', 'تابروارد',
    'پیشبینا', 'به کهاز', 'یکبیاز', 'پیش‌فاکتورهاها', 'فاکتوریا', 'آیااین', 'ثبتتا',
    'پیش‌پرداختیک', 'تاازبی', 'بیازنوع', 'بایینتا', 'اینهایپا', 'همیکوارد', 'تابه‌از',
    'نوع‌تابه‌از', 'برایبا', 'برایپا', 'بهوارد', 'شدهوارد', 'تلاشتأمین', 'بیتادسته‌بندی',
    'تامبلغاست', 'تامگابایتهای', 'بیوارد', 'رانوع', 'ایناز', 'براز پیش‌فاکتور', 'ثبت ثبتتا', 'ثبت با',
    'فاکتوربا', 'کالابا'
]

matches = []
for idx, line in enumerate(lines, 1):
    for p in patterns:
        if p in line:
            matches.append((idx, p, line.strip()))
            break

print(f'Total suspicious lines: {len(matches)}')
for num, p, l in matches[:50]:
    print(f'{num} [{p}]: {l[:110]}')
