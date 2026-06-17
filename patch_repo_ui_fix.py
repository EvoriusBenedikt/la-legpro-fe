import os

filepath = os.path.join("src", "components", "LegalRepository.tsx")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Inject revealedAi state
old_state = "  const [activeTab, setActiveTab] = useState<ActiveTab>('regulations');"
new_state = "  const [activeTab, setActiveTab] = useState<ActiveTab>('regulations');\n  const [revealedAi, setRevealedAi] = useState<Record<string, boolean>>({});"
if "revealedAi, setRevealedAi" not in content:
    content = content.replace(old_state, new_state)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Patch applied to LegalRepository.tsx successfully.")
