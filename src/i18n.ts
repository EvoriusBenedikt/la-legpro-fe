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
  /* Document <title> — applied to document.title at module load and on
     every settings change (subscription at the bottom of this module).
     The brand stays English; the tagline follows the locale. */
  docTitle: 'Legal Analyzer — Kepatuhan terverifikasi sebelum Anda menandatangani',

  /* App-shell announcement (critique P1 2026-10-06): read by the role=status
     region in App.tsx when a fresh sign-in lands focus on the main region. */
  signedInNote: 'Berhasil masuk.',

  /* TopBar + Sidebar chrome */
  openNav: 'Buka menu navigasi',
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
  secJobsData: 'Riwayat analisis',
  jobsRetTitle: 'Retensi riwayat analisis',
  jobsRetDesc:
    'Entri selesai di panel Riwayat Analisis (Kontrak) dihapus otomatis dari perangkat ini setelah melewati usia ini; dokumen hasil analisis tidak terpengaruh. Analisis yang sedang berjalan tidak pernah dihapus. Saat ini: {v}.',
  jobsRetOff: 'Matikan (simpan selamanya)',
  jobsRetWeek: '1 minggu',
  jobsRetMonth1: '1 bulan',
  jobsRetMonth3: '3 bulan',
  jobsRetMonth6: '6 bulan',
  jobsRetMonth9: '9 bulan',
  jobsRetMonth12: '12 bulan',
  jobsRetCustom: 'Kustom…',
  jobsRetDaysUnit: 'hari',
  jobsRetDaysAria: 'Jumlah hari sebelum entri riwayat dihapus',

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
  /* Wait/error/citation copy (2026-10-08 critique remediation P1-1/2/3,
     P2-4): honest full-pipeline loading line + elapsed seconds, the stop
     control, first-class error rows with retry, citation-marker aria, and
     the labeled relevance chip. The former opScore key died with the raw
     logit badge it fed. */
  opLoading: 'Menelusuri korpus regulasi dan menyusun jawaban…',
  opElapsed: '{s} dtk',
  opStop: 'Hentikan pembuatan jawaban',
  opTryAgain: 'Coba lagi',
  opErrorAborted: 'Pembuatan jawaban dihentikan. Pertanyaan Anda tetap tersimpan di riwayat.',
  opErrorTimeout: 'Server tidak mengembalikan jawaban dalam {s} detik. Permintaan dibatalkan — silakan coba lagi.',
  opErrorNetwork: 'Server tidak dapat dihubungi. Periksa koneksi Anda, lalu coba lagi.',
  opCiteAria: 'Tampilkan sumber {n}',
  opRelevance: 'Relevansi',
  opRelHigh: 'Tinggi',
  opRelMed: 'Sedang',
  opRelLow: 'Rendah',
  opRelTip: 'Kekuatan kecocokan sumber ini terhadap pertanyaan Anda, dihitung oleh pemeringkat ulang (skor mentah: {score}).',
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

  /* Document Drawer (migrated 2026-10-08, critique remediation P2-5): the
     drawer follows the app locale like the rest of the chrome; async error
     copy reads STRINGS[getLocale()] at throw time because hooks cannot run
     inside effect callbacks. */
  drawerTabsLabel: 'Bagian dokumen',
  drawerTabOverview: 'Ikhtisar',
  drawerTabPdf: 'PDF',
  drawerTabOutline: 'Kerangka',
  drawerTabAnalysis: 'Analisis',
  drawerClose: 'Tutup detail dokumen',
  drawerStatusNote: 'Status berlaku dengan catatan — periksa tab Analisis untuk pasal yang dicabut/diubah.',
  drawerTotalPasal: 'Total Pasal',
  drawerOverviewTitle: 'Ringkasan Dokumen',
  drawerStatusDocLevel: 'Status Peraturan Dokumen Level',
  drawerRevokedLabel: 'Dicabut :',
  drawerNoRevocation: 'Tidak ada informasi pencabutan',
  drawerStatusArticleLevel: 'Status Peraturan Pasal/Subpasal Level',
  drawerAmendedLabel: 'Diubah dengan :',
  drawerNoAmendment: 'Tidak ada informasi perubahan',
  drawerPdfUnavailable: 'File PDF tidak tersedia untuk dokumen ini.',
  drawerPdfLoading: 'Memuat PDF…',
  drawerPdfViewerTitle: 'Penampil PDF',
  drawerPdfOpenNewTab: 'Buka PDF di Tab Baru',
  drawerPdfFailed: 'Gagal memuat PDF.',
  drawerTryAgain: 'Coba lagi',
  drawerOutlineEmpty: 'Tidak ada kerangka yang dapat diekstrak dari dokumen ini.',
  drawerDeepLoadingTitle: 'Menganalisis Setiap Pasal…',
  drawerDeepLoadingBody: 'LLM sedang membaca dan menganalisis setiap pasal secara mendalam.',
  drawerDeepLoadingEta: 'Ini memerlukan waktu 1–3 menit.',
  drawerDeepEmpty: 'Tidak ada data analisis.',
  drawerDeepHeader: 'Analisis mendalam atas {n} pasal teratas',
  drawerDeepCompare: 'Perbandingan Dengan Regulasi Yang Dicabut',
  drawerDeepRelation: 'Hubungan dengan Regulasi yang Lebih Tinggi',
  drawerErrServer: 'Kesalahan server (kode {code}).',
  drawerErrNetwork: 'Periksa koneksi Anda lalu coba lagi.',
  drawerErrAnalyze: 'Gagal menganalisis dokumen. {msg}',
  drawerErrPdfMissing: 'Berkas PDF untuk dokumen ini tidak tersedia di server.',
  drawerErrPdfNet: 'Gagal memuat PDF. Periksa koneksi Anda lalu coba lagi.',
  drawerErrDeep: 'Gagal menganalisis. {msg}',
  drawerNomorPrefix: 'Nomor',

  /* Auth view (migrated 2026-10-02: login/register literals routed through
     useStrings(); the brand "Legal Analyzer" stays English in both locales
     per the 2026-09-30 decision — owner-confirmed 2026-10-06 as THE product
     name, retiring the former "LA LegPro" display name; Lintasarta is the
     parent company) */
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
  /* On-premises trust line under the header (2026-10-06, owner copy; "Anda"
     capitalized per the formal register). */
  authTrustNote: 'Data organisasi Anda tetap di server institusi Anda.',
  authUsername: 'Nama pengguna',
  authUsernamePh: 'Masukkan nama pengguna Anda',
  authEmail: 'Email',
  authEmailPh: 'Masukkan email Anda',
  authPassword: 'Kata sandi',
  authPasswordPh: 'Masukkan kata sandi Anda',
  authConfirm: 'Konfirmasi kata sandi',
  authConfirmPh: 'Ulangi kata sandi Anda',
  authRuleUpper: '1 huruf besar',
  authRuleNumber: '1 angka',
  authRuleSymbol: '1 simbol',
  authShowPassword: 'Tampilkan kata sandi',
  authHidePassword: 'Sembunyikan kata sandi',
  /* Caps Lock warning while the modifier is detected on a password field. */
  authCapsLockOn: 'Caps Lock aktif.',
  authSignIn: 'Masuk',
  authSignUp: 'Daftar',
  authProcessing: 'Memproses…',
  authNoAccount: 'Belum punya akun? ',
  authRegisterHere: 'Daftar di sini',
  authHaveAccount: 'Sudah punya akun? ',
  authLoginHere: 'Masuk di sini',
  authBack: '← Kembali ke ikhtisar',
  /* Static guidance line (2026-10-06): replaces the authContactAdmin mailto —
     no SMTP or real administrator contact is configured yet, so the row is
     non-interactive copy instead of a dead link. */
  authContactNote: 'Tidak dapat masuk? Hubungi administrator instansi Anda.',
  /* Login-mode-only static sibling of authContactNote: the reset flow stays
     parked in plans/2026-10-05-forgot-password.md, so this row gets the same
     non-interactive treatment (2026-10-06 user decision). */
  authForgotNote:
    'Lupa kata sandi? Administrator instansi Anda dapat membantu mengatur ulang.',
  authLangToggleAria: 'Ganti bahasa ke Inggris',
  /* Passkey placeholder (2026-10-09 Wise-style login redesign): copy for
     the disabled rollout stub rendered under the login form. */
  authOrLoginWith: 'Atau masuk dengan',
  authPasskey: 'Passkey',
  authPasskeySoon: 'Segera tersedia',
  /* Empty-field gates: the form is noValidate (native bubbles are
     English-only and unstyleable), so required checks raise localized
     errors through the same banner/highlight/shake path. */
  authErrUsernameRequired: 'Nama pengguna wajib diisi.',
  authErrEmailRequired: 'Email wajib diisi.',
  authErrPasswordRequired: 'Kata sandi wajib diisi.',
  authErrConfirmRequired: 'Konfirmasi kata sandi wajib diisi.',
  authErrMismatch:
    'Kata sandi dan konfirmasi kata sandi tidak cocok. Periksa kembali kedua isian tersebut.',
  authErrNeedUppercase:
    'Kata sandi harus memuat setidaknya satu huruf besar. Tambahkan huruf besar lalu coba lagi.',
  authErrNeedNumber:
    'Kata sandi harus memuat setidaknya satu angka. Tambahkan angka lalu coba lagi.',
  authErrNeedSymbol:
    'Kata sandi harus memuat setidaknya satu simbol. Tambahkan simbol lalu coba lagi.',
  authErrEmailSpace:
    'Email tidak boleh mengandung spasi. Hapus spasinya lalu ketik ulang alamat email.',
  authErrEmailFormat:
    'Format email tidak valid. Contoh: nama@domain.com',
  /* Localized copy for normalized backend detail codes (SERVER_MESSAGE_KEYS
     in Auth.tsx). Unknown codes fall back to authErrFailed — raw server
     text or bare codes never render. */
  authErrInvalidCredentials:
    'Nama pengguna atau kata sandi salah. Periksa kembali isian Anda lalu coba lagi.',
  authErrUsernameTaken:
    'Nama pengguna sudah terdaftar. Pilih nama pengguna lain lalu coba lagi.',
  authErrEmailTaken:
    'Email sudah terdaftar. Gunakan alamat email lain atau hubungi administrator instansi Anda.',
  authErrDeactivated:
    'Akun Anda dinonaktifkan. Hubungi administrator sistem untuk memulihkan akses.',
  authErrNetwork:
    'Tidak dapat menghubungi server. Periksa koneksi Anda lalu coba lagi; jika berlanjut, hubungi administrator sistem Anda.',
  authErrFailed:
    'Autentikasi gagal. Periksa kembali nama pengguna dan kata sandi Anda; jika berlanjut, hubungi administrator sistem Anda.',
} as const;

