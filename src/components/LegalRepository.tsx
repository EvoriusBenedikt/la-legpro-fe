import { useState, useEffect, useRef } from 'react';
import { Search, Database, File, Upload, CheckCircle2, BookOpen, FolderOpen, Zap, FileCheck, X, Trash2, Clock, Bot } from 'lucide-react';
import DocumentDrawer from './DocumentDrawer';
import { useAuth } from '../context/AuthContext';
import ComplianceResultsViewer from './ComplianceResultsViewer';
import ProtectedRoute from './ProtectedRoute';

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
  const [viewKlasifikasi, setViewKlasifikasi] = useState('Semua');
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
      const response = await fetch((import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev') + '/api/repository/pending', {
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
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev'}/api/repository/document/${docId}`, {
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
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev'}/api/repository/pending/${docId}/confirm`, {
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
      const response = await fetch((import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev') + '/api/repository', {
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
      const response = await fetch((import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev') + '/api/compliance-history', {
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
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev'}/api/compliance-history/${doc.id}`, {
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
      const res = await fetch((import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev') + '/api/auth/users', {
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
      const res = await fetch(`${import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev'}/api/documents/${showShareModal.id}/grant-access`, {
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
      const response = await fetch((import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev') + '/api/templates', {
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
        const res = await fetch((import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev') + '/api/taxonomy', {
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
    
    const pdfUrl = `${import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev'}/api/pdf/${encodeURIComponent(viewPdfDoc.filename)}`;
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
      const response = await fetch((import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev') + '/api/templates/generate', {
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
      const response = await fetch((import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev') + '/api/repository/failed', {
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
    const endpoint = (import.meta.env.VITE_API_URL || 'https://legal-analyzer.lintasarta.dev') + '/api/upload';

    let successCount = 0;
    
    // Process files sequentially to avoid overloading browser
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      setUploadStatus(`Mengunggah dokumen ${i + 1} dari ${validFiles.length}...`);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("doc_type", activeTab);
      if (selectedTaxonomy) formData.append("jenis_dokumen", selectedTaxonomy);
      formData.append("klasifikasi", viewKlasifikasi === 'Semua' ? 'Umum' : viewKlasifikasi);

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
  const filteredDocs = activeDocuments.filter(doc => {
    const matchesSearch = doc.judul.toLowerCase().includes(search.toLowerCase()) ||
                          doc.nomor.toLowerCase().includes(search.toLowerCase()) ||
                          doc.sektor.toLowerCase().includes(search.toLowerCase());
                          
    if (viewKlasifikasi === 'Duplikat') {
      return matchesSearch && (doc.status === 'Gagal - Duplikat' || doc.status.includes('Duplikat'));
    }
    
    const docKlas = (doc as any).klasifikasi || 'Umum';
    const matchesKlasifikasi = viewKlasifikasi === 'Semua' || docKlas === viewKlasifikasi;
    
    // Sembunyikan dokumen duplikat dari tampilan biasa
    return matchesSearch && matchesKlasifikasi && !doc.status.includes('Duplikat');
  });

  const filteredHistoryDocs = historyDocs.filter(doc => 
    doc.filename.toLowerCase().includes(search.toLowerCase())
  );

  const tabs = [
    { id: 'regulations' as ActiveTab, label: 'Regulations', icon: <BookOpen size={16} />, count: regulationDocs.length },
    { id: 'internal' as ActiveTab, label: 'Internal Documents', icon: <FolderOpen size={16} />, count: internalDocs.length },
    { id: 'analyzed' as ActiveTab, label: 'Analyzed Documents', icon: <FileCheck size={16} />, count: historyDocs.length },
    { id: 'templates' as ActiveTab, label: 'Document Templates', icon: <File size={16} />, count: templates.length },
  ];
  if (user?.role?.toLowerCase() === 'sekretaris perusahaan') {
    tabs.push({ id: 'pending' as ActiveTab, label: 'Pending Documents', icon: <Clock size={16} />, count: pendingDocs.length });
  }

  return (
    <div className="view-container repository-view" style={{ padding: '24px 32px', boxSizing: 'border-box' }}>
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
          <div className="floating-sphere"></div>
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
            <p>OJK Regulations</p>
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
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <button 
              className="upload-btn" 
              onClick={handleClearFailedDocuments} 
              style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border-color)', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem' }}
              title="Hapus semua dokumen yang gagal diproses"
            >
              <Trash2 size={16} /> Bersihkan Duplikat
            </button>
            <select 
              value={viewKlasifikasi} 
              onChange={e => setViewKlasifikasi(e.target.value)}
              style={{ background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '0.9rem' }}
            >
              <option value="Semua">Tampilkan: Semua</option>
              <option value="Umum">Klasifikasi: Umum</option>
              {['manajer', 'direktur', 'admin', 'sekretaris perusahaan'].includes(user?.role?.toLowerCase() || '') && (
                <option value="Rahasia">Klasifikasi: Rahasia</option>
              )}
              {['direktur', 'admin', 'sekretaris perusahaan'].includes(user?.role?.toLowerCase() || '') && (
                <option value="Terbatas">Klasifikasi: Terbatas</option>
              )}
              <option value="Duplikat">Status: Duplikat</option>
            </select>
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
                <div style={{ marginTop: '12px', padding: '12px', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                  
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

                  <p style={{ margin: '0 0 8px 0', fontSize: '0.85rem', color: '#94a3b8' }}>Klasifikasi Akhir:</p>
                  <select
                    defaultValue=""
                    onChange={(e) => { (doc as any).selectedKlasifikasi = e.target.value; }}
                    style={{ width: '100%', background: '#0f172a', border: '1px solid #334155', borderRadius: '6px', padding: '8px', color: '#f8fafc', marginBottom: '12px' }}
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
                <p style={{ fontSize: '0.9rem', color: '#94a3b8', margin: '8px 0 16px', lineHeight: '1.4' }}>
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
            
            {activeTab === 'regulations' || activeTab === 'internal' ? filteredDocs.map((doc, idx) => (
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
            
            {activeTab === 'analyzed' && filteredHistoryDocs.map((doc, idx) => (
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
        )}
          </div>
        </>
      )}

      {/* Document Drawer */}
      {/* Centered PDF Modal for Pending Documents */}
      {viewPdfDoc && (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyItems: 'center', padding: '24px', justifyContent: 'center' }}>
          <div className="modal-content" style={{ background: '#1e293b', width: '100%', maxWidth: '900px', height: '90vh', borderRadius: '12px', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', background: '#0f172a', borderBottom: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: '#f59e0b', color: '#fff', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>Menunggu Konfirmasi</div>
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc' }}>{viewPdfDoc.judul}</h3>
              </div>
              <button onClick={() => { setViewPdfDoc(null); setPdfBlobUrl(null); }} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#f8fafc', cursor: 'pointer', padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ flex: 1, position: 'relative', background: '#0f172a' }}>
              {isPdfLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8' }}>
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
          <div className="modal-content" style={{ background: '#1e293b', width: '90%', maxWidth: '500px', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Beri Akses Dokumen</h3>
              <button onClick={() => setShowShareModal(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>
            <p style={{ color: '#cbd5e1', fontSize: '0.95rem' }}>
              Anda akan memberikan akses dokumen <strong>{showShareModal.judul}</strong> ({(showShareModal as any).klasifikasi}).
            </p>
            <form onSubmit={handleShareSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Pilih Pengguna *</label>
                <input 
                  required
                  list="users-list"
                  value={shareUser}
                  onChange={(e) => setShareUser(e.target.value)}
                  placeholder="Ketik ID, Username, atau Email..."
                  style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '10px', color: '#f8fafc' }}
                />
                <datalist id="users-list">
                  {usersList.map(u => (
                    <option key={u.id} value={u.id}>{u.username} - {u.email || 'Tanpa Email'} ({u.role})</option>
                  ))}
                </datalist>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Alasan *</label>
                <textarea 
                  required
                  value={shareReason}
                  onChange={(e) => setShareReason(e.target.value)}
                  placeholder="Alasan wajib diisi..."
                  style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '10px', color: '#f8fafc', height: '80px', resize: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Batas Waktu (Opsional)</label>
                <input 
                  type="date"
                  value={shareExpiry}
                  onChange={(e) => setShareExpiry(e.target.value)}
                  style={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '10px', color: '#f8fafc', colorScheme: 'dark' }}
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
          <div className="modal-content" style={{ background: '#1e293b', width: '90%', maxWidth: '700px', borderRadius: '12px', padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem' }}>Generate Dokumen</h3>
              <button onClick={() => { setShowPromptModal(null); setGeneratedDoc(null); setPromptInput(''); }} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
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
                  style={{ width: '100%', height: '120px', background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', padding: '12px', color: '#f8fafc', fontSize: '0.95rem', resize: 'none' }}
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
                <div style={{ background: '#0f172a', padding: '16px', borderRadius: '8px', color: '#e2e8f0', fontSize: '0.95rem', whiteSpace: 'pre-wrap', lineHeight: '1.6', flex: 1, overflowY: 'auto' }}>
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
