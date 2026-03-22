import os

file_path = r'c:\Users\MOHAK\mohak-ai-tool\frontend\src\app\(dashboard)\scheduler\page.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# 1. State variable
target_state = "  /* ── Pinned slots ── */\n  const [pinsOpen, setPinsOpen] = useState(false);"
new_state = "  /* ── Pinned slots ── */\n  const [pinsOpen, setPinsOpen] = useState(false);\n  const [batchStructureOpen, setBatchStructureOpen] = useState(false);"

content = content.replace(target_state, new_state)

target_state_cr = "  /* ── Pinned slots ── */\r\n  const [pinsOpen, setPinsOpen] = useState(false);"
new_state_cr = "  /* ── Pinned slots ── */\r\n  const [pinsOpen, setPinsOpen] = useState(false);\r\n  const [batchStructureOpen, setBatchStructureOpen] = useState(false);"
content = content.replace(target_state_cr, new_state_cr)

# 2. JSX Replacement
marker = '  return (\n    <div className="flex gap-6 h-[calc(100vh-5rem)]">'
marker_cr = '  return (\r\n    <div className="flex gap-6 h-[calc(100vh-5rem)]">'

idx = content.find(marker)
if idx == -1:
    idx = content.find(marker_cr)

if idx != -1:
    with open(r'c:\Users\MOHAK\mohak-ai-tool\new_jsx.txt', 'r', encoding='utf-8') as f2:
        new_jsx = f2.read()
    
    content = content[:idx] + new_jsx
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("Replaced Successfully!")
else:
    print("Marker not found.")
