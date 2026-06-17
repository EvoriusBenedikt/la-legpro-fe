import { useEffect, useRef, useState, useCallback } from 'react';
import { Network } from 'vis-network/standalone';
import { DataSet } from 'vis-data';
import { useAuth } from '../context/AuthContext';
import {
  GitFork, Search, RefreshCw, Info, X, Filter, Loader2,
  Database, Building2, Tag, FileText, ZoomIn, ZoomOut, Maximize2,
  List, Network as NetworkIcon
} from 'lucide-react';

interface KGNode {
  id: string;
  label: string;
  type: 'regulasi' | 'entitas' | 'topik';
  doc_id: string | null;
}

interface KGEdge {
  id: number;
  source_id: string;
  target_id: string;
  relation: string;
  doc_id: string | null;
}

interface KGData {
  nodes: KGNode[];
  edges: KGEdge[];
  total_nodes: number;
  total_edges: number;
}

interface ConnectedRelation {
  id: string;
  relation: string;
  label: string;
  type: string;
  direction: 'in' | 'out';
}

interface SelectedNode extends KGNode {
  connectedCount: number;
  relations: ConnectedRelation[];
}

const NODE_COLORS: Record<string, { background: string; border: string; highlight: string }> = {
  regulasi: { background: '#1e3a5f', border: '#38BDF8', highlight: '#2563eb' },
  entitas:  { background: '#3b1f5e', border: '#A855F7', highlight: '#7c3aed' },
  topik:    { background: '#1f4a2e', border: '#22D3EE', highlight: '#059669' },
};

const CLUSTER_PALETTES = [
  { background: 'rgba(245, 158, 11, 0.4)', border: '#F59E0B', highlight: '#FBBF24' }, // Yellow/Orange
  { background: 'rgba(56, 189, 248, 0.4)', border: '#38BDF8', highlight: '#7DD3FC' }, // Blue
  { background: 'rgba(168, 85, 247, 0.4)', border: '#A855F7', highlight: '#C084FC' }, // Purple
  { background: 'rgba(34, 211, 238, 0.4)', border: '#22D3EE', highlight: '#67E8F9' }, // Cyan
  { background: 'rgba(244, 63, 94, 0.4)',  border: '#F43F5E', highlight: '#FB7185' }, // Rose
  { background: 'rgba(16, 185, 129, 0.4)', border: '#10B981', highlight: '#34D399' }, // Emerald
];

const RELATION_COLORS: Record<string, string> = {
  MENCABUT:         '#F43F5E',
  MENGUBAH:         '#F59E0B',
  MERUJUK:          '#38BDF8',
  MENGATUR:         '#22D3EE',
  DITERBITKAN_OLEH: '#A855F7',
};

const TYPE_LABELS: Record<string, string> = {
  regulasi: 'Regulasi',
  entitas: 'Entitas',
  topik: 'Topik',
};

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

