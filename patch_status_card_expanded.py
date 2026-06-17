import os

filepath = os.path.join("src", "components", "AdminDashboard.tsx")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Replace StatusCard implementation
old_card = """const StatusCard = ({ label, value, icon, color, totalDocs, docs = [] }: any) => {
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
};"""

new_card = """const StatusCard = ({ label, value, icon, color, totalDocs, docs = [] }: any) => {
  const [search, setSearch] = React.useState("");

  const filteredDocs = docs.filter((d: any) => 
    d.judul.toLowerCase().includes(search.toLowerCase()) || 
    (d.nomor && d.nomor.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', borderRadius: '14px', border: `1px solid ${color}33`, overflow: 'hidden', height: '100%' }}>
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color }}>
            {icon}
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{label}</span>
          </div>
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 800, color, marginTop: '12px' }}>{value}</div>
        <div style={{ height: '4px', background: `${color}22`, borderRadius: '2px', marginTop: '12px' }}>
          <div style={{ height: '100%', borderRadius: '2px', background: color, width: totalDocs > 0 ? `${Math.min(100, (value / totalDocs) * 100)}%` : '0%' }}></div>
        </div>
      </div>
      
      <div style={{ padding: '0 24px 24px', borderTop: `1px solid ${color}22`, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <input 
          type="text" 
          placeholder={`Cari regulasi ${label.toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', padding: '8px 12px', background: 'rgba(0,0,0,0.2)', border: `1px solid ${color}55`, borderRadius: '6px', color: '#fff', marginTop: '16px', marginBottom: '12px', fontSize: '0.85rem' }}
        />
        <div className="custom-scrollbar" style={{ maxHeight: '200px', flexGrow: 1, overflowY: 'auto' }}>
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
    </div>
  );
};"""

if old_card in content:
    content = content.replace(old_card, new_card)

# Fix the alignItems in the grid
old_grid = "alignItems: 'start'"
if old_grid in content:
    content = content.replace(old_grid, "alignItems: 'stretch'")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Permanently expanded UI applied.")
