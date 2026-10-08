import { useState, useRef, useEffect, useLayoutEffect, useMemo, useId } from 'react';
import { createPortal } from 'react-dom';
import { Send, ChevronDown, ChevronLeft, ChevronRight, User, Search, Plus, Trash2, MoreHorizontal, Pencil, FileText, Link2, MessagesSquare, Copy, Check, RotateCw, Square, AlertCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api, { isAbortError, isTimeoutError, isNetworkError } from '../services/api';
import { getSettings } from '../settings';
import { useStrings, getLocale, fill, STRINGS } from '../i18n';
import { useAuth } from '../hooks/useAuth';
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
  /** Corpus file backing this source, when the retrieval row resolves to a
      regulations entry (2026-10-08 critique remediation P2-5): enables the
      drawer's PDF tab from chat sources. Null/absent = no file on server. */
  filename?: string | null;
}

interface Message {
  id: number;
  role: 'user' | 'ai';
  content: string;
  sources?: Source[];
  /** 'greeting': set on the seeded first message of a fresh conversation;
      renders the bot mascot above the bubble copy. Absent on older stored
      history — cosmetic only, fully backwards-compatible.
      'error' (2026-10-08 critique remediation P1-3): a failed generation,
      rendered as a first-class failure row with its own retry action —
      never as an AI-shaped apology bubble — and excluded from the LLM
      context of later requests. */
  kind?: 'greeting' | 'error';
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
  filename?: string;
};

/* Chat history is per-account data: both keys carry the logged-in username as
   a suffix, so a second account on the same browser can never see the first
   one's conversations (2026-10-02 auth bug: the old origin-wide key leaked
   history across accounts on every register/login). The unsuffixed names are
   kept as LEGACY_* and migrated once, into whichever account opens Legal
   Opinion first after the upgrade. */
const STORAGE_KEY_BASE = 'legal_analyzer_conversations';
const ACTIVE_STORAGE_KEY_BASE = 'legal_analyzer_active_conversation';
const LEGACY_STORAGE_KEY = 'legal_analyzer_conversations';
const LEGACY_ACTIVE_STORAGE_KEY = 'legal_analyzer_active_conversation';
function storageKeysFor(username?: string): { list: string; active: string } {
  const suffix = username || 'anon';
  return {
    list: `${STORAGE_KEY_BASE}:${suffix}`,
    active: `${ACTIVE_STORAGE_KEY_BASE}:${suffix}`,
  };
}
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

/* Wait-state hardening (2026-10-08 critique remediation P1-2): the chat
   request gets its own deadline slightly above the backend's 60s LLM
   timeout, so a wedged round trip surfaces as a retryable error row
   instead of an endless spinner. */
const CHAT_TIMEOUT_MS = 90_000;

/* Relevance chip thresholds (2026-10-08 critique remediation P2-4): raw
   cross-encoder logits (ms-marco-MiniLM-L-6-v2, observed ≈3.0–5.4 on this
   corpus) mapped to honest labels. The former UI fabricated a percentage
   bar from (logit+5)×10 — pure relevance theater. */
const REL_HIGH = 4.0;
const REL_MED = 1.5;

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
/* Event-time timestamp (2026-10-08 critique remediation). react-hooks/purity
   (React Compiler RC) flags a direct Date.now() call in handleSend's body
   once handleSend also calls runGeneration — a component-scope function
   never passed to a JSX event prop directly, which apparently pulls the
   handler into the compiler's render-validated scope (removing either the
   call or the builtin clears the error; await vs void makes no difference).
   handleSend provably runs only from the composer's onClick/onKeyDown, so
   reading the clock there is event-time and safe. Wrapping the read in a
   module function satisfies the check without a suppression comment — the
   same restructure-don't-suppress convention as the async-IIFE workarounds
   for react-hooks/set-state-in-effect elsewhere in this codebase. */
function nowMs(): number {
  return Date.now();
}

function isFreshGreeting(messages: Message[], loading: boolean): boolean {
  if (loading) return false;
  if (messages.length === 0) return true;
  return messages.length === 1 && messages[0].kind === 'greeting';
}

/* Citation linkification (2026-10-08 critique remediation P1-1): the model
   is instructed to end sourced claims with [n] markers (system-prompt
   guideline 5). Rewrite in-range markers as same-document markdown links so
   the ReactMarkdown `a` override renders them as citation-badge buttons
   scrolling to source card n. Out-of-range numbers and existing [n](url)
   links stay untouched — a fabricated link is worse than no link. */
