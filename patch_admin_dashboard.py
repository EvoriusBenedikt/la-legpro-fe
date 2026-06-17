import os
import re

filepath = os.path.join("src", "components", "AdminDashboard.tsx")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Add StatusCard component
status_card_code = """
const StatusCard = ({ label, value, icon, color, totalDocs, docs = [] }: any) => {
  const [expanded, setExpanded] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filteredDocs = docs.filter((d: any) => 
    d.judul.toLowerCase().includes(search.toLowerCase()) || 
    (d.nomor && d.nomor.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ background: 'var(--bg-card)', borderRadius: '14px', border: `1px solid ${color}33`, overflow: 'hidden', height: 'fit-content' }}>
      <div 
        onClick={() => setExpanded(!expanded)} 
        style={{ padding: '24px', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color }}>
            {icon}
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{label}</span>
          </div>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.8rem' }}>{expanded ? '▲ Tutup' : '▼ Lihat Daftar'}</span>
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 800, color, marginTop: '12px' }}>{value}</div>
        <div style={{ height: '4px', background: `${color}22`, borderRadius: '2px', marginTop: '12px' }}>
          <div style={{ height: '100%', borderRadius: '2px', background: color, width: totalDocs > 0 ? `${Math.min(100, (value / totalDocs) * 100)}%` : '0%' }}></div>
        </div>
      </div>
      
      {expanded && (
        <div style={{ padding: '0 24px 24px', borderTop: `1px solid ${color}22` }}>
          <input 
            type="text" 
            placeholder={`Cari regulasi ${label.toLowerCase()}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.2)', border: `1px solid ${color}55`, borderRadius: '6px', color: '#fff', marginTop: '16px', marginBottom: '12px', fontSize: '0.85rem' }}
          />
          <div className="custom-scrollbar" style={{ maxHeight: '200px', overflowY: 'auto' }}>
            {filteredDocs.length > 0 ? filteredDocs.map((d: any, i: number) => (
              <div key={i} style={{ padding: '8px 0', borderBottom: i < filteredDocs.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none' }}>
                <div style={{ fontSize: '0.85rem', color: '#e2e8f0', fontWeight: 500, lineHeight: '1.4' }}>{d.judul}</div>
                {d.nomor && <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>{d.nomor}</div>}
              </div>
            )) : (
              <div style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center', padding: '10px 0' }}>Tidak ada dokumen ditemukan</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default function AdminDashboard"""

if "const StatusCard = " not in content:
    content = content.replace("export default function AdminDashboard", status_card_code)


# Update the data extracting logic
old_data_logic = """  const totalDocs = data ? Object.values(data.doc_status).reduce((a, b) => a + b, 0) : 0;
  const berlakuDocs = data?.doc_status['Berlaku'] ?? 0;
  const memproseDocs = data?.doc_status['Memproses'] ?? 0;
  const failedDocs = Object.entries(data?.doc_status ?? {})
    .filter(([k]) => k.startsWith('Gagal'))
    .reduce((a, [, v]) => a + v, 0);"""

new_data_logic = """  const totalDocs = data ? Object.values(data.doc_status).reduce((a: any, b: any) => a + b, 0) : 0;
  const berlakuDocs = data?.doc_status['Berlaku'] ?? 0;
  const tidakBerlakuDocs = data?.doc_status['Tidak Berlaku'] ?? 0;
  const memproseDocs = data?.doc_status['Memproses'] ?? 0;
  const failedDocs = data?.doc_status['Gagal'] ?? 0;
  
  const docDetails = data?.doc_details || {};"""

if "tidakBerlakuDocs" not in content:
    content = content.replace(old_data_logic, new_data_logic)


# Update the Doc Status Cards section
old_cards_section = """          {/* Doc Status Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            {[
              { label: 'Berlaku', value: berlakuDocs, icon: <CheckCircle2 size={20} />, color: '#22D3EE' },
              { label: 'Memproses', value: memproseDocs, icon: <Clock size={20} />, color: '#F59E0B' },
              { label: 'Gagal', value: failedDocs, icon: <XCircle size={20} />, color: '#F43F5E' },
            ].map(card => (
              <div key={card.label} style={{
                background: 'var(--bg-card)', borderRadius: '14px', padding: '24px',
                border: `1px solid ${card.color}33`,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', color: card.color }}>
                  {card.icon}
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{card.label}</span>
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: card.color }}>{card.value}</div>
                <div style={{ height: '4px', background: `${card.color}22`, borderRadius: '2px', marginTop: '12px' }}>
                  <div style={{
                    height: '100%', borderRadius: '2px',
                    background: card.color,
                    width: totalDocs > 0 ? `${Math.min(100, (card.value / totalDocs) * 100)}%` : '0%',
                  }} />
                </div>
              </div>
            ))}
          </div>"""

new_cards_section = """          {/* Doc Status Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px', marginBottom: '24px', alignItems: 'start' }}>
            {[
              { label: 'Berlaku', value: berlakuDocs, icon: <CheckCircle2 size={20} />, color: '#22D3EE', docs: docDetails['Berlaku'] },
              { label: 'Tidak Berlaku', value: tidakBerlakuDocs, icon: <XCircle size={20} />, color: '#94A3B8', docs: docDetails['Tidak Berlaku'] },
              { label: 'Memproses', value: memproseDocs, icon: <Clock size={20} />, color: '#F59E0B', docs: docDetails['Memproses'] },
              { label: 'Gagal', value: failedDocs, icon: <AlertTriangle size={20} />, color: '#F43F5E', docs: docDetails['Gagal'] },
            ].map(card => (
              <StatusCard key={card.label} {...card} totalDocs={totalDocs} />
            ))}
          </div>"""

if "StatusCard key=" not in content:
    content = content.replace(old_cards_section, new_cards_section)


# We also need to import React or change React.useState to just useState if it's not imported properly.
# Actually, standard Vite React 18 uses automatic runtime, but React might be needed for React.useState.
if "import React" not in content and "import * as React" not in content:
    content = "import React from 'react';\n" + content

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("AdminDashboard UI update complete.")