export type StringKey = keyof typeof id;

const en: Record<StringKey, string> = {
  docTitle: 'Legal Analyzer — Compliance, verified before you sign',
  signedInNote: 'Signed in.',
  openNav: 'Open navigation menu',
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
  secJobsData: 'Analysis history',
  jobsRetTitle: 'Analysis history retention',
  jobsRetDesc:
    'Finished entries in the Analysis History panel (Contracts) are deleted from this device once older than this; analyzed documents themselves are unaffected. Running analyses are never deleted. Current: {v}.',
  jobsRetOff: 'Off (keep forever)',
  jobsRetWeek: '1 week',
  jobsRetMonth1: '1 month',
  jobsRetMonth3: '3 months',
  jobsRetMonth6: '6 months',
  jobsRetMonth9: '9 months',
  jobsRetMonth12: '12 months',
  jobsRetCustom: 'Custom…',
  jobsRetDaysUnit: 'days',
  jobsRetDaysAria: 'Number of days before history entries are deleted',

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
  /* Wait/error/citation copy (2026-10-08 critique remediation) — mirrors id */
  opLoading: 'Searching the regulation corpus and composing the answer…',
  opElapsed: '{s}s',
  opStop: 'Stop answer generation',
  opTryAgain: 'Try again',
  opErrorAborted: 'Answer generation stopped. Your question remains in the history.',
  opErrorTimeout: 'The server did not return an answer within {s} seconds. The request was canceled — please try again.',
  opErrorNetwork: 'Cannot reach the server. Check your connection, then try again.',
  opCiteAria: 'Go to source {n}',
  opRelevance: 'Relevance',
  opRelHigh: 'High',
  opRelMed: 'Medium',
  opRelLow: 'Low',
  opRelTip: 'How strongly this source matches your question, computed by the reranker (raw score: {score}).',
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

  /* Document Drawer (migrated 2026-10-08, critique remediation P2-5) */
  drawerTabsLabel: 'Document sections',
  drawerTabOverview: 'Overview',
  drawerTabPdf: 'PDF',
  drawerTabOutline: 'Outline',
  drawerTabAnalysis: 'Analysis',
  drawerClose: 'Close document details',
  drawerStatusNote: 'In force with reservations — check the Analysis tab for revoked/amended articles.',
  drawerTotalPasal: 'Total Articles',
  drawerOverviewTitle: 'Document Summary',
  drawerStatusDocLevel: 'Document-Level Regulation Status',
  drawerRevokedLabel: 'Revoked :',
  drawerNoRevocation: 'No revocation information',
  drawerStatusArticleLevel: 'Article/Paragraph-Level Regulation Status',
  drawerAmendedLabel: 'Amended by :',
  drawerNoAmendment: 'No amendment information',
  drawerPdfUnavailable: 'No PDF file is available for this document.',
  drawerPdfLoading: 'Loading PDF…',
  drawerPdfViewerTitle: 'PDF viewer',
  drawerPdfOpenNewTab: 'Open PDF in New Tab',
  drawerPdfFailed: 'Failed to load the PDF.',
  drawerTryAgain: 'Try again',
  drawerOutlineEmpty: 'No outline could be extracted from this document.',
  drawerDeepLoadingTitle: 'Analyzing Every Article…',
  drawerDeepLoadingBody: 'The LLM is reading and analyzing every article in depth.',
  drawerDeepLoadingEta: 'This takes 1–3 minutes.',
  drawerDeepEmpty: 'No analysis data.',
  drawerDeepHeader: 'In-depth analysis of the top {n} articles',
  drawerDeepCompare: 'Comparison With Revoked Regulations',
  drawerDeepRelation: 'Relation to Higher-Level Regulations',
  drawerErrServer: 'Server error (code {code}).',
  drawerErrNetwork: 'Check your connection and try again.',
  drawerErrAnalyze: 'Failed to analyze the document. {msg}',
  drawerErrPdfMissing: 'The PDF file for this document is not available on the server.',
  drawerErrPdfNet: 'Failed to load the PDF. Check your connection and try again.',
  drawerErrDeep: 'Analysis failed. {msg}',
  drawerNomorPrefix: 'Number',

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
  authTrustNote: 'Your organization\'s data stays on your institution\'s servers.',
  authUsername: 'Username',
  authUsernamePh: 'Enter your username',
  authEmail: 'Email',
  authEmailPh: 'Enter your email',
  authPassword: 'Password',
  authPasswordPh: 'Enter your password',
  authConfirm: 'Confirm password',
  authConfirmPh: 'Repeat your password',
  authRuleUpper: '1 uppercase letter',
  authRuleNumber: '1 number',
  authRuleSymbol: '1 symbol',
  authShowPassword: 'Show password',
  authHidePassword: 'Hide password',
  authCapsLockOn: 'Caps Lock is on.',
  authSignIn: 'Sign In',
  authSignUp: 'Sign Up',
  authProcessing: 'Processing…',
  authNoAccount: 'Don\'t have an account? ',
  authRegisterHere: 'Register here',
  authHaveAccount: 'Already have an account? ',
  authLoginHere: 'Login here',
  authBack: '← Back to overview',
  authContactNote: 'Trouble signing in? Contact your organization\'s administrator.',
  authForgotNote:
    'Forgot your password? Your organization\'s administrator can help reset it.',
  authLangToggleAria: 'Switch language to Indonesian',
  authOrLoginWith: 'Or log in with',
  authPasskey: 'Passkey',
  authPasskeySoon: 'Coming soon',
  authErrUsernameRequired: 'Username is required.',
  authErrEmailRequired: 'Email is required.',
  authErrPasswordRequired: 'Password is required.',
  authErrConfirmRequired: 'Password confirmation is required.',
  authErrMismatch:
    'Password and confirmation do not match. Check both fields and try again.',
  authErrNeedUppercase:
    'Password must contain at least one uppercase letter. Add an uppercase letter and try again.',
  authErrNeedNumber:
    'Password must contain at least one number. Add a number and try again.',
  authErrNeedSymbol:
    'Password must contain at least one symbol. Add a symbol and try again.',
  authErrEmailSpace:
    'Email must not contain whitespace. Remove the spaces and retype the email address.',
  authErrEmailFormat:
    'Invalid email format. Example: name@domain.com',
  authErrInvalidCredentials:
    'Incorrect username or password. Check your details and try again.',
  authErrUsernameTaken:
    'That username is already registered. Choose a different username and try again.',
  authErrEmailTaken:
    'That email is already registered. Use a different email address or contact your organization\'s administrator.',
  authErrDeactivated:
    'Your account has been deactivated. Contact your system administrator to restore access.',
  authErrNetwork:
    'Cannot reach the server. Check your connection and try again; if this persists, contact your system administrator.',
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

/* Runtime <title> sync (2026-10-06, owner decision): index.html's static
   title is the Indonesian default for the pre-JS paint; this applies the
   localized docTitle at module load — covering a stored 'en' locale the
   pre-paint script cannot localize — and on every settings change. Lives
   here rather than in settings.ts to keep the import direction one-way
   (settings importing i18n would be circular). Note: LegalRepository
   renders its own hoisted <title> while mounted (pre-existing pattern);
   this sync only re-fires on settings changes. */
function applyDocTitle() {
  document.title = STRINGS[getLocale()].docTitle;
}
subscribeSettings(applyDocTitle);
applyDocTitle();
