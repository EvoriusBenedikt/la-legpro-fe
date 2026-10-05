import { useSyncExternalStore } from 'react';
import {
  getSettings, subscribeSettings, getSettingsSnapshot, type Locale,
} from './settings';

/**
 * Interface dictionaries. `id` (Indonesian) is the source of truth and the
 * default locale; `en` must satisfy Record<StringKey, string> so a missing
 * translation is a compile error, never a runtime blank. Templates use
 * {name} placeholders filled with fill().
 *
 * Coverage (staged, 2026-09-30): sidebar/topbar chrome incl. nav labels
 * (Indonesian in `id` per user decision the same day — the brand
 * "Legal Analyzer" stays English in both locales), settings dialog,
 * footer corporate labels, Legal Opinion chrome + dialogs. Module pages
 * (repository, contracts, graph, monitoring, admin, account, taxonomy,
 * landing) still render their Indonesian baseline; migrating a
 * module means routing its literals through useStrings() and adding both
 * locales here — tracked in la-legpro-doc/parked_queue.md.
 */

const id = {
  /* TopBar + Sidebar chrome */
  searchEverywhere: 'Cari di mana saja…',
  openNav: 'Buka menu navigasi',
  openSearch: 'Buka pencarian',
  closeSearch: 'Tutup pencarian',
  notifications: 'Notifikasi',
  goToAccount: 'Buka Pengaturan Akun',
  fallbackRole: 'Pengguna',
  mainNav: 'Utama',

  /* Nav labels + topbar page titles (Indonesian per user decision
     2026-09-30; the brand "Legal Analyzer" itself stays English) */
  navAdmin: 'Dasbor Admin',
  navAccount: 'Pengaturan Akun',
  navRepository: 'Repositori Legal',
  navOpinion: 'Opini Legal',
  navContracts: 'Kontrak',
  navGraph: 'Graf Pengetahuan',
  navMonitoring: 'Pemantauan Sistem',
  navTaxonomy: 'Manajer Taksonomi',
  navDashboard: 'Dasbor',

  /* Settings dialog shell */
  settings: 'Pengaturan',
  closeSettings: 'Tutup pengaturan',
  catNav: 'Kategori pengaturan',
  catAppearance: 'Tampilan',
  catLanguage: 'Bahasa & Format',
  catConversation: 'Percakapan',
  catAdvanced: 'Lanjutan',
  secTheme: 'Tema',
  secTypography: 'Tipografi',
  secGeneral: 'Umum',
  secLanguage: 'Bahasa',
  secDateFormat: 'Format Tanggal',
  secSettingsData: 'Data Pengaturan',
  crumbNav: 'Lokasi pengaturan',

  /* Settings rows */
  themeTitle: 'Tema tampilan',
  themeDesc:
    'Pilih tema terang atau gelap, atau ikuti pengaturan sistem perangkat Anda. Preferensi tersimpan di perangkat ini.',
  optLight: 'Terang',
  optDark: 'Gelap',
  optSystem: 'Sistem',
  scaleTitle: 'Skala antarmuka',
  scaleDesc:
    'Memperbesar atau memperkecil ukuran teks di seluruh antarmuka, termasuk dialog ini. Saat ini: {v}%.',
  fontTitle: 'Font antarmuka',
  fontDesc:
    'Pilih font bawaan untuk seluruh teks antarmuka, termasuk percakapan. Berguna bagi pengguna yang membutuhkan font keterbacaan khusus.',
  fontDefault: 'Font tema (bawaan)',
  useThemeFont: 'Gunakan font tema',
  preview: 'Pratinjau',
  langTitle: 'Bahasa antarmuka',
  langDesc:
    'Mengubah bahasa bilah sisi, bilah atas, Opini Legal, dan Pengaturan. Berlaku segera dan tersimpan di perangkat ini.',
  motionTitle: 'Kurangi animasi',
  motionDesc:
    'Memperpendek transisi dan animasi di seluruh antarmuka, termasuk guliran halus pada percakapan. Berguna bagi pengguna yang sensitif terhadap gerakan pada layar.',
  autoTitle: 'Gulir otomatis ke pesan terbaru',
  autoDesc:
    'Pada Legal Opinion, tampilan mengikuti pesan terakhir saat jawaban baru masuk. Matikan untuk membaca riwayat percakapan tanpa gangguan guliran.',
  avatarTitle: 'Avatar Sage',
  avatarDesc:
    'Pilih bentuk maskot Sage yang digunakan di seluruh tampilan chat Legal Opinion.',
  avatarColorTitle: 'Warna avatar Sage',
  avatarColorDesc:
    'Warna tubuh maskot Sage di seluruh tampilan chat. Chip pertama mengikuti aksen tema (bawaan).',
  avatarColorAccent: 'Aksen tema (bawaan)',
  spacingTitle: 'Spasi baris bacaan',
  spacingDesc:
    'Jarak baris untuk teks panjang: jawaban percakapan, kutipan sumber, dan hasil analisis kepatuhan. Pratinjau mengikuti pilihan Anda.',
  spacingCompact: 'Rapat',
  spacingCozy: 'Nyaman',
  spacingWide: 'Longgar',
  spacingSample:
    'Perjanjian ini dibuat dan ditandatangani oleh para pihak dalam keadaan sehat jasmani dan rohani, serta tanpa adanya paksaan dari pihak manapun.',
  dateFmtTitle: 'Format tanggal',
  dateFmtDesc:
    'Cara tanggal dan waktu ditampilkan di seluruh aplikasi: riwayat unggahan, kontrak, dan hasil analisis. Contoh saat ini: {v}.',
  exportTitle: 'Ekspor pengaturan',
  exportDesc:
    'Unduh seluruh preferensi tampilan dan bahasa sebagai berkas JSON, untuk cadangan atau pemindahan antar perangkat.',
  exportBtn: 'Unduh JSON',
  importTitle: 'Impor pengaturan',
  importDesc:
    'Muat berkas JSON hasil ekspor. Nilai yang dikenali menimpa preferensi saat ini; kunci yang tidak valid diabaikan.',
  importBtn: 'Pilih berkas',
  importDone: '{n} preferensi diterapkan, {x} kunci diabaikan.',
  importEmpty: 'Berkas tidak berisi preferensi yang dikenali.',
  importError: 'Berkas tidak valid atau rusak. Gunakan berkas JSON hasil ekspor pengaturan.',
  resetTitle: 'Reset semua pengaturan',
  resetDesc:
    'Mengembalikan seluruh preferensi di perangkat ini ke nilai bawaan. Tindakan ini tidak dapat dibatalkan.',
  resetBtn: 'Reset semua',
  resetConfirm: 'Reset semua pengaturan ke nilai bawaan?',

  /* Footer corporate labels (values/addresses/brand stay untouched) */
  footProducts: 'Produk & Layanan',
  footSolutions: 'Solusi',
  footAbout: 'Tentang Kami',
  footMedia: 'Media & Informasi',
  footCoverage: 'Jangkauan Layanan',
  footCareers: 'Karir',
  footResponsibleAi: 'AI Bertanggung Jawab',
  footPhone: 'Telepon (Hunting)',
  footProductInfo: 'Informasi Produk',
  footCustomer: 'Layanan Pelanggan',

  /* Legal Opinion */
  opTitle: 'Chatbot Opini Legal',
  opSubtitle: 'Tanya AI mengenai regulasi keuangan dan perbankan',
  opNew: 'Percakapan Baru',
  opClear: 'Bersihkan Percakapan',
  opPanelLabel: 'Daftar percakapan',
  opHideHistory: 'Sembunyikan daftar percakapan',
  opShowHistory: 'Tampilkan daftar percakapan',
  opSearchPh: 'Cari percakapan...',
  opEmptySearch: 'Tidak ada percakapan yang cocok.',
  opNoPreview: 'Belum ada percakapan',
  opMenuLabel: 'Buka menu percakapan',
  opRename: 'Ubah Nama',
  opDelete: 'Hapus',
  opHistoryLabel: 'Riwayat percakapan',
  opYou: 'Anda',
  opAiName: 'Sage',
  opSources: 'Sumber Dokumen yang Ditemukan:',
  opOpenDoc: 'Buka Dokumen',
  opScore: 'Skor',
  opLoading: 'Menelusuri dokumen regulasi…',
  opInputPh:
    'Tanyakan analisis regulasi (contoh: Apakah tanda tangan elektronik sah tanpa meterai?)...',
  opSend: 'Kirim pesan',
  opCopy: 'Salin jawaban',
  opCopied: 'Jawaban disalin',
  opRetry: 'Ulangi jawaban',
  opDisclaimer:
    'AI dapat membuat kesalahan. Verifikasi informasi penting pada dokumen sumber aslinya.',
  opClearTitle: 'Bersihkan percakapan ini?',
  opClearBody:
    'Semua pesan dalam percakapan aktif akan dihapus. Tindakan ini tidak dapat dibatalkan.',
  opClearConfirm: 'Bersihkan',
  opRenameTitle: 'Ubah nama percakapan',
  opRenameLabel: 'Nama percakapan',
  opDeleteLastTitle: 'Tidak dapat dihapus',
  opDeleteLastBody: 'Minimal harus ada satu percakapan.',
  opDeleteTitle: 'Hapus percakapan?',
  opDeleteBody: '"{t}" akan dihapus secara permanen.',
  opDeleteConfirm: 'Hapus',
  opCancel: 'Batal',
  opSave: 'Simpan',
  opServerError:
    'Maaf, terjadi gangguan saat menghubungi server sehingga jawaban tidak dapat ditampilkan. Silakan coba lagi beberapa saat; jika masalah berlanjut, hubungi administrator sistem Anda.',
  opNewTitle: 'Percakapan {n}',
  opDefaultTitle: 'Percakapan Baru',
  opGreetMorning: 'Selamat pagi',
  opGreetAfternoon: 'Selamat siang',
  opGreetNight: 'Selamat malam',
  opGreetOffer: 'Bagaimana Sage dapat membantu Anda?',

  /* Auth view (migrated 2026-10-02: login/register literals routed through
     useStrings(); the brand "Legal Analyzer" stays English per the
     2026-09-30 decision) */
  authTagline:
    'Pusat pengetahuan legal organisasi Anda: regulasi, kebijakan, dan kontrak dalam satu platform terverifikasi.',
  authFeat1Title: 'Kutipan Terverifikasi',
  authFeat1Desc:
    'Setiap jawaban merujuk pasal peraturan yang tepat, sehingga setiap kesimpulan dapat Anda telusuri ulang.',
  authFeat2Title: 'Korpus Regulasi Terkurasi',
  authFeat2Desc:
    'Regulasi OJK dan lembaga JDIH terhimpun dalam satu basis pengetahuan untuk sektor finansial Indonesia.',
  authFeat3Title: 'Analisis Konteks Legal',
  authFeat3Desc:
    'Ringkasan dokumen menghubungkan kontrak, kebijakan, dan peraturan terkait secara otomatis sebelum analisis.',
  authWelcome: 'Selamat datang kembali',
  authWelcomeSub: 'Masuk untuk mengakses dasbor Anda',
  authRegisterTitle: 'Buat Akun',
  authRegisterSub: 'Daftar untuk memulai',
  authUsername: 'Nama pengguna',
  authUsernamePh: 'Masukkan nama pengguna Anda',
  authEmail: 'Email',
  authEmailPh: 'Masukkan email Anda',
  authPassword: 'Kata sandi',
  authPasswordPh: 'Masukkan kata sandi Anda',
  authConfirm: 'Konfirmasi kata sandi',
  authConfirmPh: 'Ulangi kata sandi Anda',
  authPasswordRules:
    'Kata sandi harus memuat setidaknya satu angka dan satu simbol.',
  authShowPassword: 'Tampilkan kata sandi',
  authHidePassword: 'Sembunyikan kata sandi',
  authSignIn: 'Masuk',
  authSignUp: 'Daftar',
  authProcessing: 'Memproses…',
  authNoAccount: 'Belum punya akun? ',
  authRegisterHere: 'Daftar di sini',
  authHaveAccount: 'Sudah punya akun? ',
  authLoginHere: 'Masuk di sini',
  authBack: '← Kembali ke ikhtisar',
  authErrMismatch:
    'Kata sandi dan konfirmasi kata sandi tidak cocok. Periksa kembali kedua isian tersebut.',
  authErrNeedNumber:
    'Kata sandi harus memuat setidaknya satu angka. Tambahkan angka lalu coba lagi.',
  authErrNeedSymbol:
    'Kata sandi harus memuat setidaknya satu simbol. Tambahkan simbol lalu coba lagi.',
  authErrEmailSpace:
    'Email tidak boleh mengandung spasi. Hapus spasinya lalu ketik ulang alamat email.',
  authErrEmailFormat:
    'Format email tidak valid. Contoh: nama@domain.com',
  authErrFailed:
    'Autentikasi gagal. Periksa kembali nama pengguna dan kata sandi Anda; jika berlanjut, hubungi administrator sistem Anda.',
} as const;

