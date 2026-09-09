import re

with open('server.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

tables = ['invoices', 'transactions', 'items', 'accounting_docs', 'accounting_doc_lines']
patterns = [
    r'INSERT\s+INTO\s+(\w+)',
    r'UPDATE\s+(\w+)',
    r'FROM\s+(\w+)',
    r'JOIN\s+(\w+)'
]

for i, line in enumerate(lines):
    line_num = i + 1
    # Simple check for any table name in a query context
    for t in tables:
        if t in line:
            # check if it contains common SQL keywords in the same line or nearby
            if any(k in line.upper() for k in ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'FROM', 'JOIN', 'WHERE', 'INTO']):
                print(f"Line {line_num}: {line.strip()[:120]}")
