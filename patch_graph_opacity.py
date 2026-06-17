import os

filepath = os.path.join("src", "components", "KnowledgeGraph.tsx")
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# Fix restoration of opacities
old_restore = "const nodeUpdates = kgData.nodes.map(n => ({ id: n.id, opacity: 1 }));"
new_restore = "const nodeUpdates = kgData.nodes.map(n => ({ id: n.id, color: { opacity: 1 }, font: { color: '#ffffff' } }));"
content = content.replace(old_restore, new_restore)

# Fix dimming of nodes
old_dim = """    // Dim irrelevant nodes and edges by updating dataset directly
    const nodeUpdates = kgData.nodes.map(n => ({
      id: n.id,
      opacity: nodesToHighlight.has(n.id) ? 1 : 0.08 // Drop opacity of irrelevant nodes to 8%
    }));"""

new_dim = """    // Dim irrelevant nodes and edges by updating dataset directly
    const nodeUpdates = kgData.nodes.map(n => ({
      id: n.id,
      color: { opacity: nodesToHighlight.has(n.id) ? 1 : 0.05 },
      font: { color: nodesToHighlight.has(n.id) ? '#ffffff' : 'rgba(255,255,255,0.05)' }
    }));"""
content = content.replace(old_dim, new_dim)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Graph opacity patch applied successfully.")
