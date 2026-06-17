import os

filepath = os.path.join("src", "components", "TopBar.tsx")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add Taxonomy menu item
menu_code = """
        {isSekretaris && (
          <button
            onClick={() => setActiveTab('taxonomy_manager')}
            style={{
              background: 'transparent',
              border: 'none',
              color: activeTab === 'taxonomy_manager' ? '#818cf8' : '#94a3b8',
              cursor: 'pointer',
              fontWeight: activeTab === 'taxonomy_manager' ? 600 : 400,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <FolderTree size={18} />
            Taksonomi
          </button>
        )}
"""

if "Taksonomi" not in content:
    # Insert after Admin Dashboard button
    old_admin_btn = """          >
            <Shield size={18} />
            Admin Dashboard
          </button>
        )}"""
    
    if old_admin_btn in content:
        content = content.replace(old_admin_btn, old_admin_btn + menu_code)
        
# 2. Make sure FolderTree is imported from lucide-react
if "FolderTree" not in content:
    content = content.replace("import { Database, UploadCloud,", "import { Database, UploadCloud, FolderTree,")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("TopBar.tsx updated.")
