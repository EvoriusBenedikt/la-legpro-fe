import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, ChevronDown, Bot, User, Search, Plus, Trash2, MoreHorizontal, Pencil, FileText, Loader2, Link2, Sparkles } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { API_BASE } from '../config';

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

const STORAGE_KEY = 'legal_analyzer_conversations';
const ACTIVE_STORAGE_KEY = 'legal_analyzer_active_conversation';
const INITIAL_AI_MESSAGE: Message = {
  id: 1,
  role: 'ai',
  content: 'Halo! Saya adalah OJK Legal Analyzer. Anda dapat bertanya mengenai Peraturan Otoritas Jasa Keuangan (Perbankan, IKNB, atau Pasar Modal), dan saya akan merangkum sanksi atau ketentuannya dari database kami.'
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

import { useAuth } from '../context/AuthContext';

export default function LegalOpinion() {
  const { token } = useAuth();
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
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = '50px';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  };

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
    updateConversation(activeConversation.id, (c) => ({
      ...c,
      updatedAt: Date.now(),
      messages: [{ ...INITIAL_AI_MESSAGE, id: Date.now() }],
    }));
  };

  const handleRenameConversation = (conversationId: string) => {
    const target = conversations.find((c) => c.id === conversationId);
    if (!target) return;
    const renamed = window.prompt('Nama percakapan baru:', target.title);
    if (!renamed) return;
    const cleanTitle = renamed.trim();
    if (!cleanTitle) return;
    updateConversation(conversationId, (c) => ({
      ...c,
      title: cleanTitle,
      updatedAt: Date.now(),
    }));
  };

  const handleDeleteConversation = (conversationId: string) => {
    if (conversations.length <= 1) {
      window.alert('Minimal harus ada satu percakapan.');
      return;
    }

    const target = conversations.find((c) => c.id === conversationId);
    if (!target) return;
    const confirmed = window.confirm(`Hapus percakapan "${target.title}"?`);
    if (!confirmed) return;

    const remaining = conversations.filter((c) => c.id !== conversationId);
    setConversations(remaining);
    if (activeConversationId === conversationId) {
      setActiveConversationId(remaining[0]?.id ?? '');
    }
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
    setLoadingStep(1);
    if (textareaRef.current) textareaRef.current.style.height = '50px';

    try {
      const apiMessages = [...existingMessages, userMessage].map(msg => ({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content
      }));

      setTimeout(() => { setIsLoading((loading) => { if (loading) setLoadingStep(2); return loading; }); }, 1500);
      setTimeout(() => { setIsLoading((loading) => { if (loading) setLoadingStep(3); return loading; }); }, 3000);

      const response = await fetch(API_BASE + '/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!response.ok) {
        throw new Error('Gagal menghubungi server API.');
      }

      const data = await response.json();

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
            content: 'Maaf, terjadi kesalahan saat menghubungi server. Pastikan FastAPI sedang berjalan dan kredensial GLM API sudah diatur dengan benar.'
          }
        ]
      }));
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <div className="view-container no-scroll">
      <div className="view-header">
        <div>
          <h2>Legal Opinion Chatbot</h2>
          <p>Tanya AI mengenai regulasi keuangan dan perbankan</p>
        </div>
        <div className="legal-opinion-actions">
          <button className="secondary-action-btn" onClick={handleCreateConversation}>
            <Plus size={16} />
            Percakapan Baru
          </button>
          <button className="secondary-action-btn danger" onClick={handleClearChat} disabled={isLoading}>
            <Trash2 size={16} />
            Clear Chat
          </button>
        </div>
      </div>

      <div className="legal-opinion-body">
        <aside className="conversation-panel">
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
                        <Pencil size={14} /> Rename
                      </button>
                      <button
                        className="danger"
                        onClick={() => {
                          handleDeleteConversation(conv.id);
                          setMenuConversationId(null);
                        }}
                      >
                        <Trash2 size={14} /> Delete
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
          <div className="chat-box">
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
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="sources-container">
                      <div style={{ fontSize: '0.75rem', marginTop: '16px', color: 'var(--text-secondary)', fontWeight: 600 }}>SUMBER DOKUMEN YANG DITEMUKAN:</div>
                      {msg.sources.map((source, index) => (
                        <SourceAccordion key={source.id + index} source={source} />
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
                    <Loader2 size={16} className="multi-loader-icon" color="var(--accent-color)" />
                    <span>
                      {loadingStep === 1 && "Running Hybrid Search (BM25 + Dense)..."}
                      {loadingStep === 2 && "Cross-Encoder Reranking chunks..."}
                      {loadingStep >= 3 && "Generating Contextual Analysis..."}
                      {loadingStep === 0 && "Memproses..."}
                    </span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-area">
            <div className="input-container" style={{ alignItems: 'flex-end', background: 'var(--bg-dark)', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)', padding: '8px', transition: 'border-color 0.2s' }}>
              <textarea
                ref={textareaRef}
                className="chat-input"
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
                style={{ 
                  resize: 'none', 
                  minHeight: '50px', 
                  maxHeight: '200px', 
                  overflowY: 'auto',
                  border: 'none',
                  background: 'transparent',
                  padding: '12px',
                  lineHeight: '1.5'
                }}
              />
              <button
                className="send-button btn-primary"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                style={{ height: '40px', width: '40px', padding: 0, borderRadius: 'var(--radius-sm)', marginBottom: '4px', marginRight: '4px' }}
              >
                <Send size={18} />
              </button>
            </div>
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              AI can make mistakes. Please verify important information with original documents.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SourceAccordion({ source }: { source: Source }) {
  const [isOpen, setIsOpen] = useState(false);

  const rawScore = source.rerank_score ?? 0;
  const percentScore = Math.min(100, Math.max(10, (rawScore + 5) * 10));

  return (
    <div className={`evidence-card ${isOpen ? 'open' : ''}`}>
      <div className="evidence-card-header" onClick={() => setIsOpen(!isOpen)}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <FileText size={14} color="var(--text-secondary)" />
            <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              {source.judul || `${source.jenis} ${source.nomor}`}
            </span>
          </div>
          <div className="evidence-badges">
            <span className={`jenis-badge ${source.jenis}`}>{source.jenis}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{source.sektor}</span>
            {source.rerank_score != null && (
              <span className="rerank-badge">
                <Sparkles size={12} />
                Reranked: {source.rerank_score.toFixed(2)}
              </span>
            )}
          </div>
        </div>
        <ChevronDown size={18} color="var(--text-secondary)" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.3s' }} />
      </div>
      
      {source.rerank_score != null && (
        <div className="relevance-bar-container">
          <div className="relevance-bar" style={{ width: `${percentScore}%` }} />
        </div>
      )}

      <div className="evidence-content">
        <div className="evidence-snippet">
          {source.snippet}
        </div>
        <div style={{ marginTop: '12px', display: 'flex', justifyContent: 'flex-end' }}>
          <button style={{ background: 'transparent', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-sm)', padding: '6px 12px', fontSize: '0.75rem', color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Link2 size={12} />
            Buka Dokumen
          </button>
        </div>
      </div>
    </div>
  );
}
