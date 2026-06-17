import os
import re

filepath = os.path.join("src", "components", "LegalRepository.tsx")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add taxonomy state
state_code = """
  const [taxonomyList, setTaxonomyList] = useState<{id: number, name: string}[]>([]);
  const [selectedTaxonomy, setSelectedTaxonomy] = useState<string>('');
"""
if "const [taxonomyList" not in content:
    content = content.replace("const [uploadStatus, setUploadStatus] = useState<string | null>(null);", "const [uploadStatus, setUploadStatus] = useState<string | null>(null);" + state_code)

# 2. Fetch taxonomy
fetch_tax_code = """
  useEffect(() => {
    const fetchTaxonomy = async () => {
      try {
        const res = await fetch('http://localhost:8000/api/taxonomy', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          // only active
          setTaxonomyList(data.taxonomy.filter((t: any) => t.is_active));
        }
      } catch (e) {
        console.error(e);
      }
    };
    if (token) fetchTaxonomy();
  }, [token]);
"""
if "const fetchTaxonomy =" not in content:
    content = content.replace("useEffect(() => {", fetch_tax_code + "\n  useEffect(() => {", 1)

# 3. Add to formData
if "formData.append(\"jenis_dokumen\"" not in content:
    content = content.replace('formData.append("doc_type", activeTab);', 'formData.append("doc_type", activeTab);\n      if (selectedTaxonomy) formData.append("jenis_dokumen", selectedTaxonomy);')

# 4. Add to UI
ui_code = """
            <select
              value={selectedTaxonomy}
              onChange={(e) => setSelectedTaxonomy(e.target.value)}
              style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer' }}
              title="Pilih Jenis Dokumen untuk diunggah"
            >
              <option value="">Jenis Upload: Auto</option>
              {taxonomyList.map(tax => (
                <option key={tax.id} value={tax.name}>{tax.name}</option>
              ))}
            </select>
"""
if "Jenis Upload: Auto" not in content:
    content = content.replace('<select\n              value={viewKlasifikasi}', ui_code + '\n            <select\n              value={viewKlasifikasi}')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("LegalRepository.tsx updated.")