export default function KnowledgeGraph({ onOpenDocument }: { onOpenDocument?: (docId: string) => void }) {
  const { token } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesDataset = useRef<DataSet<any>>(new DataSet([]));
  const edgesDataset = useRef<DataSet<any>>(new DataSet([]));

  const [kgData, setKgData] = useState<KGData | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [hoveredRelationId, setHoveredRelationId] = useState<string | null>(null);
  const [statsVisible, setStatsVisible] = useState(true);
  const [viewMode, setViewMode] = useState<'graph' | 'list'>('graph');
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [isScenarioLoading, setIsScenarioLoading] = useState<string | null>(null);
  const [scenarioNodes, setScenarioNodes] = useState<KGNode[]>([]);

  const NDA_KEYWORDS = ['rahasia', 'data pribadi', 'pdp', 'ite', 'informasi', 'perlindungan', 'sandi'];
  const PKS_KEYWORDS = ['perjanjian', 'kerja sama', 'kontrak', 'kemitraan', 'kewajiban', 'hak', 'penyedia', 'vendor'];

  const handleScenarioClick = async (scenario: string) => {
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
  };

  const handleRelationClick = (nodeId: string) => {
    if (!kgData || !networkRef.current) return;
    const node = kgData.nodes.find(n => n.id === nodeId);
    if (node) {
      const connectedEdges = kgData.edges.filter(
        (e) => e.source_id === nodeId || e.target_id === nodeId
      );
      const relations: ConnectedRelation[] = connectedEdges.map(e => {
        const isSource = e.source_id === nodeId;
        const otherNodeId = isSource ? e.target_id : e.source_id;
        const otherNode = kgData.nodes.find(n => n.id === otherNodeId);
        return {
          id: otherNodeId,
          relation: e.relation,
          label: otherNode ? otherNode.label : otherNodeId,
          type: otherNode ? otherNode.type : 'unknown',
          direction: isSource ? 'out' : 'in'
        };
      });
      setSelectedNode({ ...node, connectedCount: connectedEdges.length, relations });
      networkRef.current.selectNodes([nodeId]);
      networkRef.current.focus(nodeId, { scale: 1.2, animation: { duration: 500, easingFunction: 'easeInOutQuad' } });
    }
  };

  useEffect(() => {
    if (networkRef.current && selectedNode) {
      if (hoveredRelationId) {
        networkRef.current.selectNodes([selectedNode.id, hoveredRelationId]);
      } else {
        networkRef.current.selectNodes([selectedNode.id]);
      }
    }
  }, [hoveredRelationId, selectedNode]);

  const fetchGraph = useCallback(async (s = search, t = filterType) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (s) params.set('search', s);
      if (t) params.set('node_type', t);
      const res = await fetch(`http://localhost:8000/api/knowledge-graph?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: KGData = await res.json();
        setKgData(data);
        renderGraph(data);
      }
    } catch (e) {
      console.error('KG fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [token, search, filterType]);

  const renderGraph = (data: KGData) => {
    // 1. Calculate degree (number of connections) for each node
    const nodeDegrees = new Map<string, number>();
    data.edges.forEach(e => {
      nodeDegrees.set(e.source_id, (nodeDegrees.get(e.source_id) || 0) + 1);
      nodeDegrees.set(e.target_id, (nodeDegrees.get(e.target_id) || 0) + 1);
    });

    // 2. Identify Hubs (nodes with > 10 connections) to act as visual cluster centers
    const clusterCenters = data.nodes.filter(n => (nodeDegrees.get(n.id) || 0) > 10);
    const clusterColors = new Map<string, typeof CLUSTER_PALETTES[0]>();
    clusterCenters.forEach((c, i) => {
      clusterColors.set(c.id, CLUSTER_PALETTES[i % CLUSTER_PALETTES.length]);
    });

    // 3. Build a map of Node -> Parent Cluster
    const nodeToCluster = new Map<string, string>();
    data.edges.forEach(e => {
      if (clusterColors.has(e.target_id)) {
        nodeToCluster.set(e.source_id, e.target_id);
      } else if (clusterColors.has(e.source_id)) {
        nodeToCluster.set(e.target_id, e.source_id);
      }
    });

    // 4. Render all nodes, applying cluster colors
    const visNodes = data.nodes.map((n) => {
      const degree = nodeDegrees.get(n.id) || 0;
      const isCenter = degree > 10;
      
      let nodeColor = NODE_COLORS[n.type] ?? NODE_COLORS.topik;
      
      if (isCenter) {
        nodeColor = clusterColors.get(n.id) || nodeColor;
      } else {
        const parentId = nodeToCluster.get(n.id);
        if (parentId && clusterColors.has(parentId)) {
          nodeColor = clusterColors.get(parentId)!;
        }
      }

      // Highlight Hubs differently from the leaf nodes
      const font = isCenter 
        ? { color: '#ffffff', size: Math.min(32, 16 + (degree * 0.2)), face: 'Inter, sans-serif', bold: true }
        : { color: '#f8fafc', size: 10, face: 'Inter, sans-serif', bold: false };

      const nodeProps: any = {
        id: n.id,
        label: n.label.length > 25 ? n.label.slice(0, 23) + '…' : n.label,
        title: n.label,
        font: font,
      };

      if (isCenter) {
        nodeProps.shape = 'box';
        nodeProps.margin = { top: 12, right: 20, bottom: 12, left: 20 };
        nodeProps.borderWidth = 3;
        // Make the center a massive solid color block with white border
        nodeProps.color = {
          background: nodeColor.border, // Use the vibrant border color as solid background
          border: '#ffffff',            // White border to pop out
          highlight: { background: nodeColor.highlight, border: '#ffffff' }
        };
      } else {
        nodeProps.shape = 'dot';
        nodeProps.size = 12;
        nodeProps.borderWidth = 1;
        nodeProps.color = nodeColor;
      }

      return nodeProps;
    });

    // 5. Render all edges, inheriting source node color for cluster cohesion
    const visEdges = data.edges.map((e) => {
      let edgeColor = RELATION_COLORS[e.relation] ?? '#94A3B8';
      
      // Inherit edge color from source node's cluster
      const sourceParentId = nodeToCluster.get(e.source_id) || (e.source_id);
      const colorSource = clusterColors.get(sourceParentId);
      if (colorSource) {
        edgeColor = colorSource.border;
      }

      return {
        id: e.id,
        from: e.source_id,
        to: e.target_id,
        // Removed label to prevent edge labels from obscuring the massive graph
        title: e.relation, // Still show relation on hover
        color: { color: edgeColor, opacity: e.relation === 'DITERBITKAN_OLEH' ? 0.3 : 0.7 },
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        width: e.relation === 'DITERBITKAN_OLEH' ? 1 : 1.5,
        smooth: { enabled: true, type: 'curvedCW', roundness: 0.2 },
      };
    });

    nodesDataset.current.clear();
    edgesDataset.current.clear();
    nodesDataset.current.add(visNodes);
    edgesDataset.current.add(visEdges);

    if (!networkRef.current && containerRef.current) {
      networkRef.current = new Network(
        containerRef.current,
        { nodes: nodesDataset.current, edges: edgesDataset.current },
        {
          physics: {
            enabled: true,
            solver: 'forceAtlas2Based',
            forceAtlas2Based: {
              gravitationalConstant: -180, // High repulsion to push clusters apart
              centralGravity: 0.005,       // Very weak central gravity so it doesn't compress
              springLength: 120,           // Tighter springs for regulations near their center
              springConstant: 0.08,
              damping: 0.4
            },
            stabilization: { iterations: 300 }, 
          },
          interaction: { hover: true, tooltipDelay: 200, zoomView: true, dragView: true },
          layout: { randomSeed: 42 },
        }
      );

      networkRef.current.on('click', (params) => {
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0] as string;
          const node = data.nodes.find(n => n.id === nodeId);
          if (node) {
            const connectedEdges = data.edges.filter(
              (e) => e.source_id === nodeId || e.target_id === nodeId
            );
            
            const relations: ConnectedRelation[] = connectedEdges.map(e => {
              const isSource = e.source_id === nodeId;
              const otherNodeId = isSource ? e.target_id : e.source_id;
              const otherNode = data.nodes.find(n => n.id === otherNodeId);
              return {
                id: otherNodeId,
                relation: e.relation,
                label: otherNode ? otherNode.label : otherNodeId,
                type: otherNode ? otherNode.type : 'unknown',
                direction: isSource ? 'out' : 'in'
              };
            });
            
            setSelectedNode({ ...node, connectedCount: connectedEdges.length, relations });
          }
        } else {
          setSelectedNode(null);
        }
      });

      // Disable physics after initial layout to save CPU/RAM and prevent lag during zoom/pan
      networkRef.current.on('stabilizationIterationsDone', () => {
        networkRef.current?.setOptions({ physics: { enabled: false } });
      });
    } else if (networkRef.current) {
      networkRef.current.setData({ nodes: nodesDataset.current, edges: edgesDataset.current });
    }
  };

  useEffect(() => {
    fetchGraph();
    return () => {
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchGraph(search, filterType);
  };

  const handleReset = () => {
    setSearch('');
    setFilterType('');
    fetchGraph('', '');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Header */}
      <div style={{
        padding: '20px 28px 16px',
        background: 'linear-gradient(135deg, rgba(56,189,248,0.08), rgba(168,85,247,0.06))',
        borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
          <div style={{
            background: 'linear-gradient(135deg, #38BDF8, #A855F7)',
            borderRadius: '10px', padding: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <GitFork size={18} color="white" />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              Knowledge Graph
            </h2>
            {kgData && (
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                {kgData.total_nodes} node · {kgData.total_edges} relasi
              </span>
            )}
          </div>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', background: 'var(--bg-lighter)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <button type="button" onClick={() => setViewMode('graph')} style={{ padding: '6px 12px', background: viewMode === 'graph' ? 'rgba(56, 189, 248, 0.15)' : 'transparent', color: viewMode === 'graph' ? '#38bdf8' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
              <NetworkIcon size={14} /> Graph
            </button>
            <button type="button" onClick={() => setViewMode('list')} style={{ padding: '6px 12px', background: viewMode === 'list' ? 'rgba(56, 189, 248, 0.15)' : 'transparent', color: viewMode === 'list' ? '#38bdf8' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
              <List size={14} /> List
            </button>
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'rgba(30,41,59,0.6)', borderRadius: '10px',
            padding: '8px 14px', border: '1px solid var(--border-color)',
          }}>
            <Search size={14} color="var(--text-secondary)" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari node..."
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text-primary)', fontSize: '0.85rem', width: '160px',
              }}
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              background: 'rgba(30,41,59,0.6)', border: '1px solid var(--border-color)',
              borderRadius: '10px', padding: '8px 12px',
              color: 'var(--text-primary)', fontSize: '0.85rem', cursor: 'pointer',
            }}
          >
            <option value="">Semua Tipe</option>
            <option value="regulasi">Regulasi</option>
            <option value="entitas">Entitas</option>
            <option value="topik">Topik</option>
          </select>

          <button type="submit" style={{
            background: 'linear-gradient(135deg, #38BDF8, #A855F7)',
            border: 'none', borderRadius: '10px', padding: '8px 16px',
            color: 'white', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
          }}>Cari</button>

          <button type="button" onClick={handleReset} style={{
            background: 'rgba(148,163,184,0.1)', border: '1px solid var(--border-color)',
            borderRadius: '10px', padding: '8px', cursor: 'pointer', color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center',
          }}>
            <RefreshCw size={14} />
          </button>
        </form>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, position: 'relative' }}>
        {/* Graph Canvas */}
        <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
          {loading && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', zIndex: 10,
              background: 'rgba(22,18,43,0.85)', backdropFilter: 'blur(4px)',
            }}>
              <GitFork size={40} color="#38BDF8" style={{ opacity: 0.6, marginBottom: '16px' }} />
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Memuat knowledge graph...</p>
            </div>
          )}
          {!loading && kgData?.nodes.length === 0 && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <GitFork size={48} color="#38BDF8" style={{ opacity: 0.3, marginBottom: '16px' }} />
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '1rem' }}>
                Belum ada data graph.
              </p>
              <p style={{ color: 'var(--text-secondary)', margin: '8px 0 0', fontSize: '0.85rem', opacity: 0.7 }}>
                Upload dokumen baru atau minta Admin menjalankan Rebuild.
              </p>
            </div>
          )}
          <div style={{ display: viewMode === 'graph' ? 'block' : 'none', width: '100%', height: '100%', position: 'relative' }}>
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
                <button type="button" key={i} onClick={btn.action} style={{
                  background: 'rgba(30,41,59,0.85)', border: '1px solid var(--border-color)',
                  borderRadius: '8px', width: '36px', height: '36px', cursor: 'pointer',
                  color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {btn.icon}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: viewMode === 'list' ? 'block' : 'none', width: '100%', height: '100%', background: 'var(--bg-dark)', padding: '20px', overflowY: 'auto' }} className="custom-scrollbar">
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: '16px' }}>List View Knowledge Graph</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {kgData && kgData.nodes
                  .filter(n => n.label.toLowerCase().includes(search.toLowerCase()) && (filterType === '' || n.type.toLowerCase() === filterType.toLowerCase()))
                  .slice(0, 100)
                  .map(node => (
                  <NodeListCard 
                    key={node.id} 
                    node={node} 
                    kgData={kgData} 
                    onNavigate={(id: string) => { setViewMode('graph'); setTimeout(() => handleRelationClick(id), 100); }} 
                  />
                ))}
                {kgData && kgData.nodes.filter(n => n.label.toLowerCase().includes(search.toLowerCase()) && (filterType === '' || n.type.toLowerCase() === filterType.toLowerCase())).length > 100 && (
                  <div style={{ textAlign: 'center', color: '#64748b', padding: '20px', fontSize: '0.85rem' }}>
                    Menampilkan 100 dari {kgData.nodes.filter(n => n.label.toLowerCase().includes(search.toLowerCase()) && (filterType === '' || n.type.toLowerCase() === filterType.toLowerCase())).length} node. Gunakan pencarian untuk hasil lebih spesifik.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side Panel: Legend + Selected Node Info */}
        <div style={{
          width: '260px', minWidth: '260px',
          background: 'rgba(15,23,42,0.5)', borderLeft: '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Prototype Scenarios */}
          <div style={{ padding: '20px 20px 0', borderBottom: '1px solid var(--border-color)', paddingBottom: '20px' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '12px', fontWeight: 600 }}>SKENARIO PROTOTIPE</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => handleScenarioClick('PKS')}
                style={{
                  flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                  background: activeScenario === 'PKS' ? 'rgba(56,189,248,0.2)' : 'rgba(30,41,59,0.6)',
                  color: activeScenario === 'PKS' ? '#38BDF8' : 'var(--text-secondary)',
                  border: `1px solid ${activeScenario === 'PKS' ? '#38BDF8' : 'var(--border-color)'}`,
                  transition: 'all 0.2s'
                }}>
                {isScenarioLoading === 'PKS' ? <><Loader2 size={12} className="animate-spin" style={{ marginRight: '4px' }} /> Analisis AI...</> : 'PKS'}
              </button>
              <button 
                onClick={() => handleScenarioClick('NDA')}
                style={{
                  flex: 1, padding: '8px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                  background: activeScenario === 'NDA' ? 'rgba(168,85,247,0.2)' : 'rgba(30,41,59,0.6)',
                  color: activeScenario === 'NDA' ? '#A855F7' : 'var(--text-secondary)',
                  border: `1px solid ${activeScenario === 'NDA' ? '#A855F7' : 'var(--border-color)'}`,
                  transition: 'all 0.2s'
                }}>
                {isScenarioLoading === 'NDA' ? <><Loader2 size={12} className="animate-spin" style={{ marginRight: '4px' }} /> Analisis AI...</> : 'NDA'}
              </button>
            </div>
            
            {activeScenario && scenarioNodes.length > 0 && (
              <div style={{ marginTop: '16px', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '8px', padding: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>NODE TERKAIT ({activeScenario})</div>
                <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'block', paddingRight: '4px' }} className="custom-scrollbar">
                  {scenarioNodes.map(node => (
                    <div 
                      key={node.id} 
                      onClick={() => handleRelationClick(node.id)}
                      style={{ cursor: 'pointer', marginBottom: '6px', fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', padding: '6px 8px', borderRadius: '4px', color: '#e2e8f0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.4' }} 
                      title={node.label}
                    >
                      • {node.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
              <Filter size={14} color="var(--text-secondary)" />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Legenda
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                { type: 'regulasi', icon: <FileText size={14} />, color: '#38BDF8', shape: '▬' },
                { type: 'entitas', icon: <Building2 size={14} />, color: '#A855F7', shape: '◯' },
                { type: 'topik', icon: <Tag size={14} />, color: '#22D3EE', shape: '●' },
              ].map(item => (
                <div key={item.type} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ color: item.color, fontSize: '1rem' }}>{item.shape}</span>
                  <span style={{ color: item.color, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem' }}>
                    {item.icon} {TYPE_LABELS[item.type]}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '8px', fontWeight: 600 }}>RELASI</div>
              {Object.entries(RELATION_COLORS).map(([rel, color]) => (
                <div key={rel} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div style={{ width: '20px', height: '2px', background: color, borderRadius: '1px' }} />
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{rel}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Selected Node Info */}
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
            {!selectedNode ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <Info size={28} color="var(--text-secondary)" style={{ opacity: 0.4, marginBottom: '12px', display: 'block', margin: '0 auto 12px' }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0, lineHeight: 1.5 }}>
                  Klik pada node untuk melihat detail
                </p>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      width: '10px', height: '10px', borderRadius: '50%',
                      background: NODE_COLORS[selectedNode.type]?.border ?? '#94A3B8',
                    }} />
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700,
                      color: NODE_COLORS[selectedNode.type]?.border ?? '#94A3B8',
                      textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>
                      {TYPE_LABELS[selectedNode.type]}
                    </span>
                  </div>
                  <button onClick={() => setSelectedNode(null)} style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-secondary)', display: 'flex', padding: '2px',
                  }}>
                    <X size={14} />
                  </button>
                </div>

                <h3 style={{
                  margin: '0 0 16px', fontSize: '0.95rem', fontWeight: 700,
                  color: 'var(--text-primary)', lineHeight: 1.4,
                }}>
                  {selectedNode.label}
                </h3>

                <div style={{
                  background: 'rgba(255,255,255,0.04)', borderRadius: '10px', padding: '12px',
                  marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Koneksi</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: NODE_COLORS[selectedNode.type]?.border ?? '#94A3B8' }}>
                    {selectedNode.connectedCount}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>relasi terhubung</div>
                </div>

                {selectedNode.relations && selectedNode.relations.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase' }}>
                      Detail Relasi
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                      {selectedNode.relations.map((rel, idx) => (
                        <div 
                          key={idx} 
                          onMouseEnter={() => setHoveredRelationId(rel.id)}
                          onMouseLeave={() => setHoveredRelationId(null)}
                          onClick={() => handleRelationClick(rel.id)}
                          style={{ 
                            background: hoveredRelationId === rel.id ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.4)', 
                            borderRadius: '6px', padding: '8px',
                            borderLeft: `2px solid ${RELATION_COLORS[rel.relation] ?? '#94A3B8'}`,
                            cursor: 'pointer',
                            transition: 'background 0.2s ease'
                          }}
                        >
                          <div style={{ fontSize: '0.7rem', color: RELATION_COLORS[rel.relation] ?? '#94A3B8', fontWeight: 600, marginBottom: '4px' }}>
                            {rel.direction === 'out' ? '→ ' : '← '} {rel.relation}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                            {rel.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedNode.type === 'regulasi' && selectedNode.doc_id && onOpenDocument && (
                  <button
                    onClick={() => onOpenDocument(selectedNode.doc_id!)}
                    style={{
                      width: '100%', background: 'linear-gradient(135deg, rgba(56,189,248,0.15), rgba(168,85,247,0.15))',
                      border: '1px solid rgba(56,189,248,0.3)', borderRadius: '10px',
                      padding: '10px', cursor: 'pointer', color: '#38BDF8',
                      fontSize: '0.85rem', fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    }}
                  >
                    <Database size={14} />
                    Buka Dokumen
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