function linkifyCitations(text: string, sourceCount: number): string {
  if (sourceCount <= 0) return text;
  return text.replace(/\[(\d{1,2})\](?!\()/g, (match, digits: string) => {
    const n = Number(digits);
    if (n < 1 || n > sourceCount) return match;
    return `[${digits}](#cite-${n})`;
  });
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
  const { user } = useAuth();
  const storageKeys = useMemo(() => storageKeysFor(user?.username), [user?.username]);
  const [conversations, setConversations] = useState<Conversation[]>(() => {
    // One-time migration: adopt the pre-fix origin-wide history for the
    // account that opens the view first, then retire the legacy key.
    if (!localStorage.getItem(storageKeys.list)) {
      const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        localStorage.setItem(storageKeys.list, legacy);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
        const legacyActive = localStorage.getItem(LEGACY_ACTIVE_STORAGE_KEY);
        if (legacyActive) {
          localStorage.setItem(storageKeys.active, legacyActive);
          localStorage.removeItem(LEGACY_ACTIVE_STORAGE_KEY);
        }
      }
    }
    const raw = localStorage.getItem(storageKeys.list);
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
    const raw = localStorage.getItem(storageKeys.active);
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
  /* Whole seconds the current round trip has been running, shown next to
     the loading copy (2026-10-08 critique remediation P1-2). */
  const [elapsed, setElapsed] = useState(0);

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
  /* Live /api/chat request, abortable by the stop control and on unmount
     (2026-10-08 critique remediation P1-2). */
  const abortRef = useRef<AbortController | null>(null);

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
    // Async-IIFE wrapper (react-hooks/set-state-in-effect): this guarded
    // fallback only fires when the persisted active id is stale or missing —
    // a bounded, conditional correction, kept out of the effect body's
    // direct call graph.
    (async () => {
      if (!activeConversationId || !conversations.some(c => c.id === activeConversationId)) {
        setActiveConversationId(conversations[0]?.id ?? '');
      }
    })();
  }, [activeConversationId, conversations]);

  useEffect(() => {
    localStorage.setItem(storageKeys.list, JSON.stringify(conversations));
  }, [conversations, storageKeys]);

  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem(storageKeys.active, activeConversationId);
    }
  }, [activeConversationId, storageKeys]);

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
  /* Honest wait feedback (2026-10-08 critique remediation P1-2): a 1s
     ticker counts the round trip's whole seconds. setState fires only
     from the interval callback, never from the effect body
     (react-hooks/set-state-in-effect). */
  useEffect(() => {
    if (!isLoading) return;
    const started = Date.now();
    const iv = window.setInterval(() => {
      setElapsed(Math.round((Date.now() - started) / 1000));
    }, 1_000);
    return () => window.clearInterval(iv);
  }, [isLoading]);
  /* Unmount safety: never leave a chat request in flight behind. */
  useEffect(() => () => { abortRef.current?.abort(); }, []);
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

  /* Citation click (2026-10-08 critique remediation P1-1): scroll the chat
     box — never scrollIntoView, which drags ancestor scrollers (bug
     2026-09-29) — to the numbered source card, then flash it. */
  const flashSourceCard = (elId: string) => {
    const el = document.getElementById(elId);
    const box = chatBoxRef.current;
    if (!el || !box) return;
    const behavior: ScrollBehavior = getSettings().reduceMotion ? 'auto' : 'smooth';
    const elRect = el.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    const top = Math.max(0, box.scrollTop + (elRect.top - boxRect.top) - 16);
    box.scrollTo({ top, behavior });
    el.classList.add('cite-target');
    window.setTimeout(() => el.classList.remove('cite-target'), 1600);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const updateConversation = (conversationId: string, updater: (c: Conversation) => Conversation) => {
    setConversations(prev => prev.map(c => (c.id === conversationId ? updater(c) : c)));
  };

  /* Shared generation flow (2026-10-08 critique remediation P1-2/P1-3):
     send, retry-an-answer and retry-after-error all run through here, so
     abort, timeout and error handling exist exactly once. prefix is the
     history the answer should follow; kind:'error' rows are filtered out
     of the LLM context — a stored apology replayed as if the assistant
     had really answered was the poisoning vector. Failures land as
     first-class error rows with their own retry action; the copy is
     frozen at creation time from the locale active then. */
  const runGeneration = async (conversationId: string, prefix: Message[]) => {
    setIsLoading(true);
    setElapsed(0);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const apiMessages = prefix
        .filter((msg) => msg.kind !== 'error')
        .map((msg) => ({
          role: msg.role === 'ai' ? 'assistant' : 'user',
          content: msg.content
        }));
      const response = await api.post('/api/chat', { messages: apiMessages }, {
        timeout: CHAT_TIMEOUT_MS,
        signal: controller.signal
      });
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
      const s = STRINGS[getLocale()];
      let content = s.opServerError;
      if (isAbortError(error)) {
        content = s.opErrorAborted;
      } else if (isTimeoutError(error)) {
        content = fill(s.opErrorTimeout, { s: Math.round(CHAT_TIMEOUT_MS / 1000) });
      } else if (isNetworkError(error)) {
        content = s.opErrorNetwork;
      }
      updateConversation(conversationId, (c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: [
          ...c.messages,
          {
            id: Date.now() + 1,
            role: 'ai',
            kind: 'error',
            content
          }
        ]
      }));
    } finally {
      abortRef.current = null;
      setIsLoading(false);
    }
  };

  /* Stop control (2026-10-08 critique remediation P1-2): aborts the live
     request; the catch above records the abort as an honest error row.
     The composer stays usable while waiting — the user can draft the next
     question or copy text out of the conversation. */
  const handleStop = () => {
    abortRef.current?.abort();
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
    /* isLoading guard (2026-10-08 critique remediation P1-2): Enter during
       a live round trip must not queue a second request. */
    if (isLoading || !input.trim() || !activeConversation) return;

    const now = nowMs();
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
    if (textareaRef.current) textareaRef.current.style.height = '40px';

    await runGeneration(activeConversation.id, [...existingMessages, userMessage]);
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
    const idx = activeConversation.messages.findIndex((m) => m.id === messageId && m.role === 'ai' && m.kind !== 'error');
    if (idx < 1 || activeConversation.messages[idx - 1].role !== 'user') return;
    const prefix = activeConversation.messages.slice(0, idx);
    const conversationId = activeConversation.id;

    updateConversation(conversationId, (c) => ({ ...c, messages: c.messages.slice(0, idx) }));
    await runGeneration(conversationId, prefix);
  };

  /* "Coba lagi" on a kind:'error' row (2026-10-08 critique remediation
     P1-3): drops the failed row and regenerates from the question it
     followed, so a successful retry leaves no trace of the failure. */
  const handleRetryError = async (messageId: number) => {
    if (isLoading || !activeConversation) return;
    const idx = activeConversation.messages.findIndex((m) => m.id === messageId && m.kind === 'error');
    if (idx < 1 || activeConversation.messages[idx - 1].role !== 'user') return;
    const prefix = activeConversation.messages.slice(0, idx);
    const conversationId = activeConversation.id;

    updateConversation(conversationId, (c) => ({ ...c, messages: c.messages.slice(0, idx) }));
    await runGeneration(conversationId, prefix);
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
              msg.kind === 'error' ? (
                /* First-class failure row (2026-10-08 critique remediation
                   P1-3): toast grammar — semantic danger edge + icon — and
                   no avatar/name: an error is not the assistant speaking.
                   Its retry drops the row and regenerates. */
                <div key={msg.id} className="message-error" role="alert">
                  <AlertCircle size={18} className="message-error-icon" aria-hidden="true" />
                  <div className="message-error-body">
                    <p>{msg.content}</p>
                    <button
                      type="button"
                      className="btn btn-primary message-error-retry"
                      onClick={() => handleRetryError(msg.id)}
                      disabled={isLoading}
                    >
                      <RotateCw size={14} /> {t.opTryAgain}
                    </button>
                  </div>
                </div>
              ) : (
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
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          /* [n] markers (linkified below) render through the
                             signature Citation Badge as buttons that jump to
                             source card n (2026-10-08 critique remediation
                             P1-1). Anything else keeps the plain anchor. */
                          a: (props) => {
                            const citeMatch = String(props.href ?? '').match(/^#cite-(\d{1,2})$/);
                            if (citeMatch && msg.sources && msg.sources.length > 0) {
                              const n = Number(citeMatch[1]);
                              if (n >= 1 && n <= msg.sources.length) {
                                return (
                                  <button
                                    type="button"
                                    className="citation-badge citation-marker"
                                    aria-label={fill(t.opCiteAria, { n })}
                                    onClick={() => flashSourceCard(`source-${msg.id}-${n}`)}
                                  >
                                    {props.children}
                                  </button>
                                );
                              }
                            }
                            return <a href={props.href}>{props.children}</a>;
                          },
                        }}
                      >
                        {linkifyCitations(normalizeMarkdown(msg.content), msg.sources?.length ?? 0)}
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
                          index={index}
                          messageId={msg.id}
                          onOpenDocument={(s) =>
                            setDrawerDoc({ id: s.id, nomor: s.nomor, judul: s.judul, jenis: s.jenis, sektor: s.sektor, filename: s.filename ?? undefined })
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
              )
            ))}
            {isLoading && (
              <div className="message-item ai">
                {/* Standard anatomy (plan Task 2 Step 6): avatar column with
                    the sender name, identical to a landed AI row — the
                    pending row no longer shifts the layout when the real
                    answer replaces it. */}
                <div className="msg-avatar-col">
                  <BotIdentity size={32} state="working" />
                  <span className="msg-name">{t.opAiName}</span>
                </div>
                <div className="bubble bubble-pending">
                  <LoadingOrb
                    inline
                    size={20}
                    state="composing"
                    label={elapsed > 0 ? `${t.opLoading} · ${fill(t.opElapsed, { s: elapsed })}` : t.opLoading}
                  />
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
                />
                {/* While waiting the send button morphs into the stop
                    control — same slot, same primary chrome (One Blue
                    Rule): an exit from the wait without a second button
                    competing for the row (2026-10-08 critique remediation
                    P1-2). The textarea stays enabled for drafting. */}
                {isLoading ? (
                  <button
                    className="send-button btn-primary"
                    onClick={handleStop}
                    aria-label={t.opStop}
                    title={t.opStop}
                  >
                    <Square size={14} fill="currentColor" aria-hidden="true" />
                  </button>
                ) : (
                  <button
                    className="send-button btn-primary"
                    onClick={handleSend}
                    disabled={!input.trim()}
                    aria-label={t.opSend}
                  >
                    <Send size={18} />
                  </button>
                )}
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

function SourceAccordion({ source, index, messageId, onOpenDocument }: { source: Source; index: number; messageId: number; onOpenDocument: (source: Source) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useStrings();
  const contentId = useId();

  /* Honest relevance (2026-10-08 critique remediation P2-4): the raw
     cross-encoder logit maps to a labeled threshold chip; the fabricated
     percent bar and the raw "Skor" badge are gone. The number survives
     only in the tooltip/aria-label for anyone who wants it. */
  const rawScore = source.rerank_score;
  const relLevel: 'high' | 'med' | 'low' | null =
    rawScore == null ? null : rawScore >= REL_HIGH ? 'high' : rawScore >= REL_MED ? 'med' : 'low';
  const relLabel = relLevel === 'high' ? t.opRelHigh : relLevel === 'med' ? t.opRelMed : t.opRelLow;
  const relTip = rawScore == null ? '' : fill(t.opRelTip, { score: rawScore.toFixed(2) });

  return (
    /* Anchor target for inline [n] citation markers; the number chip makes
       the marker ↔ card pairing legible without counting (P1-1). */
    <div className={`evidence-card ${isOpen ? 'open' : ''}`} id={`source-${messageId}-${index + 1}`}>
      <button
        type="button"
        className="evidence-card-header"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="source-number">{index + 1}</span>
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
            {relLevel && (
              <span
                className={`relevance-chip relevance-chip--${relLevel}`}
                title={relTip}
                aria-label={`${t.opRelevance}: ${relLabel}. ${relTip}`}
              >
                {t.opRelevance}: {relLabel}
              </span>
            )}
          </span>
        </span>
        <ChevronDown size={18} color="var(--text-secondary)" style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.3s' }} />
      </button>

      <div className="evidence-content" id={contentId}>
        <div className="evidence-snippet">
          {source.snippet}
        </div>
        <div className="evidence-open-row">
          <button
            type="button"
            className="evidence-open-btn"
            onClick={() => onOpenDocument(source)}
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
