import os
import re

filepath = os.path.join("src", "components", "KnowledgeGraph.tsx")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Define the new component to insert before KnowledgeGraph
node_list_card_component = """
const NodeListCard = ({ node, kgData, onNavigate }: { node: KGNode, kgData: KGData, onNavigate: (id: string) => void }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const connectedEdges = kgData.edges.filter(e => e.source_id === node.id || e.target_id === node.id);
  const connectedNodes = connectedEdges.map(e => {
    const otherId = e.source_id === node.id ? e.target_id : e.source_id;
    return { node: kgData.nodes.find(n => n.id === otherId), rel: e.relation_type };
  }).filter(n => n.node);

  return (
    <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', transition: 'all 0.2s' }}>
      <div 
        onClick={() => onNavigate(node.id)}
        style={{ cursor: 'pointer' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <strong style={{ color: '#f8fafc', fontSize: '1rem' }}>{node.label}</strong>
          <span style={{ fontSize: '0.75rem', padding: '4px 8px', borderRadius: '4px', background: node.type === 'regulasi' ? 'rgba(56,189,248,0.1)' : node.type === 'entitas' ? 'rgba(168,85,247,0.1)' : 'rgba(52,211,153,0.1)', color: node.type === 'regulasi' ? '#38bdf8' : node.type === 'entitas' ? '#a855f7' : '#34d399' }}>
            {node.type.toUpperCase()}
          </span>
        </div>
        <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
          {connectedEdges.length} Relasi Terhubung
        </div>
      </div>
      
      {connectedEdges.length > 0 && (
        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '12px' }}>
          <button 
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            style={{ background: 'transparent', border: 'none', color: '#38bdf8', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
          >
            {isExpanded ? 'Sembunyikan Relasi ▲' : 'Lihat Daftar Regulasi/Entitas ▼'}
          </button>
          
          {isExpanded && (
            <div style={{ marginTop: '12px', maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '8px' }} className="custom-scrollbar">
              {connectedNodes.map((cn, i) => (
                <div key={i} style={{ padding: '8px', borderBottom: i < connectedNodes.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#cbd5e1' }}><span style={{ color: '#a855f7', fontWeight: 600 }}>{cn.rel}</span> • {cn.node?.type.toUpperCase()}</div>
                  <div 
                    onClick={() => onNavigate(cn.node!.id)}
                    style={{ fontSize: '0.85rem', color: '#38bdf8', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {cn.node?.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default function KnowledgeGraph() {"""

if "const NodeListCard" not in content:
    content = content.replace("export default function KnowledgeGraph() {", node_list_card_component)


# Find the chunk we need to replace in the list mapping
old_map_logic = """                  .map(node => (
                  <div key={node.id} onClick={() => { setViewMode('graph'); setTimeout(() => handleRelationClick(node.id), 100); }} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px', cursor: 'pointer', transition: 'all 0.2s' }}>
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
                ))}"""

new_map_logic = """                  .map(node => (
                  <NodeListCard 
                    key={node.id} 
                    node={node} 
                    kgData={kgData} 
                    onNavigate={(id) => { setViewMode('graph'); setTimeout(() => handleRelationClick(id), 100); }} 
                  />
                ))}"""

if "NodeListCard key=" not in content:
    content = content.replace(old_map_logic, new_map_logic)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Accordion logic injected successfully.")
