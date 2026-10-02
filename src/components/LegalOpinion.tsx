import { useState, useRef, useEffect, useLayoutEffect, useMemo, useId } from 'react';
import { createPortal } from 'react-dom';
import { Send, ChevronDown, ChevronLeft, ChevronRight, User, Search, Plus, Trash2, MoreHorizontal, Pencil, FileText, Link2, MessagesSquare, Sparkles, Copy, Check, RotateCw } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api from '../services/api';
import { getSettings } from '../settings';
import { useStrings, getLocale, fill, STRINGS } from '../i18n';
import DocumentDrawer from './DocumentDrawer';
import LoadingOrb from './LoadingOrb';
import BotIdentity from './BotIdentity';
import WorkBeam from './WorkBeam';

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
  /** Set on the seeded first message of a fresh conversation; renders the
      bot mascot above the bubble copy. Absent on older stored history —
      cosmetic only, fully backwards-compatible. */
  kind?: 'greeting';
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
/* Desktop-only history-panel collapse (handle on the panel seam,
   2026-10-01 review); same single-key localStorage pattern as the
   dashboard sidebar rail. Mobile keeps the off-canvas drawer. */
const HISTORY_COLLAPSED_KEY = 'la_op_history_collapsed';

/* Bot mascot nap rhythm (2026-10-01 review, refined the same day on user
   request): bot-avatars idle ↔ sleeping states, derived in Legal Opinion
   and shared by every BotIdentity in the view. The mascot dozes after
   BOT_IDLE_BEFORE_NAP_MS of message-quiet, naps for BOT_NAP_MS, then
   wakes by itself and the cycle loops (idle → nap → idle …); touching
   the composer (focus or typing) or a landing message wakes it at once
   and restarts the idle phase. */
const BOT_IDLE_BEFORE_NAP_MS = 60_000;
const BOT_NAP_MS = 30_000;

/* Time-of-day greeting for the empty-conversation hero: morning
   05:00–11:59, afternoon 12:00–17:59, night otherwise; the offer line
   names the assistant (Sage). Emitted as a markdown H2 so the hero
   reads as a true heading; the former scope paragraph was deleted in
   the 2026-10-01 review. Since the same day's "let it be the user"
   review the greeting is an empty-state only — rendered live while a
   conversation holds no messages, never seeded into history. Stored
   conversations created before that review keep their frozen greeting
   message (kind 'greeting'); history is user data, never rewritten. */
function greetingContent(locale: ReturnType<typeof getLocale>): string {
  const s = STRINGS[locale];
  const h = new Date().getHours();
  const salutation = h < 5 || h >= 18 ? s.opGreetNight : h < 12 ? s.opGreetMorning : s.opGreetAfternoon;
  return `## ${salutation}! ${s.opGreetOffer}`;
}

/* A conversation shows the greeting hero (mascot + copy, no bubble)
   while nothing is pending and it holds no user-facing history: zero
   messages (current shape), or only a legacy seeded greeting (stored
   conversations from before 2026-10-01). The first question ends both
   cases; in the current shape the user's message simply becomes the
   first row of history. */
function isFreshGreeting(messages: Message[], loading: boolean): boolean {
  if (loading) return false;
  if (messages.length === 0) return true;
  return messages.length === 1 && messages[0].kind === 'greeting';
}

