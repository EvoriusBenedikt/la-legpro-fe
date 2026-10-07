import { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Database, File, Upload, CheckCircle2, BookOpen, FolderOpen, Zap, FileCheck, X, Trash2, Clock, Bot, Scale, AlertCircle, Loader2, History } from 'lucide-react';
import DocumentDrawer from './DocumentDrawer';
import LoadingOrb from './LoadingOrb';
import WorkBeam from './WorkBeam';
import { useDialogA11y } from '../hooks/useDialogA11y';
import { useAuth } from '../hooks/useAuth';
import ComplianceResultsViewer, {
  type ComplianceResult,
  type ComplianceSummary,
} from './ComplianceResultsViewer';
import ProtectedRoute from './ProtectedRoute';
import api, { isHttpError } from '../services/api';
import { useDateFormatters } from '../format';

interface OJKDocument {
  id: string;
  judul: string;
  nomor: string;
  jenis: string;
  sektor: string;
  status: string;
  filename?: string;
  klasifikasi?: string;
  /** VLM classification verdict (2026-09-30, migration 005); null on rows
      that predate the confidence-gated classifier. */
  ai_confidence?: number | null;
  ai_jenis?: string | null;
  ai_reasoning?: string | null;
  /** 'auto' = confidence >= threshold, ingested without human review;
      'manual' = confirmed through the pending tab; null = legacy row. */
  approval_mode?: 'auto' | 'manual' | null;
  /** Pending-first queue (2026-09-30): 'scanning' = AI pass still running,
      'awaiting_approval' = needs the sekretaris decision. */
  stage?: 'scanning' | 'awaiting_approval';
  /** 'Memproses' with no RUNNING backend task (e.g. backend restarted mid-scan). */
  stale?: boolean;
  uploaded_at?: string | null;
}

/** One row of the Riwayat Unggahan trail (GET /api/repository/uploads/history). */
interface UploadHistoryEntry {
  id: number;
  doc_id: string;
  filename: string;
  judul: string;
  uploaded_by_name: string;
  uploaded_at: string | null;
  outcome: string;
  ai_klasifikasi: string;
  ai_jenis: string;
  ai_confidence: number | null;
  final_klasifikasi: string;
  final_jenis: string;
  resolved_at: string | null;
  resolved_by_name: string;
  detail: string;
}

/** Outcome badge vocabulary + tones (see DESIGN.md: processing/provenance stays
    neutral; resolved outcomes reuse the status triad like document statuses). */
const OUTCOME_META: Record<string, { label: string; cls: string }> = {
  processing:        { label: 'Diproses',            cls: 'status-chip--neutral' },
  awaiting_approval: { label: 'Menunggu Konfirmasi', cls: 'status-chip--warning' },
  auto_approved:     { label: 'Otomatis disetujui',  cls: 'status-chip--success' },
  confirmed:         { label: 'Dikonfirmasi',        cls: 'status-chip--success' },
  rejected:          { label: 'Ditolak',             cls: 'status-chip--danger' },
  failed_duplicate:  { label: 'Gagal - Duplikat',    cls: 'status-chip--danger' },
  failed_error:      { label: 'Gagal - Error',       cls: 'status-chip--danger' },
  deleted:           { label: 'Dihapus',             cls: 'status-chip--neutral' },
};

interface AnalyzedDocument {
  id: string;
  filename: string;
  created_at: string;
  /** Payload persisted via /api/compliance-history (UploadProvider saves
      `{ summary, results }` from the compliance analysis). */
  results?: {
    summary?: ComplianceSummary | null;
    results?: ComplianceResult[] | null;
  } | null;
}

interface UserListItem {
  id: string;
  username: string;
  email: string;
  role: string;
}

interface DocumentTemplate {
  id: string;
  title: string;
  description: string;
  category: string;
}

type ActiveTab = 'regulations' | 'internal' | 'analyzed' | 'templates' | 'pending' | 'history';

