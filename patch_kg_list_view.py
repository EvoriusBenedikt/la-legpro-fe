import os

filepath = os.path.join("src", "components", "KnowledgeGraph.tsx")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Import List and Network icons
if "List," not in content:
    content = content.replace("Trash2, Clock, Bot }", "Trash2, Clock, Bot, List, Network as NetworkIcon }")
    # In case Bot wasn't at the end:
    content = content.replace("Maximize2\n} from", "Maximize2,\n  List, Network as NetworkIcon\n} from")

# 2. Add viewMode state
if "viewMode" not in content:
    content = content.replace("const [activeScenario", "const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');\n  const [activeScenario")

# 3. Add toggle buttons to the header right side
old_header_right = """        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'var(--bg-lighter)', padding: '6px 12px', borderRadius: '8px',
            border: '1px solid var(--border-color)'
          }}>"""
new_header_right = """        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', background: 'var(--bg-lighter)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <button onClick={() => setViewMode('graph')} style={{ padding: '6px 12px', background: viewMode === 'graph' ? 'rgba(56, 189, 248, 0.15)' : 'transparent', color: viewMode === 'graph' ? '#38bdf8' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
              <NetworkIcon size={14} /> Graph
            </button>
            <button onClick={() => setViewMode('list')} style={{ padding: '6px 12px', background: viewMode === 'list' ? 'rgba(56, 189, 248, 0.15)' : 'transparent', color: viewMode === 'list' ? '#38bdf8' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
              <List size={14} /> List
            </button>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'var(--bg-lighter)', padding: '6px 12px', borderRadius: '8px',
            border: '1px solid var(--border-color)'
          }}>"""
content = content.replace(old_header_right, new_header_right)

# 4. Wrap the graph in a condition and render the List View
old_graph_container = """          <div ref={containerRef} style={{ width: '100%', height: '100%', background: 'var(--bg-dark)' }} />

          {/* Zoom controls */}
          <div style={{
            position: 'absolute', bottom: '20px', right: '20px',
            display: 'flex', flexDirection: 'column', gap: '8px',
          }}>
            {[
              { icon: <ZoomIn size={16} />, action: () => networkRef.current?.moveTo({ scale: (networkRef.current as any).getScale() * 1.3 }) },
              { icon: <ZoomOut size={16} />, action: () => networkRef.current?.moveTo({ scale: (networkRef.current as any).getScale() * 0.77 }) },
              { icon: <Maximize2 size={16} />, action: () => networkRef.current?.fit({ animation: true }) },
            ].map((btn, i) => (
              <button key={i} onClick={btn.action} style={{
                background: 'rgba(30,41,59,0.85)', border: '1px solid var(--border-color)',
                borderRadius: '8px', width: '36px', height: '36px', cursor: 'pointer',
                color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', transition: 'all 0.2s'
              }}>
                {btn.icon}
              </button>
            ))}
          </div>"""

new_graph_container = """          {viewMode === 'graph' ? (
            <>
              <div ref={containerRef} style={{ width: '100%', height: '100%', background: 'var(--bg-dark)' }} />
              <div style={{
                position: 'absolute', bottom: '20px', right: '20px',
                display: 'flex', flexDirection: 'column', gap: '8px',
              }}>
                {[
                  { icon: <ZoomIn size={16} />, action: () => networkRef.current?.moveTo({ scale: (networkRef.current as any).getScale() * 1.3 }) },
                  { icon: <ZoomOut size={16} />, action: () => networkRef.current?.moveTo({ scale: (networkRef.current as any).getScale() * 0.77 }) },
                  { icon: <Maximize2 size={16} />, action: () => networkRef.current?.fit({ animation: true }) },
                ].map((btn, i) => (
                  <button key={i} onClick={btn.action} style={{
                    background: 'rgba(30,41,59,0.85)', border: '1px solid var(--border-color)',
                    borderRadius: '8px', width: '36px', height: '36px', cursor: 'pointer',
                    color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)', transition: 'all 0.2s'
                  }}>
                    {btn.icon}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div style={{ width: '100%', height: '100%', background: 'var(--bg-dark)', padding: '20px', overflowY: 'auto' }} className="custom-scrollbar">
              <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
                <h3 style={{ color: 'var(--text-primary)', marginBottom: '16px' }}>List View Knowledge Graph</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {kgData && kgData.nodes
                    .filter(n => n.label.toLowerCase().includes(search.toLowerCase()) && (filterType === 'Semua' || n.type.toLowerCase() === filterType.toLowerCase()))
                    .slice(0, 100)
                    .map(node => (
                    <div key={node.id} onClick={() => { setViewMode('graph'); setTimeout(() => handleNodeClick(node.id), 100); }} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', cursor: 'pointer', transition: 'all 0.2s' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <strong style={{ color: '#f8fafc', fontSize: '1rem' }}>{node.label}</strong>
                        <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', background: node.type === 'regulasi' ? 'rgba(56,189,248,0.1)' : node.type === 'entitas' ? 'rgba(168,85,247,0.1)' : 'rgba(52,211,153,0.1)', color: node.type === 'regulasi' ? '#38bdf8' : node.type === 'entitas' ? '#a855f7' : '#34d399' }}>
                          {node.type.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
                        {kgData.edges.filter(e => e.source_id === node.id || e.target_id === node.id).length} Relasi Terhubung
                      </div>
                    </div>
                  ))}
                  {kgData && kgData.nodes.filter(n => n.label.toLowerCase().includes(search.toLowerCase()) && (filterType === 'Semua' || n.type.toLowerCase() === filterType.toLowerCase())).length > 100 && (
                    <div style={{ textAlign: 'center', color: '#64748b', padding: '20px', fontSize: '0.85rem' }}>
                      Menampilkan 100 dari {kgData.nodes.filter(n => n.label.toLowerCase().includes(search.toLowerCase()) && (filterType === 'Semua' || n.type.toLowerCase() === filterType.toLowerCase())).length} node. Gunakan pencarian untuk hasil lebih spesifik.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}"""
content = content.replace(old_graph_container, new_graph_container)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("List View mode implemented successfully.")