export type StringKey = keyof typeof id;

const en: Record<StringKey, string> = {
  searchEverywhere: 'Search everywhere...',
  openNav: 'Open navigation menu',
  openSearch: 'Open search',
  closeSearch: 'Close search',
  notifications: 'Notifications',
  goToAccount: 'Go to Account Settings',
  fallbackRole: 'User',
  mainNav: 'Main',

  navAdmin: 'Admin Dashboard',
  navAccount: 'Account Settings',
  navRepository: 'Legal Repository',
  navOpinion: 'Legal Opinion',
  navContracts: 'Contracts',
  navGraph: 'Knowledge Graph',
  navMonitoring: 'System Monitoring',
  navTaxonomy: 'Taxonomy Manager',
  navDashboard: 'Dashboard',

  settings: 'Settings',
  closeSettings: 'Close settings',
  catNav: 'Settings categories',
  catAppearance: 'Appearance',
  catLanguage: 'Language & Format',
  catConversation: 'Conversation',
  catAdvanced: 'Advanced',
  secTheme: 'Theme',
  secTypography: 'Typography',
  secGeneral: 'General',
  secLanguage: 'Language',
  secDateFormat: 'Date Format',
  secSettingsData: 'Settings Data',
  crumbNav: 'Settings location',

  themeTitle: 'Display theme',
  themeDesc:
    'Choose a light or dark theme, or follow your device system setting. The preference is saved on this device.',
  optLight: 'Light',
  optDark: 'Dark',
  optSystem: 'System',
  scaleTitle: 'Interface scale',
  scaleDesc:
    'Enlarge or shrink text across the whole interface, including this dialog. Current: {v}%.',
  fontTitle: 'Interface font',
  fontDesc:
    'Choose a built-in font for all interface text, including chats. Handy when you need a readability font.',
  fontDefault: 'Theme font (default)',
  useThemeFont: 'Use theme font',
  preview: 'Preview',
  langTitle: 'Interface language',
  langDesc:
    'Switches the language of the sidebar, top bar, Legal Opinion, and Settings. Applies immediately and is saved on this device.',
  motionTitle: 'Reduce motion',
  motionDesc:
    'Shorten transitions and animations across the interface, including smooth chat scrolling. Useful if you are sensitive to on-screen motion.',
  autoTitle: 'Auto-scroll to the newest message',
  autoDesc:
    'In Legal Opinion, the view follows the latest message as new answers arrive. Turn off to read the history without scroll jumps.',
  avatarTitle: 'Sage avatar',
  avatarDesc:
    'Choose the Sage mascot shape used across the Legal Opinion chat surfaces.',
  avatarColorTitle: 'Sage avatar color',
  avatarColorDesc:
    'Body colour of the Sage mascot across the chat surfaces. The first chip follows the theme accent (default).',
  avatarColorAccent: 'Theme accent (default)',
  spacingTitle: 'Reading line spacing',
  spacingDesc:
    'Line spacing for long-form text: conversation answers, source quotes, and compliance analysis results. The preview follows your choice.',
  spacingCompact: 'Compact',
  spacingCozy: 'Cozy',
  spacingWide: 'Wide',
  spacingSample:
    'This agreement is made and signed by the parties in sound physical and mental condition, and without any coercion from any party.',
  dateFmtTitle: 'Date format',
  dateFmtDesc:
    'How dates and times are shown across the app: upload history, contracts, and analysis results. Current sample: {v}.',
  exportTitle: 'Export settings',
  exportDesc:
    'Download every appearance and language preference as a JSON file, for backup or moving to another device.',
  exportBtn: 'Download JSON',
  importTitle: 'Import settings',
  importDesc:
    'Load an exported JSON file. Recognized values overwrite the current preferences; invalid keys are ignored.',
  importBtn: 'Choose file',
  importDone: '{n} preferences applied, {x} keys ignored.',
  importEmpty: 'The file contains no recognized preferences.',
  importError: 'The file is invalid or corrupt. Use a JSON file exported from settings.',
  resetTitle: 'Reset all settings',
  resetDesc:
    'Return every preference on this device to its default value. This cannot be undone.',
  resetBtn: 'Reset all',
  resetConfirm: 'Reset all settings to their defaults?',

  footProducts: 'Products & Services',
  footSolutions: 'Solutions',
  footAbout: 'About Us',
  footMedia: 'Media & Information',
  footCoverage: 'Service Coverage',
  footCareers: 'Careers',
  footResponsibleAi: 'Responsible AI',
  footPhone: 'Phone (Hunting)',
  footProductInfo: 'Product Information',
  footCustomer: 'Customer Service',

  opTitle: 'Legal Opinion Chatbot',
  opSubtitle: 'Ask AI about financial and banking regulations',
  opNew: 'New chat',
  opClear: 'Clear conversation',
  opPanelLabel: 'Conversation list',
  opHideHistory: 'Hide conversation list',
  opShowHistory: 'Show conversation list',
  opSearchPh: 'Search conversations...',
  opEmptySearch: 'No matching conversations.',
  opNoPreview: 'No messages yet',
  opMenuLabel: 'Open conversation menu',
  opRename: 'Rename',
  opDelete: 'Delete',
  opHistoryLabel: 'Conversation history',
  opYou: 'You',
  opAiName: 'Sage',
  opSources: 'Source documents found:',
  opOpenDoc: 'Open document',
  opScore: 'Score',
  opLoading: 'Searching regulatory documents…',
  opInputPh:
    'Ask for a regulatory analysis (e.g.: Is an electronic signature valid without a stamp duty seal?)...',
  opSend: 'Send message',
  opCopy: 'Copy answer',
  opCopied: 'Answer copied',
  opRetry: 'Retry answer',
  opDisclaimer:
    'AI can make mistakes. Verify important information against the original source documents.',
  opClearTitle: 'Clear this conversation?',
  opClearBody:
    'All messages in the active conversation will be deleted. This cannot be undone.',
  opClearConfirm: 'Clear',
  opRenameTitle: 'Rename conversation',
  opRenameLabel: 'Conversation name',
  opDeleteLastTitle: 'Cannot delete',
  opDeleteLastBody: 'At least one conversation must remain.',
  opDeleteTitle: 'Delete conversation?',
  opDeleteBody: '"{t}" will be permanently deleted.',
  opDeleteConfirm: 'Delete',
  opCancel: 'Cancel',
  opSave: 'Save',
  opServerError:
    'Sorry, something interrupted the connection to the server so the answer cannot be shown. Please try again in a moment; if the problem persists, contact your system administrator.',
  opNewTitle: 'Conversation {n}',
  opDefaultTitle: 'New conversation',
  opGreetMorning: 'Good morning',
  opGreetAfternoon: 'Good afternoon',
  // Night bucket (18:00–04:59): "Good evening" is the correct English
  // greeting; "Good night" is a parting phrase.
  opGreetNight: 'Good evening',
  opGreetOffer: 'How can Sage help you?',

  /* Auth view (migrated 2026-10-02) */
  authTagline:
    'Your organization\'s legal knowledge center: regulations, policies, and contracts in one verified platform.',
  authFeat1Title: 'Verified Citations',
  authFeat1Desc:
    'Every answer points to the exact regulation article, so you can re-trace every conclusion.',
  authFeat2Title: 'Curated Regulatory Corpus',
  authFeat2Desc:
    'OJK and JDIH agency regulations gathered in one knowledge base for Indonesia\'s financial sector.',
  authFeat3Title: 'Contextual Legal Analysis',
  authFeat3Desc:
    'Document summaries link contracts, policies, and related regulations automatically before analysis.',
  authWelcome: 'Welcome back',
  authWelcomeSub: 'Sign in to access your dashboard',
  authRegisterTitle: 'Create Account',
  authRegisterSub: 'Register to get started',
  authUsername: 'Username',
  authUsernamePh: 'Enter your username',
  authEmail: 'Email',
  authEmailPh: 'Enter your email',
  authPassword: 'Password',
  authPasswordPh: 'Enter your password',
  authConfirm: 'Confirm password',
  authConfirmPh: 'Repeat your password',
  authPasswordRules:
    'Password must contain at least one number and one symbol.',
  authShowPassword: 'Show password',
  authHidePassword: 'Hide password',
  authSignIn: 'Sign In',
  authSignUp: 'Sign Up',
  authProcessing: 'Processing…',
  authNoAccount: 'Don\'t have an account? ',
  authRegisterHere: 'Register here',
  authHaveAccount: 'Already have an account? ',
  authLoginHere: 'Login here',
  authBack: '← Back to overview',
  authErrMismatch:
    'Password and confirmation do not match. Check both fields and try again.',
  authErrNeedNumber:
    'Password must contain at least one number. Add a number and try again.',
  authErrNeedSymbol:
    'Password must contain at least one symbol. Add a symbol and try again.',
  authErrEmailSpace:
    'Email must not contain whitespace. Remove the spaces and retype the email address.',
  authErrEmailFormat:
    'Invalid email format. Example: name@domain.com',
  authErrFailed:
    'Authentication failed. Check your username and password; if this persists, contact your system administrator.',
};

export const STRINGS: Record<Locale, Record<StringKey, string>> = { id, en };

/** Fill {placeholders} in a template string. Unknown keys stay as-is. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : m,
  );
}

/** Current locale outside React (logic-time strings, e.g. dialog bodies). */
export function getLocale(): Locale {
  return getSettings().locale;
}

/** Reactive locale for components (re-renders on any settings change). */
export function useLocale(): Locale {
  const snapshot = useSyncExternalStore(subscribeSettings, getSettingsSnapshot);
  try {
    const parsed = JSON.parse(snapshot) as { locale?: unknown };
    return parsed.locale === 'en' ? 'en' : 'id';
  } catch {
    return 'id';
  }
}

/** Reactive dictionary for components. */
export function useStrings(): Record<StringKey, string> {
  return STRINGS[useLocale()];
}
