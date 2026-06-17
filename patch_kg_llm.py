import os

filepath = os.path.join("src", "components", "KnowledgeGraph.tsx")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add states
state_injection = """  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [isScenarioLoading, setIsScenarioLoading] = useState<string | null>(null);
  const [scenarioNodes, setScenarioNodes] = useState<KGNode[]>([]);"""
content = content.replace("  const [activeScenario, setActiveScenario] = useState<string | null>(null);", state_injection)

# 2. Rewrite handleScenarioClick
old_handle_start = "  const handleScenarioClick = (scenario: string) => {"
old_handle_full = """  const handleScenarioClick = (scenario: string) => {
    if (!kgData || !networkRef.current) return;
    
    if (activeScenario === scenario) {
      setActiveScenario(null);
      // Restore all opacities to normal
      const nodeUpdates = kgData.nodes.map(n => ({ id: n.id, color: { opacity: 1 }, font: { color: '#ffffff' } }));
      const edgeUpdates = kgData.edges.map(e => ({ id: e.id, color: { opacity: e.relation === 'DITERBITKAN_OLEH' ? 0.3 : 0.7 } }));
      nodesDataset.current.update(nodeUpdates);
      edgesDataset.current.update(edgeUpdates);
      setSelectedNode(null);
      return;
    }
    
    setActiveScenario(scenario);
    setSelectedNode(null); // Clear selected node to view the full highlight

    const keywords = scenario === 'NDA' ? NDA_KEYWORDS : PKS_KEYWORDS;
    
    const matchedNodeIds = new Set<string>();
    kgData.nodes.forEach(n => {
      const labelLower = n.label.toLowerCase();
      if (keywords.some(kw => labelLower.includes(kw))) {
        matchedNodeIds.add(n.id);
      }
    });

    // Degree 1: Find direct neighbors (e.g., regulations connected to the topics)
    const degree1 = new Set<string>(matchedNodeIds);
    kgData.edges.forEach(e => {
      if (matchedNodeIds.has(e.source_id)) degree1.add(e.target_id);
      if (matchedNodeIds.has(e.target_id)) degree1.add(e.source_id);
    });

    // Degree 2: Find neighbors of neighbors (e.g., institutions that published those regulations)
    const nodesToHighlight = new Set<string>(degree1);
    kgData.edges.forEach(e => {
      if (degree1.has(e.source_id)) nodesToHighlight.add(e.target_id);
      if (degree1.has(e.target_id)) nodesToHighlight.add(e.source_id);
    });

    // Dim irrelevant nodes and edges by updating dataset directly
    const nodeUpdates = kgData.nodes.map(n => ({
      id: n.id,
      color: { opacity: nodesToHighlight.has(n.id) ? 1 : 0.05 },
      font: { color: nodesToHighlight.has(n.id) ? '#ffffff' : 'rgba(255,255,255,0.05)' }
    }));
    
    const edgeUpdates = kgData.edges.map(e => {
      const isRelevant = nodesToHighlight.has(e.source_id) && nodesToHighlight.has(e.target_id);
      return {
        id: e.id,
        color: { opacity: isRelevant ? (e.relation === 'DITERBITKAN_OLEH' ? 0.4 : 0.9) : 0.02 } // Nearly invisible edges if irrelevant
      };
    });

    nodesDataset.current.update(nodeUpdates);
    edgesDataset.current.update(edgeUpdates);
  };"""

