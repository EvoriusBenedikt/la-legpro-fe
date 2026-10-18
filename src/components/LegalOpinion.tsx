import { useState, useRef, useEffect, useLayoutEffect, useMemo, useId } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Send, ChevronDown, ChevronLeft, ChevronRight, User, Search, Plus, Trash2, MoreHorizontal, Pencil, FileText, Link2, MessagesSquare, Copy, Check, RotateCw, Square, AlertCircle, ListChecks, CheckSquare, ArrowUpDown, Pin, Eraser, Paperclip } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import api, { isAbortError, isTimeoutError, isNetworkError, uploadAttachment, listAttachments, deleteAttachment, deleteConversationAttachments } from '../services/api';
import type { AttachmentMeta } from '../services/api';
import { PendingChipRow, MessageAttachmentChips } from './ChatAttachments';
import type { PendingAttachment } from './ChatAttachments';
import { getSettings, type Locale } from '../settings';
import { useStrings, useLocale, fill, msg, STRINGS, GREETING_POOLS, type Dict, type Msg, type StringKey } from '../i18n';
import { useAuth } from '../hooks/useAuth';
import { useJobStatus } from '../context/JobStatusContext';
import { useContractUpload } from '../hooks/useContractUpload';
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
  /* i18n (2026-10-14): an 'error' row persists WHICH error it was, not its
     translated sentence, so it re-renders in the active language after a
     switch (the old build froze the text in the language of the failure).
     `content` stays only as the fallback for rows saved before this. */
  errorKey?: StringKey;
  errorParams?: Record<string, string | number>;
  /* Chat attachments (2026-10-12): server attachment ids that rode with
     this USER message. Replayed in the /api/chat window so later turns can
     still recall the files. Absent on pre-feature stored history. */
  attachment_ids?: string[];
}

interface Conversation {
  id: string;
  /* '' while the title is still the auto-generated default: the display
     title is then derived at render from `autoTitleN` (see convTitle), so
     "Percakapan 2" becomes "Conversation 2" after a language switch.
     Renamed / LLM-titled conversations store their literal text here. */
  title: string;
  /* n for "Conversation {n}"; absent/0 = the "New conversation" default. */
  autoTitleN?: number;
  createdAt: number;
  updatedAt: number;
  messages: Message[];
  /* Round 4 (2026-10-12): pinned chats sort into the sidebar's Pinned
     section. Optional so histories stored before round 4 load as-is
     (undefined == unpinned, no migration needed). */
  pinned?: boolean;
}

/* Glass-dialog state — replaces native window.confirm/prompt/alert with a
   system-consistent modal (see AppDialog at the bottom of this file). */
