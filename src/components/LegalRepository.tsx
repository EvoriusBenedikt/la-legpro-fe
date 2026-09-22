import { useState, useEffect, useRef } from 'react';
import { Search, Database, File, Upload, CheckCircle2, BookOpen, FolderOpen, Zap, FileCheck, X, Trash2, Clock, Bot } from 'lucide-react';
import DocumentDrawer from './DocumentDrawer';
import { useAuth } from '../context/AuthContext';
import ComplianceResultsViewer from './ComplianceResultsViewer';
import ProtectedRoute from './ProtectedRoute';
import { API_BASE } from '../config';

interface OJKDocument {
  id: string;
  judul: string;
  nomor: string;
  jenis: string;
  sektor: string;
  status: string;
  filename?: string;
}

interface AnalyzedDocument {
  id: string;
  filename: string;
  created_at: string;
  results?: any;
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

type ActiveTab = 'regulations' | 'internal' | 'analyzed' | 'templates' | 'pending';

export default function LegalRepository() {
  const [documents, setDocuments] = useState<OJKDocument[]>([]);
  const [historyDocs, setHistoryDocs] = useState<AnalyzedDocument[]>([]);
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [pendingDocs, setPendingDocs] = useState<OJKDocument[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [, setTaxonomyList] = useState<{id: number, name: string}[]>([]);
  const [selectedTaxonomy] = useState<string>('');

  const [activeTab, setActiveTab] = useState<ActiveTab>('regulations');
  const [revealedAi, setRevealedAi] = useState<Record<string, boolean>>({});
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
  const [selectedKlasifikasi, setSelectedKlasifikasi] = useState<string[]>([]);
  const [selectedJenis, setSelectedJenis] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  // --- Pagination ---
  const [rowsPerPage, setRowsPerPage] = useState(12);
  const [page, setPage] = useState(1);

  const toggleInList = (list: string[], v: string) =>
    list.includes(v) ? list.filter(x => x !== v) : [...list, v];
  const clearAllFilters = () => {
    setSelectedKlasifikasi([]);
    setSelectedJenis([]);
    setSelectedStatus([]);
    setPage(1);
  };
  const [showShareModal, setShowShareModal] = useState<OJKDocument | null>(null);
  const [usersList, setUsersList] = useState<UserListItem[]>([]);
  const [shareUser, setShareUser] = useState('');
  const [shareReason, setShareReason] = useState('');
  const [shareExpiry, setShareExpiry] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user, token } = useAuth();

  const fetchPendingDocs = async () => {
    try {
      const response = await fetch(API_BASE + '/api/repository/pending', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setPendingDocs(data.documents || []);
      }
    } catch (error) {
      console.error("Error fetching pending docs", error);
    }
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!window.confirm("Apakah Anda yakin ingin menghapus dokumen ini? Semua relasi dan akses akan dihapus.")) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/repository/document/${docId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to delete document');
      }
      
      alert("Dokumen berhasil dihapus!");
      fetchDocs();
      fetchPendingDocs();
    } catch (err: any) {
      alert(`Gagal menghapus dokumen: ${err.message}`);
    }
  };

  const handleConfirmPending = async (docId: string, klasifikasi: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/repository/pending/${docId}/confirm`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ klasifikasi })
      });
      if (res.ok) {
        alert('Dokumen berhasil dikonfirmasi dan dimasukkan ke repositori!');
        fetchPendingDocs();
        fetchDocs();
      } else {
        alert('Gagal mengkonfirmasi dokumen.');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan koneksi.');
    }
  };

  const fetchDocs = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(API_BASE + '/api/repository', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error("Error fetching repository", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchHistoryDocs = async () => {
    try {
      const response = await fetch(API_BASE + '/api/compliance-history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setHistoryDocs(data.history || []);
      }
    } catch (error) {
      console.error("Error fetching history", error);
    }
  };

  const handleViewHistoryDoc = async (doc: AnalyzedDocument) => {
    setLoadingReportId(doc.id);
    try {
      const response = await fetch(`${API_BASE}/api/compliance-history/${doc.id}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setSelectedHistoryDoc(data);
      } else {
        throw new Error('Gagal memuat detail report');
      }
    } catch (err) {
      console.error(err);
      alert('Gagal memuat detail hasil analisis');
    } finally {
      setLoadingReportId(null);
    }
  };

  const fetchUsersList = async () => {
    try {
      const res = await fetch(API_BASE + '/api/auth/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data.users || []);
        if (data.users && data.users.length > 0) {
          setShareUser(data.users[0].id);
        }
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
      const res = await fetch(`${API_BASE}/api/documents/${showShareModal.id}/grant-access`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          granted_to: shareUser,
          reason: shareReason,
          expires_at: shareExpiry || null
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        alert(data.message || 'Akses berhasil diberikan.');
        setShowShareModal(null);
        setShareReason('');
        setShareExpiry('');
      } else {
        alert(data.detail || 'Gagal memberikan akses.');
      }
    } catch (e) {
      alert('Terjadi kesalahan saat memberikan akses.');
    } finally {
      setIsSharing(false);
    }
  };

  const fetchTemplates = async () => {
    try {
      const response = await fetch(API_BASE + '/api/templates', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error("Error fetching templates", error);
    }
  };

  // Fetch PDF blob for centered viewer
  
  useEffect(() => {
    const fetchTaxonomy = async () => {
      try {
        const res = await fetch(API_BASE + '/api/taxonomy', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          // only active
          setTaxonomyList(data.taxonomy.filter((t: any) => t.is_active));
        }
      } catch (e) {
        console.error(e);
      }
    };
    if (token) fetchTaxonomy();
  }, [token]);

  useEffect(() => {
    if (!viewPdfDoc || !viewPdfDoc.filename) return;
    
    const pdfUrl = `${API_BASE}/api/pdf/${encodeURIComponent(viewPdfDoc.filename)}`;
    setIsPdfLoading(true);
    setPdfBlobUrl(null);
    
    fetch(pdfUrl)
      .then(res => res.json())
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
      
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [viewPdfDoc]);

  useEffect(() => {
    fetchDocs();
    fetchHistoryDocs();
    fetchTemplates();
    if (user?.role?.toLowerCase() === 'sekretaris perusahaan') {
      fetchPendingDocs();
    }
  }, [user]);

  const handleGenerateTemplate = async (templateId: string) => {
    if (!promptInput.trim()) return;
    setIsGenerating(true);
    setGeneratedDoc(null);
    try {
      const response = await fetch(API_BASE + '/api/templates/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          template_id: templateId,
          user_prompt: promptInput
        })
      });
      if (response.ok) {
        const data = await response.json();
        setGeneratedDoc(data.generated_document);
      } else {
        alert('Gagal membuat dokumen dari template');
      }
    } catch (e) {
      console.error(e);
      alert('Terjadi kesalahan koneksi');
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
      const response = await fetch(API_BASE + '/api/repository/failed', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        fetchDocs();
      } else {
        const err = await response.json();
        alert(err.detail || 'Gagal menghapus dokumen.');
      }
    } catch (e) {
      alert('Terjadi kesalahan koneksi.');
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
    const endpoint = API_BASE + '/api/upload';

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
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        });

        if (response.ok) {
          successCount++;
        }
      } catch (error) {
        console.error("Gagal mengunggah:", file.name, error);
      }
    }

    setUploadStatus(`Selesai! Berhasil mengantrekan ${successCount} dari ${validFiles.length} dokumen.`);
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
  const roleLower = user?.role?.toLowerCase() || '';
  const klasifikasiOptions = [
    'Umum',
    ...(['manajer', 'direktur', 'admin', 'sekretaris perusahaan'].includes(roleLower) ? ['Rahasia'] : []),
    ...(['direktur', 'admin', 'sekretaris perusahaan'].includes(roleLower) ? ['Terbatas'] : []),
  ];
  // Ignore selections the current role is no longer allowed to see
  const visibleKlasifikasi = selectedKlasifikasi.filter(k => klasifikasiOptions.includes(k));

  const isDup = (d: OJKDocument) => d.status.includes('Duplikat');
  const docKlas = (d: OJKDocument) => (d as any).klasifikasi || 'Umum';
  const normStatus = (d: OJKDocument) => isDup(d) ? 'Duplikat' : d.status;

  const matchesSearch = (d: OJKDocument) => {
    const q = search.toLowerCase();
    return d.judul.toLowerCase().includes(q) ||
           d.nomor.toLowerCase().includes(q) ||
           d.sektor.toLowerCase().includes(q) ||
           (d.filename || '').toLowerCase().includes(q);
  };

  const jenisOptions = [...new Set(activeDocuments.map(d => d.jenis))].sort();
  const statusOptions = [...new Set(activeDocuments.map(normStatus))].sort();

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

  const filteredDocs = activeDocuments.filter(d => {
    if (!matchesSearch(d)) return false;
    if (visibleKlasifikasi.length > 0 && !visibleKlasifikasi.includes(docKlas(d))) return false;
    if (selectedJenis.length > 0 && !selectedJenis.includes(d.jenis)) return false;
    if (selectedStatus.length > 0) {
      if (!selectedStatus.includes(normStatus(d))) return false;
    } else if (isDup(d)) {
      return false; // duplicates stay hidden unless explicitly selected
    }
    return true;
  });

  const activeFilterCount = visibleKlasifikasi.length + selectedJenis.length + selectedStatus.length;

  // --- Pagination (regulations + internal) ---
  const totalPages = Math.max(1, Math.ceil(filteredDocs.length / rowsPerPage));
  const safePage = Math.min(page, totalPages);
  const pagedDocs = filteredDocs.slice((safePage - 1) * rowsPerPage, safePage * rowsPerPage);

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
  const pagerTotal = isAnalyzedTab ? filteredHistoryDocs.length : filteredDocs.length;
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

  // Reset to first page whenever the result set definition changes
  useEffect(() => { setPage(1); }, [search, activeTab, rowsPerPage, selectedKlasifikasi, selectedJenis, selectedStatus]);

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

  const tabs = [
    { id: 'regulations' as ActiveTab, label: 'Regulations', icon: <BookOpen size={16} />, count: regulationDocs.length },
    { id: 'internal' as ActiveTab, label: 'Internal Documents', icon: <FolderOpen size={16} />, count: internalDocs.length },
    { id: 'analyzed' as ActiveTab, label: 'Analyzed Documents', icon: <FileCheck size={16} />, count: historyDocs.length },
    { id: 'templates' as ActiveTab, label: 'Document Templates', icon: <File size={16} />, count: templates.length },
  ];
  if (user?.role?.toLowerCase() === 'sekretaris perusahaan') {
    tabs.push({ id: 'pending' as ActiveTab, label: 'Pending Documents', icon: <Clock size={16} />, count: pendingDocs.length });
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
    background: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa',
    border: '1px solid rgba(59, 130, 246, 0.35)', borderRadius: '999px',
    padding: '3px 6px 3px 10px', cursor: 'pointer',
  };

  return (
    <div className="view-container repository-view">
      {/* Upload Overlay */}
      {isUploading && (
        <div className="upload-overlay">
          <div className="upload-card">
            {uploadStatus?.includes('berhasil') ? (
              <CheckCircle2 size={48} className="success-icon" />
            ) : uploadStatus?.includes('Gagal') || uploadStatus?.includes('Duplikat') ? (
              <Database size={48} className="error-icon" style={{ color: uploadStatus?.includes('Duplikat') ? '#f59e0b' : undefined }} />
            ) : (
              <Database size={48} className="animate-pulse processing-icon" />
            )}
            <h3>{uploadStatus?.includes('Duplikat') ? 'Peringatan Duplikasi' : 'Memproses Knowledge Base'}</h3>
            <p>{uploadStatus}</p>
          </div>
        </div>
      )}

      {/* Hero Banner */}
      <div className="hero-banner">
        <div className="hero-content">
          <h2>Legal Repository <span>☆</span></h2>
          <p>Manage all your regulatory and internal documents in one place!</p>
          <div className="hero-avatars">
            <div className="add-avatar">+</div>
            <div className="avatar">U1</div>
            <div className="avatar">U2</div>
            <div className="avatar-count">+18</div>
          </div>
        </div>
        <div className="hero-graphic">
          <img src="/logoLintas-removebg-preview.png" alt="" className="hero-graphic-img" />
        </div>
      </div>

      {/* Statistics */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon pink">
            <CheckCircle2 size={16} />
          </div>
          <div className="stat-info">
            <h4>{documents.length} Total</h4>
            <p>Documents indexed</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">
            <Database size={16} />
          </div>
          <div className="stat-info">
            <h4>{regulationDocs.length} Public</h4>
            <p>Regulations</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">
            <FolderOpen size={16} />
          </div>
          <div className="stat-info">
            <h4>{internalDocs.length} Internal</h4>
            <p>Your private documents</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', width: '32px', height: '32px' }}>
            <Clock size={16} />
          </div>
          <div className="stat-info">
            <h4>{pendingDocs.length} Pending</h4>
            <p>Awaiting confirmation</p>
          </div>
        </div>
      </div>

      {/* Header / Actions */}
      <div className="view-header repo-header" style={{ marginTop: '24px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Repository Details</h3>
        </div>
        <ProtectedRoute minRole="manajer">
          <div className="repo-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button
              className="upload-btn"
              onClick={handleClearFailedDocuments} 
              style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}
              title="Hapus semua dokumen yang gagal diproses"
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
                    { title: 'Klasifikasi', options: klasifikasiOptions, selected: selectedKlasifikasi, set: setSelectedKlasifikasi, count: countKlas },
                    { title: 'Kategori (Jenis)', options: jenisOptions, selected: selectedJenis, set: setSelectedJenis, count: countJenis },
                    { title: 'Status', options: statusOptions, selected: selectedStatus, set: setSelectedStatus, count: countStatus },
                  ].map(group => (
                    <div key={group.title} style={{ padding: '8px 8px 4px' }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '6px' }}>
                        {group.title}
                      </div>
                      {group.options.length === 0 && (
                        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', padding: '2px 4px' }}>Tidak ada opsi.</div>
                      )}
                      {group.options.map(opt => {
                        const n = group.count(opt);
                        return (
                          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 4px', minHeight: '44px', boxSizing: 'border-box', fontSize: '0.88rem', color: 'var(--text-primary)', cursor: n === 0 && !group.selected.includes(opt) ? 'not-allowed' : 'pointer', opacity: n === 0 && !group.selected.includes(opt) ? 0.45 : 1 }}>
                            <input
                              type="checkbox"
                              checked={group.selected.includes(opt)}
                              disabled={n === 0 && !group.selected.includes(opt)}
                              onChange={() => group.set(toggleInList(group.selected, opt))}
                            />
                            <span style={{ flex: 1 }}>{opt}</span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-element)', borderRadius: '10px', padding: '1px 8px' }}>{n}</span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                  <div style={{ borderTop: '1px solid var(--border-color)', marginTop: '6px', padding: '8px' }}>
                    <button
                      onClick={clearAllFilters}
                      disabled={activeFilterCount === 0}
                      style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid var(--border-color)', background: activeFilterCount === 0 ? 'transparent' : 'rgba(239, 68, 68, 0.1)', color: activeFilterCount === 0 ? 'var(--text-secondary)' : '#ef4444', cursor: activeFilterCount === 0 ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 600, opacity: activeFilterCount === 0 ? 0.5 : 1 }}
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
            ← Kembali ke Repository
          </button>
          <div className="bg-slate-900 border border-slate-700 rounded-xl" style={{ padding: '0 8px 32px 8px' }}>
            <ComplianceResultsViewer
              filename={selectedHistoryDoc.filename}
              summary={selectedHistoryDoc.results?.summary}
              results={selectedHistoryDoc.results?.results}
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
        {/* Search */}
        <div className="search-bar">
          <Search size={20} className="search-icon" />
          <input
            type="text"
            placeholder={activeTab === 'regulations'
              ? "Cari regulasi berdasarkan judul, nomor, atau sektor..."
              : activeTab === 'analyzed' ? "Cari dokumen hasil analisis..." : "Cari dokumen internal berdasarkan nama..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

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
                {activeFilterCount > 0 && (
                  <button onClick={clearAllFilters} style={{ ...chipStyle, background: 'transparent', color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }}>
                    Bersihkan semua
                  </button>
                )}
              </>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
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
          <div className="loading-state">
            <Database className="animate-pulse" size={48} />
            <p>Memuat database regulasi...</p>
          </div>
        ) : (activeTab === 'regulations' && filteredDocs.length === 0) || 
            (activeTab === 'internal' && filteredDocs.length === 0) || 
            (activeTab === 'analyzed' && filteredHistoryDocs.length === 0) ||
            (activeTab === 'templates' && templates.length === 0) ? (
          <div className="empty-state">
            {activeTab === 'internal' && internalDocs.length === 0 ? (
              <>
                <FolderOpen size={48} style={{ opacity: 0.3 }} />
                <p>Belum ada dokumen internal.</p>
                <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>Klik "Tambah PDF" untuk mengunggah dokumen pertama Anda.</p>
              </>
            ) : activeTab === 'analyzed' && historyDocs.length === 0 ? (
              <>
                <FileCheck size={48} style={{ opacity: 0.3 }} />
                <p>Belum ada dokumen yang dianalisis.</p>
                <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>Gunakan Compliance Checker untuk menganalisis dokumen dan menyimpannya ke sini.</p>
              </>
            ) : activeTab === 'templates' && templates.length === 0 ? (
              <>
                <File size={48} style={{ opacity: 0.3 }} />
                <p>Belum ada template dokumen.</p>
                <p style={{ fontSize: '0.85rem', opacity: 0.6 }}>Template akan ditambahkan oleh administrator.</p>
              </>
            ) : (
              <p>Tidak ada dokumen yang sesuai dengan pencarian Anda.</p>
            )}
          </div>
        ) : (
          <>
          <div className="document-grid">
            {activeTab === 'pending' && pendingDocs.map((doc, idx) => (
              <div key={idx} className="document-card" style={{ borderColor: '#f59e0b', background: 'rgba(245, 158, 11, 0.05)' }}>
                <div className="doc-type-badge" style={{ background: '#f59e0b', color: 'white' }}>
                  Menunggu Konfirmasi
                </div>
                <h3 className="doc-title">{doc.judul}</h3>
                <div className="doc-meta">
                  <span>Nomor: {doc.nomor}</span>
                </div>
                <button
                  className="analyze-btn"
                  onClick={() => setViewPdfDoc(doc)}
                  style={{ background: 'transparent', border: '1px solid #f59e0b', color: '#f59e0b', marginTop: '12px' }}
                >
                  <BookOpen size={14} /> Lihat Dokumen
                </button>
                <div style={{ marginTop: '12px', padding: '12px', background: 'var(--bg-element)', borderRadius: '8px' }}>
                  
                  {revealedAi[doc.id] ? (
                    <div style={{ padding: '8px', background: 'rgba(59, 130, 246, 0.1)', border: '1px solid #3b82f6', borderRadius: '6px', marginBottom: '12px', fontSize: '0.85rem', color: '#60a5fa' }}>
                      <Bot size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
                      AI merekomendasikan: <strong>{(doc as any).klasifikasi || 'Umum'}</strong>
                    </div>
                  ) : (
                    <button
                      onClick={() => setRevealedAi(prev => ({ ...prev, [doc.id]: true }))}
                      style={{ width: '100%', background: 'transparent', border: '1px solid #3b82f6', color: '#3b82f6', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '12px' }}
                    >
                      <Bot size={14} /> Tampilkan Rekomendasi AI
                    </button>
                  )}

                  <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Klasifikasi Akhir:</p>
                  <select
                    defaultValue=""
                    onChange={(e) => { (doc as any).selectedKlasifikasi = e.target.value; }}
                    style={{ width: '100%', background: 'var(--bg-dark)', border: '1px solid #334155', borderRadius: '6px', padding: '8px', color: 'var(--text-primary)', marginBottom: '12px' }}
                  >
                    <option value="" disabled>Pilih Klasifikasi...</option>
                    <option value="Umum">Umum</option>
                    <option value="Rahasia">Rahasia</option>
                    <option value="Terbatas">Terbatas</option>
                  </select>
                  <button
                    onClick={() => {
                      const finalClass = (doc as any).selectedKlasifikasi;
                      if (!finalClass) return alert("Pilih klasifikasi terlebih dahulu!");
                      handleConfirmPending(doc.id, finalClass);
                    }}
                    style={{ width: '100%', background: '#f59e0b', color: 'white', border: 'none', padding: '8px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Konfirmasi & Ingest
                  </button>
                </div>
              </div>
            ))}
            
            {activeTab === 'templates' && templates.map((tpl) => (
              <div key={tpl.id} className="document-card internal-card" style={{ borderTopColor: '#a855f7' }}>
                <div className="doc-type-badge internal-badge" style={{ color: '#a855f7', background: 'rgba(168, 85, 247, 0.1)' }}>
                  {tpl.category} Template
                </div>
                <h3 className="doc-title">{tpl.title}</h3>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '8px 0 16px', lineHeight: '1.4' }}>
                  {tpl.description}
                </p>
                <button
                  className="analyze-btn"
                  style={{ background: '#a855f7', color: 'white' }}
                  onClick={() => setShowPromptModal(tpl.id)}
                >
                  <File size={14} /> Gunakan Template
                </button>
              </div>
            ))}
            
            {activeTab === 'regulations' || activeTab === 'internal' ? pagedDocs.map((doc, idx) => (
              <div key={idx} className={`document-card ${activeTab === 'internal' ? 'internal-card' : ''}`}>
                <div className={`doc-type-badge ${activeTab === 'internal' ? 'internal-badge' : ''}`}>
                  {doc.jenis}
                </div>
                <h3 className="doc-title">{doc.judul}</h3>
                <div className="doc-meta">
                  <span>Nomor: {doc.nomor}</span>
                  <span className="doc-sektor">{doc.sektor}</span>
                </div>
                <div className="doc-status" style={{ display: 'flex', gap: '8px' }}>
                  <span style={{ color: doc.status === 'Tidak Berlaku' ? '#ef4444' : undefined }}>Status: {doc.status}</span>
                  {(doc as any).klasifikasi && (doc as any).klasifikasi !== 'Umum' && (
                    <span style={{ color: (doc as any).klasifikasi === 'Rahasia' ? '#ef4444' : '#f59e0b', fontWeight: 600 }}>
                      [{(doc as any).klasifikasi}]
                    </span>
                  )}
                </div>
                <div className="doc-footer">
                  <File size={16} /> Disimpan dalam Database
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    className="analyze-btn"
                    onClick={() => setSelectedDoc(doc)}
                    style={{ flex: 1 }}
                  >
                    <Zap size={14} /> Analyze
                  </button>
                  {user?.role?.toLowerCase() === 'sekretaris perusahaan' && (
                    <button
                      onClick={() => handleDeleteDocument(doc.id)}
                      style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', padding: '0 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                      title="Hapus Dokumen"
                      onMouseOver={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'}
                      onMouseOut={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                {(doc as any).klasifikasi && (doc as any).klasifikasi !== 'Umum' && ['direktur', 'manajer', 'admin', 'sekretaris perusahaan'].includes(user?.role?.toLowerCase() || '') && (
                  <button
                    className="analyze-btn"
                    style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', marginTop: '8px', border: '1px solid #3b82f6' }}
                    onClick={() => { setShowShareModal(doc); fetchUsersList(); }}
                  >
                    <FolderOpen size={14} /> Beri Akses
                  </button>
                )}
              </div>
            )) : null}
            
            {activeTab === 'analyzed' && pagedHistoryDocs.map((doc, idx) => (
              <div key={idx} className="document-card internal-card">
                <div className="doc-type-badge internal-badge">
                  Compliance Report
                </div>
                <h3 className="doc-title">{doc.filename}</h3>
                <div className="doc-meta">
                  <span>Dianalisis: {new Date(doc.created_at).toLocaleDateString('id-ID')}</span>
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
              <button onClick={() => gotoPage(pagerCur - 1)} disabled={pagerCur <= 1} style={{ ...navBtn, opacity: pagerCur <= 1 ? 0.4 : 1, cursor: pagerCur <= 1 ? 'not-allowed' : 'pointer' }}>
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
              <button onClick={() => gotoPage(pagerCur + 1)} disabled={pagerCur >= pagerPages} style={{ ...navBtn, opacity: pagerCur >= pagerPages ? 0.4 : 1, cursor: pagerCur >= pagerPages ? 'not-allowed' : 'pointer' }}>
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
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyItems: 'center', padding: '24px', justifyContent: 'center' }}>
          <div className="modal-content" style={{ background: 'var(--bg-card)', width: '100%', maxWidth: '900px', height: '90vh', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', background: 'var(--bg-dark)', borderBottom: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: '#f59e0b', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>Menunggu Konfirmasi</div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{viewPdfDoc.judul}</h3>
              </div>
              <button onClick={() => { setViewPdfDoc(null); setPdfBlobUrl(null); }} style={{ background: 'rgba(0,0,0,0.1)', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ flex: 1, position: 'relative', background: 'var(--bg-dark)' }}>
              {isPdfLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-secondary)' }}>
                  <File size={48} style={{ opacity: 0.5, marginBottom: '16px' }} />
                  <p>Memuat PDF...</p>
                </div>
              ) : pdfBlobUrl ? (
                <iframe src={pdfBlobUrl} title="PDF Viewer" style={{ width: '100%', height: '100%', border: 'none' }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ef4444' }}>
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
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ background: 'var(--bg-card)', width: '90%', maxWidth: '500px', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Beri Akses Dokumen</h3>
              <button onClick={() => setShowShareModal(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ color: '#cbd5e1', fontSize: '0.95rem' }}>
              Anda akan memberikan akses dokumen <strong>{showShareModal.judul}</strong> ({(showShareModal as any).klasifikasi}).
            </p>
            <form onSubmit={handleShareSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Pilih Pengguna *</label>
                <input 
                  required
                  list="users-list"
                  value={shareUser}
                  onChange={(e) => setShareUser(e.target.value)}
                  placeholder="Ketik ID, Username, atau Email..."
                  style={{ background: 'var(--bg-dark)', border: '1px solid #334155', borderRadius: '8px', padding: '10px', color: 'var(--text-primary)' }}
                />
                <datalist id="users-list">
                  {usersList.map(u => (
                    <option key={u.id} value={u.id}>{u.username} - {u.email || 'Tanpa Email'} ({u.role})</option>
                  ))}
                </datalist>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Alasan *</label>
                <textarea 
                  required
                  value={shareReason}
                  onChange={(e) => setShareReason(e.target.value)}
                  placeholder="Alasan wajib diisi..."
                  style={{ background: 'var(--bg-dark)', border: '1px solid #334155', borderRadius: '8px', padding: '10px', color: 'var(--text-primary)', height: '80px', resize: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Batas Waktu (Opsional)</label>
                <input 
                  type="date"
                  value={shareExpiry}
                  onChange={(e) => setShareExpiry(e.target.value)}
                  style={{ background: 'var(--bg-dark)', border: '1px solid #334155', borderRadius: '8px', padding: '10px', color: 'var(--text-primary)', colorScheme: 'dark' }}
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
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="modal-content" style={{ background: 'var(--bg-card)', width: '90%', maxWidth: '700px', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Generate Dokumen</h3>
              <button onClick={() => { setShowPromptModal(null); setGeneratedDoc(null); setPromptInput(''); }} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            
            {!generatedDoc ? (
              <>
                <p style={{ color: '#cbd5e1', fontSize: '0.95rem' }}>
                  Berikan instruksi untuk menyesuaikan template ini. Contoh: "Buat PKS untuk PT Bank Sumut mengenai pengadaan E-KYC."
                </p>
                <textarea 
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Masukkan instruksi kustomisasi dokumen..."
                  style={{ width: '100%', height: '120px', background: 'var(--bg-dark)', border: '1px solid #334155', borderRadius: '8px', padding: '12px', color: 'var(--text-primary)', fontSize: '0.95rem', resize: 'none' }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                  <button onClick={() => { setShowPromptModal(null); setPromptInput(''); }} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #475569', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}>Batal</button>
                  <button onClick={() => handleGenerateTemplate(showPromptModal)} disabled={isGenerating || !promptInput.trim()} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#a855f7', color: 'white', cursor: isGenerating || !promptInput.trim() ? 'not-allowed' : 'pointer', opacity: isGenerating || !promptInput.trim() ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {isGenerating ? <Database size={16} className="animate-pulse" /> : <Zap size={16} />}
                    {isGenerating ? 'Menyusun...' : 'Generate Dokumen'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ background: 'var(--bg-dark)', padding: '16px', borderRadius: '8px', color: 'var(--text-primary)', fontSize: '0.95rem', whiteSpace: 'pre-wrap', lineHeight: '1.6', flex: 1, overflowY: 'auto' }}>
                  {generatedDoc}
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
                  <button onClick={() => navigator.clipboard.writeText(generatedDoc!)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #475569', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}>
                    Copy Teks
                  </button>
                  <button onClick={() => handleExportWord(generatedDoc!)} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #3b82f6', background: 'rgba(59, 130, 246, 0.15)', color: '#93c5fd', cursor: 'pointer', fontWeight: 600 }}>
                    ↓ Export to Word
                  </button>
                  <button onClick={() => { setShowPromptModal(null); setGeneratedDoc(null); setPromptInput(''); }} style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#a855f7', color: 'white', cursor: 'pointer' }}>Selesai</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
