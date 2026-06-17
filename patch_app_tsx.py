import os

filepath = os.path.join("src", "App.tsx")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Update MainTab type
old_type = "type MainTab = 'legal_repository' | 'legal_opinion' | 'document_maker' | 'contract_monitor' | 'account' | 'admin_dashboard' | 'knowledge_graph' | 'monitoring';"
new_type = "type MainTab = 'legal_repository' | 'legal_opinion' | 'document_maker' | 'contract_monitor' | 'account' | 'admin_dashboard' | 'knowledge_graph' | 'monitoring' | 'taxonomy_manager';"

if old_type in content:
    content = content.replace(old_type, new_type)

# 2. Update validSekretaris
old_sekretaris = "const validSekretaris: string[] = [...validRegular, 'admin_dashboard'];"
new_sekretaris = "const validSekretaris: string[] = [...validRegular, 'admin_dashboard', 'taxonomy_manager'];"

if old_sekretaris in content:
    content = content.replace(old_sekretaris, new_sekretaris)

# 3. Add import
import_stmt = "import TaxonomyManager from './components/TaxonomyManager';\n"
if "import TaxonomyManager" not in content:
    content = content.replace("import SystemMonitoring from './components/SystemMonitoring';", "import SystemMonitoring from './components/SystemMonitoring';\n" + import_stmt)

# 4. Add render block
old_render = """          {activeTab === 'monitoring' && isEngineer && <SystemMonitoring />}
          
        </main>"""
new_render = """          {activeTab === 'monitoring' && isEngineer && <SystemMonitoring />}
          {activeTab === 'taxonomy_manager' && isSekretaris && <TaxonomyManager />}
          
        </main>"""

if "<TaxonomyManager />" not in content:
    content = content.replace(old_render, new_render)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("App.tsx updated.")