type DialogState =
  | { kind: 'confirm'; title: Msg; body?: Msg; confirmLabel: Msg; danger?: boolean; onConfirm: () => void }
  | { kind: 'prompt'; title: Msg; label: Msg; initialValue: string; onSubmit: (value: string) => void }
  | { kind: 'alert'; title: Msg; body: Msg };

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
const SORT_STORAGE_KEY_BASE = 'legal_analyzer_conversation_sort';
function storageKeysFor(username?: string): { list: string; active: string; sort: string } {
  const suffix = username || 'anon';
  return {
    list: `${STORAGE_KEY_BASE}:${suffix}`,
    active: `${ACTIVE_STORAGE_KEY_BASE}:${suffix}`,
    sort: `${SORT_STORAGE_KEY_BASE}:${suffix}`,
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
   names the assistant (gemma). Emitted as a markdown H2 so the hero
   reads as a true heading; the former scope paragraph was deleted in
   the 2026-10-01 review. Since the same day's "let it be the user"
   review the greeting is an empty-state only — rendered live while a
   conversation holds no messages, never seeded into history. Stored
   conversations created before that review keep their frozen greeting
   message (kind 'greeting'); history is user data, never rewritten.
   Round-3 review (2026-10-12, user request: greetings that rotate like
   Claude's) picks the copy from a per-locale pool (i18n GREETING_POOLS):
   `variant` is a pure hash of the conversation id, so one conversation
   keeps one greeting across renders and reloads while each new chat
   rotates. Templates substitute {time} (the salutation above) and
   {offer} (opGreetOffer). */
function greetingContent(locale: Locale, variant: number): string {
  const s = STRINGS[locale];
  const h = new Date().getHours();
  const time = h < 5 || h >= 18 ? s.opGreetNight : h < 12 ? s.opGreetMorning : s.opGreetAfternoon;
  const pool = GREETING_POOLS[locale];
  const template = pool[((variant % pool.length) + pool.length) % pool.length];
  return `## ${template.replace('{time}', time).replace('{offer}', s.opGreetOffer)}`;
}

/* FNV-1a over the conversation id (2026-10-12): pure and deterministic
   — no Math.random in render (the React Compiler's purity check would
   flag it, and a re-render would re-roll the greeting mid-typing). The
   same conversation always hashes to the same pool index, including
   after a reload; UUID ids distribute evenly across new chats. */
function greetingVariant(id: string | undefined): number {
  let h = 0x811c9dc5;
  const key = id ?? 'new';
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
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

/* Sidebar preview text (2026-10-12 critique, polish): stored messages are
   raw markdown — bold markers, [n] citations, heading hashes, and table
   pipes all leaked into the one-line conversation preview. Strip the
   grammar, keep the words; the full render stays inside the chat. */
function stripMarkdown(src: string): string {
  return src
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\d{1,2}\]/g, ' ')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*[-*_]{3,}\s*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* Roving arrow keys for the role="menu" dropdowns (2026-10-12 critique,
   polish): menu semantics promise arrow navigation — without it a keyboard
   user has to Tab through the whole panel. Wraps at both ends; Home/End
   jump. Shared by the sort menu and the portaled row menu, which focus
   their first item on open so the arrows are discoverable. */
function handleMenuKeys(e: ReactKeyboardEvent<HTMLElement>) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
  const items = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>(
      'button[role="menuitem"], button[role="menuitemradio"]'
    )
  );
  if (items.length === 0) return;
  const idx = items.indexOf(document.activeElement as HTMLElement);
  const next =
    e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? items.length - 1
        : e.key === 'ArrowDown'
          ? (idx + 1) % items.length
          : (idx - 1 + items.length) % items.length;
  e.preventDefault();
  items[next].focus();
}

/* Per-message attachment cap (spec §10). FE-side contract — each POST
   carries exactly one file, so the server can only enforce the
   per-conversation cap (20); the composer refuses picks beyond 4 chips. */
const ATTACH_MAX_PER_MESSAGE = 4;

/* Module-level in-flight registry (background-generation fix, 2026-10-14):
   survives component unmount/remount cycles caused by React Router's route
   switching. Maps conversationId → { controller, jobId, startedAt }.
   On mount the component checks this map: if its active conversation is
   in-flight it restores isLoading immediately so the spinner returns and
   the stop button works. On generation end the entry is deleted.
   Module-scope is safe: there is exactly one LegalOpinion mounted at any
   time (route-based rendering). */
interface InFlightEntry {
  controller: AbortController;
  jobId: string | undefined;
  startedAt: number;
}
const inFlightGenerations = new Map<string, InFlightEntry>();

/* Display title of a conversation. Auto-generated defaults are stored as an
   empty title (+ optional autoTitleN) and resolved here with the live
   dictionary, so they follow the language. Titles saved by older builds are
   literal text and are shown as-is. */
function convTitle(c: Conversation, t: Dict): string {
  if (c.title) return c.title;
  return c.autoTitleN ? fill(t.opNewTitle, { n: c.autoTitleN }) : t.opDefaultTitle;
}

function createConversation(autoTitleN?: number): Conversation {
  const now = Date.now();
  return {
    id: `conv_${now}_${Math.random().toString(36).slice(2, 7)}`,
    title: '',
    autoTitleN,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
}

export default function LegalOpinion() {
  const t = useStrings();
  const locale = useLocale();
  const { user } = useAuth();
  const { addJob, updateJob, clearJob } = useJobStatus();
  const { notify } = useContractUpload();
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
  /* Round 4 (2026-10-12, Claude-style sidebar): selection mode for bulk
     delete, the persisted sort order, and the sort dropdown's open
     state. selectedIds holds conversation IDS, so a selection survives
     search filtering and re-sorts; the sort choice is per-account like
     the history keys. */
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [sortMode, setSortMode] = useState<'activity' | 'created' | 'name'>(() => {
    const raw = localStorage.getItem(storageKeys.sort);
    return raw === 'created' || raw === 'name' ? raw : 'activity';
  });
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement | null>(null);
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
  /* Chat attachments (2026-10-12): composer-side chips from pick until the
     server says ready/failed. Every chip carries the conversation id it
     uploaded against, so switching conversations hides (never deletes) the
     other conversation's chips and a send clears exactly its own. */
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  /* Background-generation support: track mount state so runGeneration can
     fall back to a direct localStorage write when the component is gone.
     storageKeysRef keeps the current key accessible inside async callbacks
     that outlive the render cycle. */
  const mountedRef = useRef(true);
  const storageKeysRef = useRef(storageKeys);
  useEffect(() => {
    storageKeysRef.current = storageKeys;
  }, [storageKeys]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  /* In-flight restore (2026-10-14): when React Router remounts this
     component after a tab switch, check the module-level registry for a
     generation that was running on the active conversation. If found,
     restore isLoading and hook up the abort controller so the stop button
     still works. The elapsed timer restarts from the original start time. */
  useEffect(() => {
    if (!activeConversationId) return;
    const entry = inFlightGenerations.get(activeConversationId);
    if (!entry) return;
    // The registry is an external async source; restore both state fields together.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true);
    abortRef.current = entry.controller;
    // Restart the elapsed counter from when the generation actually began.
    const already = Math.round((Date.now() - entry.startedAt) / 1000);
    setElapsed(already);
  }, [activeConversationId]); // intentionally runs only when the active id changes (mount + switch)

  /* Storage event (2026-10-14): cross-tab sync. When the user has two
     browser tabs open and the background generation in one tab writes to
     localStorage, the other tab's mounted component picks it up here and
     reloads state. Same-tab background writes (component unmounted then
     remounted) are handled by the useState initializer (re-reads from
     localStorage on every fresh mount) and by the in-flight restore effect
     above (mountedRef becomes true, so the async callback uses the direct
     setConversations path once the generation lands). */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== storageKeys.list || !e.newValue) return;
      try {
        const parsed = JSON.parse(e.newValue) as Conversation[];
        if (!Array.isArray(parsed)) return;
        setConversations(parsed);
      } catch {
        // malformed — ignore
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [storageKeys.list]);

  const resizeTextarea = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    // Chromium counts a wrapped placeholder toward scrollHeight, so an
    // empty field measured several lines tall in narrow columns — the
    // inflation pushed the centered fresh composer into the hero
    // (2026-10-12). Measure with the placeholder neutralized; the
    // restore is synchronous, so no frame ever paints without it. With
    // text present the placeholder isn't rendered anyway, so content
    // measurement is unaffected.
    const ph = el.placeholder;
    el.placeholder = '';
    const content = el.scrollHeight;
    el.placeholder = ph;
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

  /* Round 4: persist the sort choice per account, same single-key
     pattern as the active-conversation pointer. */
  useEffect(() => {
    localStorage.setItem(storageKeys.sort, sortMode);
  }, [sortMode, storageKeys]);

  /* Round 4: close the sort dropdown on any outside press — the row
     kebab already has this grammar via its portal effect. */
  useEffect(() => {
    if (!sortMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [sortMenuOpen]);

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

  /* Attachment chips belonging to the ACTIVE conversation (the state array
     may also hold chips from other conversations — they stay alive if the
     user switches back, and their server rows are cleaned by the
     conversation-wide bulk delete in Task 6's wiring). */
  const visiblePending = useMemo(
    () => pending.filter((p) => p.convId === activeConversation?.id),
    [pending, activeConversation?.id]
  );
  /* Send gate (spec §7): anything still uploading/processing blocks the
     send — a half-uploaded file cannot ride along. Failed chips do NOT
     block; they are left behind on send or X'd away. */
  const attachBlocked = visiblePending.some(
    (p) => p.status === 'uploading' || p.status === 'processing'
  );
  /* PDF chips flip processing → ready/failed server-side (background
     pipeline); poll the conversation's metadata every 2s while any visible
     chip is processing. The setState bails on unchanged values (house
     pattern, see the nap ticker below), and a transient poll failure just
     lets the next tick retry. */
  const anyProcessing = visiblePending.some((p) => p.status === 'processing');
  useEffect(() => {
    if (!anyProcessing || !activeConversationId) return;
    const iv = window.setInterval(() => {
      listAttachments(activeConversationId)
        .then((metas) => {
          setPending((prev) => {
            let changed = false;
            const next = prev.map((p) => {
              if (p.status !== 'processing' || !p.id) return p;
              const m = metas.find((x) => x.id === p.id);
              if (!m || m.status === 'processing') return p;
              changed = true;
              return m.status === 'ready'
                ? { ...p, status: 'ready' as const }
                : { ...p, status: 'failed' as const, error: m.error ?? 'failed' };
            });
            return changed ? next : prev;
          });
        })
        .catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(iv);
  }, [anyProcessing, activeConversationId]);

  /* History-chip metadata (2026-10-12, Task 6): the conversation's server
     attachment list, tagged with the conversation id so a switch can never
     render the previous conversation's metas (tag mismatch = still loading
     = no chips yet, no ghost flash). A failed fetch degrades to an empty
     list — referenced ids then render ghost chips, which is the honest
     "file unavailable" state rather than a spinner that never ends. */
  const [attachState, setAttachState] = useState<{ convId: string; metas: AttachmentMeta[] } | null>(null);
  useEffect(() => {
    if (!activeConversationId) return;
    listAttachments(activeConversationId)
      .then((metas) => setAttachState({ convId: activeConversationId, metas }))
      .catch(() => setAttachState({ convId: activeConversationId, metas: [] }));
  }, [activeConversationId]);
  const attachMetas =
    attachState && activeConversation && attachState.convId === activeConversation.id
      ? attachState.metas
      : null;

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
  /* The stop button aborts the in-flight request; navigating away does NOT
     abort it — the generation continues in the background and the result
     lands in localStorage when it finishes so it's there when the user
     returns. */
  const botState: 'default' | 'working' | 'sleeping' = isLoading
    ? 'working'
    : botPhase === 'sleeping'
      ? 'sleeping'
      : 'default';

  const filteredConversations = useMemo(() => {
    const query = conversationSearch.trim().toLowerCase();
    const base = query
      ? conversations.filter((c) => {
          const inTitle = convTitle(c, t).toLowerCase().includes(query);
          const inMessages = c.messages.some(m => m.content.toLowerCase().includes(query));
          return inTitle || inMessages;
        })
      : conversations;
    /* Round 4: the persisted sort applies to the filtered rows; the
       Pinned/unpinned split happens after, so both sections share the
       order (Claude's grammar). */
    return [...base].sort((a, b) => {
      if (sortMode === 'name') return convTitle(a, t).localeCompare(convTitle(b, t));
      if (sortMode === 'created') return b.createdAt - a.createdAt;
      return b.updatedAt - a.updatedAt;
    });
  }, [conversationSearch, conversations, sortMode, t]);

  const pinnedConversations = useMemo(
    () => filteredConversations.filter((c) => c.pinned),
    [filteredConversations]
  );
  const unpinnedConversations = useMemo(
    () => filteredConversations.filter((c) => !c.pinned),
    [filteredConversations]
  );

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
    /* Fresh hero pane (2026-10-12): nothing to follow yet — and in a
       short viewport the content-sized pane CAN scroll, so chasing the
       sentinel clipped the mascot's head off the top (found in the
       frontier-composer verification pass). */
    if (isFreshGreeting(messages, isLoading)) return;
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
    setConversations(prev => {
      const next = prev.map(c => (c.id === conversationId ? updater(c) : c));
      // Write through to localStorage immediately so the data survives even
      // if the component unmounts before React flushes the persistence effect.
      try {
        localStorage.setItem(storageKeysRef.current.list, JSON.stringify(next));
      } catch { /* quota / unavailable — the effect is the fallback */ }
      return next;
    });
  };

  /* Shared generation flow (2026-10-08 critique remediation P1-2/P1-3,
     background fix 2026-10-14): send, retry-an-answer and retry-after-error
     all run through here, so abort, timeout and error handling exist exactly
     once. prefix is the history the answer should follow; kind:'error' rows
     are filtered out of the LLM context — a stored apology replayed as if
     the assistant had really answered was the poisoning vector. Failures land
     as first-class error rows with their own retry action; the copy is
     frozen at creation time from the locale active then.

     Background run: the entry is registered in the module-level
     inFlightGenerations map before the await, so if the user switches tabs
     and comes back the new component instance restores isLoading and the
     abort controller immediately on mount. Toast notifications land whether
     or not the component is mounted (notify comes from UploadProvider, which
     lives above the router). */
  const runGeneration = async (conversationId: string, prefix: Message[], jobId?: string) => {
    setIsLoading(true);
    setElapsed(0);
    const controller = new AbortController();
    abortRef.current = controller;

    // Register in the module-level map BEFORE the await so a concurrent
    // mount can find the entry immediately.
    // This timestamp belongs to the async request registry, not render output.
    // eslint-disable-next-line react-hooks/purity
    inFlightGenerations.set(conversationId, { controller, jobId, startedAt: Date.now() });

    /* persistConversationUpdate: applies an updater to the conversation
       whether or not the component is still mounted.
       - Mounted: goes through setConversations which now writes through to
         localStorage synchronously inside the setState updater.
       - Unmounted: setConversations is a no-op, so we read + write
         localStorage directly from storageKeysRef. Both paths are safe. */
    const persistConversationUpdate = (updater: (c: Conversation) => Conversation) => {
      if (mountedRef.current) {
        // Normal path: write-through updateConversation (persists + updates UI).
        updateConversation(conversationId, updater);
      } else {
        // Background path: component is gone, write directly to localStorage.
        // The storage event listener in the new component instance (or on
        // other tabs) picks this up and reloads state automatically.
        try {
          const key = storageKeysRef.current.list;
          const raw = localStorage.getItem(key);
          const stored: Conversation[] = raw ? JSON.parse(raw) : [];
          const next = stored.map(c => c.id === conversationId ? updater(c) : c);
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // localStorage unavailable or quota — nothing we can do.
        }
      }
    };

    try {
      const apiMessages = prefix
        .filter((msg) => msg.kind !== 'error')
        .map((msg) => ({
          role: msg.role === 'ai' ? 'assistant' : 'user',
          content: msg.content,
          /* Chat attachments (2026-10-12): replay stored ids so later turns
              can still recall the files; absent on pre-feature history. */
          ...(msg.attachment_ids?.length ? { attachment_ids: msg.attachment_ids } : {})
        }));
      const response = await api.post('/api/chat', { messages: apiMessages }, {
        timeout: CHAT_TIMEOUT_MS,
        signal: controller.signal
      });
      const data = response.data;
      /* Apply the LLM-generated title when the backend supplies one (first
         message only). Fall back to slicing the user text when it's absent
         (e.g. title-gen failed silently) — keeps the old behaviour intact. */
      const userText = prefix.filter(m => m.role === 'user').slice(-1)[0]?.content ?? '';
      persistConversationUpdate((c) => {
        const shouldSetTitle =
          !c.title ||
          // Legacy: titles stored as translated literals by older builds.
          c.title.startsWith('Percakapan') ||
          c.title.startsWith('Conversation') ||
          c.title === 'New conversation' ||
          c.title === 'Percakapan Baru';
        const newTitle = shouldSetTitle
          ? (data.suggested_title ?? (userText.slice(0, 42) || c.title))
          : c.title;
        return {
          ...c,
          title: newTitle,
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
        };
      });
      if (jobId) updateJob(jobId, 'completed');
      /* Background-completion toast: only fires when the user navigated away
         while the request was running. The toast lands in the same tab via
         UploadProvider (which lives above the router and is always mounted),
         so the user gets a visible nudge to come back and read the answer. */
      if (!mountedRef.current) {
        notify('success', { key: 'opNotifyReady' }, 8000);
      }
    } catch (error) {
      console.error(error);
      /* Persist WHICH error this was (a key + params), never the translated
         sentence: the row is saved to localStorage and must re-render in
         whatever language is active when it is read (bug 2026-10-14). */
      let errorKey: StringKey = 'opServerError';
      let errorParams: Record<string, string | number> | undefined;
      if (isAbortError(error)) {
        errorKey = 'opErrorAborted';
      } else if (isTimeoutError(error)) {
        errorKey = 'opErrorTimeout';
        errorParams = { s: Math.round(CHAT_TIMEOUT_MS / 1000) };
      } else if (isNetworkError(error)) {
        errorKey = 'opErrorNetwork';
      }
      persistConversationUpdate((c) => ({
        ...c,
        updatedAt: Date.now(),
        messages: [
          ...c.messages,
          {
            id: Date.now() + 1,
            role: 'ai',
            kind: 'error',
            // Empty on purpose: the row renders from errorKey. Rows saved
            // by older builds keep their literal `content` as the fallback.
            content: '',
            errorKey,
            errorParams
          }
        ]
      }));
      // Don't notify on intentional abort — only real failures.
      // On abort, remove the in-flight job entirely (user cancelled it).
      if (jobId) {
        if (isAbortError(error)) clearJob(jobId);
        else updateJob(jobId, 'failed');
      }
      if (!mountedRef.current && !isAbortError(error)) {
        notify('error', { key: 'opNotifyFailed' }, 12000);
      }
    } finally {
      inFlightGenerations.delete(conversationId);
      abortRef.current = null;
      if (mountedRef.current) setIsLoading(false);
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
    const convo = createConversation(conversations.length + 1);
    setConversations(prev => [convo, ...prev]);
    setActiveConversationId(convo.id);
    setInput('');
  };

  /* Round 4: the header's Clear conversation button moved into the row
     kebab, so the handler takes the target id instead of assuming the
     active conversation. */
  const handleClearConversation = (conversationId: string) => {
    setDialog({
      kind: 'confirm',
      title: { key: 'opClearTitle' },
      body: { key: 'opClearBody' },
      confirmLabel: { key: 'opClearConfirm' },
      danger: true,
      onConfirm: () => {
        updateConversation(conversationId, (c) => ({
          ...c,
          updatedAt: Date.now(),
          messages: [],
        }));
        /* Chat attachments (2026-10-12): server storage dies with the local
           messages; best-effort — failures only orphan files the next
           clear/delete retries. */
        deleteConversationAttachments(conversationId).catch(console.warn);
      },
    });
  };

  const handleRenameConversation = (conversationId: string) => {
    const target = conversations.find((c) => c.id === conversationId);
    if (!target) return;
    setDialog({
      kind: 'prompt',
      title: { key: 'opRenameTitle' },
      label: { key: 'opRenameLabel' },
      initialValue: convTitle(target, t),
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
        title: { key: 'opDeleteLastTitle' },
        body: { key: 'opDeleteLastBody' },
      });
      return;
    }

    const target = conversations.find((c) => c.id === conversationId);
    if (!target) return;
    setDialog({
      kind: 'confirm',
      title: { key: 'opDeleteTitle' },
      // The title param is itself a Msg-free literal when the user named it,
      // or an auto title that must follow the language: keep it as a Msg.
      body: {
        key: 'opDeleteBody',
        params: { t: target.title ? { text: target.title } : target.autoTitleN
          ? { key: 'opNewTitle', params: { n: target.autoTitleN } }
          : { key: 'opDefaultTitle' } },
      },
      confirmLabel: { key: 'opDeleteConfirm' },
      danger: true,
      onConfirm: () => {
        const remaining = conversations.filter((c) => c.id !== conversationId);
        setConversations(remaining);
        if (activeConversationId === conversationId) {
          setActiveConversationId(remaining[0]?.id ?? '');
        }
        deleteConversationAttachments(conversationId).catch(console.warn);
      },
    });
  };

  /* Round 4 (2026-10-12): selection-mode helpers for bulk delete.
     Leaving the mode always drops the selection; select-all covers the
     filtered rows the user can actually see; deleting a selection that
     spans every conversation hits the same last-conversation alert as
     the single-row flow. */
  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleToggleSelected = (conversationId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedIds(new Set(filteredConversations.map((c) => c.id)));
  };

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    if (selectedIds.size >= conversations.length) {
      // Deleting ALL conversations — confirm then auto-create a fresh one
      setDialog({
        kind: 'confirm',
        title: { key: 'opDeleteAllTitle' },
        body: { key: 'opDeleteAllBody', params: { n: selectedIds.size } },
        confirmLabel: { key: 'opDeleteConfirm' },
        danger: true,
        onConfirm: () => {
          const fresh = createConversation();
          selectedIds.forEach((id) => deleteConversationAttachments(id).catch(console.warn));
          setConversations([fresh]);
          setActiveConversationId(fresh.id);
          exitSelectMode();
        },
      });
      return;
    }
    setDialog({
      kind: 'confirm',
      title: { key: 'opDeleteManyTitle' },
      body: { key: 'opDeleteManyBody', params: { n: selectedIds.size } },
      confirmLabel: { key: 'opDeleteConfirm' },
      danger: true,
      onConfirm: () => {
        const remaining = conversations.filter((c) => !selectedIds.has(c.id));
        setConversations(remaining);
        if (activeConversationId && selectedIds.has(activeConversationId)) {
          setActiveConversationId(remaining[0]?.id ?? '');
        }
        /* One bulk call per deleted conversation (the endpoint is
           per-conversation); the closure's selectedIds snapshot is the
           set confirmed in the dialog. */
        selectedIds.forEach((id) => deleteConversationAttachments(id).catch(console.warn));
        exitSelectMode();
      },
    });
  };

  const handleTogglePin = (conversationId: string) => {
    updateConversation(conversationId, (c) => ({ ...c, pinned: !c.pinned }));
  };

  /* Transient over-cap notice (2026-10-12 critique, clarify P1-3): shares
     the hint slot's grammar, self-clears after 5s, and stacks under the
     send-gate hint when a truncated pick is still processing. */
  const [attachNotice, setAttachNotice] = useState('');
  const attachNoticeTimer = useRef<number | undefined>(undefined);
  const flashAttachNotice = (msg: string) => {
    window.clearTimeout(attachNoticeTimer.current);
    setAttachNotice(msg);
    attachNoticeTimer.current = window.setTimeout(() => setAttachNotice(''), 5000);
  };
  useEffect(() => () => window.clearTimeout(attachNoticeTimer.current), []);

  /* Paperclip pick (2026-10-12): ensure a conversation id first — a fresh
     chat mints one exactly like handleCreateConversation (minus clearing
     the input: an attach must not eat a drafted question) so the upload
     and the first message land in the SAME conversation — then POST each
     file. Picks beyond the per-message cap (4) are counted and announced
     in the hint slot (2026-10-12 critique, clarify P1-3); the
     per-conversation cap (20) is server-enforced (422 'limit' → failed
     chip). */
  const handleFilesPicked = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let convId = activeConversation?.id;
    if (!convId) {
      const convo = createConversation(conversations.length + 1);
      setConversations((prev) => [convo, ...prev]);
      setActiveConversationId(convo.id);
      convId = convo.id;
    }
    /* TS resets let-narrowing inside closures; freeze the id for the
       setPending callbacks below. */
    const cid = convId;
    const capacity = ATTACH_MAX_PER_MESSAGE - visiblePending.length;
    /* Clarify P1-3 (2026-10-12 critique): over-cap picks used to vanish
       without a word — count the drops and announce them in the hint slot
       instead of failing silently. */
    const accepted = Array.from(files).slice(0, Math.max(0, capacity));
    const dropped = files.length - accepted.length;
    if (dropped > 0) {
      flashAttachNotice(fill(t.opAttachTruncated, { max: ATTACH_MAX_PER_MESSAGE, n: dropped }));
    }
    if (accepted.length === 0) return;
    for (const file of accepted) {
      const key = `att_${nowMs()}_${Math.random().toString(36).slice(2, 7)}`;
      setPending((prev) => [...prev, { key, convId: cid, file, status: 'uploading' }]);
      uploadAttachment(cid, file)
        .then((meta) => {
          setPending((prev) =>
            prev.map((p) =>
              p.key === key
                ? { ...p, id: meta.id, status: meta.status === 'ready' ? 'ready' : 'processing' }
                : p
            )
          );
        })
        .catch((e) => {
          /* Task-4 client rethrows BE codes as Error('oversize'|'type'|
             'limit'); anything else shows its raw message in the chip. */
          const code = e instanceof Error ? e.message : 'error';
          setPending((prev) =>
            prev.map((p) => (p.key === key ? { ...p, status: 'failed', error: code } : p))
          );
        });
    }
  };

  /* X on a pending chip: drop it locally and best-effort delete the server
     row when the POST already resolved (id present); the conversation-wide
     bulk delete is the backstop, so a failed DELETE is swallowed. */
  const handleRemovePending = (key: string) => {
    const chip = pending.find((p) => p.key === key);
    setPending((prev) => prev.filter((p) => p.key !== key));
    if (chip?.id) deleteAttachment(chip.id).catch(() => undefined);
  };

  const handleSend = async () => {
    /* isLoading guard (2026-10-08 critique remediation P1-2): Enter during
       a live round trip must not queue a second request. */
    if (isLoading || !input.trim() || !activeConversation) return;
    /* Attach gate (spec §7): chips still uploading/processing block the
       send — the button mirrors this via aria-disabled + the hint line,
       and the Enter keydown path lands here too. */
    if (attachBlocked) return;

    const now = nowMs();
    const userContent = input.trim();
    /* Ready chips ride along as attachment_ids; failed chips are left
       behind (the user can X them) and cleared with the row below. */
    const readyIds = visiblePending
      .filter((p) => p.status === 'ready' && p.id)
      .map((p) => p.id as string);
    const userMessage: Message = {
      id: now,
      role: 'user',
      content: userContent,
      ...(readyIds.length > 0 ? { attachment_ids: readyIds } : {})
    };

    const existingMessages = activeConversation.messages;
    /* Title is now set by the backend on the first message (suggested_title
       in ChatResponse). We still pass the user text as a fallback inside
       runGeneration in case the LLM title call fails. */

    updateConversation(activeConversation.id, (c) => ({
      ...c,
      updatedAt: now,
      messages: [...c.messages, userMessage],
    }));
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = '40px';
    /* Clear exactly this conversation's chips (others stay in state, hidden
       until the user switches back). */
    setPending((prev) => prev.filter((p) => p.convId !== activeConversation.id));
    /* Promote chips to history: refetch the server list so the message row
       about to render finds its metas (it would otherwise ghost — its ids
       postdate the list fetched on conversation activation). */
    listAttachments(activeConversation.id)
      .then((metas) => setAttachState({ convId: activeConversation.id, metas }))
      .catch(() => undefined);

    const opJobId = `opinion-${now}`;
    addJob(opJobId, 'uploading', userContent.slice(0, 48) || t.notifTypeOpinion, 'opinion');
    await runGeneration(activeConversation.id, [...existingMessages, userMessage], opJobId);
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
      {/* Round 4 (2026-10-12, Claude-style sidebar): the view header is
          gone entirely — the panel and the chat column now start at the
          card's top edge. New chat moved to the panel top, Clear
          conversation into the row kebab, and the mobile drawer opener
          floats over the chat column. */}
      <div className={`legal-opinion-body ${historyHidden ? 'history-collapsed' : ''}`}>
        {panelOpen && (
          <div
            className="conversation-panel-backdrop"
            onClick={() => setPanelOpen(false)}
            aria-hidden="true"
          />
        )}
        <aside
          className={`conversation-panel ${panelOpen ? 'open' : ''} ${selectMode ? 'selecting' : ''}`}
          id="conversation-panel"
          aria-label={t.opPanelLabel}
          inert={historyHidden && !panelOpen}
        >
          <button className="conversation-new-btn" onClick={handleCreateConversation}>
            <Plus size={16} />
            <span>{t.opNew}</span>
          </button>
          {selectMode ? (
            <div className="select-toolbar">
              <span className="select-count">{fill(t.opSelectedCount, { n: selectedIds.size })}</span>
              <button className="conv-icon-btn" onClick={handleSelectAll}>
                {t.opSelectAll}
              </button>
              <button
                className="conv-icon-btn danger"
                onClick={handleDeleteSelected}
                disabled={selectedIds.size === 0}
              >
                <Trash2 size={14} /> {t.opDeleteSelected}
              </button>
              <button className="conv-icon-btn" onClick={exitSelectMode}>
                {t.opCancel}
              </button>
            </div>
          ) : (
          <div className="conversation-search">
            <Search size={16} />
            <input
              type="text"
              placeholder={t.opSearchPh}
              value={conversationSearch}
              onChange={(e) => setConversationSearch(e.target.value)}
            />
            <div className="conv-search-actions">
              <div className="conv-sort-wrap" ref={sortMenuRef}>
                <button
                  className="conv-icon-btn"
                  onClick={() => setSortMenuOpen((o) => !o)}
                  aria-label={t.opSortLabel}
                  aria-haspopup="true"
                  aria-expanded={sortMenuOpen}
                >
                  <ArrowUpDown size={15} />
                </button>
                {sortMenuOpen && (
                  <div className="sort-menu" role="menu" onKeyDown={handleMenuKeys}>
                    {([['activity', t.opSortActivity], ['created', t.opSortCreated], ['name', t.opSortName]] as const).map(([mode, label], i) => (
                      <button
                        key={mode}
                        role="menuitemradio"
                        aria-checked={sortMode === mode}
                        autoFocus={i === 0}
                        onClick={() => {
                          setSortMode(mode);
                          setSortMenuOpen(false);
                        }}
                      >
                        {sortMode === mode ? <Check size={14} /> : <span className="sort-menu-spacer" />}
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                className="conv-icon-btn"
                onClick={() => setSelectMode(true)}
                aria-label={t.opSelectMode}
                aria-pressed={selectMode}
              >
                <ListChecks size={15} />
              </button>
            </div>
          </div>
          )}
          <div className="conversation-list">
            {pinnedConversations.length > 0 && (
              <div className="conversation-section-label">{t.opPinned}</div>
            )}
            {[...pinnedConversations, ...unpinnedConversations].map((conv, i) => (
              <div
                key={conv.id}
                className={`conversation-item ${conv.id === activeConversation?.id ? 'active' : ''} ${selectedIds.has(conv.id) ? 'selected' : ''} ${i === pinnedConversations.length && pinnedConversations.length > 0 ? 'section-start' : ''}`}
              >
                <button
                  className="conversation-main-btn"
                  onClick={() => {
                    /* In selection mode the row toggles instead of
                       opening — the checkbox is the row's own state. */
                    if (selectMode) {
                      handleToggleSelected(conv.id);
                      return;
                    }
                    setActiveConversationId(conv.id);
                    setMenuState(null);
                    setPanelOpen(false);
                  }}
                  aria-pressed={selectMode ? selectedIds.has(conv.id) : undefined}
                >
                  {selectMode &&
                    (selectedIds.has(conv.id) ? (
                      <CheckSquare size={16} className="conv-check on" />
                    ) : (
                      <Square size={16} className="conv-check" />
                    ))}
                  <span className="conv-text">
                    <div className="conversation-title">{convTitle(conv, t)}</div>
                    <div className="conversation-preview">
                      {stripMarkdown(conv.messages[conv.messages.length - 1]?.content ?? '') ||
                        t.opNoPreview}
                    </div>
                  </span>
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
                      const MENU_W = 180;
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

        {/* Frontier composer layout (2026-10-12, refined the same day on
            user review): --fresh pins the hero to the pane top and floats
            the composer at the pane's vertical middle (absolute centering
            in components.css); the first send drops the class and the
            composer returns to flow, docked full-width at the bottom. One
            composer instance across both layouts — focus and an in-flight
            WorkBeam survive the move. */}
        <div className={isFreshGreeting(messages, isLoading) ? 'chat-main chat-main--fresh' : 'chat-main'}>
          {/* Round 4: with the view header gone, the mobile (≤767px)
              drawer opener floats at the chat's top-left corner; the
              class pair keeps it display:none on desktop. */}
          <button
            className="panel-toggle-btn panel-toggle-float"
            onClick={() => setPanelOpen(true)}
            aria-label={t.opPanelLabel}
            aria-expanded={panelOpen}
            aria-controls="conversation-panel"
          >
            <MessagesSquare size={16} />
          </button>
          <div className="chat-box" ref={chatBoxRef} role="log" aria-live="polite" aria-label={t.opHistoryLabel}>
            {isFreshGreeting(messages, isLoading) && (
              <div className="greeting-hero">
                {/* size 88 → a 132px canvas box (bot-avatars renders 1.5×
                    the size prop, measured): compacted 2026-10-12 so the
                    pane-centered composer clears the hero at laptop pane
                    heights. */}
                <BotIdentity size={88} state={botState} />
                <div className="greeting-hero-text markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {normalizeMarkdown(
                      messages.length === 0
                        ? greetingContent(locale, greetingVariant(activeConversationId))
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
                    <p>
                      {msg.errorKey
                        ? fill(t[msg.errorKey], msg.errorParams ?? {})
                        : msg.content}
                    </p>
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
                    <>
                      <div style={{ whiteSpace: 'pre-wrap', lineHeight: '1.6' }}>{msg.content}</div>
                      {/* History attachment chips (2026-10-12): thumbs + pdf
                          chips under the question text; metas come from the
                          conversation's server list (attachState). */}
                      {msg.attachment_ids && msg.attachment_ids.length > 0 && (
                        <MessageAttachmentChips ids={msg.attachment_ids} metas={attachMetas} />
                      )}
                    </>
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

                  {/* Only show sources when the answer actually references the knowledge base.
                      Hide for general questions, greetings, or responses that don't need citations. */}
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
            {/* Pending-attachment chips (2026-10-12): above the card so the
                WorkBeam border animation keeps tracking only the composer's
                rounded rect. */}
            <PendingChipRow chips={visiblePending} onRemove={handleRemovePending} />
            <WorkBeam active={isLoading}>
              <div className="input-container">
                {/* Paperclip (2026-10-12): reuses the quiet-icon grammar;
                    the hidden input carries the accept filter (server-side
                    magic-byte sniffing is the backstop). */}
                <button
                  type="button"
                  className="conv-icon-btn attach-btn"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label={t.opAttach}
                  title={t.opAttach}
                >
                  <Paperclip size={16} aria-hidden="true" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,application/pdf"
                  className="attach-input-hidden"
                  tabIndex={-1}
                  aria-hidden="true"
                  onChange={(e) => {
                    handleFilesPicked(e.target.files);
                    /* Reset so re-picking the same file fires change again. */
                    e.target.value = '';
                  }}
                />
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
                    aria-disabled={attachBlocked || undefined}
                    aria-label={t.opSend}
                    title={attachBlocked ? t.opAttachSendHint : undefined}
                  >
                    <Send size={18} />
                  </button>
                )}
              </div>
            </WorkBeam>
            {attachBlocked && (
              <div className="composer-attach-hint" role="status">
                {t.opAttachSendHint}
              </div>
            )}
            {attachNotice && (
              <div className="composer-attach-hint" role="status">
                {attachNotice}
              </div>
            )}
            <div className="composer-disclaimer">{t.opDisclaimer}</div>
          </div>
        </div>
      </div>

      {/* Portaled conversation menu (bugfix 2026-10-01): fixed-positioned
          on document.body so the list's overflow-y frame (and the mobile
          drawer) can never clip it; flips above the button near the
          viewport bottom via the layout effect. */}
      {menuState &&
        createPortal(
          <div
            className="conversation-menu"
            role="menu"
            onKeyDown={handleMenuKeys}
            ref={menuRef}
            style={{ top: menuState.top, left: menuState.left }}
          >
            <button
              role="menuitem"
              autoFocus
              onClick={() => {
                handleTogglePin(menuState.convId);
                setMenuState(null);
              }}
            >
              <Pin size={14} /> {conversations.find((c) => c.id === menuState.convId)?.pinned ? t.opUnpin : t.opPin}
            </button>
            <button
              role="menuitem"
              onClick={() => {
                handleClearConversation(menuState.convId);
                setMenuState(null);
              }}
            >
              <Eraser size={14} /> {t.opClearMessages}
            </button>
            <button
              role="menuitem"
              onClick={() => {
                handleRenameConversation(menuState.convId);
                setMenuState(null);
              }}
            >
              <Pencil size={14} /> {t.opRename}
            </button>
            <button
              role="menuitem"
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
        <h3 className="confirm-modal-title" id={titleId}>{msg(t, dialog.title)}</h3>
        {dialog.kind === 'prompt' ? (
          <>
            <label className="confirm-modal-label" htmlFor={`${titleId}-input`}>{msg(t, dialog.label)}</label>
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
          <p className="confirm-modal-body">{dialog.body ? msg(t, dialog.body) : null}</p>
        )}
        <div className="confirm-modal-actions">
          {dialog.kind === 'alert' ? (
            <button ref={defaultBtnRef} type="button" className="btn btn-primary" onClick={onClose}>
              {t.opDialogOk}
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
                {msg(t, dialog.confirmLabel)}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