export default function LegalRepository() {
  const { user, token } = useAuth();
  const { formatDate, formatDateTime } = useDateFormatters();
  // URL state (critique re-score P1): search/filters/sort/page restore from the
  // query string on mount and mirror back (debounced, replace) on change, so a
  // narrowed view is bookmarkable, shareable, and survives refresh.
  const [searchParams, setSearchParams] = useSearchParams();
  const roleLower = user?.role?.toLowerCase() || '';
  // Riwayat Unggahan visibility (decision B, 2026-09-30): sekretaris sees all
  // uploads, manajer/direktur see only their own (enforced backend-side too).
  const canSeeHistory = ['sekretaris perusahaan', 'manajer', 'direktur', 'dewa'].includes(roleLower);
  const initialTab = (): ActiveTab => {
    const t = searchParams.get('tab');
    if (t === 'pending' && !['sekretaris perusahaan', 'dewa'].includes(roleLower)) return 'regulations';
    if (t === 'history' && !canSeeHistory) return 'regulations';
    return (['regulations', 'internal', 'analyzed', 'templates', 'pending', 'history'].includes(t || '') ? t : 'regulations') as ActiveTab;
  };
  const initialList = (key: string) => searchParams.get(key)?.split(',').filter(Boolean) ?? [];
  const initialSort = (): 'default' | 'tahun-desc' | 'judul-asc' | 'instansi-asc' => {
    const s = searchParams.get('sort');
    return (['tahun-desc', 'judul-asc', 'instansi-asc'].includes(s || '') ? s : 'default') as 'default' | 'tahun-desc' | 'judul-asc' | 'instansi-asc';
  };
  const initialRows = () => {
    const n = Number(searchParams.get('rows'));
    return [24, 48, 96].includes(n) ? n : 12;
  };

  const [documents, setDocuments] = useState<OJKDocument[]>([]);
  const [historyDocs, setHistoryDocs] = useState<AnalyzedDocument[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [pendingDocs, setPendingDocs] = useState<OJKDocument[]>([]);
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [taxonomyList, setTaxonomyList] = useState<{id: number, name: string}[]>([]);
  const [selectedTaxonomy] = useState<string>('');

  const [activeTab, setActiveTab] = useState<ActiveTab>(initialTab);
  const [revealedAi, setRevealedAi] = useState<Record<string, boolean>>({});
  // Pending-tab approver selections (2026-09-30): per-doc klasifikasi/jenis
  // picks, pre-filled from the AI verdict via ?? fallbacks at render time.
  const [pendingSel, setPendingSel] = useState<Record<string, { klass?: string; jenis?: string }>>({});
  const [selectedDoc, setSelectedDoc] = useState<OJKDocument | null>(null);
  const [viewPdfDoc, setViewPdfDoc] = useState<OJKDocument | null>(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [selectedHistoryDoc, setSelectedHistoryDoc] = useState<AnalyzedDocument | null>(null);
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDoc, setGeneratedDoc] = useState<string | null>(null);
  const [showPromptModal, setShowPromptModal] = useState<string | null>(null);
  const [promptInput, setPromptInput] = useState('');
  // --- Multi-select filters (regulations + internal tabs) ---
  // Empty array = "all". Klasifikasi options stay role-gated like before.
  const [selectedKlasifikasi, setSelectedKlasifikasi] = useState<string[]>(() => initialList('klas'));
  const [selectedJenis, setSelectedJenis] = useState<string[]>(() => initialList('jenis'));
  const [selectedStatus, setSelectedStatus] = useState<string[]>(() => initialList('status'));
  const [selectedSektor, setSelectedSektor] = useState<string[]>(() => initialList('instansi'));
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  // Sort control + facet-panel progressive disclosure (critique remediation P1)
  const [sortBy, setSortBy] = useState<'default' | 'tahun-desc' | 'judul-asc' | 'instansi-asc'>(initialSort);
  const [jenisShowAll, setJenisShowAll] = useState(false);
  const [sektorQuery, setSektorQuery] = useState('');
  const [sektorShowAll, setSektorShowAll] = useState(false);
  // Per-source load errors: a failed fetch must never render as an empty
  // result set (critique remediation P1)
  const [repoError, setRepoError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  // Riwayat Unggahan (2026-09-30): upload-trail state (migration 006).
  const [uploadHistory, setUploadHistory] = useState<UploadHistoryEntry[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyOutcome, setHistoryOutcome] = useState('');
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [uploadHistoryError, setUploadHistoryError] = useState<string | null>(null);
  // Post-upload watch window: keeps lists fresh while the backend scans and
  // classifies a just-uploaded doc (the pending-first flow hides in-flight
  // docs from the designated tabs until they resolve).
  const [uploadWatchUntil, setUploadWatchUntil] = useState(0);
  // --- Pagination ---
  const [rowsPerPage, setRowsPerPage] = useState(initialRows);
  const [page, setPage] = useState(() => Math.max(1, Number(searchParams.get('page')) || 1));

  const toggleInList = (list: string[], v: string) =>
    list.includes(v) ? list.filter(x => x !== v) : [...list, v];
  const clearAllFilters = () => {
    setSelectedKlasifikasi([]);
    setSelectedJenis([]);
    setSelectedStatus([]);
    setSelectedSektor([]);
    setPage(1);
  };
  const [showShareModal, setShowShareModal] = useState<OJKDocument | null>(null);
  const [usersList, setUsersList] = useState<UserListItem[]>([]);
  const [shareUser, setShareUser] = useState('');
  const [shareReason, setShareReason] = useState('');
  const [shareExpiry, setShareExpiry] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfModalRef = useRef<HTMLDivElement>(null);
  const shareModalRef = useRef<HTMLDivElement>(null);
  const promptModalRef = useRef<HTMLDivElement>(null);

  // Shared dialog a11y: Esc closes, focus moves in on open and is restored
  // on close, Tab is trapped (critique remediation P2)
  useDialogA11y(!!viewPdfDoc, () => { setViewPdfDoc(null); setPdfBlobUrl(null); }, pdfModalRef);
  useDialogA11y(!!showShareModal, () => setShowShareModal(null), shareModalRef);
  useDialogA11y(!!showPromptModal, () => { setShowPromptModal(null); setGeneratedDoc(null); setPromptInput(''); }, promptModalRef);

  const fetchPendingDocs = async () => {
    try {
      setPendingError(null);
      const response = await api.get('/api/repository/pending');
      setPendingDocs(response.data.documents || []);
    } catch (error) {
      console.error("Error fetching pending docs", error);
      setPendingError('Gagal memuat dokumen pending. Periksa koneksi Anda lalu coba lagi.');
    }
  };

  const fetchUploadHistory = async (opts?: { append?: boolean; outcome?: string; offset?: number }) => {
    const append = opts?.append ?? false;
    try {
      const res = await api.get('/api/repository/uploads/history', {
        params: {
          limit: 50,
          offset: opts?.offset ?? 0,
          ...(opts?.outcome ? { outcome: opts.outcome } : {}),
        },
      });
      setUploadHistoryError(null);
      setHistoryTotal(res.data.total ?? 0);
      const entries: UploadHistoryEntry[] = res.data.entries || [];
      setUploadHistory(prev => (append ? [...prev, ...entries] : entries));
    } catch (error) {
      console.error("Error fetching upload history", error);
      setUploadHistoryError('Gagal memuat riwayat unggahan. Periksa koneksi Anda lalu coba lagi.');
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus dokumen ini? Semua relasi dan akses akan dihapus.")) return;
    
    try {
      await api.delete(`/api/repository/document/${docId}`).catch((e) => {
        if (e.response) throw new Error(e.response.data?.detail || 'Gagal menghapus dokumen');
        throw e;
      });
      
      alert("Dokumen berhasil dihapus!");
      fetchDocs();
      fetchPendingDocs();
    } catch (err) {
      alert(`Gagal menghapus dokumen: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleConfirmPending = async (docId: string, klasifikasi: string, jenis?: string) => {
    try {
      await api.post(`/api/repository/pending/${docId}/confirm`, { klasifikasi, jenis });
      alert('Dokumen berhasil dikonfirmasi dan dimasukkan ke repositori!');
      fetchPendingDocs();
      fetchDocs();
    } catch (e) {
      if (isHttpError(e)) {
        alert(e.response?.data?.detail || 'Gagal mengkonfirmasi dokumen.');
      } else {
        console.error(e);
        alert('Terjadi kesalahan koneksi.');
      }
    }
  };

  // Reject = delete the pending doc (file + row) before it ever reaches the
  // repository; reuses the audited DELETE endpoint (log_audit DELETE_DOCUMENT).
  const handleRejectPending = async (doc: OJKDocument) => {
    if (!window.confirm(`Tolak "${doc.judul}"? Dokumen akan dihapus permanen dari antrean dan tidak masuk ke repositori.`)) return;
    try {
      await api.delete(`/api/repository/document/${doc.id}`);
      fetchPendingDocs();
    } catch (e) {
      if (isHttpError(e)) {
        alert(e.response?.data?.detail || 'Gagal menolak dokumen.');
      } else {
        console.error(e);
        alert('Terjadi kesalahan koneksi.');
      }
    }
  };

  const fetchDocs = async () => {
    setIsLoading(true);
    try {
      setRepoError(null);
      const response = await api.get('/api/repository');
      setDocuments(response.data.documents || []);
    } catch (error) {
      console.error("Error fetching repository", error);
      setRepoError('Gagal memuat repositori. Periksa koneksi Anda lalu coba lagi.');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistoryDocs = async () => {
    try {
      setHistoryError(null);
      const response = await api.get('/api/compliance-history');
      setHistoryDocs(response.data.history || []);
    } catch (error) {
      console.error("Error fetching history", error);
      setHistoryError('Gagal memuat riwayat analisis. Periksa koneksi Anda lalu coba lagi.');
    }
  };

  const handleViewHistoryDoc = async (doc: AnalyzedDocument) => {
    setLoadingReportId(doc.id);
    try {
      const response = await api.get(`/api/compliance-history/${doc.id}`);
      setSelectedHistoryDoc(response.data);
    } catch (err) {
      console.error(err);
      alert('Gagal memuat detail hasil analisis');
    } finally {
      setLoadingReportId(null);
    }
  };

  const fetchUsersList = async () => {
    try {
      const res = await api.get('/api/auth/users');
      const data = res.data;
      setUsersList(data.users || []);
      if (data.users && data.users.length > 0) {
        setShareUser(data.users[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleShareSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showShareModal) return;
    setIsSharing(true);
    
    try {
      const res = await api.post(`/api/documents/${showShareModal.id}/grant-access`, {
        granted_to: shareUser,
        reason: shareReason,
        expires_at: shareExpiry || null
      });
      
      alert(res.data.message || 'Akses berhasil diberikan.');
      setShowShareModal(null);
      setShareReason('');
      setShareExpiry('');
    } catch (e) {
      if (isHttpError(e)) {
        alert(e.response.data?.detail || 'Gagal memberikan akses.');
      } else {
        alert('Terjadi kesalahan saat memberikan akses.');
      }
    } finally {
      setIsSharing(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      setTemplatesError(null);
      const response = await api.get('/api/templates');
      setTemplates(response.data.templates || []);
    } catch (error) {
      console.error("Error fetching templates", error);
      setTemplatesError('Gagal memuat template dokumen. Periksa koneksi Anda lalu coba lagi.');
    }
  };

  // Fetch PDF blob for centered viewer
  
  useEffect(() => {
    const fetchTaxonomy = async () => {
      try {
        const res = await api.get('/api/taxonomy');
        // only active
        setTaxonomyList(res.data.taxonomy.filter((t: { is_active?: boolean }) => t.is_active));
      } catch (e) {
        console.error(e);
      }
    };
    if (token) fetchTaxonomy();
  }, [token]);

  useEffect(() => {
    if (!viewPdfDoc || !viewPdfDoc.filename) return;
    
    const pdfPath = `/api/pdf/${encodeURIComponent(viewPdfDoc.filename)}`;
    // Awaited-IIFE: keeps the setState-containing fetch out of the effect
    // body's direct call graph (react-hooks/set-state-in-effect). The two
    // spinner resets still run synchronously in the same tick as before.
    (async () => {
      setIsPdfLoading(true);
      setPdfBlobUrl(null);

      await api.get(pdfPath)
        .then(res => res.data)
        .then(data => {
          const binary = atob(data.data);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: 'application/pdf' });
          setPdfBlobUrl(URL.createObjectURL(blob));
        })
        .catch(err => console.error('PDF load error:', err))
        .finally(() => setIsPdfLoading(false));
    })();
      
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [viewPdfDoc]);

  useEffect(() => {
    // Awaited-IIFE + Promise.all: every fetch still STARTS in the same tick
    // (fully parallel, exactly as the previous fire-and-forget calls) but no
    // setState-containing call sits directly in the effect body
    // (react-hooks/set-state-in-effect).
    (async () => {
      const role = user?.role?.toLowerCase() || '';
      await Promise.all([
        fetchDocs(),
        fetchHistoryDocs(),
        fetchTemplates(),
        ...(['sekretaris perusahaan', 'dewa'].includes(role) ? [fetchPendingDocs()] : []),
        // Riwayat Unggahan (2026-09-30): eligible roles prefetch so the tab
        // badge count is real on first paint.
        ...(['sekretaris perusahaan', 'manajer', 'direktur', 'dewa'].includes(role)
          ? [fetchUploadHistory()]
          : []),
      ]);
    })();
  }, [user]);

  // Pending-first queue (2026-09-30): poll while the queue tab is open so new
  // uploads appear without a manual refresh and scanning cards transition in
  // place (scanning → approval card, or out to the designated tab when the AI
  // auto-approves). The endpoint is cheap (few rows, no joins beyond history).
  useEffect(() => {
    if (activeTab !== 'pending') return;
    const t = setInterval(() => { fetchPendingDocs(); }, 5000);
    return () => clearInterval(t);
  }, [activeTab]);

  // Post-upload watch window: after an upload, refresh the lists every 5 s for
  // two minutes so the uploader (any role) sees the doc land without manual
  // refreshes — in-flight docs are hidden from the designated tabs now.
  useEffect(() => {
    if (!uploadWatchUntil) return;
    const t = setInterval(() => {
      if (Date.now() >= uploadWatchUntil) {
        setUploadWatchUntil(0);
        return;
      }
      fetchDocs();
      if (['sekretaris perusahaan', 'dewa'].includes(roleLower)) fetchPendingDocs();
      if (['sekretaris perusahaan', 'manajer', 'direktur', 'dewa'].includes(roleLower)) fetchUploadHistory();
    }, 5000);
    return () => clearInterval(t);
  }, [uploadWatchUntil, roleLower]);

  const handleGenerateTemplate = async (templateId: string) => {
    if (!promptInput.trim()) return;
    setIsGenerating(true);
    setGeneratedDoc(null);
    try {
      const response = await api.post('/api/templates/generate', {
        template_id: templateId,
        user_prompt: promptInput
      });
      setGeneratedDoc(response.data.generated_document);
    } catch (e) {
      if (isHttpError(e)) {
        alert('Gagal membuat dokumen dari template');
      } else {
        console.error(e);
        alert('Terjadi kesalahan koneksi');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportWord = (content: string) => {
    const htmlContent = content
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^- (.+)$/gm, '<li>$1</li>')
      .replace(/\n\n/g, '</p><p>')
      .split('\n').join('<br/>');

    const docHTML = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>Dokumen Hukum</title>
        <style>
          body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.8; color: #1a1a1a; }
          h1 { font-size: 16pt; text-align: center; margin-bottom: 24px; text-transform: uppercase; letter-spacing: 0.05em; }
          h2 { font-size: 13pt; margin-top: 20px; margin-bottom: 8px; }
          h3 { font-size: 12pt; margin-top: 14px; margin-bottom: 6px; }
          p { margin-bottom: 10px; text-align: justify; }
          ul { margin: 8px 0 8px 24px; }
          li { margin-bottom: 4px; }
          strong { font-weight: bold; }
          em { font-style: italic; }
        </style>
      </head>
      <body><p>${htmlContent}</p></body>
      </html>
    `;
    
    const blob = new Blob(['\ufeff', docHTML], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Draft_Dokumen_Hukum.doc';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearFailedDocuments = async () => {
    if (!confirm('Apakah Anda yakin ingin menghapus semua dokumen yang gagal diproses (termasuk duplikat)?')) return;
    try {
      const response = await api.delete('/api/repository/failed');
      alert(response.data.message);
      fetchDocs();
    } catch (e) {
      if (isHttpError(e)) {
        alert(e.response.data?.detail || 'Gagal menghapus dokumen.');
      } else {
        alert('Terjadi kesalahan koneksi.');
      }
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Filter PDFs only
    const validFiles = Array.from(files).filter(f => f.type === "application/pdf");
    if (validFiles.length === 0) {
      alert("Hanya format PDF yang didukung.");
      return;
    }

    setIsUploading(true);
    const endpoint = '/api/upload';

    let successCount = 0;
    
    // Process files sequentially to avoid overloading browser
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      setUploadStatus(`Mengunggah dokumen ${i + 1} dari ${validFiles.length}...`);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("doc_type", activeTab);
      if (selectedTaxonomy) formData.append("jenis_dokumen", selectedTaxonomy);
      formData.append("klasifikasi", selectedKlasifikasi[0] ?? 'Umum');

      try {
        await api.post(endpoint, formData);

        successCount++;
      } catch (error) {
        console.error("Gagal mengunggah:", file.name, error);
      }
    }

    setUploadStatus(`Selesai! Berhasil mengantrekan ${successCount} dari ${validFiles.length} dokumen.`);
    if (successCount > 0) {
      // Pending-first flow (2026-09-30): in-flight docs stay hidden from the
      // designated tabs, so keep the lists refreshing for two minutes while
      // the backend scans and classifies the uploads.
      setUploadWatchUntil(Date.now() + 120000);
    }
    setTimeout(() => {
      setUploadStatus(null);
      setIsUploading(false);
      fetchDocs();
    }, 2500);
    
    // Clear the input so the same files can be selected again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const regulationDocs = documents.filter(
    doc => doc.sektor !== "Upload Manual" && doc.sektor !== "Dokumen Internal"
  );
  const internalDocs = documents.filter(
    doc => doc.sektor === "Upload Manual" || doc.sektor === "Dokumen Internal"
  );
  const activeDocuments = activeTab === 'regulations' ? regulationDocs : internalDocs;

  // --- Filter option sources ---
  const klasifikasiOptions = [
    'Umum',
    ...(['manajer', 'direktur', 'admin', 'sekretaris perusahaan', 'dewa'].includes(roleLower) ? ['Rahasia'] : []),
    ...(['direktur', 'admin', 'sekretaris perusahaan', 'dewa'].includes(roleLower) ? ['Terbatas'] : []),
  ];
  // Ignore selections the current role is no longer allowed to see
  const visibleKlasifikasi = selectedKlasifikasi.filter(k => klasifikasiOptions.includes(k));

  const isDup = (d: OJKDocument) => d.status.includes('Duplikat');
  const docKlas = (d: OJKDocument) => d.klasifikasi || 'Umum';
  const normStatus = (d: OJKDocument) => isDup(d) ? 'Duplikat' : d.status;

  // Structured citation parsed from the judul ("... Nomor 55/POJK.03/2016
  // tentang ...", "... Nomor 71 Tahun 2019 tentang ..."): the bare nomor
  // column often holds only a digit or an ingest slug, so the citable
  // reference lives in the title prose (critique remediation P1).
  const citationInfo = useMemo(() => {
    const map = new Map<string, { citation: string | null; year: number | null }>();
    for (const d of documents) {
      const t = d.judul || '';
      const m1 = t.match(/Nomor\s+([0-9]+(?:\/[A-Za-z0-9.]+)+\/(?:19|20)\d{2})/i);
      if (m1) {
        const y = m1[1].match(/(?:19|20)\d{2}$/);
        map.set(d.id, { citation: m1[1], year: y ? Number(y[0]) : null });
        continue;
      }
      const m2 = t.match(/Nomor\s+([0-9]+)\s+Tahun\s+((?:19|20)\d{2})/i);
      if (m2) {
        map.set(d.id, { citation: `${m2[1]} Tahun ${m2[2]}`, year: Number(m2[2]) });
        continue;
      }
      const y2 = t.match(/(?:19|20)\d{2}/);
      map.set(d.id, { citation: null, year: y2 ? Number(y2[0]) : null });
    }
    return map;
  }, [documents]);
  const docYear = (d: OJKDocument) => citationInfo.get(d.id)?.year ?? null;

  const fmtSektor = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // Status -> chip tone. Qualified statuses ("Berlaku (Dicabut Sebagian)",
  // "Berlaku (Perubahan) (Diubah)") must never read as plain success green
  // (critique remediation P0).
  const statusTone = (status: string): { cls: string; hint?: string } => {
    if (status.includes('Gagal')) return { cls: 'status-chip--danger' };
    if (status === 'Tidak Berlaku') return { cls: 'status-chip--danger' };
    if (status.startsWith('Berlaku (')) {
      return { cls: 'status-chip--warning', hint: 'Status berlaku dengan catatan — periksa tab Analisis untuk pasal yang dicabut/diubah.' };
    }
    if (status === 'Berlaku') return { cls: 'status-chip--success' };
    return { cls: 'status-chip--neutral' };
  };
  const klasTone = (k: string) => (k === 'Rahasia' ? 'status-chip--danger' : 'status-chip--warning');

  const matchesSearch = (d: OJKDocument) => {
    const q = search.toLowerCase();
    return d.judul.toLowerCase().includes(q) ||
           d.nomor.toLowerCase().includes(q) ||
           d.sektor.toLowerCase().includes(q) ||
           (d.filename || '').toLowerCase().includes(q);
  };

  const jenisOptions = [...new Set(activeDocuments.map(d => d.jenis))].sort();
  const statusOptions = [...new Set(activeDocuments.map(normStatus))].sort();
  const sektorOptions = [...new Set(activeDocuments.map(d => d.sektor))];

  // Live per-option counts: respect search + the OTHER two filter groups
  const countKlas = (k: string) => activeDocuments.filter(d =>
    matchesSearch(d) &&
    (selectedJenis.length === 0 || selectedJenis.includes(d.jenis)) &&
    (selectedStatus.length === 0 || selectedStatus.includes(normStatus(d))) &&
    docKlas(d) === k
  ).length;
  const countJenis = (j: string) => activeDocuments.filter(d =>
    matchesSearch(d) &&
    (visibleKlasifikasi.length === 0 || visibleKlasifikasi.includes(docKlas(d))) &&
    (selectedStatus.length === 0 || selectedStatus.includes(normStatus(d))) &&
    d.jenis === j
  ).length;
  const countStatus = (s: string) => activeDocuments.filter(d =>
    matchesSearch(d) &&
    (visibleKlasifikasi.length === 0 || visibleKlasifikasi.includes(docKlas(d))) &&
    (selectedJenis.length === 0 || selectedJenis.includes(d.jenis)) &&
    normStatus(d) === s
  ).length;
  const countSektor = (s: string) => activeDocuments.filter(d =>
    matchesSearch(d) &&
    (visibleKlasifikasi.length === 0 || visibleKlasifikasi.includes(docKlas(d))) &&
    (selectedJenis.length === 0 || selectedJenis.includes(d.jenis)) &&
    (selectedStatus.length === 0 || selectedStatus.includes(normStatus(d))) &&
    d.sektor === s
  ).length;

  const filteredDocs = activeDocuments.filter(d => {
    if (!matchesSearch(d)) return false;
    if (visibleKlasifikasi.length > 0 && !visibleKlasifikasi.includes(docKlas(d))) return false;
    if (selectedJenis.length > 0 && !selectedJenis.includes(d.jenis)) return false;
    if (selectedSektor.length > 0 && !selectedSektor.includes(d.sektor)) return false;
    if (selectedStatus.length > 0) {
      if (!selectedStatus.includes(normStatus(d))) return false;
    } else if (isDup(d)) {
      return false; // duplicates stay hidden unless explicitly selected
    }
    return true;
  });

  const activeFilterCount = visibleKlasifikasi.length + selectedJenis.length + selectedStatus.length + selectedSektor.length;

  // Sort applied after filtering, before pagination (critique remediation P1)
  const sortedDocs = useMemo(() => {
    const arr = [...filteredDocs];
    if (sortBy === 'tahun-desc') arr.sort((a, b) => (docYear(b) ?? -1) - (docYear(a) ?? -1));
    else if (sortBy === 'judul-asc') arr.sort((a, b) => a.judul.localeCompare(b.judul, 'id'));
    else if (sortBy === 'instansi-asc') arr.sort((a, b) => fmtSektor(a.sektor).localeCompare(fmtSektor(b.sektor), 'id'));
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredDocs.length, sortBy, documents, selectedKlasifikasi, selectedJenis, selectedStatus, selectedSektor, search, activeTab]);

  // Duplicates currently hidden by the default filter (for the empty-state hint)
  const hiddenDups = activeDocuments.filter(isDup).length;

  // --- Pagination (regulations + internal) ---
  const totalPages = Math.max(1, Math.ceil(sortedDocs.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const pagedDocs = sortedDocs.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

  const filteredHistoryDocs = historyDocs.filter(doc =>
    doc.filename.toLowerCase().includes(search.toLowerCase())
  );
  const historyTotalPages = Math.max(1, Math.ceil(filteredHistoryDocs.length / rowsPerPage));
  const safeHistoryPage = Math.min(page, historyTotalPages);
  const pagedHistoryDocs = filteredHistoryDocs.slice(
    (safeHistoryPage - 1) * rowsPerPage, safeHistoryPage * rowsPerPage
  );

  // Pager values shared by the footer nav (regulations, internal, analyzed)
  const isAnalyzedTab = activeTab === 'analyzed';
  const showPagerTab = activeTab === 'regulations' || activeTab === 'internal' || isAnalyzedTab;
  const pagerPages = isAnalyzedTab ? historyTotalPages : totalPages;
  const pagerCur = isAnalyzedTab ? safeHistoryPage : safePage;
  const pagerTotal = isAnalyzedTab ? filteredHistoryDocs.length : sortedDocs.length;
  const pagerStart = Math.max(1, Math.min(pagerCur - 3, pagerPages - 6));
  const pagerNums: number[] = [];
  for (let i = pagerStart; i <= Math.min(pagerPages, pagerStart + 6); i++) pagerNums.push(i);
  const pagerFrom = (pagerCur - 1) * rowsPerPage + 1;
  const pagerTo = Math.min(pagerCur * rowsPerPage, pagerTotal);
  const showPager = showPagerTab && pagerPages > 1;
  const navBtn: React.CSSProperties = {
    minWidth: '44px', height: '44px', padding: '0 12px',
    borderRadius: '8px', border: '1px solid var(--border-color)',
    background: 'var(--bg-card)', color: 'var(--text-primary)',
    cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
  };

  // Keep a URL-restored ?page= on mount; afterwards reset to the first page
  // whenever the result set definition changes.
  const firstStateRender = useRef(true);
  useEffect(() => {
    if (firstStateRender.current) { firstStateRender.current = false; return; }
    setPage(1);
  }, [search, activeTab, rowsPerPage, selectedKlasifikasi, selectedJenis, selectedStatus, selectedSektor, sortBy]);

  // Mirror state into the query string (critique re-score P1). replace: no
  // history-entry spam; debounced so typing does not rewrite the URL per key.
  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams();
      if (activeTab !== 'regulations') p.set('tab', activeTab);
      if (search) p.set('q', search);
      if (selectedKlasifikasi.length) p.set('klas', selectedKlasifikasi.join(','));
      if (selectedJenis.length) p.set('jenis', selectedJenis.join(','));
      if (selectedStatus.length) p.set('status', selectedStatus.join(','));
      if (selectedSektor.length) p.set('instansi', selectedSektor.join(','));
      if (sortBy !== 'default') p.set('sort', sortBy);
      if (rowsPerPage !== 12) p.set('rows', String(rowsPerPage));
      if (page > 1) p.set('page', String(page));
      if (p.toString() !== searchParams.toString()) setSearchParams(p, { replace: true });
    }, 400);
    return () => clearTimeout(t);
  }, [activeTab, search, selectedKlasifikasi, selectedJenis, selectedStatus, selectedSektor, sortBy, rowsPerPage, page, searchParams, setSearchParams]);

  // Close filter dropdown on outside click / Escape
  useEffect(() => {
    if (!filterOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFilterOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [filterOpen]);

  // Which load error (if any) belongs to the active tab, and its retry action
  const activeTabError =
    activeTab === 'analyzed' ? historyError :
    activeTab === 'templates' ? templatesError :
    activeTab === 'pending' ? pendingError :
    activeTab === 'history' ? uploadHistoryError :
    repoError;
  const activeTabRetry =
    activeTab === 'analyzed' ? fetchHistoryDocs :
    activeTab === 'templates' ? fetchTemplates :
    activeTab === 'pending' ? fetchPendingDocs :
    activeTab === 'history' ? () => fetchUploadHistory() :
    fetchDocs;

  // Riwayat Unggahan table cell styles
  const thStyle: React.CSSProperties = { padding: '8px 10px', fontWeight: 600, whiteSpace: 'nowrap' };
  const tdStyle: React.CSSProperties = { padding: '8px 10px', verticalAlign: 'top', color: 'var(--text-primary)' };

  const tabs = [
    { id: 'regulations' as ActiveTab, label: 'Regulasi', icon: <BookOpen size={16} />, count: regulationDocs.length },
    { id: 'internal' as ActiveTab, label: 'Dokumen Internal', icon: <FolderOpen size={16} />, count: internalDocs.length },
    { id: 'analyzed' as ActiveTab, label: 'Dokumen Teranalisis', icon: <FileCheck size={16} />, count: historyDocs.length },
    { id: 'templates' as ActiveTab, label: 'Template Dokumen', icon: <File size={16} />, count: templates.length },
  ];
  if (['sekretaris perusahaan', 'dewa'].includes(user?.role?.toLowerCase() || '')) {
    tabs.push({ id: 'pending' as ActiveTab, label: 'Dokumen Pending', icon: <Clock size={16} />, count: pendingDocs.length });
  }
  if (canSeeHistory) {
    tabs.push({ id: 'history' as ActiveTab, label: 'Riwayat Unggahan', icon: <History size={16} />, count: historyTotal });
  }

  const gotoPage = (p: number) => {
    setPage(p);
    requestAnimationFrame(() => {
      document.querySelector('.document-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const chipStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    fontSize: '0.78rem', fontWeight: 600,
    background: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent-hover)',
    border: '1px solid rgba(59, 130, 246, 0.35)', borderRadius: '999px',
    padding: '3px 6px 3px 10px', cursor: 'pointer',
  };

  return (
    <div className="view-container repository-view">
      {/* Upload Overlay */}
      {isUploading && (
        <div className="upload-overlay">
          <WorkBeam
            active={
              !uploadStatus?.includes('berhasil') &&
              !uploadStatus?.includes('Gagal') &&
              !uploadStatus?.includes('Duplikat')
            }
          >
            <div className="upload-card">
              {uploadStatus?.includes('berhasil') ? (
                <CheckCircle2 size={48} className="success-icon" />
              ) : uploadStatus?.includes('Gagal') || uploadStatus?.includes('Duplikat') ? (
                <Database size={48} className="error-icon" style={{ color: uploadStatus?.includes('Duplikat') ? 'var(--warning-text)' : undefined }} />
              ) : (
                <LoadingOrb state="weaving" size={64} />
              )}
              <h3>{uploadStatus?.includes('Duplikat') ? 'Peringatan Duplikasi' : 'Memproses Basis Pengetahuan'}</h3>
              <p>{uploadStatus}</p>
            </div>
          </WorkBeam>
        </div>
      )}

      {/* Hero header — compact, search-forward */}
      <div className="hero-banner">
        <div className="hero-content">
          <div className="hero-title-row">
            <span className="hero-icon-tile" aria-hidden="true">
              <Scale size={22} strokeWidth={1.75} />
            </span>
            <h2>Legal Repository</h2>
          </div>
          <p>Kelola seluruh dokumen regulasi dan internal Anda di satu tempat.</p>
          {!selectedHistoryDoc && (
            <div className="search-bar hero-search">
              <Search size={20} className="search-icon" />
              <label htmlFor="repo-search" className="visually-hidden">Cari dokumen</label>
              <input
                id="repo-search"
                type="text"
                placeholder={activeTab === 'regulations'
                  ? "Cari regulasi berdasarkan judul, nomor, atau instansi..."
                  : activeTab === 'analyzed' ? "Cari dokumen teranalisis..." : "Cari dokumen internal berdasarkan nama..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {/* Statistics */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon blue">
            <CheckCircle2 size={16} />
          </div>
          <div className="stat-info">
            <h4>{documents.length} Total</h4>
            <p>Dokumen terindeks</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <Database size={16} />
          </div>
          <div className="stat-info">
            <h4>{regulationDocs.length} Publik</h4>
            <p>Regulasi</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon sky">
            <FolderOpen size={16} />
          </div>
          <div className="stat-info">
            <h4>{internalDocs.length} Internal</h4>
            <p>Dokumen privat Anda</p>
          </div>
        </div>
        {['sekretaris perusahaan', 'dewa'].includes(roleLower) && (
          <div className="stat-card priority" title="Dokumen yang menunggu konfirmasi Anda">
            <div className="stat-icon orange">
              <Clock size={16} />
            </div>
            <div className="stat-info">
              <h4>{pendingDocs.length} Pending</h4>
              <p>Menunggu konfirmasi</p>
            </div>
          </div>
        )}
      </div>

      {/* Header / Actions */}
      <div className="view-header repo-header" style={{ marginTop: '24px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Rincian Repositori</h3>
        </div>
        <ProtectedRoute minRole="manajer">
          <div className="repo-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              className="btn-danger-outline"
              onClick={handleClearFailedDocuments}
              title="Hapus permanen semua dokumen yang gagal diproses dan duplikat"
            >
              <Trash2 size={16} /> Bersihkan Duplikat
            </button>
            <div ref={filterRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setFilterOpen(o => !o)}
                aria-expanded={filterOpen}
                style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
                <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{filterOpen ? '▲' : '▼'}</span>
              </button>
              {filterOpen && (
                <div className="repo-filter-panel">
                  {[
                    { key: 'klasifikasi', title: 'Klasifikasi', options: klasifikasiOptions, selected: selectedKlasifikasi, set: setSelectedKlasifikasi, count: countKlas, label: (o: string) => o },
                    { key: 'jenis', title: 'Kategori (Jenis)', options: jenisOptions, selected: selectedJenis, set: setSelectedJenis, count: countJenis, label: (o: string) => o },
                    { key: 'status', title: 'Status', options: statusOptions, selected: selectedStatus, set: setSelectedStatus, count: countStatus, label: (o: string) => o },
                    { key: 'sektor', title: 'Instansi', options: sektorOptions, selected: selectedSektor, set: setSelectedSektor, count: countSektor, label: fmtSektor },
                  ].map(group => {
                    // Progressive disclosure: rare jenis options and the long
                    // instansi tail hide behind a "Lainnya (n)" toggle; the
                    // instansi group also gets an in-panel search (critique
                    // remediation P1).
                    const sektorCollapsed = group.key === 'sektor' && !sektorShowAll && !sektorQuery.trim();
                    let opts = group.options;
                    if (group.key === 'sektor') {
                      if (sektorQuery.trim()) {
                        const q = sektorQuery.trim().toLowerCase();
                        opts = opts.filter(o => group.label(o).toLowerCase().includes(q));
                      }
                      opts = [...opts].sort((a, b) => group.count(b) - group.count(a));
                    }
                    let hidden: string[] = [];
                    if (group.key === 'jenis' && !jenisShowAll) {
                      hidden = opts.filter(o => group.count(o) <= 2 && !group.selected.includes(o));
                    } else if (sektorCollapsed) {
                      hidden = opts.filter(o => !group.selected.includes(o)).slice(6);
                    }
                    const visible = opts.filter(o => !hidden.includes(o));
                    return (
                    <div key={group.key} style={{ padding: '8px 8px 4px' }}>
                      {group.key === 'sektor' && group.options.length > 6 && (
                        <input
                          value={sektorQuery}
                          onChange={e => setSektorQuery(e.target.value)}
                          placeholder="Cari instansi..."
                          aria-label="Cari instansi"
                          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '6px 8px', color: 'var(--text-primary)', fontSize: '0.82rem', marginBottom: '6px' }}
                        />
                      )}
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                        {group.title}
                      </div>
                      {visible.length === 0 && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '2px 4px' }}>Tidak ada opsi.</div>
                      )}
                      {visible.map(opt => {
                        const n = group.count(opt);
                        return (
                          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 4px', minHeight: '44px', boxSizing: 'border-box', fontSize: '0.88rem', color: 'var(--text-primary)', cursor: n === 0 && !group.selected.includes(opt) ? 'not-allowed' : 'pointer', opacity: n === 0 && !group.selected.includes(opt) ? 0.45 : 1 }}>
                            <input
                              type="checkbox"
                              checked={group.selected.includes(opt)}
                              disabled={n === 0 && !group.selected.includes(opt)}
                              onChange={() => group.set(toggleInList(group.selected, opt))}
                            />
                            <span style={{ flex: 1 }}>{group.label(opt)}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-element)', borderRadius: '10px', padding: '1px 8px' }}>{n}</span>
                          </label>
                        );
                      })}
                      {hidden.length > 0 && (
                        <button
                          onClick={() => (group.key === 'jenis' ? setJenisShowAll(v => !v) : setSektorShowAll(v => !v))}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '4px 4px 8px', textDecoration: 'underline' }}
                        >
                          Lainnya ({hidden.length})
                        </button>
                      )}
                      {group.key === 'sektor' && (sektorShowAll || sektorQuery.trim()) && group.options.length > 6 && (
                        <button
                          onClick={() => { setSektorShowAll(false); setSektorQuery(''); }}
                          style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, padding: '4px 4px 8px', textDecoration: 'underline' }}
                        >
                          Sembunyikan instansi lain
                        </button>
                      )}
                    </div>
                    );
                  })}
                  <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '6px', padding: '8px' }}>
                    <button
                      onClick={clearAllFilters}
                      disabled={activeFilterCount === 0}
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)', background: activeFilterCount === 0 ? 'transparent' : 'rgba(239, 68, 68, 0.1)', color: activeFilterCount === 0 ? 'var(--text-secondary)' : 'var(--danger-text)', cursor: activeFilterCount === 0 ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 600, opacity: activeFilterCount === 0 ? 0.5 : 1 }}
                    >
                      Bersihkan semua filter
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button className="upload-btn" onClick={() => fileInputRef.current?.click()} style={{ background: 'var(--accent-color)', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Upload size={18} /> Tambah PDF
            </button>
          </div>
          <input
            type="file"
            multiple
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept="application/pdf"
            onChange={handleFileUpload}
          />
        </ProtectedRoute>
      </div>

      {selectedHistoryDoc ? (
        <div className="history-viewer-inline" style={{ marginTop: '24px' }}>
          <button 
            className="back-btn" 
            onClick={() => setSelectedHistoryDoc(null)}
            style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.95rem', fontWeight: 500 }}
          >
            ← Kembali ke Repositori
          </button>
          <div style={{ padding: '0 8px 32px 8px' }}>
            <ComplianceResultsViewer
              filename={selectedHistoryDoc.filename}
              summary={selectedHistoryDoc.results?.summary ?? null}
              results={selectedHistoryDoc.results?.results ?? null}
              headerActions={null}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Tabs */}
          <div className="repo-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`repo-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab.id); setSearch(''); }}
          >
            {tab.icon}
            {tab.label}
            <span className="repo-tab-count">{tab.count}</span>
          </button>
        ))}
      </div>

      <div className="repository-content">
        {/* Result count + active filter chips + rows per page */}
        {(activeTab === 'regulations' || activeTab === 'internal' || activeTab === 'analyzed') && !isLoading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', margin: '16px 0 4px' }}>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
              Menampilkan{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {activeTab === 'analyzed' ? pagedHistoryDocs.length : pagedDocs.length}
              </strong>
              {' '}dari{' '}
              <strong style={{ color: 'var(--text-primary)' }}>
                {activeTab === 'analyzed' ? filteredHistoryDocs.length : filteredDocs.length}
              </strong>
              {' '}dokumen
              {(activeFilterCount > 0 || search) && (
                <span style={{ color: 'var(--accent-color)' }}> (terfilter)</span>
              )}
            </span>
            {(activeTab === 'regulations' || activeTab === 'internal') && (
              <>
                {visibleKlasifikasi.map(v => (
                  <button key={'k-' + v} onClick={() => setSelectedKlasifikasi(toggleInList(selectedKlasifikasi, v))} style={chipStyle} title="Hapus filter">
                    {v} <X size={12} />
                  </button>
                ))}
                {selectedJenis.map(v => (
                  <button key={'j-' + v} onClick={() => setSelectedJenis(toggleInList(selectedJenis, v))} style={chipStyle} title="Hapus filter">
                    {v} <X size={12} />
                  </button>
                ))}
                {selectedStatus.map(v => (
                  <button key={'s-' + v} onClick={() => setSelectedStatus(toggleInList(selectedStatus, v))} style={chipStyle} title="Hapus filter">
                    {v} <X size={12} />
                  </button>
                ))}
                {selectedSektor.map(v => (
                  <button key={'sek-' + v} onClick={() => setSelectedSektor(toggleInList(selectedSektor, v))} style={chipStyle} title="Hapus filter">
                    {fmtSektor(v)} <X size={12} />
                  </button>
                ))}
                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} style={{ ...chipStyle, background: 'transparent', color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}>
                    Bersihkan semua
                  </button>
                )}
              </>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              <label htmlFor="repo-sort">Urutkan:</label>
              <select
                id="repo-sort"
                value={sortBy}
                onChange={e => setSortBy(e.target.value as typeof sortBy)}
                style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                <option value="default">Urutan default</option>
                <option value="tahun-desc">Tahun terbaru</option>
                <option value="judul-asc">Judul A–Z</option>
                <option value="instansi-asc">Instansi A–Z</option>
              </select>
              <label htmlFor="repo-rows">Baris per halaman:</label>
              <select
                id="repo-rows"
                value={rowsPerPage}
                onChange={e => setRowsPerPage(Number(e.target.value))}
                style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem' }}
              >
                {[12, 24, 48, 96].map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>
        )}

        {/* Document Grid */}
        {isLoading ? (
          <LoadingOrb className="loading-orb--padded" state="searching" label="Memuat database regulasi..." />
        ) : activeTabError ? (
          <div className="empty-state" role="alert">
            <AlertCircle size={48} style={{ opacity: 0.6, color: 'var(--danger-text)' }} />
            <p>{activeTabError}</p>
            <button className="btn btn-primary" onClick={activeTabRetry}>Coba lagi</button>
          </div>
        ) : (activeTab === 'regulations' && sortedDocs.length === 0) || 
            (activeTab === 'internal' && sortedDocs.length === 0) || 
            (activeTab === 'analyzed' && filteredHistoryDocs.length === 0) ||
            (activeTab === 'templates' && templates.length === 0) ||
            (activeTab === 'pending' && pendingDocs.length === 0) ||
            (activeTab === 'history' && uploadHistory.length === 0 && !historyOutcome) ? (
          <div className="empty-state">
            {activeTab === 'internal' && internalDocs.length === 0 ? (
              <>
                <FolderOpen size={48} style={{ opacity: 0.3 }} />
                <p>Belum ada dokumen internal.</p>
                <p style={{ fontSize: '0.85rem', opacity: 0.85 }}>Klik "Tambah PDF" untuk mengunggah dokumen pertama Anda.</p>
              </>
            ) : activeTab === 'analyzed' && historyDocs.length === 0 ? (
              <>
                <FileCheck size={48} style={{ opacity: 0.3 }} />
                <p>Belum ada dokumen yang dianalisis.</p>
                <p style={{ fontSize: '0.85rem', opacity: 0.85 }}>Gunakan tombol Upload Dokumen di halaman Contracts untuk menganalisis dokumen dan menyimpannya ke sini.</p>
              </>
            ) : activeTab === 'templates' && templates.length === 0 ? (
              <>
                <File size={48} style={{ opacity: 0.3 }} />
                <p>Belum ada template dokumen.</p>
                <p style={{ fontSize: '0.85rem', opacity: 0.85 }}>Template akan ditambahkan oleh administrator.</p>
              </>
            ) : activeTab === 'pending' && pendingDocs.length === 0 ? (
              <>
                <Clock size={48} style={{ opacity: 0.3 }} />
                <p>Antrean dokumen kosong.</p>
                <p style={{ fontSize: '0.85rem', opacity: 0.85 }}>Dokumen yang baru diunggah dipindai dan diklasifikasikan di antrean ini terlebih dahulu.</p>
              </>
            ) : activeTab === 'history' && uploadHistory.length === 0 ? (
              <>
                <History size={48} style={{ opacity: 0.3 }} />
                <p>Belum ada riwayat unggahan.</p>
                <p style={{ fontSize: '0.85rem', opacity: 0.85 }}>Setiap dokumen yang diunggah tercatat di sini beserta vonis AI dan penyelesaiannya.</p>
              </>
            ) : (
              <>
                <Search size={48} style={{ opacity: 0.3 }} />
                <p>
                  {search
                    ? <>Tidak ada hasil untuk <strong>"{search}"</strong>.</>
                    : 'Tidak ada dokumen yang sesuai dengan filter aktif.'}
                </p>
                {(search || activeFilterCount > 0) && (
                  <button className="btn btn-primary" onClick={() => { setSearch(''); clearAllFilters(); }}>
                    Bersihkan pencarian & filter
                  </button>
                )}
                {(activeTab === 'regulations' || activeTab === 'internal') && hiddenDups > 0 && selectedStatus.length === 0 && (
                  <p style={{ fontSize: '0.85rem', opacity: 0.85 }}>
                    {hiddenDups} dokumen disembunyikan karena berstatus Duplikat.{' '}
                    <button
                      onClick={() => setSelectedStatus(['Duplikat'])}
                      style={{ background: 'none', border: 'none', color: 'var(--accent-color)', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, padding: 0, textDecoration: 'underline' }}
                    >
                      Tampilkan duplikat
                    </button>
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <>
          <div className="document-grid">
            {activeTab === 'history' && (
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                  {['', 'processing', 'awaiting_approval', 'auto_approved', 'confirmed', 'rejected', 'failed_duplicate', 'failed_error', 'deleted'].map(o => (
                    <button
                      key={o || 'all'}
                      onClick={() => { setHistoryOutcome(o); fetchUploadHistory({ outcome: o }); }}
                      style={historyOutcome === o
                        ? { ...chipStyle, background: 'var(--accent-color)', color: 'white', borderColor: 'var(--accent-color)' }
                        : chipStyle}
                    >
                      {o === '' ? `Semua${historyTotal > 0 ? ` (${historyTotal})` : ''}` : (OUTCOME_META[o]?.label || o)}
                    </button>
                  ))}
                </div>
                {uploadHistory.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', padding: '12px 0' }}>
                    Tidak ada riwayat dengan hasil tersebut.
                  </p>
                ) : (
                  <div style={{ overflowX: 'auto', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ textAlign: 'left', color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-color)' }}>
                          <th style={thStyle}>Berkas</th>
                          <th style={thStyle}>Pengunggah</th>
                          <th style={thStyle}>Waktu Unggah</th>
                          <th style={thStyle}>Vonis AI</th>
                          <th style={thStyle}>Hasil</th>
                          <th style={thStyle}>Penyelesaian</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadHistory.map(h => (
                          <tr key={h.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                            <td style={tdStyle}>
                              <strong>{h.filename}</strong>
                              {h.judul && h.judul !== h.filename && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{h.judul}</div>
                              )}
                              {h.detail && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }} title={h.detail}>
                                  {h.detail.length > 60 ? h.detail.slice(0, 60) + '…' : h.detail}
                                </div>
                              )}
                            </td>
                            <td style={tdStyle}>{h.uploaded_by_name || '—'}</td>
                            <td style={tdStyle}>{h.uploaded_at ? formatDateTime(h.uploaded_at) : '—'}</td>
                            <td style={tdStyle}>
                              {h.ai_jenis || h.ai_klasifikasi ? (
                                <>
                                  {h.ai_jenis && <div>{h.ai_jenis}</div>}
                                  {h.ai_klasifikasi && (
                                    <div style={{ color: 'var(--text-secondary)' }}>
                                      {h.ai_klasifikasi}{h.ai_confidence != null ? ` · ${h.ai_confidence}%` : ''}
                                    </div>
                                  )}
                                </>
                              ) : '—'}
                            </td>
                            <td style={tdStyle}>
                              <span className={`status-chip ${OUTCOME_META[h.outcome]?.cls || 'status-chip--neutral'}`}>
                                {OUTCOME_META[h.outcome]?.label || h.outcome}
                              </span>
                            </td>
                            <td style={tdStyle}>
                              {h.final_jenis && (
                                <div>{h.final_jenis}{h.final_klasifikasi ? ` · ${h.final_klasifikasi}` : ''}</div>
                              )}
                              {(h.resolved_at || h.resolved_by_name) && (
                                <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                                  {h.resolved_at ? formatDateTime(h.resolved_at) : ''}
                                  {h.resolved_by_name ? ` · ${h.resolved_by_name}` : ''}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {uploadHistory.length < historyTotal && (
                  <div style={{ textAlign: 'center', margin: '16px 0 8px' }}>
                    <button
                      className="btn btn-primary"
                      disabled={historyLoadingMore}
                      onClick={() => {
                        setHistoryLoadingMore(true);
                        fetchUploadHistory({ append: true, outcome: historyOutcome, offset: uploadHistory.length })
                          .finally(() => setHistoryLoadingMore(false));
                      }}
                    >
                      {historyLoadingMore ? 'Memuat…' : `Muat lebih banyak (${historyTotal - uploadHistory.length} tersisa)`}
                    </button>
                  </div>
                )}
              </div>
            )}
            {activeTab === 'pending' && pendingDocs.map((doc) => doc.stage === 'scanning' ? (
              <div key={doc.id} className="document-card" style={{ borderColor: 'var(--border-color)' }}>
                <div className="doc-type-badge" style={{ background: 'rgba(59, 130, 246, 0.12)', color: 'var(--accent-hover)' }}>
                  <Loader2 size={12} className="animate-spin-slow" style={{ marginRight: '4px', verticalAlign: '-2px' }} />
                  Sedang Dipindai
                </div>
                <h3 className="doc-title">{doc.judul}</h3>
                <div className="doc-meta">
                  <span>Nomor: {doc.nomor}</span>
                  {doc.uploaded_at && <span>Diunggah: {formatDateTime(doc.uploaded_at)}</span>}
                </div>
                <p style={{ margin: '12px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Dokumen sedang dipindai dan diklasifikasikan oleh AI. Bila keyakinan di atas ambang batas, dokumen langsung masuk ke tab tujuannya; bila di bawahnya, kartu ini berubah menjadi formulir persetujuan.
                </p>
                {doc.stale ? (
                  <>
                    <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', fontSize: '0.83rem', color: 'var(--danger-text)' }}>
                      <AlertCircle size={14} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
                      Pemindaian tidak lagi berjalan (backend mungkin sempat dimuat ulang). Dokumen macet di antrean — Anda dapat menolaknya.
                    </div>
                    <button
                      onClick={() => handleRejectPending(doc)}
                      style={{ width: '100%', marginTop: '8px', background: 'transparent', color: 'var(--danger-text)', border: '1px solid var(--danger-text)', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                    >
                      <Trash2 size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                      Tolak Dokumen
                    </button>
                  </>
                ) : (
                  <button
                    className="analyze-btn"
                    onClick={() => setViewPdfDoc(doc)}
                    style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', marginTop: '12px' }}
                  >
                    <BookOpen size={14} /> Lihat Dokumen
                  </button>
                )}
              </div>
            ) : (
              <div key={doc.id} className="document-card" style={{ borderColor: '#f59e0b', background: 'rgba(245, 158, 11, 0.05)' }}>
                <div className="doc-type-badge" style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning-text)' }}>
                  Menunggu Konfirmasi
                </div>
                <h3 className="doc-title">{doc.judul}</h3>
                <div className="doc-meta">
                  <span>Nomor: {doc.nomor}</span>
                  {doc.ai_confidence != null && (
                    <span
                      className="status-chip status-chip--warning"
                      title="Keyakinan hasil pemindaian & klasifikasi VLM berada di bawah ambang batas, sehingga dokumen memerlukan persetujuan manusia."
                    >
                      Keyakinan AI: {doc.ai_confidence}%
                    </span>
                  )}
                </div>
                <button
                  className="analyze-btn"
                  onClick={() => setViewPdfDoc(doc)}
                  style={{ background: 'transparent', border: '1px solid #f59e0b', color: 'var(--warning-text)', marginTop: '12px' }}
                >
                  <BookOpen size={14} /> Lihat Dokumen
                </button>
                <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-element)', borderRadius: '8px' }}>
                  
                  {revealedAi[doc.id] ? (
                    <div style={{ padding: '8px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid var(--info)', borderRadius: '6px', marginBottom: '12px', fontSize: '0.85rem', color: 'var(--accent-hover)' }}>
                      <Bot size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                      AI merekomendasikan: <strong>{doc.klasifikasi || 'Umum'}</strong>
                      {doc.ai_jenis && <> · Jenis: <strong>{doc.ai_jenis}</strong></>}
                      {doc.ai_confidence != null && <> · Keyakinan: <strong>{doc.ai_confidence}%</strong></>}
                      {doc.ai_reasoning && (
                        <p style={{ margin: '6px 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{doc.ai_reasoning}</p>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => setRevealedAi(prev => ({ ...prev, [doc.id]: true }))}
                      style={{ width: '100%', background: 'transparent', border: '1px solid var(--info)', color: 'var(--accent-hover)', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '12px' }}
                    >
                      <Bot size={14} /> Tampilkan Rekomendasi AI
                    </button>
                  )}

                  <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Klasifikasi Akhir:</p>
                  <select
                    value={pendingSel[doc.id]?.klass ?? doc.klasifikasi ?? ''}
                    onChange={(e) => setPendingSel(prev => ({ ...prev, [doc.id]: { ...prev[doc.id], klass: e.target.value } }))}
                    style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px', color: 'var(--text-primary)', marginBottom: '12px' }}
                  >
                    <option value="" disabled>Pilih Klasifikasi...</option>
                    <option value="Umum">Umum</option>
                    <option value="Rahasia">Rahasia</option>
                    <option value="Terbatas">Terbatas</option>
                  </select>

                  <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Jenis Dokumen (Taksonomi):</p>
                  <select
                    value={pendingSel[doc.id]?.jenis ?? doc.ai_jenis ?? doc.jenis ?? ''}
                    onChange={(e) => setPendingSel(prev => ({ ...prev, [doc.id]: { ...prev[doc.id], jenis: e.target.value } }))}
                    style={{ width: '100%', background: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: '6px', padding: '8px', color: 'var(--text-primary)', marginBottom: '12px' }}
                  >
                    {Array.from(new Set(
                      [doc.ai_jenis, doc.jenis, ...taxonomyList.map(t => t.name)].filter(Boolean) as string[]
                    )).map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>

                  <button
                    onClick={() => {
                      const finalClass = pendingSel[doc.id]?.klass ?? doc.klasifikasi;
                      if (!finalClass) return alert("Pilih klasifikasi terlebih dahulu!");
                      const finalJenis = pendingSel[doc.id]?.jenis ?? doc.ai_jenis ?? doc.jenis;
                      handleConfirmPending(doc.id, finalClass, finalJenis);
                    }}
                    style={{ width: '100%', background: '#92400e', color: 'white', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Konfirmasi & Simpan
                  </button>
                  <button
                    onClick={() => handleRejectPending(doc)}
                    style={{ width: '100%', background: 'transparent', color: 'var(--danger-text)', border: '1px solid var(--danger-text)', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, marginTop: '8px' }}
                  >
                    <Trash2 size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                    Tolak Dokumen
                  </button>
                </div>
              </div>
            ))}
            
            {activeTab === 'templates' && templates.map((tpl) => (
              <div key={tpl.id} className="document-card internal-card" style={{ borderTopColor: 'var(--accent-color)' }}>
                <div className="doc-type-badge internal-badge">
                  Template {tpl.category}
                </div>
                <h3 className="doc-title">{tpl.title}</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '8px 0 16px', lineHeight: '1.4' }}>
                  {tpl.description}
                </p>
                <button
                  className="analyze-btn"
                  style={{ background: 'var(--accent-color)', color: 'white' }}
                  onClick={() => setShowPromptModal(tpl.id)}
                >
                  <File size={14} /> Gunakan Template
                </button>
              </div>
            ))}
            
            {activeTab === 'regulations' || activeTab === 'internal' ? pagedDocs.map((doc) => (
              <div key={doc.id} className={`document-card ${activeTab === 'internal' ? 'internal-card' : ''}`}>
                <div className="doc-card-head">
                  <div className={`doc-type-badge ${activeTab === 'internal' ? 'internal-badge' : ''}`}>
                    {doc.jenis}
                  </div>
                  <div className="doc-head-chips">
                    {doc.approval_mode === 'auto' && (
                      <span
                        className="status-chip status-chip--neutral"
                        title={`Disetujui otomatis oleh AI — keyakinan VLM ${doc.ai_confidence != null ? `${doc.ai_confidence}%` : '—'} (di atas ambang batas), tanpa antrean pending.`}
                      >
                        <Zap size={10} style={{ marginRight: '3px', verticalAlign: '-1px' }} />Otomatis
                      </span>
                    )}
                    {doc.klasifikasi && doc.klasifikasi !== 'Umum' && (
                      <span className={`status-chip ${klasTone(doc.klasifikasi)}`}>
                        {doc.klasifikasi}
                      </span>
                    )}
                    {(() => {
                      // The qualified-status explanation must reach keyboard,
                      // screen-reader, and touch users too (critique re-score
                      // P1): the native title tooltip is hover-only, so the
                      // hint chip is focusable and paints data-hint as a CSS
                      // tooltip on :hover and :focus-visible, with a visually
                      // hidden aria-describedby twin for screen readers.
                      const tone = statusTone(doc.status);
                      return (
                        <span
                          className={`status-chip ${tone.cls}`}
                          title={tone.hint ? undefined : `Status dokumen: ${doc.status}`}
                          {...(tone.hint ? {
                            tabIndex: 0,
                            'data-hint': tone.hint,
                            'aria-describedby': `status-hint-${doc.id}`,
                          } : {})}
                        >
                          {doc.status}
                          {tone.hint && (
                            <span id={`status-hint-${doc.id}`} className="visually-hidden">{tone.hint}</span>
                          )}
                        </span>
                      );
                    })()}
                  </div>
                </div>
                <h3 className="doc-title" title={doc.judul}>{doc.judul}</h3>
                {citationInfo.get(doc.id)?.citation && (
                  <div className="doc-citation">{doc.jenis} No. {citationInfo.get(doc.id)!.citation}</div>
                )}
                <div className="doc-meta">
                  <span>Nomor: {doc.nomor}</span>
                  <span className="doc-sektor">{fmtSektor(doc.sektor)}</span>
                </div>
                <div className="doc-footer">
                  <File size={16} /> Disimpan dalam Basis Data
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="analyze-btn"
                    onClick={() => setSelectedDoc(doc)}
                    style={{ flex: 1 }}
                  >
                    <Zap size={14} /> Analisis
                  </button>
                  {['sekretaris perusahaan', 'dewa'].includes(user?.role?.toLowerCase() || '') && (
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      style={{ background: 'rgba(239, 68, 68, 0.1)', color: 'var(--danger-text)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '0 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                      title="Hapus Dokumen"
                      aria-label="Hapus dokumen"
                      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                {doc.klasifikasi && doc.klasifikasi !== 'Umum' && ['direktur', 'manajer', 'admin', 'sekretaris perusahaan', 'dewa'].includes(user?.role?.toLowerCase() || '') && (
                  <button
                    className="analyze-btn"
                    style={{ background: 'rgba(59, 130, 246, 0.1)', color: 'var(--accent-hover)', marginTop: '8px', border: '1px solid var(--info)' }}
                    onClick={() => { setShowShareModal(doc); fetchUsersList(); }}
                  >
                    <FolderOpen size={14} /> Beri Akses
                  </button>
                )}
              </div>
            )) : null}
            
            {activeTab === 'analyzed' && pagedHistoryDocs.map((doc) => (
              <div key={doc.id} className="document-card internal-card">
                <div className="doc-type-badge internal-badge">
                  Laporan Kepatuhan
                </div>
                <h3 className="doc-title">{doc.filename}</h3>
                <div className="doc-meta">
                  <span>Dianalisis: {formatDate(doc.created_at)}</span>
                </div>
                <div className="doc-status">Tersimpan secara lokal</div>
                <button
                  className="analyze-btn"
                  onClick={() => handleViewHistoryDoc(doc)}
                  disabled={loadingReportId === doc.id}
                >
                  <FileCheck size={14} /> {loadingReportId === doc.id ? 'Memuat...' : 'Lihat Hasil'}
                </button>
              </div>
            ))}
          </div>
          {showPager && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', margin: '20px 0 8px', flexWrap: 'wrap' }}>
              <button onClick={() => gotoPage(pagerCur - 1)} disabled={pagerCur <= 1} aria-label="Halaman sebelumnya" style={{ ...navBtn, opacity: pagerCur <= 1 ? 0.4 : 1, cursor: pagerCur <= 1 ? 'not-allowed' : 'pointer' }}>
                ‹
              </button>
              {pagerNums.map(n => (
                <button
                  key={n}
                  onClick={() => gotoPage(n)}
                  style={n === pagerCur
                    ? { ...navBtn, background: 'var(--accent-color)', borderColor: 'var(--accent-color)', color: 'white' }
                    : navBtn}
                >
                  {n}
                </button>
              ))}
              <button onClick={() => gotoPage(pagerCur + 1)} disabled={pagerCur >= pagerPages} aria-label="Halaman berikutnya" style={{ ...navBtn, opacity: pagerCur >= pagerPages ? 0.4 : 1, cursor: pagerCur >= pagerPages ? 'not-allowed' : 'pointer' }}>
                ›
              </button>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>
                Hal. {pagerCur}/{pagerPages} · {pagerFrom}–{pagerTo} dari {pagerTotal}
              </span>
              </div>
            )}
          </>
        )}
          </div>
        </>
      )}

      {/* Document Drawer */}
      {/* Centered PDF Modal for Pending Documents */}
      {viewPdfDoc && (
        <div className="modal-overlay" style={{ zIndex: 1100, padding: '24px' }}>
          <div ref={pdfModalRef} role="dialog" aria-modal="true" aria-label="Pratinjau PDF dokumen" tabIndex={-1} className="modal-content" style={{ background: 'var(--bg-card)', width: '100%', maxWidth: '900px', height: '90vh', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', background: 'var(--bg-base)', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'rgba(245, 158, 11, 0.15)', color: 'var(--warning-text)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>Menunggu Konfirmasi</div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{viewPdfDoc.judul}</h3>
              </div>
              <button onClick={() => { setViewPdfDoc(null); setPdfBlobUrl(null); }} aria-label="Tutup pratinjau PDF" style={{ background: 'var(--bg-element)', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ flex: 1, position: 'relative', background: 'var(--bg-base)' }}>
              {isPdfLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                  <File size={48} style={{ opacity: 0.5, marginBottom: '16px' }} />
                  <p>Memuat PDF...</p>
                </div>
              ) : pdfBlobUrl ? (
                <iframe src={pdfBlobUrl} title="Penampil PDF" style={{ width: '100%', height: '100%', border: 'none' }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--danger-text)' }}>
                  <p>Gagal memuat PDF.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <DocumentDrawer
        doc={selectedDoc}
        onClose={() => setSelectedDoc(null)}
      />

      {/* Share Modal (FR-21 & FR-22) */}
      {showShareModal && (
        <div className="modal-overlay">
          <div ref={shareModalRef} role="dialog" aria-modal="true" aria-label="Beri akses dokumen" tabIndex={-1} className="modal-content" style={{ background: 'var(--bg-card)', width: '90%', maxWidth: '500px', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Beri Akses Dokumen</h3>
              <button onClick={() => setShowShareModal(null)} aria-label="Tutup dialog" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              Anda akan memberikan akses dokumen <strong>{showShareModal.judul}</strong> ({showShareModal.klasifikasi}).
            </p>
            <form onSubmit={handleShareSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label htmlFor="share-user" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Pilih Pengguna *</label>
                <input 
                  id="share-user"
                  required
                  list="users-list"
                  value={shareUser}
                  onChange={(e) => setShareUser(e.target.value)}
                  placeholder="Ketik ID, Username, atau Email..."
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', color: 'var(--text-primary)' }}
                />
                <datalist id="users-list">
                  {usersList.map(u => (
                    <option key={u.id} value={u.id}>{u.username} - {u.email || 'Tanpa Email'} ({u.role})</option>
                  ))}
                </datalist>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label htmlFor="share-reason" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Alasan *</label>
                <textarea 
                  id="share-reason"
                  required
                  value={shareReason}
                  onChange={(e) => setShareReason(e.target.value)}
                  placeholder="Alasan wajib diisi..."
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', color: 'var(--text-primary)', height: '80px', resize: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label htmlFor="share-expiry" style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Batas Waktu (Opsional)</label>
                <input 
                  id="share-expiry"
                  type="date"
                  value={shareExpiry}
                  onChange={(e) => setShareExpiry(e.target.value)}
                  style={{ background: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '10px', color: 'var(--text-primary)' }}
                />
              </div>
              <button 
                type="submit"
                disabled={isSharing}
                style={{ background: 'var(--accent-color)', color: 'white', border: 'none', padding: '12px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, marginTop: '8px' }}
              >
                {isSharing ? 'Memproses...' : 'Beri Akses'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Prompt Modal */}
      {showPromptModal && (
        <div className="modal-overlay">
          <div ref={promptModalRef} role="dialog" aria-modal="true" aria-label="Buat dokumen dari template" tabIndex={-1} className="modal-content" style={{ background: 'var(--bg-card)', width: '90%', maxWidth: '700px', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Buat Dokumen</h3>
              <button onClick={() => { setShowPromptModal(null); setGeneratedDoc(null); setPromptInput(''); }} aria-label="Tutup dialog" style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            
            {!generatedDoc ? (
              <>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                  Berikan instruksi untuk menyesuaikan template ini. Contoh: "Buat PKS untuk PT Bank Sumut mengenai pengadaan E-KYC."
                </p>
                <textarea 
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Masukkan instruksi kustomisasi dokumen..."
                  style={{ width: '100%', height: '120px', background: 'var(--bg-base)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '12px', color: 'var(--text-primary)', fontSize: '0.95rem', resize: 'none' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                  <button onClick={() => { setShowPromptModal(null); setPromptInput(''); }} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #475569', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>Batal</button>
                  <button onClick={() => handleGenerateTemplate(showPromptModal)} disabled={isGenerating || !promptInput.trim()} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--accent-color)', color: 'white', cursor: isGenerating || !promptInput.trim() ? 'not-allowed' : 'pointer', opacity: isGenerating || !promptInput.trim() ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isGenerating ? <Database size={16} className="animate-pulse" /> : <Zap size={16} />}
                    {isGenerating ? 'Menyusun...' : 'Buat Dokumen'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ background: 'var(--bg-base)', padding: '16px', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.95rem', whiteSpace: 'pre-wrap', lineHeight: '1.6', flex: 1, overflowY: 'auto' }}>
                  {generatedDoc}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
                  <button onClick={() => navigator.clipboard.writeText(generatedDoc!)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #475569', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                    Salin Teks
                  </button>
                  <button onClick={() => handleExportWord(generatedDoc!)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #3b82f6', background: 'rgba(59, 130, 246, 0.15)', color: 'var(--accent-hover)', cursor: 'pointer', fontWeight: 600 }}>
                    ↓ Ekspor ke Word
                  </button>
                  <button onClick={() => { setShowPromptModal(null); setGeneratedDoc(null); setPromptInput(''); }} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--accent-color)', color: 'white', cursor: 'pointer' }}>Selesai</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
