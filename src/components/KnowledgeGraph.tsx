import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Network } from 'vis-network/standalone';
import { DataSet } from 'vis-data';
import { toPng } from 'html-to-image';
import api from '../services/api';
import {
  GitFork, Search, RefreshCw, Info, X, Filter, Loader2,
  Building2, Tag, FileText, ZoomIn, ZoomOut, Maximize2,
  List, Network as NetworkIcon, Download, ChevronDown,
  CheckCircle, AlertTriangle, AlertCircle
} from 'lucide-react';
import LoadingOrb from './LoadingOrb';
import DocumentDrawer from './DocumentDrawer';
import { useStrings } from '../i18n';

interface KGNode {
  id: string;
  label: string;
  type: 'regulasi' | 'entitas' | 'topik';
  doc_id: string | null;
  /* Legal-effect status of the node's own regulation — the BE joins
     regulations on doc_id, which only 'regulasi' nodes carry (they are the
     document self-nodes; entitas/topik are NULL). Drives the canvas status
     rings, the detail-panel chip and the list-card chip (v5 shape). */
  doc_status?: string | null;
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

/* Item shapes fed into the vis-network DataSets by renderGraph. They mirror
   the subset of vis-network Node/Edge options actually used, so the datasets
   stay typed (no DataSet<any>) while remaining structurally assignable to
   what the Network constructor / setData expect. */
interface VisGraphNode {
  id: string;
  label: string;
  title: string;
  font: { color: string; size: number; face: string; bold: boolean };
  shape?: string;
  size?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
  borderWidth?: number;
  /** Status ring (v5): a dashed border on regulasi nodes whose own document
      is not plain 'Berlaku'. Shape channel on purpose — hue stays owned by
      the type/cluster palettes (keep-zone), and dashes survive both the
      cluster repaint and the scenario-dimming `color` partials. */
  shapeProperties?: { borderDashes: number[] };
  color?: {
    background: string;
    border: string;
    highlight: string | { background: string; border: string };
    /** Present on the scenario-highlight partial updates, which send only
        `{ opacity }` (vis-data merges it into the stored color). */
    opacity?: number;
  };
}

interface VisGraphEdge {
  id: number;
  from: string;
  to: string;
  title: string;
  color: { color: string; opacity: number };
  arrows: { to: { enabled: boolean; scaleFactor: number } };
  width: number;
  smooth: { enabled: boolean; type: 'curvedCW'; roundness: number };
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

/* Theme-aware deep variants of the two neon palettes above, for TEXT and thin
   borders on glass surfaces (sidebar, list cards, legend, selected-node
   panel). The vis-network canvas keeps its literal neon palette (keep-zone,
   DESIGN.md): node fills are dark navy, so neon borders/edges read against
   the node bodies — and canvas fillStyle cannot resolve CSS var() anyway.
   DOM-side semantics ride the --dv-* / --warning-text tokens (same -700 hues
   on light glass, flipping to 300-level tints in dark): the old hardcoded
   -700 hexes measured ~2.1–2.8:1 on dark glass (critique 2026-10-06 P2). */
const NODE_COLORS_DEEP: Record<string, string> = {
  regulasi: 'var(--dv-sky)',    // ← canvas border #38BDF8
  entitas:  'var(--dv-purple)', // ← canvas border #A855F7
  topik:    'var(--dv-cyan)',   // ← canvas border #22D3EE
};

const RELATION_COLORS_DEEP: Record<string, string> = {
  MENCABUT:         'var(--dv-rose)',
  MENGUBAH:         'var(--warning-text)',
  MERUJUK:          'var(--dv-sky)',
  MENGATUR:         'var(--dv-cyan)',
  DITERBITKAN_OLEH: 'var(--dv-purple)',
};

/* Human-readable relation names for every user-facing surface (legend, list
   cards, detail panel, canvas edge tooltips). The raw enum is a database
   identifier and leaked straight into the UI ("DITERBITKAN_OLEH", critique
   2026-10-07 minor). RELATION_COLORS* keys stay enum-based — only display
   text goes through here; unknown enums fall back to the raw value. */
const RELATION_LABELS: Record<string, string> = {
  MENCABUT: 'Mencabut',
  MENGUBAH: 'Mengubah',
  MERUJUK: 'Merujuk',
  MENGATUR: 'Mengatur',
  DITERBITKAN_OLEH: 'Diterbitkan oleh',
};
const relationLabel = (rel: string): string => RELATION_LABELS[rel] ?? rel;

const TYPE_LABELS: Record<string, string> = {
  regulasi: 'Regulasi',
  entitas: 'Entitas',
  topik: 'Topik',
};

/* Regulation-status grammar — parity with LegalRepository's statusTone
   (fixed-vocabulary chips, critique remediation P0): 'Tidak Berlaku' rides
   danger, qualified 'Berlaku (...)' must never read as plain success green,
   anything else that is not exactly 'Berlaku' stays neutral. The canvas ring
   encodes only the binary "not plain Berlaku" (shape channel); the exact
   status string + tone live in these DOM chips. */
const statusTone = (status: string): string => {
  if (status.includes('Gagal')) return 'status-chip--danger';
  if (status === 'Tidak Berlaku') return 'status-chip--danger';
  if (status.startsWith('Berlaku (')) return 'status-chip--warning';
  if (status === 'Berlaku') return 'status-chip--success';
  return 'status-chip--neutral';
};
const needsStatusRing = (n: KGNode): boolean =>
  n.type === 'regulasi' && !!n.doc_status && n.doc_status !== 'Berlaku';

/* prefers-reduced-motion gate for the vis-network camera moves (Sam's flag):
   canvas animations are not CSS-driven, so the global reduce-motion rules
   never reached them. */
const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Deep-link / refresh restore (v5 URL state): the address bar carries the
   applied query — ?q=&type=&view=&node=. Read inside the state initializers
   (per mount, NOT module scope: revisiting /graph must re-read the URL).
   All in-page URL writes are replace-only, so browser Back leaves the route
   and returning remounts through these initializers. */
const initialParams = (): { q: string; type: string; view: 'graph' | 'list' | null; node: string } => {
  const p = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const view = p.get('view');
  return {
    q: p.get('q') ?? '',
    type: p.get('type') ?? '',
    // Fresh literals (not a narrowed `view`) so the annotated return type
    // holds without relying on control-flow narrowing inside the literal.
    view: view === 'list' ? 'list' : view === 'graph' ? 'graph' : null,
    node: p.get('node') ?? '',
  };
};

/* Timestamp suffix for export filenames (v5 polish): repeated exports used to
   stack up as knowledge-graph.png, knowledge-graph (1).png, ... — now every
   artifact self-identifies, e.g. knowledge-graph-20261008-1530.png. */
const exportStamp = (): string => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

/* Uppercase Stamp Rule (DESIGN.md): 700 / 0.7rem / 0.4px — the section
   kickers and type badges previously improvised 0.75rem/600 (critique
   2026-10-06 minor). */
const STAMP_STYLE: React.CSSProperties = {
  fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.4px', textTransform: 'uppercase',
};

/* One row of the "Ekspor ▾" dropdown (polish: the export trio used to sit as
   three always-visible toolbar buttons — 9 controls in one wrapping row). */
const menuItemStyle = (disabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: '8px', width: '100%',
  padding: '8px 10px', background: 'transparent', border: 'none', borderRadius: '8px',
  color: 'var(--text-primary)', fontSize: '0.83rem', textAlign: 'left', fontFamily: 'inherit',
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
});

/* Canvas label colors must be LITERALS: canvas fillStyle cannot resolve CSS
   var() strings (the PNG-export note says the same). Leaves read the live
   --text-primary so both themes stay readable; hubs keep white on their
   solid vivid fill. The old code wrote 'var(--text-primary)' into the
   dataset — unresolvable — and scenario toggle-off restored every label to
   '#ffffff', white-on-porcelain in the light theme (critique 2026-10-06 P1).
   Module scope on purpose: renderGraph's closure must stay non-reactive or
   fetchGraph loses its stable-identity baseline (react-hooks/exhaustive-deps). */
const leafFontColor = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim() || '#0f172a';

/* Single relation-computation path shared by the canvas click listener
   (registered once — reads kgDataRef) and by list/panel navigation, so the
   same node can never yield two different answers after a refetch
   (critique 2026-10-06 — Riley's stale-closure flag). */
const relationsFor = (data: KGData, nodeId: string): ConnectedRelation[] =>
  data.edges
    .filter(e => e.source_id === nodeId || e.target_id === nodeId)
    .map(e => {
      const isSource = e.source_id === nodeId;
      const otherNodeId = isSource ? e.target_id : e.source_id;
      const otherNode = data.nodes.find(n => n.id === otherNodeId);
      return {
        id: otherNodeId,
        relation: e.relation,
        label: otherNode ? otherNode.label : otherNodeId,
        type: otherNode ? otherNode.type : 'unknown',
        direction: isSource ? 'out' : 'in',
      };
    });

/* One 44px icon button of the graph zoom controls (44px = DESIGN.md minimum
   touch target; the graph view is reachable on phones via the view toggle —
   the old 36px mouse-only targets were flagged by critique 2026-10-06).
   Extracted to module scope so the controls no longer need a render-time
   array of {icon, action} objects — react-hooks/refs flags ref-touching
   functions stored in such arrays even though they only ever run from event
   handlers. `label` gives the icon-only button its accessible name. */
const GraphControlButton = ({ onClick, label, children }: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) => (
  <button type="button" onClick={onClick} aria-label={label} title={label} style={{
    background: 'var(--bg-element)', border: '1px solid var(--border-color)',
    borderRadius: '8px', width: '44px', height: '44px', cursor: 'pointer',
    color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    {children}
  </button>
);

/* One card of the list view. `connections` arrives precomputed from the
   parent's adjacency map — each card used to filter the full edge set itself,
   O(N x E) across up to 100 cards (critique 2026-10-06 minor). Header and
   relation links are real <button>s: the onClick-div versions locked
   keyboard and screen-reader users out of the node model (critique P1).
   Activating a card selects the node IN PLACE — the detail panel is rendered
   in list mode too, so there is no graph-view ejection and no 100ms
   setTimeout hop (critique 2026-10-08 P2·2). */
const NodeListCard = ({ node, connections, onNavigate }: {
  node: KGNode;
  connections: { node: KGNode; rel: string }[];
  onNavigate: (id: string) => void;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
      <button
        type="button"
        className="kg-card-main"
        onClick={() => onNavigate(node.id)}
        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          {/* Citation voice (v5): a regulasi card's label IS the citation —
              "{jenis} {nomor}" — so it rides the mono face the app uses for
              document numbers. The badge tint is now color-mix'd from the
              same --dv-* token as its text (was three hardcoded rgba
              triplets frozen at light-theme hues — critique minor). */}
          <strong style={{ color: 'var(--text-primary)', fontSize: '1rem', fontFamily: node.type === 'regulasi' ? 'var(--font-mono)' : undefined }}>{node.label}</strong>
          <span style={{ ...STAMP_STYLE, padding: '4px 8px', borderRadius: '4px', whiteSpace: 'nowrap', background: `color-mix(in srgb, ${NODE_COLORS_DEEP[node.type] ?? 'var(--text-secondary)'} 12%, transparent)`, color: NODE_COLORS_DEEP[node.type] ?? 'var(--text-secondary)' }}>
            {node.type.toUpperCase()}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
          {connections.length} relasi terhubung
          {node.doc_status && (
            <span className={`status-chip ${statusTone(node.doc_status)}`}>{node.doc_status}</span>
          )}
        </div>
      </button>

      {connections.length > 0 && (
        <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
          <button
            type="button"
            className="kg-expand-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            style={{ background: 'transparent', border: 'none', color: 'var(--accent-hover)', fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', padding: 0 }}
          >
            {/* The state glyphs are decorative — aria-expanded already carries
                the state, so screen readers skip the characters. */}
            {isExpanded ? <>Sembunyikan relasi <span aria-hidden="true">▲</span></> : <>Lihat relasi terhubung <span aria-hidden="true">▼</span></>}
          </button>

          {isExpanded && (
            <div style={{ marginTop: '12px', maxHeight: '200px', overflowY: 'auto', background: 'var(--bg-element)', borderRadius: '6px', padding: '8px' }}>
              {connections.map((cn, i) => (
                <div key={i} style={{ padding: '8px', borderBottom: i < connections.length - 1 ? '1px solid var(--border-color)' : 'none', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}><span style={{ color: RELATION_COLORS_DEEP[cn.rel] ?? 'var(--text-secondary)', fontWeight: 600 }}>{relationLabel(cn.rel)}</span> • {cn.node.type.toUpperCase()}</div>
                  <button
                    type="button"
                    className="kg-node-link"
                    onClick={() => onNavigate(cn.node.id)}
                    style={{ fontSize: '0.85rem', color: 'var(--accent-hover)', cursor: 'pointer', textDecoration: 'underline', background: 'transparent', border: 'none', padding: 0, textAlign: 'left', fontFamily: 'inherit' }}
                  >
                    {cn.node.label}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* DocumentDrawer's doc prop — mirrors LegalOpinion's DrawerDoc, plus the
   optional status/filename the drawer accepts (filename enables its PDF
   tab). */
type DrawerDoc = {
  id: string;
  nomor: string;
  judul: string;
  jenis: string;
  sektor: string;
  status?: string;
  filename?: string;
};

/* One row of GET /api/repository's `documents` array — same fields, but the
   API sends null where the drawer's props want undefined (openDocument
   normalizes). */
type RepoDoc = {
  id: string;
  nomor: string;
  judul: string;
  jenis: string;
  sektor: string;
  status?: string | null;
  filename?: string | null;
};

export default function KnowledgeGraph() {
  const t = useStrings();
  /* v5 URL state: react-router owns the address bar (popstate/reconciliation
     come free); every write from this component is replace-only. */
  const [urlParams, setUrlParams] = useSearchParams();
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesDataset = useRef<DataSet<VisGraphNode>>(new DataSet<VisGraphNode>([]));
  const edgesDataset = useRef<DataSet<VisGraphEdge>>(new DataSet<VisGraphEdge>([]));
  /* Latest fetched graph, per-node base fonts, hub membership and the active
     scenario highlight — read by handlers registered once (the vis 'click'
     listener) and by the theme observer. The click listener used to close
     over the FIRST dataset, so after any refetch canvas clicks computed
     relations from stale data while list clicks used fresh data — the same
     node gave two different answers (critique 2026-10-06, Riley). */
  const kgDataRef = useRef<KGData | null>(null);
  const nodeFontsRef = useRef<Map<string, VisGraphNode['font']>>(new Map());
  const hubIdsRef = useRef<Set<string>>(new Set());
  const highlightRef = useRef<Set<string> | null>(null);
  const repoDocsRef = useRef<RepoDoc[] | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuListRef = useRef<HTMLDivElement>(null);
  const exportTriggerRef = useRef<HTMLButtonElement>(null);
  /* Keyboard handoff: activating a list card hides the list (display:none),
     dropping focus to <body> — verified live (activeElement=BODY after the
     hop). handleRelationClick raises the flag; an effect focuses the detail
     panel's heading once the new selection commits. The canvas 'click'
     listener sets selectedNode WITHOUT calling handleRelationClick, so
     canvas mouse users never get focus moved away. */
  const panelHeadingRef = useRef<HTMLHeadingElement>(null);
  const shouldFocusPanelRef = useRef(false);
  /* Scenario request lifecycle: a request id discards stale/canceled
     responses and an AbortController cancels the HTTP call itself (axios
     supports `signal`). Without them, re-clicking a scenario mid-flight
     unlatched the button while the pending response still re-dimmed the
     canvas and a same-tick double click fired two identical 18s LLM calls
     (critique 2026-10-07 P1 — both reproduced live). */
  const scenarioReqIdRef = useRef(0);
  const scenarioAbortRef = useRef<AbortController | null>(null);
  /* Synchronous source of truth for "an analysis is in flight" — the
     isScenarioLoading STATE is batched, so two clicks in the same tick both
     read null and each starts a call (reproduced live: two identical 18s
     POSTs). Refs are written during the event, before any await. */
  const scenarioInFlightRef = useRef<string | null>(null);
  const toastIdRef = useRef(0);
  /* v5 URL-state + filter-application plumbing. Refs because they are read
     from a debounced callback and once-registered effects where state would
     be a stale closure — the file's established pattern (kgDataRef,
     scenarioInFlightRef). */
  const appliedRef = useRef({ search: initialParams().q, type: initialParams().type });
  const lastAttemptRef = useRef({ search: initialParams().q, type: initialParams().type });
  const pendingNodeRef = useRef<string | null>(initialParams().node || null);
  const centerOnViewRef = useRef(false);
  const typeDebounceRef = useRef<number | null>(null);
  const fetchGraphRef = useRef<((s?: string, t?: string) => Promise<void>) | null>(null);

  const [kgData, setKgData] = useState<KGData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => initialParams().q);
  const [filterType, setFilterType] = useState(() => initialParams().type);
  /* The query the fetched dataset actually shows, vs the draft in the input.
     Drives the Cari↔Terapkan label swap (dirty cue), the URL mirror and the
     select's auto-apply fetch — which must never carry unapplied draft text
     (v5 P1: same control, two behaviors). */
  const [appliedParams, setAppliedParams] = useState(() => ({
    search: initialParams().q,
    type: initialParams().type,
  }));
  const [selectedNode, setSelectedNode] = useState<SelectedNode | null>(null);
  const [hoveredRelationId, setHoveredRelationId] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  /* Legend disclosure (v5 distill): reference material — open by default on
     wide screens, collapsed on narrow ones (the stacked panel is bounded at
     45% height), explicit toggles persisted per browser. */
  const [legendOpen, setLegendOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('kg-legend-open');
      if (saved !== null) return saved === '1';
    } catch { /* storage blocked — fall back to the viewport default */ }
    return !(typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  });
  const [drawerDoc, setDrawerDoc] = useState<DrawerDoc | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; kind: 'success' | 'error' | 'info'; message: string }[]>([]);
  const [scenarioNotice, setScenarioNotice] = useState<string | null>(null);
  // Small screens default to the read-only list view (canvas physics is
  // unusable on phones); follow the breakpoint if the viewport changes.
  // isNarrow also stacks the side panel below the canvas — the fixed 260px
  // panel squeezed a 375px phone's list view to ~115px (critique, Riley).
  const [viewMode, setViewMode] = useState<'graph' | 'list'>(() => {
    // An explicit deep link (?view=) wins; otherwise small screens default to
    // the read-only list view.
    const fromUrl = initialParams().view;
    if (fromUrl) return fromUrl;
    return typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches ? 'list' : 'graph';
  });
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = (e: MediaQueryListEvent) => {
      // Crossing back to wide re-shows the canvas — center any live selection
      // on it (consumed by the post-layout effect, centerOnViewRef).
      if (!e.matches) centerOnViewRef.current = true;
      setViewMode(e.matches ? 'list' : 'graph');
      setIsNarrow(e.matches);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const [activeScenario, setActiveScenario] = useState<string | null>(null);
  const [isScenarioLoading, setIsScenarioLoading] = useState<string | null>(null);
  const [scenarioNodes, setScenarioNodes] = useState<KGNode[]>([]);
  // True when starting a scenario cleared a selected node — disclosed in the
  // loading status so the selection never vanishes without a trace (critique
  // 2026-10-07 minor).
  const [scenarioClearedSelection, setScenarioClearedSelection] = useState(false);

  const NDA_KEYWORDS = ['rahasia', 'data pribadi', 'pdp', 'ite', 'informasi', 'perlindungan', 'sandi'];
  const PKS_KEYWORDS = ['perjanjian', 'kerja sama', 'kontrak', 'kemitraan', 'kewajiban', 'hak', 'penyedia', 'vendor'];

  /* ---- Shared helpers, declared above their first textual use (the
     react-hooks/immutability rule rejects use-before-declare — the same
     reason renderGraph precedes fetchGraph further down). ---- */

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(x => x.id !== id));
  }, []);
  // Local toast strip reusing the UploadProvider's .upload-toast grammar
  // (components.css) — replaces console-only failures and the native alert()
  // (critique 2026-10-06 P1). There is no app-wide toast context to join.
  const pushToast = useCallback((kind: 'success' | 'error' | 'info', message: string, ttl = 8000) => {
    const id = ++toastIdRef.current;
    setToasts(prev => [...prev, { id, kind, message }]);
    window.setTimeout(() => dismissToast(id), ttl);
  }, [dismissToast]);

  /* One label-styling path feeds the initial render, scenario apply/restore
     and the theme observer (canvas colors must be literals — see the
     module-level leafFontColor note). Memoized as a stable chain over refs
     only, so renderGraph's closure — and with it fetchGraph's identity —
     stays non-reactive for exhaustive-deps. */
  const baseFont = useCallback((id: string): VisGraphNode['font'] =>
    nodeFontsRef.current.get(id) ?? { color: leafFontColor(), size: 10, face: 'Inter, sans-serif', bold: false }, []);

  const fontColorFor = useCallback((id: string): string => {
    const hl = highlightRef.current;
    if (hl && !hl.has(id)) return 'rgba(0,0,0,0.05)'; // dimmed by an active scenario
    if (hubIdsRef.current.has(id)) return '#ffffff';
    return leafFontColor();
  }, []);

  const refreshNodeFonts = useCallback(() => {
    const data = kgDataRef.current;
    if (!data) return;
    nodesDataset.current.update(data.nodes.map(n => ({
      id: n.id,
      font: { ...baseFont(n.id), color: fontColorFor(n.id) },
    })));
  }, [baseFont, fontColorFor]);

  /* Theme switch (topbar Terang/Gelap or OS) re-pins --text-primary; canvas
     labels hold literal colors, so re-apply them without a full re-render. */
  useEffect(() => {
    const obs = new MutationObserver(() => refreshNodeFonts());
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, [refreshNodeFonts]);

  /* Restore the canvas to its un-scenarized state: opacities back to normal
     and every label recomputed through fontColorFor. */
  const clearScenarioHighlight = (data: KGData) => {
    highlightRef.current = null;
    nodesDataset.current.update(data.nodes.map(n => ({
      id: n.id,
      color: { opacity: 1 },
      font: { ...baseFont(n.id), color: fontColorFor(n.id) },
    })));
    edgesDataset.current.update(data.edges.map(e => ({
      id: e.id,
      color: { opacity: e.relation === 'DITERBITKAN_OLEH' ? 0.3 : 0.7 },
    })));
  };

  /* "Buka Dokumen" — the citation-first payoff. The CTA used to be dead-
     wired (App.tsx passed () => {}): critique 2026-10-06 P1. KG nodes carry
     only doc_id, so resolve the full record through the same role-aware
     GET /api/repository the Repository page uses (klasifikasi permissions
     and access grants are enforced server-side), then open the shared
     DocumentDrawer in place — graph to source document in one click. */
  const openDocument = async (docId: string) => {
    setDocLoading(true);
    try {
      if (!repoDocsRef.current) {
        const res = await api.get('/api/repository');
        repoDocsRef.current = (res.data?.documents ?? []) as RepoDoc[];
      }
      const doc = repoDocsRef.current.find(d => String(d.id) === String(docId));
      if (!doc) {
        pushToast('error', 'Dokumen tidak ditemukan atau tidak dapat diakses dengan akun Anda.');
        return;
      }
      setDrawerDoc({ ...doc, status: doc.status ?? undefined, filename: doc.filename ?? undefined });
    } catch (err) {
      console.error('Open document error:', err);
      pushToast('error', 'Gagal memuat dokumen. Periksa koneksi Anda lalu coba lagi.');
    } finally {
      setDocLoading(false);
    }
  };

  /* Close the Ekspor menu on outside click / Escape; Escape returns focus to
     the trigger (menu-button pattern — the menu unmounts, so without this
     the keyboard user is dropped to <body>). */
  useEffect(() => {
    if (!exportMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExportMenuOpen(false);
        exportTriggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [exportMenuOpen]);

  /* Opening the menu moves focus to its first enabled item so the arrow-key
     handler below has somewhere to start — role="menu" without keyboard
     navigation was a broken promise (critique 2026-10-07 P2). PNG is
     disabled in list view, hence :not([disabled]). */
  useEffect(() => {
    if (exportMenuOpen) {
      exportMenuListRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')?.focus();
    }
  }, [exportMenuOpen]);

  /* Roving focus for the export menu: arrows cycle the enabled items
     (wrapping), Home/End jump to the ends, Tab closes the menu and moves on. */
  const handleExportMenuKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') { setExportMenuOpen(false); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const items = [...(exportMenuListRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])];
    if (items.length === 0) return;
    const idx = items.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Home') { items[0].focus(); return; }
    if (e.key === 'End') { items[items.length - 1].focus(); return; }
    const step = e.key === 'ArrowDown' ? 1 : -1;
    items[((idx < 0 ? -1 : idx) + step + items.length) % items.length].focus();
  };

  /* Cancel an in-flight scenario analysis: bump the request id so the
     response is discarded when it lands, abort the HTTP call, clear every
     latch the analysis owns and restore the canvas. Wired to the Batal
     button AND to clicking the loading button itself — the old mid-flight
     toggle-off unlatched everything except the spinner and never touched
     the request, so the stale response re-dimmed the canvas afterwards
     (reproduced live: 3037 visible canvas samples / 40 colors while
     aria-pressed=false, vs a clean 6488 / 165). */
  const cancelScenario = () => {
    scenarioReqIdRef.current += 1;
    scenarioAbortRef.current?.abort();
    scenarioAbortRef.current = null;
    scenarioInFlightRef.current = null;
    setIsScenarioLoading(null);
    setActiveScenario(null);
    setScenarioNodes([]);
    setScenarioNotice(null);
    setSelectedNode(null);
    setScenarioClearedSelection(false);
    const data = kgDataRef.current;
    if (data) clearScenarioHighlight(data);
  };

  const handleScenarioClick = async (scenario: string) => {
    if (!kgData || !networkRef.current) return;

    // Mid-flight guard reads the REF, not the state (see
    // scenarioInFlightRef): the other button is disabled once the spinner
    // renders and until then its same-tick click is ignored, so a second
    // analysis can never start while one is in flight (the old code fired
    // two identical 18s LLM calls on a double-press — reproduced live).
    const inFlight = scenarioInFlightRef.current;
    if (inFlight) {
      // A click on the LOADING button cancels — a real toggle-off — but only
      // once the spinner has committed (isScenarioLoading set): a same-tick
      // double-press is an accident, not a cancel of a <16ms-old request,
      // and is ignored.
      if (inFlight === scenario && isScenarioLoading === scenario) cancelScenario();
      return;
    }

    if (activeScenario === scenario) {
      setActiveScenario(null);
      setScenarioNodes([]);
      setScenarioNotice(null);
      setSelectedNode(null);
      setScenarioClearedSelection(false);
      clearScenarioHighlight(kgData);
      return;
    }

    setActiveScenario(scenario);
    // Clear selected node to view the full highlight — and say so, instead
    // of silently losing the user's place (critique 2026-10-07 minor).
    setScenarioClearedSelection(selectedNode !== null);
    setSelectedNode(null);
    setIsScenarioLoading(scenario);
    setScenarioNodes([]);
    setScenarioNotice(null);

    const reqId = ++scenarioReqIdRef.current;
    const controller = new AbortController();
    scenarioAbortRef.current = controller;
    scenarioInFlightRef.current = scenario; // synchronous — guards same-tick clicks

    try {
      // HTTP/network errors (including our own abort) degrade to res=null and
      // hit the keyword fallback below; the reqId guard then discards the
      // whole pass when this request was canceled or superseded.
      const res = await api.post('/api/knowledge-graph/analyze-scenario', { scenario }, { signal: controller.signal }).catch(() => null);
      if (reqId !== scenarioReqIdRef.current) return;

      const data = res?.data ?? {};
      const matchedNodeIds = new Set<string>(data.matchedNodeIds || []);

      let notice: string | null = null;
      // Fallback
      if (matchedNodeIds.size === 0) {
        const keywords = scenario === 'NDA' ? NDA_KEYWORDS : PKS_KEYWORDS;
        kgData.nodes.forEach(n => {
          const labelLower = n.label.toLowerCase();
          if (keywords.some(kw => labelLower.includes(kw))) {
            matchedNodeIds.add(n.id);
          }
        });
        // Disclose the degradation instead of silently swapping engines
        // (critique 2026-10-06 P1: the fallback was undisclosed).
        notice = res === null
          ? 'Analisis AI tidak tersedia — node dicocokkan dengan kata kunci.'
          : 'Analisis AI tidak menemukan kecocokan — node dicocokkan dengan kata kunci.';
        if (matchedNodeIds.size === 0) {
          notice = 'Tidak ada node yang cocok untuk skenario ini. Coba skenario lainnya, atau gunakan pencarian untuk menemukan node secara langsung.';
        }
      }
      // Render side bar with strictly matched AI nodes (core concepts)
      const coreNodes = kgData.nodes.filter(n => matchedNodeIds.has(n.id));
      // The LLM can return IDs that don't exist in the graph — the BE does
      // not validate them (knowledge_graph.py analyze-scenario). Without this
      // the empty intersection latched the scenario button over a
      // full-strength canvas with zero explanation (observed live during
      // GREEN verification: pressed=true, no panel, no notice).
      if (coreNodes.length === 0 && notice === null) {
        notice = 'Tidak ada node yang cocok untuk skenario ini. Coba skenario lainnya, atau gunakan pencarian untuk menemukan node secara langsung.';
      }
      setScenarioNotice(notice);
      setScenarioNodes(coreNodes);

      if (coreNodes.length === 0) {
        // Zero matches: restore full strength and let the notice explain —
        // the old behavior dimmed the whole canvas to 0.05 opacity with a
        // latched button and no message (critique 2026-10-06 P1).
        clearScenarioHighlight(kgData);
        return;
      }

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

      // Dim irrelevant nodes; label colors go through the same fontColorFor
      // path as every other styling update (no blanket '#ffffff' anymore).
      highlightRef.current = nodesToHighlight;
      const nodeUpdates = kgData.nodes.map(n => ({
        id: n.id,
        color: { opacity: nodesToHighlight.has(n.id) ? 1 : 0.05 },
        font: { ...baseFont(n.id), color: fontColorFor(n.id) },
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
      if (reqId !== scenarioReqIdRef.current) return;
      console.error("Failed to fetch scenario from LLM", e);
      setScenarioNotice('Analisis skenario gagal — coba lagi.');
    } finally {
      // Only the newest request may clear the latch — a canceled or
      // superseded call's finally must not kill its successor's spinner.
      if (reqId === scenarioReqIdRef.current) {
        scenarioInFlightRef.current = null;
        setIsScenarioLoading(null);
        scenarioAbortRef.current = null;
      }
    }
  };

  const handleRelationClick = (nodeId: string) => {
    const data = kgDataRef.current;
    if (!data) return;
    const node = data.nodes.find(n => n.id === nodeId);
    if (!node) return;
    const relations = relationsFor(data, nodeId);
    // Keyboard handoff: the focus effect below moves focus to the panel
    // heading once this selection commits, so screen readers land on the
    // detail the activation just opened.
    shouldFocusPanelRef.current = true;
    setSelectedNode({ ...node, connectedCount: relations.length, relations });
    /* Canvas ops only while the canvas is actually visible (v5 P2·2):
       activating a list card no longer ejects the user into graph mode — the
       detail panel sits right beside the list — and the old path ran
       selectNodes/focus against a display:none canvas behind a 100ms
       setTimeout gamble on the re-render finishing in time. */
    if (viewMode === 'graph' && networkRef.current) {
      networkRef.current.selectNodes([nodeId]);
      networkRef.current.focus(nodeId, {
        scale: 1.2,
        animation: reducedMotion() ? false : { duration: 500, easingFunction: 'easeInOutQuad' },
      });
    }
  };

  useEffect(() => {
    // Guarded by view mode (v5 polish): in list mode this ran selectNodes
    // against the hidden canvas on every relation-row hover — dead dataset
    // work. The view-switch layout effect below re-selects on arrival.
    if (viewMode === 'graph' && networkRef.current && selectedNode) {
      if (hoveredRelationId) {
        networkRef.current.selectNodes([selectedNode.id, hoveredRelationId]);
      } else {
        networkRef.current.selectNodes([selectedNode.id]);
      }
    }
  }, [hoveredRelationId, selectedNode, viewMode]);

  /* Post-commit focus handoff (see shouldFocusPanelRef): runs after the new
     selection renders, so the heading exists and screen readers announce the
     panel the keyboard user just landed in. */
  useEffect(() => {
    if (shouldFocusPanelRef.current && selectedNode) {
      shouldFocusPanelRef.current = false;
      panelHeadingRef.current?.focus();
    }
  }, [selectedNode]);

  /* Post-layout centering when the canvas becomes visible with a selection
     made elsewhere (list card → Grafik toggle, breakpoint flip back to wide).
     useLayoutEffect runs after the display flip commits, so vis-network
     measures a real-sized container — replaces the 100ms setTimeout gamble
     (v5 P2·2). Flag-consumed: ordinary selection changes while the canvas is
     already visible go through handleRelationClick instead. */
  useLayoutEffect(() => {
    if (viewMode !== 'graph' || !centerOnViewRef.current) return;
    centerOnViewRef.current = false;
    const network = networkRef.current;
    if (!network || !selectedNode) return;
    network.selectNodes([selectedNode.id]);
    network.focus(selectedNode.id, {
      scale: 1.2,
      animation: reducedMotion() ? false : { duration: 500, easingFunction: 'easeInOutQuad' },
    });
  }, [viewMode, selectedNode]);

  // renderGraph is declared BEFORE fetchGraph because fetchGraph calls it:
  // react-hooks/immutability rejects textual use-before-declare even for
  // hoisted function declarations, so the source order is what matters.
  function renderGraph(data: KGData) {
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

      // Highlight Hubs differently from the leaf nodes. Leaf color is the
      // LIVE theme literal: canvas fillStyle cannot resolve CSS var()
      // strings, so the old 'var(--text-primary)' never actually rendered
      // (critique 2026-10-06 P1 — the file's PNG-export note says the same).
      const font = isCenter 
        ? { color: '#ffffff', size: Math.min(32, 16 + (degree * 0.2)), face: 'Inter, sans-serif', bold: true }
        : { color: leafFontColor(), size: 10, face: 'Inter, sans-serif', bold: false };

      /* Status ring (v5 shape): a dashed border marks regulasi nodes whose
         own document is not plain 'Berlaku'. Shape channel on purpose — the
         neon type/cluster hues are a keep-zone and keep owning color, dashes
         survive the scenario-dimming `color` partials, and the pattern is
         colorblind-safe. Exact status text rides the tooltip (third channel)
         and the DOM chips. */
      const ringed = needsStatusRing(n);

      const nodeProps: VisGraphNode = {
        id: n.id,
        label: n.label.length > 25 ? n.label.slice(0, 23) + '…' : n.label,
        title: n.doc_status ? `${n.label} — Status: ${n.doc_status}` : n.label,
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
        // Thicker stroke so the dash pattern stays legible at 12px radius
        nodeProps.borderWidth = ringed ? 2.5 : 1;
        nodeProps.color = nodeColor;
      }
      if (ringed) nodeProps.shapeProperties = { borderDashes: [5, 4] };

      return nodeProps;
    });

    // 5. Render all edges, inheriting source node color for cluster cohesion
    const visEdges: VisGraphEdge[] = data.edges.map((e) => {
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
        title: relationLabel(e.relation), // Still show relation on hover (humanized)
        color: { color: edgeColor, opacity: e.relation === 'DITERBITKAN_OLEH' ? 0.3 : 0.7 },
        arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        width: e.relation === 'DITERBITKAN_OLEH' ? 1 : 1.5,
        smooth: { enabled: true, type: 'curvedCW', roundness: 0.2 },
      };
    });

    /* Snapshot the styling metadata the shared font-color path needs (hub
       membership + per-node base fonts); a fresh dataset is never
       scenario-dimmed. */
    hubIdsRef.current = new Set(clusterCenters.map(c => c.id));
    nodeFontsRef.current = new Map(visNodes.map(v => [v.id, v.font]));
    highlightRef.current = null;

    nodesDataset.current.clear();
    edgesDataset.current.clear();
    nodesDataset.current.add(visNodes);
    edgesDataset.current.add(visEdges);

    /* vis-network 10 typings declare font.bold as string | FontStyles, but the
       runtime (and the library's own docs) still accept the boolean values this
       graph has always passed. The datasets keep the runtime-truthful item
       types; the mismatch is cast away once, at the Network boundary — no
       `any`, and no weakened VisGraphNode. */
    const graphData = {
      nodes: nodesDataset.current,
      edges: edgesDataset.current,
    } as unknown as Parameters<Network['setData']>[0];

    if (!networkRef.current && containerRef.current) {
      networkRef.current = new Network(
        containerRef.current,
        graphData,
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
        // Reads kgDataRef, NOT the renderGraph closure argument: this
        // listener is registered once, and closing over the first dataset
        // made canvas clicks compute relations from stale data after any
        // refetch (critique 2026-10-06 — Riley's stale-closure flag).
        const current = kgDataRef.current;
        if (!current) return;
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0] as string;
          const node = current.nodes.find(n => n.id === nodeId);
          if (node) {
            const relations = relationsFor(current, nodeId);
            setSelectedNode({ ...node, connectedCount: relations.length, relations });
          }
        } else {
          setSelectedNode(null);
        }
      });

      // Disable physics after initial layout to save CPU/RAM and prevent lag during zoom/pan
      networkRef.current.on('stabilizationIterationsDone', () => {
        networkRef.current?.setOptions({ physics: { enabled: false } });
      });

      /* vis-network gives its canvas frame tabindex="0" but wires no keyboard
         interaction to it — a dead tab stop between the toolbar and the side
         panel (verified live). Drop it from the tab order; the adjacent
         visually-hidden guidance already routes keyboard users to the list
         view, which IS keyboard-navigable. */
      const visFrame = containerRef.current.querySelector('.vis-network');
      if (visFrame) visFrame.setAttribute('tabindex', '-1');
    } else if (networkRef.current) {
      networkRef.current.setData(graphData);
    }
  }

  /* Defaults read the APPLIED params through a ref, not the draft state:
     retries and the deep-linked first load must fetch what the URL / the
     last success say. The ref also keeps this callback's identity
     permanently stable — the same doctrine as the renderGraph
     non-reactivity note above. */
  const fetchGraph = useCallback(async (s = appliedRef.current.search, type = appliedRef.current.type) => {
    // A new query supersedes any in-flight scenario analysis: discard its
    // response (reqId) and abort the call, so a stale reply can't re-dim the
    // rebuilt canvas after the latch resets below (same defect class as the
    // scenario-button race, critique 2026-10-07 P1).
    scenarioReqIdRef.current += 1;
    scenarioAbortRef.current?.abort();
    scenarioAbortRef.current = null;
    scenarioInFlightRef.current = null;
    setIsScenarioLoading(null);
    lastAttemptRef.current = { search: s, type };
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams();
      if (s) params.set('search', s);
      if (type) params.set('node_type', type);
      const res = await api.get(`/api/knowledge-graph?${params}`);
      const data: KGData = res.data;
      kgDataRef.current = data;
      setKgData(data);
      appliedRef.current = { search: s, type };
      setAppliedParams(prev => (prev.search === s && prev.type === type ? prev : { search: s, type }));
      // A refetch rebuilds the datasets from scratch: unlatch any scenario
      // or selection so the UI can't claim a highlight the canvas no longer
      // shows (critique 2026-10-06 P1: search-during-scenario wiped the
      // dimming while the button and result panel stayed latched).
      setActiveScenario(null);
      setScenarioNodes([]);
      setScenarioNotice(null);
      setSelectedNode(null);
      setScenarioClearedSelection(false);
      highlightRef.current = null;
      renderGraph(data);
    } catch (err) {
      console.error('KG fetch error:', err);
      // User-visible error state with retry — this failure used to be
      // console-only, leaving a permanently blank canvas (critique P1).
      const status = (err as { response?: { status?: number } })?.response?.status;
      setLoadError(status
        ? `Kesalahan server (kode ${status}).`
        : 'Periksa koneksi Anda lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // First load honors a deep-linked ?q=/?type= — fetchGraph's defaults read
    // appliedRef, which is seeded from the URL. fetchGraph's identity is
    // stable (ref-based defaults), so this dep never re-fires.
    (async () => { await fetchGraph(); })();
    return () => {
      if (typeDebounceRef.current) window.clearTimeout(typeDebounceRef.current);
      scenarioAbortRef.current?.abort();
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
      }
    };
  }, [fetchGraph]);

  /* Deep-linked ?node= consumption: select it once the dataset it must exist
     in has landed (an id filtered out by q/type is silently dropped — the URL
     mirror then normalizes the param away). No focus steal and no camera move
     on load: the panel reveal is the payoff, Fit brings the node into view. */
  const consumePendingNode = useCallback((data: KGData | null) => {
    const id = pendingNodeRef.current;
    if (!id || !data) return;
    pendingNodeRef.current = null;
    const node = data.nodes.find(n => n.id === id);
    if (!node) return;
    const relations = relationsFor(data, id);
    setSelectedNode({ ...node, connectedCount: relations.length, relations });
  }, []);

  useEffect(() => { consumePendingNode(kgData); }, [kgData, consumePendingNode]);

  /* URL mirror (v5 P2·3): the address bar carries the APPLIED state (q,
     type, view, node) so refreshes, deep links and shared URLs restore the
     same working set. Every write is replace-only — in-page state, not
     history steps (graph exploration would spam the stack) — so browser
     Back always leaves /graph and returning REMOUNTS through the URL-seeded
     state initializers; no mounted-lifetime reconciliation branch is needed
     (two /graph entries are never adjacent in this app's navigation model).
     Kept to mirroring only: no synchronous setState in the effect body
     (react-hooks/set-state-in-effect). */
  useEffect(() => {
    const next = new URLSearchParams();
    if (appliedParams.search) next.set('q', appliedParams.search);
    if (appliedParams.type) next.set('type', appliedParams.type);
    next.set('view', viewMode);
    if (selectedNode) next.set('node', selectedNode.id);
    const nextRaw = next.toString();
    if (nextRaw !== urlParams.toString()) {
      setUrlParams(next, { replace: true });
    }
  }, [appliedParams, viewMode, selectedNode, urlParams, setUrlParams]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchGraph(search, filterType);
  };

  /* v5 P1: the type select APPLIES ON CHANGE — in both modes. Graph mode used
     to sit inert until Cari while the list filtered live (same control, two
     behaviors, and no way to remember which mode you were in). A select is a
     discrete, low-frequency change, so one debounced server round-trip is
     affordable; arrow-key option cycling coalesces inside the 300ms window.
     The fetch carries the APPLIED search text, never the draft — the
     Cari/Terapkan label swap covers that separate path. */
  useEffect(() => { fetchGraphRef.current = fetchGraph; }, [fetchGraph]);
  const handleFilterTypeChange = (value: string) => {
    setFilterType(value);
    if (typeDebounceRef.current) window.clearTimeout(typeDebounceRef.current);
    typeDebounceRef.current = window.setTimeout(() => {
      typeDebounceRef.current = null;
      fetchGraphRef.current?.(appliedRef.current.search, value);
    }, 300);
  };

  // Zoom/fit controls: body-defined event handlers (the pattern this file
  // already uses for handleSearch), passed straight to JSX props. vis-network
  // 10 types getScale(), so the old `as any` casts are gone.
  const handleZoomIn = () => {
    const network = networkRef.current;
    if (network) network.moveTo({ scale: network.getScale() * 1.3 });
  };
  const handleZoomOut = () => {
    const network = networkRef.current;
    if (network) network.moveTo({ scale: network.getScale() * 0.77 });
  };
  const fitGraph = () => { networkRef.current?.fit({ animation: !reducedMotion() }); };

  const handleReset = () => {
    setSearch('');
    setFilterType('');
    fetchGraph('', '');
  };

  /* Deterministic LIGHT artifact. The capture carries backgroundColor
     '#f8fafc' (keep-zone), but in the dark theme both the container's
     var(--bg-base) and the canvas labels (leafFontColor = live
     --text-primary) are dark-themed: html-to-image clones computed styles,
     so the dark container bg bakes in and overrides the light option (live
     check: container computes rgb(11,18,32) with labels at #f1f5f9), and on
     any path where the light bg does win, dark-theme labels land at 1.05:1.
     Pin bg AND labels to their light-theme literals for the capture only,
     then restore. Canvas colors must be literals (see leafFontColor). */
  const exportToPng = useCallback(async () => {
    const container = containerRef.current;
    const network = networkRef.current;
    const data = kgDataRef.current;
    if (!container || !network) return;

    const prevBg = container.style.background;
    container.style.background = '#f8fafc'; // --bg-base (light), tokens.css
    if (data) {
      const exportFontColor = (id: string): string => {
        const hl = highlightRef.current;
        if (hl && !hl.has(id)) return 'rgba(0,0,0,0.05)'; // keep scenario dimming legible-as-dimmed
        if (hubIdsRef.current.has(id)) return '#ffffff';   // white on the vivid hub fills, both themes
        return '#0f172a';                                  // --text-primary (light), tokens.css
      };
      nodesDataset.current.update(data.nodes.map(n => ({
        id: n.id,
        font: { ...baseFont(n.id), color: exportFontColor(n.id) },
      })));
      network.redraw(); // repaint the canvas bitmap synchronously before the clone
    }

    try {
      const dataUrl = await toPng(container, { cacheBust: true, backgroundColor: '#f8fafc' });
      const link = document.createElement('a');
      link.download = `knowledge-graph-${exportStamp()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Failed to export graph', err);
      pushToast('error', 'Gagal mengekspor gambar graf.');
    } finally {
      container.style.background = prevBg;
      if (data) {
        refreshNodeFonts(); // theme-correct labels again
        network.redraw();
      }
    }
  }, [baseFont, pushToast, refreshNodeFonts]);

  const exportData = async (format: 'json' | 'csv') => {
    try {
      const res = await api.get(`/api/knowledge-graph/export?format=${format}`, { responseType: 'blob' });
      const blob = res.data as Blob;
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `knowledge_graph_export-${exportStamp()}.${format === 'json' ? 'json' : 'zip'}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export error', err);
      // Toast instead of the native alert() — DESIGN.md bans the browser
      // dialogs (critique 2026-10-06 P1).
      pushToast('error', 'Gagal mengekspor data.');
    }
  };

  /* Adjacency built once per dataset instead of every list card filtering
     the full edge set itself — O(N x E) across up to 100 cards (critique
     2026-10-06 minor). */
  const adjacency = useMemo(() => {
    const map = new Map<string, { node: KGNode; rel: string }[]>();
    if (!kgData) return map;
    const byId = new Map(kgData.nodes.map(n => [n.id, n]));
    const push = (key: string, value: { node: KGNode; rel: string }) => {
      const arr = map.get(key);
      if (arr) arr.push(value); else map.set(key, [value]);
    };
    kgData.edges.forEach(e => {
      const source = byId.get(e.source_id);
      const target = byId.get(e.target_id);
      if (!source || !target) return;
      push(e.source_id, { node: target, rel: e.relation });
      push(e.target_id, { node: source, rel: e.relation });
    });
    return map;
  }, [kgData]);

  /* One filter pass for the list view — the same predicate used to run
     three times inline per render (cards, cap check, cap message). */
  const visibleNodes = useMemo(() => {
    if (!kgData) return [];
    const q = search.toLowerCase();
    return kgData.nodes.filter(n =>
      n.label.toLowerCase().includes(q) &&
      (filterType === '' || n.type.toLowerCase() === filterType.toLowerCase())
    );
  }, [kgData, search, filterType]);

  /* Dirty cue (v5 P1): in graph mode the text input is submit-gated (a
     server round-trip) while the list filters as you type — the difference
     is now VISIBLE through the Cari→Terapkan label swap instead of being
     working memory. The type select self-applies, so it can only be dirty
     inside its 300ms debounce window. */
  const filtersDirty = viewMode === 'graph' &&
    (search !== appliedParams.search || filterType !== appliedParams.type);

  /* One spoken status line for the PERSISTENT live region at the bottom of
     the component (v5, Sam's flag): a live region only announces a change if
     the region existed before it — the old role="status" paragraphs mounted
     with their text already inside and were routinely swallowed. Precedence:
     load failure > analysis in flight > analysis outcome > selection. */
  const srStatus = loadError
    ? `Gagal memuat graf pengetahuan. ${loadError}`
    : isScenarioLoading
      ? `Menganalisis skenario ${isScenarioLoading}. Dapat memakan waktu hingga satu menit.`
      : scenarioNotice
        ?? (selectedNode
          ? `Node ${selectedNode.label} dipilih. ${selectedNode.connectedCount} relasi terhubung.`
          : '');

  return (
    /* view-container no-scroll: same fill-the-scroller pattern as LegalOpinion.
       A bare height:'100%' here resolves against the indefinite .route-inset
       (flex:1 0 auto), making the vis-network container content-sized — its
       autoResize poller then ratchets canvas→container→canvas and the page
       grows forever. The .no-scroll cap (:has() rule in components.css) gives
       the chain a definite height, so vis sizes once and stays stable. */
    <div className="view-container no-scroll kg-view">
      {/* Header — .view-header grammar (24x32 padding, 1.5rem display h2,
          responsive padding via utilities.css) replaces the improvised
          1.1rem / 20x28 one-off with its purple wash (critique 2026-10-06,
          consistency H4). The title follows the shell's i18n label — the
          page used to hardcode "Knowledge Graph" while sidebar/topbar said
          "Graf Pengetahuan". */}
      <div className="view-header" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Accent-tint tile (the badge grammar this file already uses):
              --gradient-brand is reserved for the auth/hero/avatar carriers
              (DESIGN.md) — this header was the app's only other one. Icon
              role rides --accent-color, re-pinned in the dark theme for
              exactly this use (tokens.css). */}
          <div style={{
            background: 'var(--accent-glow)',
            borderRadius: '10px', padding: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <GitFork size={18} color="var(--accent-color)" />
          </div>
          <div>
            <h2>{t.navGraph}</h2>
            {kgData && (
              <p>{kgData.total_nodes} node · {kgData.total_edges} relasi</p>
            )}
          </div>
        </div>

        {/* Tools row, chunked under the title — the old single flex line
            carried 9 controls at one decision point (critique: minimal
            choices / chunking failures). */}
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <div role="group" aria-label="Mode tampilan" style={{ display: 'flex', background: 'var(--bg-element)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
            <button type="button" onClick={() => { centerOnViewRef.current = true; setViewMode('graph'); }} aria-pressed={viewMode === 'graph'} style={{ padding: '6px 12px', background: viewMode === 'graph' ? 'var(--accent-glow)' : 'transparent', color: viewMode === 'graph' ? 'var(--accent-hover)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
              <NetworkIcon size={14} /> Grafik
            </button>
            <button type="button" onClick={() => setViewMode('list')} aria-pressed={viewMode === 'list'} style={{ padding: '6px 12px', background: viewMode === 'list' ? 'var(--accent-glow)' : 'transparent', color: viewMode === 'list' ? 'var(--accent-hover)' : 'var(--text-secondary)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
              <List size={14} /> Daftar
            </button>
          </div>
          {/* Visible focus treatment moves to the wrapper (ring + hairline
              flip): the bare input stays outline-less, but keyboard users
              now get a ring — the old outline:'none' gave them nothing.
              Vertical padding lives on the INPUT (not the wrapper) so the
              mobile 44px floor (utilities.css) makes the whole box a real
              touch target — desktop rendering is pixel-identical. */}
          <div className="kg-search-box" style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'var(--bg-element)', borderRadius: '10px',
            padding: '0 14px',
            border: `1px solid ${searchFocused ? 'var(--border-highlight)' : 'var(--border-color)'}`,
            boxShadow: searchFocused ? '0 0 0 3px var(--accent-glow)' : 'none',
            transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
          }}>
            <Search size={14} color="var(--text-secondary)" />
            <label htmlFor="kg-search" className="visually-hidden">Cari node</label>
            <input
              id="kg-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="Cari node..."
              style={{
                background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text-primary)', fontSize: '0.85rem', width: '160px',
                padding: '8px 0',
              }}
            />
          </div>

          <label htmlFor="kg-filter-type" className="visually-hidden">Filter tipe node</label>
          <select
            id="kg-filter-type"
            value={filterType}
            onChange={(e) => handleFilterTypeChange(e.target.value)}
            style={{
              background: 'var(--bg-element)', border: '1px solid var(--border-color)',
              borderRadius: '10px', padding: '8px 12px',
              color: 'var(--text-primary)', fontSize: '0.85rem', cursor: 'pointer',
            }}
          >
            <option value="">Semua Tipe</option>
            <option value="regulasi">Regulasi</option>
            <option value="entitas">Entitas</option>
            <option value="topik">Topik</option>
          </select>

          {/* Standard .btn .btn-primary carrier (v5 colorize): the one-off
              inline accent bg escaped the dark-theme global re-pin (#2563eb)
              that lifts white-on-accent from a measured 3.68:1 to AA 5.1:1
              (theme-dark.css tracked gap). The label swaps to "Terapkan"
              while unapplied draft input waits — the dirty cue. */}
          <button
            type="submit"
            className="btn btn-primary"
            title={filtersDirty ? 'Terapkan pencarian dan filter (Enter)' : undefined}
          >
            {filtersDirty ? 'Terapkan' : 'Cari'}
          </button>

          <button type="button" onClick={handleReset} aria-label="Atur ulang pencarian dan filter" title="Atur ulang" style={{
            background: 'var(--bg-element)', border: '1px solid var(--border-color)',
            borderRadius: '10px', padding: '8px', cursor: 'pointer', color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center',
          }}>
            <RefreshCw size={14} />
          </button>

          {/* Ekspor ▾ — the export trio collapsed into one dropdown; PNG is
              disabled in list view because the canvas is display:none there
              (the old button silently produced a blank artifact). */}
          <div ref={exportMenuRef} style={{ position: 'relative', marginLeft: '12px' }}>
            <button
              type="button"
              ref={exportTriggerRef}
              onClick={() => setExportMenuOpen(o => !o)}
              aria-expanded={exportMenuOpen}
              aria-haspopup="menu"
              style={{
                padding: '6px 12px', fontSize: '0.85rem', fontWeight: 600,
                display: 'flex', alignItems: 'center', gap: '6px',
                background: 'var(--bg-element)', border: '1px solid var(--border-color)',
                borderRadius: '8px', color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              <Download size={14} /> Ekspor <ChevronDown size={12} />
            </button>
            {exportMenuOpen && (
              <div role="menu" aria-label="Ekspor data graf" ref={exportMenuListRef} onKeyDown={handleExportMenuKeyDown} style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
                minWidth: '200px', padding: '6px',
                background: 'var(--bg-card)', backdropFilter: 'blur(12px)',
                border: '1px solid var(--border-color)', borderRadius: '12px',
                boxShadow: '0 12px 32px rgba(15, 23, 42, 0.18)',
                display: 'flex', flexDirection: 'column', gap: '2px',
              }}>
                <button
                  role="menuitem" type="button"
                  disabled={viewMode === 'list'}
                  title={viewMode === 'list' ? 'Tersedia pada tampilan Grafik' : undefined}
                  onClick={() => { setExportMenuOpen(false); exportTriggerRef.current?.focus(); exportToPng(); }}
                  style={menuItemStyle(viewMode === 'list')}
                >
                  <Download size={14} /> Ekspor PNG
                </button>
                <button role="menuitem" type="button" onClick={() => { setExportMenuOpen(false); exportTriggerRef.current?.focus(); exportData('json'); }} style={menuItemStyle(false)}>
                  <Download size={14} /> Ekspor JSON
                </button>
                <button role="menuitem" type="button" onClick={() => { setExportMenuOpen(false); exportTriggerRef.current?.focus(); exportData('csv'); }} style={menuItemStyle(false)}>
                  <Download size={14} /> Ekspor CSV (ZIP)
                </button>
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Main Content — stacks vertically on phones: the fixed 260px side
          panel used to squeeze a 375px viewport's list view to ~115px
          (critique 2026-10-06, Riley). */}
      <div style={{ flex: 1, display: 'flex', flexDirection: isNarrow ? 'column' : 'row', minHeight: 0, position: 'relative' }}>
        {/* Graph Canvas */}
        <div style={{ flex: 1, minHeight: isNarrow ? '240px' : 0, position: 'relative' }}>
          {loading && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', zIndex: 10,
              background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(4px)',
            }}>
              {/* Dark loading wash (dimmer over the graph area): the orb is
                  pinned to dark ink + light label because this surface does
                  not follow the app theme. Ink-navy rgba(15,23,42,α) per the
                  veil doctrine (DESIGN.md — the --overlay-veil family); the
                  old rgba(22,18,43,0.85) drifted purple (critique 2026-10-07
                  minor). */}
              <LoadingOrb theme="dark" className="loading-orb--on-dark" label="Memuat graf pengetahuan..." />
            </div>
          )}
          {/* Fetch failure: an honest error state with retry — this used to
              be console-only, leaving a permanently blank canvas with no way
              to tell "no data" from "API down" (critique 2026-10-06 P1). */}
          {!loading && loadError && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 9, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: '12px',
              padding: '24px', textAlign: 'center', background: 'var(--bg-base)',
            }}>
              <AlertCircle size={40} color="var(--danger-text)" />
              <div>
                <p style={{ margin: 0, fontWeight: 600, color: 'var(--text-primary)' }}>Gagal memuat graf pengetahuan</p>
                <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{loadError}</p>
              </div>
              <button type="button" className="secondary-action-btn" onClick={() => fetchGraph(lastAttemptRef.current.search, lastAttemptRef.current.type)}>
                <RefreshCw size={14} /> Coba lagi
              </button>
            </div>
          )}
          {!loading && !loadError && kgData?.nodes.length === 0 && (
            (search.trim() !== '' || filterType !== '') ? (
              /* Zero-match state: with an active search/filter the old copy
                 misdiagnosed the situation as an empty corpus ("Belum ada
                 data graf... Unggah dokumen") while the list view beside it
                 correctly said nothing matched — two views contradicting
                 each other (critique 2026-10-07 P1, reproduced live with
                 search "qqqzzz999"). Same predicate grammar as visibleNodes
                 so they can't drift apart again; the CTA resets both. */
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: '16px',
                padding: '24px', textAlign: 'center',
              }}>
                <Search size={40} color="var(--text-secondary)" style={{ opacity: 0.4 }} />
                <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '0.95rem' }}>
                  Tidak ada node yang cocok dengan pencarian atau filter saat ini.
                </p>
                <button type="button" className="secondary-action-btn" onClick={handleReset}>
                  <RefreshCw size={14} /> Atur ulang pencarian
                </button>
              </div>
            ) : (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
            }}>
              <GitFork size={48} color="var(--accent-color)" style={{ opacity: 0.3, marginBottom: '16px' }} />
              <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '1rem' }}>
                Belum ada data graf.
              </p>
              {/* Truthful + product-register copy: the old line told users to
                  "minta Admin menjalankan Rebuild" — an action no screen in
                  the product exposes (critique 2026-10-06 P1/H9). */}
              <p style={{ color: 'var(--text-secondary)', margin: '8px 0 0', fontSize: '0.85rem', opacity: 0.7 }}>
                Unggah dokumen baru melalui Repositori, atau hubungi administrator untuk membangun ulang graf.
              </p>
            </div>
            )
          )}
          <div style={{ display: viewMode === 'graph' ? 'block' : 'none', width: '100%', height: '100%', position: 'relative' }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%', background: 'var(--bg-base)' }} />
            {/* The canvas is opaque to assistive tech; the list view is the
                keyboard-navigable path through the node model. */}
            <p className="visually-hidden">
              Kanvas graf interaktif. Gunakan mode Daftar untuk menelusuri node dengan keyboard.
            </p>
            <div style={{
              position: 'absolute', bottom: '20px', right: '20px',
              display: 'flex', flexDirection: 'column', gap: '8px',
            }}>
              <GraphControlButton onClick={handleZoomIn} label="Perbesar"><ZoomIn size={18} /></GraphControlButton>
              <GraphControlButton onClick={handleZoomOut} label="Perkecil"><ZoomOut size={18} /></GraphControlButton>
              <GraphControlButton onClick={fitGraph} label="Sesuaikan tampilan"><Maximize2 size={18} /></GraphControlButton>
            </div>
          </div>

          <div style={{ display: viewMode === 'list' ? 'block' : 'none', width: '100%', height: '100%', background: 'var(--bg-base)', padding: '20px', overflowY: 'auto' }}>
            <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
              <h3 style={{ color: 'var(--text-primary)', marginBottom: '16px', fontSize: '1.15rem', fontWeight: 600, lineHeight: 1.3 }}>Daftar Node</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {visibleNodes.slice(0, 100).map(node => (
                  <NodeListCard
                    key={node.id}
                    node={node}
                    connections={adjacency.get(node.id) ?? []}
                    onNavigate={handleRelationClick}
                  />
                ))}
                {visibleNodes.length === 0 && !loading && !loadError && (
                  <p style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px', fontSize: '0.85rem', margin: 0 }}>
                    Tidak ada node yang cocok dengan pencarian atau filter saat ini.
                  </p>
                )}
                {visibleNodes.length > 100 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '20px', fontSize: '0.85rem' }}>
                    Menampilkan 100 dari {visibleNodes.length} node. Gunakan pencarian untuk hasil lebih spesifik.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side Panel: Scenarios + Legend + Selected Node Info. On
            phones it stacks below the canvas (max 45% height, own scroll)
            instead of eating 260px of a 375px viewport. */}
        <div className="kg-side" style={isNarrow ? {
          width: '100%', minWidth: 0, maxHeight: '45%',
          background: 'var(--bg-element)', borderTop: '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column', overflowY: 'auto',
        } : {
          width: '260px', minWidth: '260px',
          background: 'var(--bg-element)', borderLeft: '1px solid var(--border-color)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          {/* Contract scenarios — the kicker drops "PROTOTIPE" (it undercut
              the flagship demo moment, critique H10), the acronym gets the
              one-line explanation it never had, and the buttons announce
              their toggle state. */}
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
            <div style={{ ...STAMP_STYLE, color: 'var(--text-secondary)', marginBottom: '4px' }}>Analisis Skenario</div>
            <p style={{ margin: '0 0 12px', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Sorot node terkait skenario kontrak: PKS (Perjanjian Kerja Sama) atau NDA (kerahasiaan informasi).
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                type="button"
                onClick={() => handleScenarioClick('PKS')}
                aria-pressed={activeScenario === 'PKS'}
                disabled={isScenarioLoading !== null && isScenarioLoading !== 'PKS'}
                title={isScenarioLoading === 'PKS' ? 'Klik untuk membatalkan analisis' : undefined}
                style={{
                  flex: 1, padding: '8px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
                  cursor: isScenarioLoading === 'NDA' ? 'not-allowed' : 'pointer',
                  opacity: isScenarioLoading === 'NDA' ? 0.5 : 1,
                  background: activeScenario === 'PKS' ? 'var(--accent-glow)' : 'var(--bg-card)',
                  color: activeScenario === 'PKS' ? 'var(--accent-hover)' : 'var(--text-secondary)',
                  border: `1px solid ${activeScenario === 'PKS' ? 'var(--accent-color)' : 'var(--border-color)'}`,
                  transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease',
                }}>
                {isScenarioLoading === 'PKS' ? <><Loader2 size={12} className="animate-spin" style={{ marginRight: '4px' }} /> Menganalisis...</> : 'PKS'}
              </button>
              <button
                type="button"
                onClick={() => handleScenarioClick('NDA')}
                aria-pressed={activeScenario === 'NDA'}
                disabled={isScenarioLoading !== null && isScenarioLoading !== 'NDA'}
                title={isScenarioLoading === 'NDA' ? 'Klik untuk membatalkan analisis' : undefined}
                style={{
                  flex: 1, padding: '8px', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600,
                  cursor: isScenarioLoading === 'PKS' ? 'not-allowed' : 'pointer',
                  opacity: isScenarioLoading === 'PKS' ? 0.5 : 1,
                  background: activeScenario === 'NDA' ? 'var(--accent-glow)' : 'var(--bg-card)',
                  color: activeScenario === 'NDA' ? 'var(--accent-hover)' : 'var(--text-secondary)',
                  border: `1px solid ${activeScenario === 'NDA' ? 'var(--accent-color)' : 'var(--border-color)'}`,
                  transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease',
                }}>
                {isScenarioLoading === 'NDA' ? <><Loader2 size={12} className="animate-spin" style={{ marginRight: '4px' }} /> Menganalisis...</> : 'NDA'}
              </button>
            </div>

            {/* Scenario status line: the LLM call used to show only a 12px
                in-button spinner (with a dead animate-spin class, so it
                never even turned), and both the keyword fallback and the
                zero-match dim were silent (critique 2026-10-06 P1). Now it
                also sets the expectation (the call takes ~18s, measured
                live), discloses a cleared selection, and offers a real
                cancel — Batal aborts the request and restores the canvas. */}
            {isScenarioLoading && (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-start' }}>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Loader2 size={12} className="animate-spin" /> Menganalisis skenario {isScenarioLoading}... dapat memakan waktu hingga ±1 menit.
                </p>
                {scenarioClearedSelection && (
                  <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.5, opacity: 0.85 }}>
                    Pilihan node sebelumnya dibersihkan agar sorotan skenario terlihat penuh.
                  </p>
                )}
                <button type="button" className="secondary-action-btn" onClick={cancelScenario}>
                  <X size={14} /> Batal
                </button>
              </div>
            )}
            {!isScenarioLoading && scenarioNotice && (
              <p style={{ margin: '12px 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {scenarioNotice}
              </p>
            )}

            {activeScenario && scenarioNodes.length > 0 && (
              <div style={{ marginTop: '16px', background: 'var(--bg-element)', borderRadius: '8px', padding: '12px', border: '1px solid var(--border-color)' }}>
                <div style={{ ...STAMP_STYLE, color: 'var(--text-secondary)', marginBottom: '8px' }}>Node Terkait ({activeScenario})</div>
                {/* Explains the dimming semantics — "faded" used to be
                    undefined from the user's side (critique 2026-10-07 P1·2
                    companion). Legend-footnote grammar (0.7rem / 0.85). */}
                <p style={{ margin: '0 0 8px', fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.5, opacity: 0.85 }}>
                  Node yang diredupkan di kanvas berjarak lebih dari 2 lompatan relasi dari node-node ini.
                </p>
                <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'block', paddingRight: '4px' }}>
                  {scenarioNodes.map(node => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => handleRelationClick(node.id)}
                      title={node.label}
                      style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: '6px', fontSize: '0.75rem', fontFamily: 'inherit', background: 'var(--bg-card)', border: '1px solid var(--border-color)', padding: '6px 8px', borderRadius: '4px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.4' }}
                    >
                      <span aria-hidden="true">{'• '}</span>{node.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Legend — describes what the canvas actually draws (critique
              2026-10-06 P2 rewrite). v5: it became a disclosure (reference
              material, collapsed by default on narrow screens, persisted per
              browser), the two cluster-inheritance caveats merged into ONE
              line at the bottom (the same fact was said twice under Tipe
              Node and Relasi at 0.7rem/0.85 — critique P3 caveat density),
              and a Status Regulasi section documents the dashed-ring
              channel. Swatches ride the --dv-* tokens. */}
          <div style={{ padding: '20px', borderBottom: '1px solid var(--border-color)' }}>
            <button
              type="button"
              className="kg-expand-toggle"
              onClick={() => {
                const next = !legendOpen;
                setLegendOpen(next);
                try { localStorage.setItem('kg-legend-open', next ? '1' : '0'); } catch { /* storage blocked — session-only */ }
              }}
              aria-expanded={legendOpen}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', padding: 0, fontFamily: 'inherit', width: '100%' }}
            >
              <Filter size={14} />
              <span style={{ ...STAMP_STYLE }}>Legenda</span>
              <span aria-hidden="true" style={{ marginLeft: 'auto', display: 'flex', transition: 'transform 0.15s ease', transform: legendOpen ? 'none' : 'rotate(-90deg)' }}>
                <ChevronDown size={14} />
              </span>
            </button>
            {legendOpen && (
              <div style={{ marginTop: '14px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span aria-hidden="true" style={{ width: '16px', height: '11px', border: '2px solid var(--text-secondary)', borderRadius: '3px', flexShrink: 0 }} />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.4 }}>Hub (simpul pusat) — lebih dari 10 relasi</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span aria-hidden="true" style={{ width: '11px', height: '11px', borderRadius: '50%', border: '2px solid var(--text-secondary)', flexShrink: 0, marginLeft: '2.5px', marginRight: '2.5px' }} />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.4 }}>Node biasa</span>
                  </div>
                </div>
                <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  <div style={{ ...STAMP_STYLE, color: 'var(--text-secondary)', marginBottom: '8px' }}>Tipe Node</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {[
                      { type: 'regulasi', icon: <FileText size={14} /> },
                      { type: 'entitas', icon: <Building2 size={14} /> },
                      { type: 'topik', icon: <Tag size={14} /> },
                    ].map(item => (
                      <div key={item.type} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span aria-hidden="true" style={{ width: '10px', height: '10px', borderRadius: '50%', background: NODE_COLORS_DEEP[item.type], flexShrink: 0 }} />
                        <span style={{ color: NODE_COLORS_DEEP[item.type], display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem' }}>
                          {item.icon} {TYPE_LABELS[item.type]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  <div style={{ ...STAMP_STYLE, color: 'var(--text-secondary)', marginBottom: '8px' }}>Status Regulasi</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span aria-hidden="true" style={{ width: '11px', height: '11px', borderRadius: '50%', border: '2px dashed var(--text-secondary)', flexShrink: 0, marginLeft: '2.5px', marginRight: '2.5px' }} />
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.4 }}>Cincin putus-putus — status bukan "Berlaku" penuh</span>
                  </div>
                  <p style={{ margin: '8px 0 0', fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.5, opacity: 0.85 }}>
                    Hanya node regulasi yang berstatus hukum: cincin solid berarti "Berlaku", cincin putus-putus berarti status lain (mis. "Tidak Berlaku", "Berlaku (Dicabut Sebagian)"). Status lengkap tampil di panel node dan daftar. Entitas dan topik tidak berstatus.
                  </p>
                </div>
                <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                  <div style={{ ...STAMP_STYLE, color: 'var(--text-secondary)', marginBottom: '8px' }}>Relasi</div>
                  {Object.entries(RELATION_COLORS_DEEP).map(([rel, color]) => (
                    <div key={rel} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <div aria-hidden="true" style={{ width: '20px', height: '2px', background: color, borderRadius: '1px', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{relationLabel(rel)}</span>
                    </div>
                  ))}
                </div>
                <p style={{ margin: '14px 0 0', borderTop: '1px solid var(--border-color)', paddingTop: '12px', fontSize: '0.7rem', color: 'var(--text-secondary)', lineHeight: 1.5, opacity: 0.85 }}>
                  Di dalam klaster, node dan garis mewarisi warna hub — warna tipe dan relasi hanya berlaku di luar klaster.
                </p>
              </div>
            )}
          </div>

          {/* Selected Node Info */}
          <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
            {!selectedNode ? (
              <div style={{ textAlign: 'center', padding: '32px 0' }}>
                <Info size={28} color="var(--text-secondary)" style={{ opacity: 0.4, marginBottom: '12px', display: 'block', margin: '0 auto 12px' }} />
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', margin: 0, lineHeight: 1.5 }}>
                  Pilih node pada grafik atau daftar untuk melihat detail relasi.
                </p>
              </div>
            ) : (
              <div>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div aria-hidden="true" style={{
                      width: '10px', height: '10px', borderRadius: '50%',
                      background: NODE_COLORS_DEEP[selectedNode.type] ?? 'var(--text-secondary)',
                    }} />
                    <span style={{ ...STAMP_STYLE, color: NODE_COLORS_DEEP[selectedNode.type] ?? 'var(--text-secondary)' }}>
                      {TYPE_LABELS[selectedNode.type]}
                    </span>
                  </div>
                  <button type="button" onClick={() => setSelectedNode(null)} aria-label="Tutup detail node" style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: 'var(--text-secondary)', display: 'flex', padding: '2px',
                  }}>
                    <X size={14} />
                  </button>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <h3 ref={panelHeadingRef} tabIndex={-1} style={{
                    margin: 0, fontSize: '0.95rem', fontWeight: 700,
                    color: 'var(--text-primary)', lineHeight: 1.4, outline: 'none',
                    /* Citation voice (v5): a regulasi node's label IS the
                       citation — "{jenis} {nomor}" — rendered in the mono
                       face the app uses for document numbers. */
                    fontFamily: selectedNode.type === 'regulasi' ? 'var(--font-mono)' : undefined,
                  }}>
                    {selectedNode.label}
                  </h3>
                  {/* Exact legal-effect status (v5 shape): the canvas ring
                      only encodes the binary "not plain Berlaku"; the chip
                      carries the true string in the shared vocabulary
                      (statusTone parity with LegalRepository). */}
                  {selectedNode.doc_status && (
                    <span className={`status-chip ${statusTone(selectedNode.doc_status)}`} style={{ display: 'inline-block', marginTop: '8px' }}>
                      {selectedNode.doc_status}
                    </span>
                  )}
                </div>

                {/* The trailing "relasi terhubung" line is gone (v5
                    distill): kicker + big number already say it once. */}
                <div style={{
                  background: 'var(--bg-element)', borderRadius: '10px', padding: '12px',
                  marginBottom: '16px',
                }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: '6px' }}>Koneksi</div>
                  <div style={{ fontSize: '1.4rem', fontWeight: 700, color: NODE_COLORS_DEEP[selectedNode.type] ?? 'var(--text-secondary)' }}>
                    {selectedNode.connectedCount}
                  </div>
                </div>

                {selectedNode.relations && selectedNode.relations.length > 0 && (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ ...STAMP_STYLE, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                      Detail Relasi
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                      {selectedNode.relations.map((rel, idx) => (
                        /* Real <button>: the onClick-div rows were unreachable
                           by keyboard and screen reader (critique P1). Hover
                           highlight stays a mouse-only enhancement. */
                        <button 
                          key={idx} 
                          type="button"
                          onMouseEnter={() => setHoveredRelationId(rel.id)}
                          onMouseLeave={() => setHoveredRelationId(null)}
                          onClick={() => handleRelationClick(rel.id)}
                          style={{ 
                            background: hoveredRelationId === rel.id ? 'var(--bg-card)' : 'var(--bg-element)', 
                            borderRadius: '6px', padding: '8px',
                            border: 'none',
                            borderLeft: `2px solid ${RELATION_COLORS_DEEP[rel.relation] ?? 'var(--text-secondary)'}`,
                            cursor: 'pointer',
                            transition: 'background 0.2s ease',
                            display: 'block', width: '100%', textAlign: 'left', fontFamily: 'inherit',
                          }}
                        >
                          <div style={{ fontSize: '0.7rem', color: RELATION_COLORS_DEEP[rel.relation] ?? 'var(--text-secondary)', fontWeight: 600, marginBottom: '4px' }}>
                            {rel.direction === 'out' ? '→ ' : '← '} {relationLabel(rel.relation)}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                            {rel.label}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Citation-first payoff, now actually wired: resolves the
                    doc_id through GET /api/repository and opens the shared
                    DocumentDrawer. The old CTA called App's () => {} no-op
                    and only appeared for regulasi nodes — any node with a
                    source document gets the honest path now (critique P1). */}
                {selectedNode.doc_id && (
                  <button
                    type="button"
                    onClick={() => openDocument(selectedNode.doc_id!)}
                    disabled={docLoading}
                    style={{
                      width: '100%', background: 'var(--accent-glow)',
                      border: '1px solid var(--border-highlight)', borderRadius: '10px',
                      padding: '10px', cursor: docLoading ? 'wait' : 'pointer', color: 'var(--accent-hover)',
                      fontSize: '0.85rem', fontWeight: 600, fontFamily: 'inherit',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                      opacity: docLoading ? 0.7 : 1,
                    }}
                  >
                    {docLoading ? <Loader2 size={14} className="animate-spin" /> : <FileText size={14} />}
                    {docLoading ? 'Memuat dokumen...' : 'Buka Dokumen'}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Shared document drawer — the same component Repository and Legal
          Opinion use; it portals itself and handles doc=null. */}
      <DocumentDrawer doc={drawerDoc} onClose={() => setDrawerDoc(null)} />

      {/* Persistent screen-reader status line — see the srStatus derivation.
          The visible scenario/notice paragraphs are the visual copies; this
          is the announcement channel that actually fires. */}
      <p className="visually-hidden" role="status">{srStatus}</p>

      {/* Local toast strip — reuses the UploadProvider's .upload-toast
          grammar (components.css); there is no app-wide toast context to
          join. ALWAYS mounted (v5, Sam's flag): an aria-live region only
          announces changes when the region itself pre-exists, and per-toast
          role=status/alert nested inside the container's aria-live was
          invalid — the live region lives here, once. The empty container is
          invisible and pointer-events: none. */}
      <div className="upload-toast-container" aria-live="polite">
        {toasts.map(tt => (
          <div key={tt.id} className={`upload-toast upload-toast--${tt.kind}`}>
            {tt.kind === 'success' ? <CheckCircle size={16} /> : tt.kind === 'error' ? <AlertTriangle size={16} /> : <Info size={16} />}
            <span>{tt.message}</span>
            <button type="button" className="upload-toast-close" onClick={() => dismissToast(tt.id)} aria-label="Tutup notifikasi">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
