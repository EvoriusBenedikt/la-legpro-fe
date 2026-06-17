import os

filepath = os.path.join("src", "components", "DocumentMaker.tsx")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add useOCR state
old_state = "  const [saveSuccess, setSaveSuccess] = useState(false);"
new_state = "  const [saveSuccess, setSaveSuccess] = useState(false);\n  const [useOCR, setUseOCR] = useState(false);"
content = content.replace(old_state, new_state)

# 2. Add use_ocr to formData
old_formdata = """    const formData = new FormData();
    formData.append('file', file);"""
new_formdata = """    const formData = new FormData();
    formData.append('file', file);
    formData.append('use_ocr', useOCR.toString());"""
content = content.replace(old_formdata, new_formdata)

# 3. Add OCR Checkbox UI below the file input
old_input = """              {file && (
                <div className="selected-file">
                  <FileText size={16} />
                  <span>{file.name}</span>
                </div>
              )}
            </div>"""

new_input = """              {file && (
                <div className="selected-file">
                  <FileText size={16} />
                  <span>{file.name}</span>
                </div>
              )}
            </div>

            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setUseOCR(!useOCR)}>
              <input 
                type="checkbox" 
                checked={useOCR} 
                onChange={() => {}} 
                style={{ cursor: 'pointer', width: '16px', height: '16px', accentColor: '#f59e0b' }} 
              />
              <span style={{ fontSize: '0.85rem', color: useOCR ? '#f8fafc' : '#94a3b8', fontWeight: useOCR ? 600 : 400 }}>Gunakan OCR Tradisional (Sesuai FR-2)</span>
            </div>"""
content = content.replace(old_input, new_input)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Frontend OCR patch applied successfully.")