function createConversation(title?: string): Conversation {
  const now = Date.now();
  return {
    id: `conv_${now}_${Math.random().toString(36).slice(2, 7)}`,
    title: title ?? STRINGS[getLocale()].opDefaultTitle,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export default function LegalOpinion() {
  const t = useStrings();
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
  /* Conversation row menu (Rename/Delete). Rendered through a portal at
     fixed coordinates (bugfix 2026-10-01: inside the overflow-y list the
     absolute dropdown was clipped by the panel frame on the last rows);
     anchorTop keeps the button rect for the upward flip. */
  const [menuState, setMenuState] = useState<{ convId: string; top: number; left: number; anchorTop: number } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  /* Mobile only: at ≤767px the conversation panel becomes an off-canvas
     drawer (styles in utilities.css); desktop ignores this state. */
  const [panelOpen, setPanelOpen] = useState(false);
  /* Desktop: history panel collapsed to zero width so the chat expands;
     persisted per browser like the sidebar rail. Mobile ignores it (the
     drawer is panelOpen's job). */
  const [historyHidden, setHistoryHidden] = useState<boolean>(() => {
    try {
      return localStorage.getItem(HISTORY_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleHistoryPanel = () => {
    const next = !historyHidden;
    setHistoryHidden(next);
    try {
      localStorage.setItem(HISTORY_COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      /* private mode: collapse lasts this page life only */
    }
  };
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  /* Bot mascot nap rhythm (2026-10-01 review, refined same day): ONE
     identity shared by every BotIdentity in the view — 'working' while
     an answer is pending; otherwise the mascot alternates an idle phase
     and a BOT_NAP_MS nap (dozing after BOT_IDLE_BEFORE_NAP_MS of
     message-quiet, waking by itself when the nap ends, looping). The
     phase clock lives in phaseStartedRef, reset whenever botPhase
     flips; wakeBot() restarts it from user contact with the composer.
     Declared above handleInput so the composer handlers can call it. */
  const phaseStartedRef = useRef<number>(0);
  const [botPhase, setBotPhase] = useState<'idle' | 'sleeping'>('idle');
  const wakeBot = () => {
    phaseStartedRef.current = Date.now();
    setBotPhase('idle');
  };
  /* Claude-style message actions (2026-10-01 review): id of the AI message
     whose copy button is showing the transient "copied" check mark. */
  const [copiedMessageId, setCopiedMessageId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [drawerDoc, setDrawerDoc] = useState<DrawerDoc | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatBoxRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const content = el.scrollHeight;
    el.style.height = `${Math.min(content, 200)}px`;
    // The scrollbar channel (and its themed paint) exists only past the
    // height cap; below it the field grows with content and stays
    // overflow-hidden, so no engine can render a scrollbar frame inside
    // the composer (2026-10-01 inner-ring review).
    el.classList.toggle('is-scrollable', content > 200);
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    wakeBot(); // typing counts as touching the chat: the mascot wakes
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

  // Dismiss the conversation menu on Escape, any click outside its wrap
  // AND outside the portaled menu, and on any scroll/resize (the fixed
  // menu would otherwise detach from its anchor button).
  useEffect(() => {
    if (!menuState) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuState(null);
    };
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.conversation-menu-wrap') && !target.closest('.conversation-menu')) {
        setMenuState(null);
      }
    };
    const onMove = () => setMenuState(null);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [menuState]);

  // Flip the portaled menu above its button when the downward position
  // would leave the viewport; runs before paint so no jump is visible.
  useLayoutEffect(() => {
    if (!menuState || !menuRef.current) return;
    const h = menuRef.current.offsetHeight;
    if (menuState.top + h > window.innerHeight - 8) {
      menuRef.current.style.top = `${Math.max(8, menuState.anchorTop - 4 - h)}px`;
    }
  }, [menuState]);

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

  /* Bot mascot nap rhythm, effects: the [botPhase] effect stamps the
     phase clock on every flip (and on mount); the activity effect
     restarts the idle phase when a message lands or a send starts
     (keyed off the message COUNT, a primitive, so composer-keystroke
     re-renders never reset it on their own); the 5s ticker advances
     idle → sleeping → idle without re-rendering on every check
     (setState bails on unchanged values). */
  useEffect(() => {
    phaseStartedRef.current = Date.now();
  }, [botPhase]);
  useEffect(() => {
    phaseStartedRef.current = Date.now();
    /* Deferred wake: setState must not run synchronously in an effect
       body (react-hooks/set-state-in-effect), and a 0ms callback wakes
       the mascot the moment a message lands or a send starts. */
    const id = window.setTimeout(() => setBotPhase('idle'), 0);
    return () => window.clearTimeout(id);
  }, [messages.length, isLoading]);
  useEffect(() => {
    const iv = window.setInterval(() => {
      const elapsed = Date.now() - phaseStartedRef.current;
      setBotPhase((prev) => {
        const limit = prev === 'idle' ? BOT_IDLE_BEFORE_NAP_MS : BOT_NAP_MS;
        return elapsed > limit ? (prev === 'idle' ? 'sleeping' : 'idle') : prev;
      });
    }, 5_000);
    return () => window.clearInterval(iv);
  }, []);
  const botState: 'default' | 'working' | 'sleeping' = isLoading
    ? 'working'
    : botPhase === 'sleeping'
      ? 'sleeping'
      : 'default';

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
    // Scroll the chat's own container only. scrollIntoView would also drag
    // every ancestor scroller — the view is .no-scroll, so the shared page
    // scroller moved too, yanking the whole page toward the footer band
    // whenever messages changed (bug 2026-09-29). The settings dialog can
    // turn the auto-follow off entirely (chatAutoScroll) and collapses
    // smooth scrolling under reduce-motion.
    const settings = getSettings();
    if (!settings.chatAutoScroll) return;
    const behavior: ScrollBehavior = settings.reduceMotion ? 'auto' : 'smooth';
    const box = chatBoxRef.current;
    if (box) {
      box.scrollTo({ top: box.scrollHeight, behavior });
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const updateConversation = (conversationId: string, updater: (c: Conversation) => Conversation) => {
    setConversations(prev => prev.map(c => (c.id === conversationId ? updater(c) : c)));
  };

  const handleCreateConversation = () => {
    const convo = createConversation(fill(t.opNewTitle, { n: conversations.length + 1 }));
    setConversations(prev => [convo, ...prev]);
    setActiveConversationId(convo.id);
    setInput('');
  };

  const handleClearChat = () => {
    if (!activeConversation) return;
    setDialog({
      kind: 'confirm',
      title: t.opClearTitle,
      body: t.opClearBody,
      confirmLabel: t.opClearConfirm,
      danger: true,
      onConfirm: () => {
        updateConversation(activeConversation.id, (c) => ({
          ...c,
          updatedAt: Date.now(),
          messages: [],
        }));
      },
    });
  };

  const handleRenameConversation = (conversationId: string) => {
    const target = conversations.find((c) => c.id === conversationId);
    if (!target) return;
    setDialog({
      kind: 'prompt',
      title: t.opRenameTitle,
      label: t.opRenameLabel,
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
        title: t.opDeleteLastTitle,
        body: t.opDeleteLastBody,
      });
      return;
    }

    const target = conversations.find((c) => c.id === conversationId);
    if (!target) return;
    setDialog({
      kind: 'confirm',
      title: t.opDeleteTitle,
      body: fill(t.opDeleteBody, { t: target.title }),
      confirmLabel: t.opDeleteConfirm,
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
    if (textareaRef.current) textareaRef.current.style.height = '40px';

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
            content: STRINGS[getLocale()].opServerError
          }
        ]
      }));
    } finally {
      setIsLoading(false);
    }
  };

  /* Claude-style message actions (2026-10-01 review). Copy writes the raw
     answer text to the clipboard (Clipboard API with an execCommand
     fallback for non-secure contexts) and flashes a check mark on the
     button that triggered it. Retry regenerates an AI answer in place:
     the conversation is truncated back to the question being retried
     and the same /api/chat flow runs, so history never forks. */
  const handleCopyMessage = async (messageId: number, content: string) => {
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(content);
        ok = true;
      }
    } catch (error) {
      console.error(error);
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = content;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch (error) {
        console.error(error);
      }
    }
    if (!ok) return;
    setCopiedMessageId(messageId);
    window.setTimeout(() => {
      setCopiedMessageId((cur) => (cur === messageId ? null : cur));
    }, 1600);
  };

  const handleRetry = async (messageId: number) => {
    if (isLoading || !activeConversation) return;
    const idx = activeConversation.messages.findIndex((m) => m.id === messageId && m.role === 'ai');
    if (idx < 1 || activeConversation.messages[idx - 1].role !== 'user') return;
    const prefix = activeConversation.messages.slice(0, idx);
    const conversationId = activeConversation.id;

    updateConversation(conversationId, (c) => ({ ...c, messages: c.messages.slice(0, idx) }));
    setIsLoading(true);

    try {
      const apiMessages = prefix.map((msg) => ({
        role: msg.role === 'ai' ? 'assistant' : 'user',
        content: msg.content
      }));
      const response = await api.post('/api/chat', { messages: apiMessages });
      const data = response.data;
      updateConversation(conversationId, (c) => ({
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
      updateConversation(conversationId, (c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: [
          ...c.messages,
          {
            id: Date.now() + 1,
            role: 'ai',
            content: STRINGS[getLocale()].opServerError
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
          <h2>{t.opTitle}</h2>
          <p>{t.opSubtitle}</p>
        </div>
        <div className="legal-opinion-actions">
          <button
            className="panel-toggle-btn secondary-action-btn"
            onClick={() => setPanelOpen(true)}
            aria-label={t.opPanelLabel}
            aria-expanded={panelOpen}
            aria-controls="conversation-panel"
          >
            <MessagesSquare size={16} />
          </button>
          <button className="secondary-action-btn" onClick={handleCreateConversation} aria-label={t.opNew}>
            <Plus size={16} />
            <span className="btn-label">{t.opNew}</span>
          </button>
          <button className="secondary-action-btn danger" onClick={handleClearChat} disabled={isLoading} aria-label={t.opClear}>
            <Trash2 size={16} />
            <span className="btn-label">{t.opClear}</span>
          </button>
        </div>
      </div>

      <div className={`legal-opinion-body ${historyHidden ? 'history-collapsed' : ''}`}>
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
          aria-label={t.opPanelLabel}
          inert={historyHidden && !panelOpen}
        >
          <div className="conversation-search">
            <Search size={16} />
            <input
              type="text"
              placeholder={t.opSearchPh}
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
                    setMenuState(null);
                    setPanelOpen(false);
                  }}
                >
                  <div className="conversation-title">{conv.title}</div>
                  <div className="conversation-preview">
                    {conv.messages[conv.messages.length - 1]?.content || t.opNoPreview}
                  </div>
                </button>

                <div className="conversation-menu-wrap">
                  <button
                    className="conversation-menu-btn"
                    onClick={(e) => {
                      if (menuState?.convId === conv.id) {
                        setMenuState(null);
                        return;
                      }
                      /* Anchor the portaled menu to the button's right
                         edge, clamped into the viewport horizontally. */
                      const r = e.currentTarget.getBoundingClientRect();
                      const MENU_W = 140;
                      const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
                      setMenuState({ convId: conv.id, top: r.bottom + 4, left, anchorTop: r.top });
                    }}
                    aria-label={t.opMenuLabel}
                    aria-haspopup="true"
                    aria-expanded={menuState?.convId === conv.id}
                  >
                    <MoreHorizontal size={16} />
                  </button>
                </div>
              </div>
            ))}
            {filteredConversations.length === 0 && (
              <div className="conversation-empty">{t.opEmptySearch}</div>
            )}
          </div>
        </aside>

        <button
          className="panel-collapse-handle"
          onClick={toggleHistoryPanel}
          aria-expanded={!historyHidden}
          aria-controls="conversation-panel"
          aria-label={historyHidden ? t.opShowHistory : t.opHideHistory}
          title={historyHidden ? t.opShowHistory : t.opHideHistory}
        >
          {historyHidden ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className="chat-main">
          <div className="chat-box" ref={chatBoxRef} role="log" aria-live="polite" aria-label={t.opHistoryLabel}>
            {isFreshGreeting(messages, isLoading) && (
              <div className="greeting-hero">
                <BotIdentity size={128} state={botState} />
                <div className="greeting-hero-text markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {normalizeMarkdown(
                      messages.length === 0
                        ? greetingContent(getLocale())
                        : messages[0].content
                    )}
                  </ReactMarkdown>
                </div>
              </div>
            )}
            {!isFreshGreeting(messages, isLoading) && messages.map((msg) => (
              <div key={msg.id} className={`message-item ${msg.role}`}>
                {/* Avatar column (2026-10-01 review): the sender name lives
                    BELOW the avatar instead of inside the bubble, so the
                    bubble surface carries content only. */}
                <div className="msg-avatar-col">
                  {msg.role === 'ai' && <BotIdentity size={32} state={botState} />}
                  {msg.role === 'user' && (
                    <span className="msg-avatar-user" aria-hidden="true">
                      <User size={16} />
                    </span>
                  )}
                  <span className="msg-name">
                    {msg.role === 'user' ? t.opYou : t.opAiName}
                  </span>
                </div>
                <div className="bubble">
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
                      <div className="sources-label">{t.opSources}</div>
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

                  {/* Claude-style action row (2026-10-01 review): quiet
                      copy + retry icons under the AI answer, on the
                      now-boxless bubble surface. */}
                  {msg.role === 'ai' && (
                    <div className="msg-actions">
                      <button
                        className="msg-action-btn"
                        onClick={() => handleCopyMessage(msg.id, msg.content)}
                        aria-label={copiedMessageId === msg.id ? t.opCopied : t.opCopy}
                      >
                        {copiedMessageId === msg.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                      <button
                        className="msg-action-btn"
                        onClick={() => handleRetry(msg.id)}
                        disabled={isLoading}
                        aria-label={t.opRetry}
                      >
                        <RotateCw size={14} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="message-item ai">
                <BotIdentity state="working" size={32} />
                <div className="bubble bubble-pending" style={{ background: 'transparent', border: 'none', padding: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <LoadingOrb inline size={20} state="composing" label={t.opLoading} />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="input-area">
            <WorkBeam active={isLoading}>
              <div className="input-container">
                <textarea
                  ref={textareaRef}
                  className="chat-input"
                  rows={1}
                  placeholder={t.opInputPh}
                  value={input}
                  onChange={handleInput}
                  onFocus={wakeBot}
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
                  aria-label={t.opSend}
                >
                  <Send size={18} />
                </button>
              </div>
            </WorkBeam>
            <div style={{ textAlign: 'center', marginTop: '8px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {t.opDisclaimer}
            </div>
          </div>
        </div>
      </div>

      {/* Portaled conversation menu (bugfix 2026-10-01): fixed-positioned
          on document.body so the list's overflow-y frame (and the mobile
          drawer) can never clip it; flips above the button near the
          viewport bottom via the layout effect. */}
      {menuState &&
        createPortal(
          <div className="conversation-menu" ref={menuRef} style={{ top: menuState.top, left: menuState.left }}>
            <button
              onClick={() => {
                handleRenameConversation(menuState.convId);
                setMenuState(null);
              }}
            >
              <Pencil size={14} /> {t.opRename}
            </button>
            <button
              className="danger"
              onClick={() => {
                handleDeleteConversation(menuState.convId);
                setMenuState(null);
              }}
            >
              <Trash2 size={14} /> {t.opDelete}
            </button>
          </div>,
          document.body
        )}

      <DocumentDrawer doc={drawerDoc} onClose={() => setDrawerDoc(null)} />
      {dialog && <AppDialog dialog={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}

function SourceAccordion({ source, onOpenDocument }: { source: Source; onOpenDocument: (source: Source) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useStrings();
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
                {t.opScore}: {source.rerank_score.toFixed(2)}
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
            {t.opOpenDoc}
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
  const t = useStrings();
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
              <button type="button" className="btn btn-secondary" onClick={onClose}>{t.opCancel}</button>
              <button type="button" className="btn btn-primary" onClick={submitPrompt} disabled={!promptValue.trim()}>
                {t.opSave}
              </button>
            </>
          ) : (
            <>
              <button ref={defaultBtnRef} type="button" className="btn btn-secondary" onClick={onClose}>{t.opCancel}</button>
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
