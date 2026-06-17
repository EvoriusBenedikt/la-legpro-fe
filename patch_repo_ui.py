import os

filepath = os.path.join("src", "components", "LegalRepository.tsx")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Import Bot
if "Bot" not in content:
    content = content.replace("Clock } from 'lucide-react';", "Clock, Bot } from 'lucide-react';")

# 2. Add revealedAi state
old_state = "  const [activeTab, setActiveTab] = useState<'regulations' | 'internal' | 'analyzed' | 'templates' | 'pending'>('regulations');"
new_state = "  const [activeTab, setActiveTab] = useState<'regulations' | 'internal' | 'analyzed' | 'templates' | 'pending'>('regulations');\n  const [revealedAi, setRevealedAi] = useState<Record<string, boolean>>({});"
if "revealedAi" not in content:
    content = content.replace(old_state, new_state)

# 3. Replace the pending card UI section
old_ui = """                <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#94a3b8' }}>Rekomendasi AI Klasifikasi:</p>
                  <select
                    defaultValue={(doc as any).klasifikasi || 'Umum'}
                    onChange={(e) => { (doc as any).selectedKlasifikasi = e.target.value; }}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '8px', color: '#f8fafc', marginBottom: '12px' }}
                  >
                    <option value="Umum">Umum</option>
                    <option value="Rahasia">Rahasia</option>
                    <option value="Terbatas">Terbatas</option>
                  </select>
                  <button
                    onClick={() => handleConfirmPending(doc.id, (doc as any).selectedKlasifikasi || (doc as any).klasifikasi || 'Umum')}
                    style={{ width: '100%', background: '#f59e0b', color: 'white', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Konfirmasi & Ingest
                  </button>
                </div>"""

new_ui = """                <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  
                  {revealedAi[doc.id] ? (
                    <div style={{ padding: '8px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', borderRadius: '6px', marginBottom: '12px', fontSize: '0.85rem', color: '#60a5fa' }}>
                      <Bot size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                      AI merekomendasikan: <strong>{doc.klasifikasi || 'Umum'}</strong>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRevealedAi(prev => ({ ...prev, [doc.id]: true }))}
                      style={{ width: '100%', background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '12px' }}
                    >
                      <Bot size={14} /> Tampilkan Rekomendasi AI
                    </button>
                  )}

                  <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#94a3b8' }}>Klasifikasi Akhir:</p>
                  <select
                    defaultValue=""
                    onChange={(e) => { (doc as any).selectedKlasifikasi = e.target.value; }}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '8px', color: '#f8fafc', marginBottom: '12px' }}
                  >
                    <option value="" disabled>Pilih Klasifikasi...</option>
                    <option value="Umum">Umum</option>
                    <option value="Rahasia">Rahasia</option>
                    <option value="Terbatas">Terbatas</option>
                  </select>
                  <button
                    onClick={() => {
                      const finalClass = (doc as any).selectedKlasifikasi;
                      if (!finalClass) return alert("Pilih klasifikasi terlebih dahulu!");
                      handleConfirmPending(doc.id, finalClass);
                    }}
                    style={{ width: '100%', background: '#f59e0b', color: 'white', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Konfirmasi & Ingest
                  </button>
                </div>"""

content = content.replace(old_ui, new_ui)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Patch applied to UI successfully.")
