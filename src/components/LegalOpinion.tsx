import { useState, useRef, useEffect, useMemo, useId } from 'react';
import { Send, ChevronDown, Bot, User, Search, Plus, Trash2, MoreHorizontal, Pencil, FileText, Loader2, Link2, MessagesSquare, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../services/api';
import DocumentDrawer from './DocumentDrawer';

interface Source {
  id: string;
  jenis: string;
  nomor: string;
  sektor: string;
  judul: string;
  snippet: string;
  rerank_score?: number;
}

interface Message {
  id: number;
  role: 'user' | 'ai';
  content: string;
  sources?: Source[];
}

interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

/* Glass-dialog state — replaces native window.confirm/prompt/alert with a
   system-consistent modal (see AppDialog at the bottom of this file). */
type DialogState =
  | { kind: 'confirm'; title: string; body?: string; confirmLabel: string; danger?: boolean; onConfirm: () => void }
  | { kind: 'prompt'; title: string; label: string; initialValue: string; onSubmit: (value: string) => void }
  | { kind: 'alert'; title: string; body: string };

type DrawerDoc = {
  id: string;
  nomor: string;
  judul: string;
  jenis: string;
  sektor: string;
};

const STORAGE_KEY = 'legal_analyzer_conversations';
const ACTIVE_STORAGE_KEY = 'legal_analyzer_active_conversation';
const INITIAL_AI_MESSAGE: Message = {
  id: 1,
  role: 'ai',
  content: 'Halo! Saya adalah asisten legal LA LegPro. Anda dapat bertanya mengenai regulasi sektor keuangan Indonesia — peraturan OJK serta 15 lembaga sumber JDIH (Bank Indonesia, Kemenkeu, Kominfo, Kemnaker, LPS, PPATK, dan lainnya) — maupun dokumen internal organisasi yang tersimpan di platform. Setiap jawaban disertai kutipan dari dokumen sumber agar dapat Anda verifikasi langsung.'
};

function createConversation(title = 'Percakapan Baru'): Conversation {
  const now = Date.now();
  return {
    id: `conv_${now}_${Math.random().toString(36).slice(2, 7)}`,
    title,
    createdAt: now,
    updatedAt: now,
    messages: [{ ...INITIAL_AI_MESSAGE, id: now }],
  };
}

export default function LegalOpinion() {
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [createConversation()];
    try {
      const parsed = JSON.parse(raw) as Conversation[];
      if (!Array.isArray(parsed) || parsed.length === 0) return [createConversation()];
      return parsed;
    } catch {
      return [createConversation()];
    }
  });
  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    const raw = localStorage.getItem(ACTIVE_STORAGE_KEY);
    return raw || '';
  });
  const [conversationSearch, setConversationSearch] = useState('');
  const [menuConversationId, setMenuConversationId] = useState<string | null>(null);
  /* Mobile only: at ≤767px the conversation panel becomes an off-canvas
     drawer (styles in utilities.css); desktop ignores this state. */
  const [panelOpen, setPanelOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [drawerDoc, setDrawerDoc] = useState<DrawerDoc | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  // Keep height in sync with content no matter which code path changed the
  // value (typing, send, new conversation, conversation switch, suggestions).
  // Without this, clearing the text leaves a stale tall box behind.
  useEffect(() => {
    resizeTextarea();
  }, [input]);

  useEffect(() => {
    if (!activeConversationId || !conversations.some(c => c.id === activeConversationId)) {
      setActiveConversationId(conversations[0]?.id ?? '');
    }
  }, [activeConversationId, conversations]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem(ACTIVE_STORAGE_KEY, activeConversationId);
    }
  }, [activeConversationId]);

  // Dismiss the conversation menu on Escape or any click outside its wrap.
  useEffect(() => {
    if (!menuConversationId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuConversationId(null);
    };
    const onMouseDown = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest('.conversation-menu-wrap')) {
        setMenuConversationId(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [menuConversationId]);

  // Close the mobile conversation drawer on Escape — skipped while a dialog
  // or the document drawer is open, so Escape unwinds one layer at a time.
  useEffect(() => {
    if (!panelOpen || dialog || drawerDoc) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [panelOpen, dialog, drawerDoc]);

  const activeConversation = useMemo(
    () => conversations.find(c => c.id === activeConversationId) ?? conversations[0],
    [conversations, activeConversationId]
  );
  const messages = activeConversation?.messages ?? [];

  const filteredConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();
    if (!query) return conversations;
    return conversations.filter((c) => {
      const inTitle = c.title.toLowerCase().includes(query);
      const inMessages = c.messages.some(m => m.content.toLowerCase().includes(query));
      return inTitle || inMessages;
    });
  }, [conversationSearch, conversations]);

  // Repairs the model's sloppy markdown before render (non-destructive —
  // the stored message is untouched). Handles: empty **** markers, bullets
  // that are only a marker + colon, missing space after -/+, stray whitespace.
  const normalizeMarkdown = (text: string) => {
    return text
      .replace(/\*\*\s*\*\*/g, '')
      .replace(/^(\s*[-*+]\s*):/gm, '$1')
      .replace(/^(\s*[-+])(\S)/gm, '$1 $2')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const updateConversation = (conversationId: string, updater: (c: Conversation) => Conversation) => {
    setConversations(prev => prev.map(c => (c.id === conversationId ? updater(c) : c)));
  };

  const handleCreateConversation = () => {
    const convo = createConversation(`Percakapan ${conversations.length + 1}`);
    setConversations(prev => [convo, ...prev]);
    setActiveConversationId(convo.id);
    setInput('');
  };

  const handleClearChat = () => {
    if (!activeConversation) return;
    setDialog({
      kind: 'confirm',
      title: 'Bersihkan percakapan ini?',
      body: 'Semua pesan dalam percakapan aktif akan dihapus. Tindakan ini tidak dapat dibatalkan.',
      confirmLabel: 'Bersihkan',
      danger: true,
      onConfirm: () => {
        updateConversation(activeConversation.id, (c) => ({
          ...c,
          updatedAt: Date.now(),
          messages: [{ ...INITIAL_AI_MESSAGE, id: Date.now() }],
        }));
      },
    });
  };

  const handleRenameConversation = (conversationId: string) => {
    const target = conversations.find((c) => c.id === conversationId);
    if (!target) return;
    setDialog({
      kind: 'prompt',
      title: 'Ubah nama percakapan',
      label: 'Nama percakapan',
      initialValue: target.title,
      onSubmit: (value) => {
        const cleanTitle = value.trim();
        if (!cleanTitle) return;
        updateConversation(conversationId, (c) => ({
          ...c,
          title: cleanTitle,
          updatedAt: Date.now(),
        }));
      },
    });
  };

  const handleDeleteConversation = (conversationId: string) => {
    if (conversations.length <= 1) {
      setDialog({
        kind: 'alert',
        title: 'Tidak dapat dihapus',
        body: 'Minimal harus ada satu percakapan.',
      });
      return;
    }

    const target = conversations.find((c) => c.id === conversationId);
    if (!target) return;
    setDialog({
      kind: 'confirm',
      title: 'Hapus percakapan?',
      body: `"${target.title}" akan dihapus secara permanen.`,
      confirmLabel: 'Hapus',
      danger: true,
      onConfirm: () => {
        const remaining = conversations.filter((c) => c.id !== conversationId);
        setConversations(remaining);
        if (activeConversationId === conversationId) {
          setActiveConversationId(remaining[0]?.id ?? '');
        }
      },
    });
  };

  const handleSend = async () => {
    if (!input.trim() || !activeConversation) return;

    const now = Date.now();
    const userContent = input.trim();
    const userMessage: Message = {
      id: now,
      role: 'user',
      content: userContent
    };

    const existingMessages = activeConversation.messages;
    const shouldSetTitle = activeConversation.title.startsWith('Percakapan');
    const newTitle = shouldSetTitle ? userContent.slice(0, 42) || activeConversation.title : activeConversation.title;

    updateConversation(activeConversation.id, (c) => ({
      ...c,
      title: newTitle,
      updatedAt: now,
      messages: [...c.messages, userMessage],
    }));
    setInput('');
    setIsLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = '50px';

    try {
      const apiMessages = [...existingMessages, userMessage].map(msg => ({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content
      }));

      const response = await api.post('/api/chat', { messages: apiMessages });

      const data = response.data;

      updateConversation(activeConversation.id, (c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: [
          ...c.messages,
          {
            id: Date.now() + 1,
            role: 'ai',
            content: data.answer,
            sources: data.sources
          }
        ]
      }));

    } catch (error) {
      console.error(error);
      updateConversation(activeConversation.id, (c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: [
          ...c.messages,
          {
            id: Date.now() + 1,
            role: 'ai',
            content: 'Maaf, terjadi gangguan saat menghubungi server sehingga jawaban tidak dapat ditampilkan. Silakan coba lagi beberapa saat; jika masalah berlanjut, hubungi administrator sistem Anda.'
          }
        ]
      }));
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="view-container no-scroll legal-opinion-view">
      <div className="view-header">
        <div>
          <h2>Legal Opinion Chatbot</h2>
          <p>Tanya AI mengenai regulasi keuangan dan perbankan</p>
        </div>
        <div className="legal-opinion-actions">
          <button
            className="panel-toggle-btn secondary-action-btn"
            onClick={() => setPanelOpen(true)}
            aria-label="Daftar percakapan"
            aria-expanded={panelOpen}
            aria-controls="conversation-panel"
          >
            <MessagesSquare size={16} />
          </button>
          <button className="secondary-action-btn" onClick={handleCreateConversation} aria-label="Percakapan Baru">
            <Plus size={16} />
            <span className="btn-label">Percakapan Baru</span>
          </button>
          <button className="secondary-action-btn danger" onClick={handleClearChat} disabled={isLoading} aria-label="Bersihkan Percakapan">
            <Trash2 size={16} />
            <span className="btn-label">Bersihkan Percakapan</span>
          </button>
        </div>
      </div>

      <div className="legal-opinion-body">
        {panelOpen && (
          <div
            className="conversation-panel-backdrop"
            onClick={() => setPanelOpen(false)}
            aria-hidden="true"
          />
        )}
        <aside
          className={`conversation-panel ${panelOpen ? 'open' : ''}`}
          id="conversation-panel"
          aria-label="Daftar percakapan"
        >
          <div className="conversation-search">
            <Search size={16} />
            <input
              type="text"
              placeholder="Cari percakapan..."
              value={conversationSearch}
              onChange={(e) => setConversationSearch(e.target.value)}
            />
          </div>
          <div className="conversation-list">
            {filteredConversations.map((conv) => (
              <div
                key={conv.id}
                className={`conversation-item ${conv.id === activeConversation?.id ? 'active' : ''}`}
              >
                <button
                  className="conversation-main-btn"
                  onClick={() => {
                    setActiveConversationId(conv.id);
                    setMenuConversationId(null);
                    setPanelOpen(false);
                  }}
                >
                  <div className="conversation-title">{conv.title}</div>
                  <div className="conversation-preview">
                    {conv.messages[conv.messages.length - 1]?.content || 'Belum ada percakapan'}
                  </div>
                </button>

                <div className="conversation-menu-wrap">
                  <button
                    className="conversation-menu-btn"
                    onClick={() => setMenuConversationId((prev) => (prev === conv.id ? null : conv.id))}
                    aria-label="Buka menu percakapan"
                    aria-haspopup="true"
                    aria-expanded={menuConversationId === conv.id}
                  >
                    <MoreHorizontal size={16} />
                  </button>

                  {menuConversationId === conv.id && (
                    <div className="conversation-menu">
                      <button
                        onClick={() => {
                          handleRenameConversation(conv.id);
                          setMenuConversationId(null);
                        }}
                      >
                        <Pencil size={14} /> Ubah Nama
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          handleDeleteConversation(conv.id);
                          setMenuConversationId(null);
                        }}
                      >
                        <Trash2 size={14} /> Hapus
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {filteredConversations.length === 0 && (
              <div className="conversation-empty">Tidak ada percakapan yang cocok.</div>
            )}
          </div>
        </aside>

        <div className="chat-main">
          <div className="chat-box" role="log" aria-live="polite" aria-label="Riwayat percakapan">
            {messages.map((msg) => (
              <div key={msg.id} className={`message-item ${msg.role}`}>
                <div className="bubble">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', opacity: 0.7, fontSize: '0.8rem', fontWeight: 600 }}>
                    {msg.role === 'user' ? <User size={16} /> : <Bot size={16} color="var(--accent-color)" />}
                    {msg.role === 'user' ? 'Anda' : 'Legal Analyzer'}
                  </div>

                  {msg.role === 'user' ? (
                    <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{msg.content}</div>
                  ) : (
                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {normalizeMarkdown(msg.content)}
                      </ReactMarkdown>
                    </div>
                  )}

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="sources-container">
                      <div className="sources-label">Sumber Dokumen yang Ditemukan:</div>
                      {msg.sources.map((source, index) => (
                        <SourceAccordion
                          key={source.id + index}
                          source={source}
                          onOpenDocument={(s) =>
                            setDrawerDoc({ id: s.id, nomor: s.nomor, judul: s.judul, jenis: s.jenis, sektor: s.sektor })
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message-item ai">
                <div className="bubble" style={{ background: 'transparent', border: 'none', padding: 0 }}>
                  <div className="multi-loader">
                    <Loader2 size={16} className="multi-loader-icon animate-spin-slow" color="var(--accent-color)" aria-hidden="true" />
                    <span>Menelusuri dokumen regulasi…</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-area">
            <div className="input-container">
              <textarea
                ref={textareaRef}
                className="chat-input"
                rows={1}
                placeholder="Tanyakan analisis regulasi (contoh: Apakah tanda tangan elektronik sah tanpa meterai?)..."
                value={input}
                onChange={handleInput}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={isLoading}
              />
              <button
                className="send-button btn-primary"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                aria-label="Kirim pesan"
              >
                <Send size={18} />
              </button>
            </div>
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              AI dapat membuat kesalahan. Verifikasi informasi penting pada dokumen sumber aslinya.
            </div>
          </div>
        </div>
      </div>

      <DocumentDrawer doc={drawerDoc} onClose={() => setDrawerDoc(null)} />
      {dialog && <AppDialog dialog={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

function SourceAccordion({ source, onOpenDocument }: { source: Source; onOpenDocument: (source: Source) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const contentId = useId();

  const rawScore = source.rerank_score ?? 0;
  const percentScore = Math.min(100, Math.max(10, (rawScore + 5) * 10));

  return (
    <div className={`evidence-card ${isOpen ? 'open' : ''}`}>
      <button
        type="button"
        className="evidence-card-header"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <FileText size={14} color="var(--text-secondary)" />
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              {source.judul || `${source.jenis} ${source.nomor}`}
            </span>
          </span>
          <span className="evidence-badges">
            <span className={`jenis-badge ${source.jenis}`}>{source.jenis}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{source.sektor}</span>
            {source.rerank_score != null && (
              <span className="rerank-badge">
                <Sparkles size={12} />
                Skor: {source.rerank_score.toFixed(2)}
              </span>
            )}
          </span>
        </span>
        <ChevronDown size={18} color="var(--text-secondary)" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.3s' }} />
      </button>
      
      {source.rerank_score != null && (
        <div className="relevance-bar-container" aria-hidden="true">
          <div className="relevance-bar" style={{ width: `${percentScore}%` }} />
        </div>
      )}

      <div className="evidence-content" id={contentId}>
        <div className="evidence-snippet">
          {source.snippet}
        </div>
        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={() => onOpenDocument(source)}
            style={{ background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: '0.75rem', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Link2 size={12} />
            Buka Dokumen
          </button>
        </div>
      </div>
    </div>
  );
}

/* Glass confirm/prompt/alert dialog — the system-consistent replacement for
   native window.confirm/prompt/alert. Escape closes; backdrop click closes;
   destructive confirms focus the cancel button first. */
function AppDialog({ dialog, onClose }: { dialog: DialogState; onClose: () => void }) {
  const [promptValue, setPromptValue] = useState(dialog.kind === 'prompt' ? dialog.initialValue : '');
  const inputRef = useRef<HTMLInputElement>(null);
  const defaultBtnRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (dialog.kind === 'prompt') {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      defaultBtnRef.current?.focus();
    }
  }, [dialog.kind]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const submitPrompt = () => {
    if (dialog.kind !== 'prompt') return;
    dialog.onSubmit(promptValue);
    onClose();
  };

  return (
    <div
      className="modal-overlay"
      style={{ zIndex: 1200 }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h3 className="confirm-modal-title" id={titleId}>{dialog.title}</h3>
        {dialog.kind === 'prompt' ? (
          <>
            <label className="confirm-modal-label" htmlFor={`${titleId}-input`}>{dialog.label}</label>
            <input
              id={`${titleId}-input`}
              ref={inputRef}
              className="confirm-modal-input"
              type="text"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitPrompt(); }}
            />
          </>
        ) : (
          <p className="confirm-modal-body">{dialog.body}</p>
        )}
        <div className="confirm-modal-actions">
          {dialog.kind === 'alert' ? (
            <button ref={defaultBtnRef} type="button" className="btn btn-primary" onClick={onClose}>
              OK
            </button>
          ) : dialog.kind === 'prompt' ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
              <button type="button" className="btn btn-primary" onClick={submitPrompt} disabled={!promptValue.trim()}>
                Simpan
              </button>
            </>
          ) : (
            <>
              <button ref={defaultBtnRef} type="button" className="btn btn-secondary" onClick={onClose}>Batal</button>
              <button
                type="button"
                className={`btn ${dialog.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => { dialog.onConfirm(); onClose(); }}
              >
                {dialog.confirmLabel}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
