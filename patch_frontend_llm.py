import os

filepath = os.path.join("src", "components", "KnowledgeGraph.tsx")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add loading state
state_injection = "  const [activeScenario, setActiveScenario] = useState<string | null>(null);\n  const [isScenarioLoading, setIsScenarioLoading] = useState<string | null>(null);"
content = content.replace("  const [activeScenario, setActiveScenario] = useState<string | null>(null);", state_injection)

# 2. Rewrite handleScenarioClick
old_handle_start = "  const handleScenarioClick = (scenario: string) => {"
# The end of the function is just before "const handleRelationClick"
# I'll replace the whole block by finding the substring
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

    try {
      const res = await fetch(`http://localhost:8000/api/knowledge-graph/analyze-scenario`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario })
      });
      
      const data = await res.json();
      const matchedNodeIds = new Set<string>(data.matchedNodeIds || []);

      // If LLM failed to match anything, we just use the original keyword fallback as a safety net
      if (matchedNodeIds.size === 0) {
        const keywords = scenario === 'NDA' ? NDA_KEYWORDS : PKS_KEYWORDS;
        kgData.nodes.forEach(n => {
          const labelLower = n.label.toLowerCase();
          if (keywords.some(kw => labelLower.includes(kw))) {
            matchedNodeIds.add(n.id);
          }
        });
      }

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
    } catch (e) {
      console.error("Failed to fetch scenario from LLM", e);
    } finally {
      setIsScenarioLoading(null);
    }
  };"""

content = content.replace(old_handle_full, new_handle_full)

# 3. Update the button rendering to show "Memuat..." and a spinner when loading
old_pks_btn = "PKS\n              </button>"
new_pks_btn = "{isScenarioLoading === 'PKS' ? <><Loader2 size={12} className=\"spinning\" style={{ marginRight: '4px' }} /> Analisis AI...</> : 'PKS'}\n              </button>"
content = content.replace(old_pks_btn, new_pks_btn)

old_nda_btn = "NDA\n              </button>"
new_nda_btn = "{isScenarioLoading === 'NDA' ? <><Loader2 size={12} className=\"spinning\" style={{ marginRight: '4px' }} /> Analisis AI...</> : 'NDA'}\n              </button>"
content = content.replace(old_nda_btn, new_nda_btn)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Frontend LLM patch applied successfully.")