new_handle_full = """  const handleScenarioClick = async (scenario: string) => {
    if (!kgData || !networkRef.current) return;
    
    if (activeScenario === scenario) {
      setActiveScenario(null);
      setScenarioNodes([]);
      // Restore all opacities to normal
      const nodeUpdates = kgData.nodes.map(n => ({ id: n.id, color: { opacity: 1 }, font: { color: '#ffffff' } }));
      const edgeUpdates = kgData.edges.map(e => ({ id: e.id, color: { opacity: e.relation === 'DITERBITKAN_OLEH' ? 0.3 : 0.7 } }));
      nodesDataset.current.update(nodeUpdates);
      edgesDataset.current.update(edgeUpdates);
      setSelectedNode(null);
      return;
    }
    
    setActiveScenario(scenario);
    setSelectedNode(null); // Clear selected node to view the full highlight
    setIsScenarioLoading(scenario);
    setScenarioNodes([]);

    try {
      const res = await fetch(`http://localhost:8000/api/knowledge-graph/analyze-scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      
      const data = await res.json();
      const matchedNodeIds = new Set<string>(data.matchedNodeIds || []);

      // Fallback
      if (matchedNodeIds.size === 0) {
        const keywords = scenario === 'NDA' ? NDA_KEYWORDS : PKS_KEYWORDS;
        kgData.nodes.forEach(n => {
          const labelLower = n.label.toLowerCase();
          if (keywords.some(kw => labelLower.includes(kw))) {
            matchedNodeIds.add(n.id);
          }
        });
      }

      // Render side bar with strictly matched AI nodes (core concepts)
      const coreNodes = kgData.nodes.filter(n => matchedNodeIds.has(n.id));
      setScenarioNodes(coreNodes);

      // Degree 1: Find direct neighbors
      const degree1 = new Set<string>(matchedNodeIds);
      kgData.edges.forEach(e => {
        if (matchedNodeIds.has(e.source_id)) degree1.add(e.target_id);
        if (matchedNodeIds.has(e.target_id)) degree1.add(e.source_id);
      });

      // Degree 2: Find neighbors of neighbors
      const nodesToHighlight = new Set<string>(degree1);
      kgData.edges.forEach(e => {
        if (degree1.has(e.source_id)) nodesToHighlight.add(e.target_id);
        if (degree1.has(e.target_id)) nodesToHighlight.add(e.source_id);
      });

      // Dim irrelevant nodes
      const nodeUpdates = kgData.nodes.map(n => ({
        id: n.id,
        color: { opacity: nodesToHighlight.has(n.id) ? 1 : 0.05 },
        font: { color: nodesToHighlight.has(n.id) ? '#ffffff' : 'rgba(255,255,255,0.05)' }
      }));
      
      const edgeUpdates = kgData.edges.map(e => {
        const isRelevant = nodesToHighlight.has(e.source_id) && nodesToHighlight.has(e.target_id);
        return {
          id: e.id,
          color: { opacity: isRelevant ? (e.relation === 'DITERBITKAN_OLEH' ? 0.4 : 0.9) : 0.02 } 
        };
      });

      nodesDataset.current.update(nodeUpdates);
      edgesDataset.current.update(edgeUpdates);
    } catch (e) {
      console.error("Failed to fetch scenario from LLM", e);
    } finally {
      setIsScenarioLoading(null);
    }
  };"""

content = content.replace(old_handle_full, new_handle_full)

# 3. Update buttons to show loading state
old_pks_btn = "PKS\n              </button>"
new_pks_btn = "{isScenarioLoading === 'PKS' ? <><Loader2 size={12} className=\"animate-spin\" style={{ marginRight: '4px' }} /> Analisis AI...</> : 'PKS'}\n              </button>"
content = content.replace(old_pks_btn, new_pks_btn)

old_nda_btn = "NDA\n              </button>"
new_nda_btn = "{isScenarioLoading === 'NDA' ? <><Loader2 size={12} className=\"animate-spin\" style={{ marginRight: '4px' }} /> Analisis AI...</> : 'NDA'}\n              </button>"
content = content.replace(old_nda_btn, new_nda_btn)

# 4. Render the list of nodes in the sidebar
old_sidebar_end = """              </button>
            </div>
          </div>

          {/* Legend */}"""

new_sidebar_end = """              </button>
            </div>
            
            {activeScenario && scenarioNodes.length > 0 && (
              <div style={{ marginTop: '16px', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '8px', padding: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>NODE TERKAIT ({activeScenario})</div>
                <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }} className="custom-scrollbar">
                  {scenarioNodes.map(node => (
                    <div key={node.id} style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '6px 8px', borderRadius: '4px', color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={node.label}>
                      • {node.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Legend */}"""

content = content.replace(old_sidebar_end, new_sidebar_end)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Frontend Knowledge Graph LLM + Sidebar patch applied successfully.")
