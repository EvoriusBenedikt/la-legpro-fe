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

  /* Sidebar (2026-10-11 monochrome redesign) */
  sbSearchPlaceholder: 'Cari menu',
  sbMore: 'Lainnya',
  sbCollapse: 'Ciutkan sidebar',
  sbExpand: 'Bentangkan sidebar',
  sbNoMatch: 'Tidak ada menu yang cocok',
  sbChildDocs: 'Dokumen',
  sbChildPending: 'Menunggu Konfirmasi',
  sbChildHistory: 'Riwayat Unggahan',
  sbHelp: 'Bantuan',
  sbHelpTitle: 'Bantuan & pintasan keyboard',
  sbHelpClose: 'Tutup bantuan',
  sbHelpKeysNav: 'Pindah antar menu sidebar',
  sbHelpKeysOpen: 'Buka menu yang sedang difokus',
  sbHelpKeysClose: 'Tutup dialog yang terbuka',
  sbHelpVersion: 'Versi',

  /* Route error boundary (2026-10-12): fallback panel shown inside the
     shell when a page crashes during render or a lazy chunk's import
     rejects (e.g. a stale vite dep cache). */
  routeErrorTitle: 'Halaman gagal dimuat',
  routeErrorBody: 'Terjadi kesalahan saat memuat halaman ini. Coba muat ulang, atau buka halaman lain melalui menu.',
  routeErrorReload: 'Muat ulang halaman',
  routeErrorDetails: 'Detail teknis',

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
    'Mengubah bahasa seluruh aplikasi. Berlaku segera dan tersimpan di perangkat ini.',
  motionTitle: 'Kurangi animasi',
  motionDesc:
    'Memperpendek transisi dan animasi di seluruh antarmuka, termasuk guliran halus pada percakapan. Berguna bagi pengguna yang sensitif terhadap gerakan pada layar.',
  autoTitle: 'Gulir otomatis ke pesan terbaru',
  autoDesc:
    'Pada Legal Opinion, tampilan mengikuti pesan terakhir saat jawaban baru masuk. Matikan untuk membaca riwayat percakapan tanpa gangguan guliran.',
  avatarTitle: 'Avatar gemma',
  avatarDesc:
    'Pilih bentuk maskot gemma yang digunakan di seluruh tampilan chat Legal Opinion.',
  avatarColorTitle: 'Warna avatar gemma',
  avatarColorDesc:
    'Warna tubuh maskot gemma di seluruh tampilan chat. Chip pertama mengikuti aksen tema (bawaan).',
  avatarColorAccent: 'Aksen tema (bawaan)',
  /* Nama tampilan bentuk + swatch gemma (2026-10-13, kritik P1·2): nama
     yang dapat diakses untuk radio picker — slug library adalah pengenal
     internal, bukan label. Peta kunci ada di SettingsDialog.tsx. */
  avatarNameClover: 'Semanggi',
  avatarNameFlower: 'Bunga',
  avatarNameTriangle: 'Segitiga',
  avatarNameSquare: 'Persegi',
  avatarNameBlob: 'Blob',
  avatarNameGhost: 'Hantu',
  avatarNameCircle: 'Lingkaran',
  avatarNameDrop: 'Tetesan',
  avatarNameStar: 'Bintang',
  avatarNameDroid: 'Droid',
  avatarNameMech: 'Mech',
  avatarNameAlien: 'Alien',
  avatarNameHexagon: 'Heksagon',
  avatarNameCat: 'Kucing',
  avatarNameCloud: 'Awan',
  avatarNamePill: 'Kapsul',
  avatarNamePebble: 'Kerikil',
  avatarNamePuddle: 'Genangan',
  avatarColorViolet: 'Ungu',
  avatarColorRose: 'Mawar',
  avatarColorEmerald: 'Zamrud',
  avatarColorAmber: 'Ambar',
  avatarColorTeal: 'Teal',
  avatarColorSlate: 'Slate',
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
  resetConfirm: 'Reset semua pengaturan ke nilai bawaan? Tindakan ini tidak dapat dibatalkan.',
  secJobsData: 'Riwayat analisis',
  jobsRetTitle: 'Retensi riwayat analisis',
  jobsRetDesc:
    'Entri selesai di panel Riwayat Analisis (Kontrak) dihapus dari perangkat ini setelah melewati usia ini — termasuk entri yang sudah ada. Dokumen hasil analisis dan analisis yang sedang berjalan tidak terpengaruh. Saat ini: {v}.',
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
  jobsRetDaysHint: 'Antara {min} dan {max} hari.',
  jobsRetDaysInvalid: 'Masukkan jumlah hari antara {min} dan {max}.',
  jobsRetPrunedOne: '{n} entri riwayat lama dihapus dari perangkat ini.',
  jobsRetPrunedMany: '{n} entri riwayat lama dihapus dari perangkat ini.',

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
  opAiName: 'gemma',
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
  /* Conversation panel round 4 (2026-10-12): multi-select bulk delete,
     sort menu, and pinning (Claude-style sidebar). */
  opSelectMode: 'Pilih percakapan',
  opSelectedCount: '{n} dipilih',
  opSelectAll: 'Pilih semua',
  opDeleteSelected: 'Hapus terpilih',
  opDeleteManyTitle: 'Hapus percakapan?',
  opDeleteManyBody: '{n} percakapan akan dihapus permanen dari perangkat ini.',
  opDeleteAllTitle: 'Hapus semua percakapan?',
  opDeleteAllBody: 'Semua {n} percakapan akan dihapus permanen. Percakapan baru akan dibuat untuk Anda.',
  opSortLabel: 'Urutkan percakapan',
  opSortCreated: 'Tanggal dibuat',
  opSortName: 'Nama (A–Z)',
  opSortActivity: 'Aktivitas terakhir',
  opPinned: 'Disematkan',
  opPin: 'Sematkan',
  opUnpin: 'Lepas sematan',
  opClearMessages: 'Hapus isi percakapan',
  opCancel: 'Batal',
  opSave: 'Simpan',
  opServerError:
    'Maaf, terjadi gangguan saat menghubungi server sehingga jawaban tidak dapat ditampilkan. Silakan coba lagi beberapa saat; jika masalah berlanjut, hubungi administrator sistem Anda.',
  opNewTitle: 'Percakapan {n}',
  opDefaultTitle: 'Percakapan Baru',
  opGreetMorning: 'Selamat pagi',
  opGreetAfternoon: 'Selamat siang',
  opGreetNight: 'Selamat malam',
  opGreetOffer: 'Bagaimana gemma dapat membantu Anda?',
  /* Chat attachments (2026-10-12): paperclip upload of images + PDFs in
     the Legal Opinion composer; {e} interpolates the failure reason. */
  opAttach: 'Lampirkan berkas',
  opAttachProcessing: 'Memproses…',
  opAttachFailed: 'Gagal: {e}',
  opAttachSendHint: 'Tunggu lampiran selesai diproses',
  opAttachGhost: 'Berkas tidak tersedia',
  opAttachRemove: 'Hapus lampiran',
  opAttachClose: 'Tutup',
  /* Critique remediation (2026-10-12): a noun label for the pending list —
     the verb "Lampirkan berkas" belongs on the paperclip — and the
     over-cap notice that replaces the old silent drop. */
  opAttachPendingList: 'Lampiran menunggu kirim',
  opAttachTruncated: 'Maksimal {max} berkas per pesan — {n} berkas tidak ditambahkan',

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
  /* New-/login back link (critique clarify 2026-10-13): logged-out "/"
     renders the marketing LandingPage, not an "ikhtisar". authBack stays
     verbatim — the frozen legacy page renders it (fingerprint contract
     e112e530d3108821). */
  authBackLanding: '← Kembali ke beranda',
  /* Register-mode role disclosure (critique clarify 2026-10-13): BE
     auth.py register hardcodes the pengguna role — stated before signup
     so the granted level is not a surprise after. */
  authRegisterRoleNote: 'Akun baru dibuat dengan peran pengguna.',
  /* Static guidance line (2026-10-06): replaces the authContactAdmin mailto —
     no SMTP or real administrator contact is configured yet, so the row is
     non-interactive copy instead of a dead link. */
  authContactNote: 'Tidak dapat masuk? Hubungi administrator instansi Anda.',
  /* Login-mode-only static sibling of authContactNote: the reset flow stays
     parked in plans/2026-10-05-forgot-password.md, so this row gets the same
     non-interactive treatment (2026-10-06 user decision). */
  authForgotNote:
    'Lupa kata sandi? Administrator instansi Anda dapat membantu mengatur ulang.',
  /* Parent-company credit (owner 2026-10-11): the sentence frame is
     localized; the product name stays verbatim in both locales. */
  authCredit: 'Ditenagai oleh LA Lintasarta Core',
  authLangToggleAria: 'Ganti bahasa ke Inggris',
  /* Passkey placeholder (2026-10-09 Wise-style login redesign): copy for
     the disabled rollout stub rendered under the login form. */
  authOrLoginWith: 'Atau masuk dengan',
  authPasskey: 'Passkey',
  authPasskeySoon: 'Passkey segera tersedia',
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
  /* Admin dashboard refresh button: {time} is a 24-hour HH:mm stamp. */
  adminRefresh: 'Muat ulang',
  adminLastUpdated: 'Terakhir diperbarui {time}',
  adminRefreshAria: 'Muat ulang data. Terakhir diperbarui {time}',

  /* ── Shared errors (2026-10-14 i18n pass): stored as Msg keys and resolved
     at render, never as translated text. ── */
  errNetwork: 'Tidak dapat menghubungi server. Periksa koneksi Anda lalu coba lagi.',
  errUnexpected: 'Terjadi kesalahan tak terduga.',
  errServer: 'Server mengembalikan kesalahan (kode {code}). Coba lagi beberapa saat.',
  errSystem: 'Terjadi kesalahan sistem.',
  errProcessDoc: 'Gagal memproses dokumen.',
  errSaveAnalysis: 'Analisis selesai, tetapi gagal menyimpan hasil analisis.',
  errFileFormat: 'Format file tidak didukung. Harap unggah PDF, DOCX, XLSX, PPTX, JPG, PNG, atau TXT.',
  errFileTooLarge: 'Ukuran file terlalu besar (maksimal 50 MB).',
  errDocUnreadable: 'Dokumen tidak dapat dibaca. Coba unggah ulang atau pastikan PDF tidak terenkripsi.',
  errAccessDenied: 'Akses ditolak.',
  errDocNotFound: 'Dokumen tidak ditemukan.',
  errPdfNotFound: 'Berkas PDF tidak ditemukan.',
  errDocBusy: 'Dokumen sedang diproses. Coba lagi beberapa saat.',
  errPwCurrentWrong: 'Kata sandi saat ini salah.',
  errPwSame: 'Kata sandi baru harus berbeda dari kata sandi saat ini.',
  errTaxEmpty: 'Nama jenis dokumen tidak boleh kosong.',
  errTaxMax: 'Nama jenis dokumen maksimal {n} karakter.',
  errTaxExists: 'Jenis dokumen dengan nama tersebut sudah ada.',
  errTaxInUse: 'Jenis ini masih digunakan oleh dokumen di repositori. Nonaktifkan sebagai gantinya, atau hubungi administrator untuk menghapus permanen.',
  errTaxNotActive: 'Jenis dokumen tidak ada dalam taksonomi aktif.',
  errRepoNoAuthority: 'Admin sistem tidak memiliki kewenangan untuk mengakses repositori dokumen.',
  errGrantRoleOnly: 'Hanya Manajer, Direktur, atau Sekretaris Perusahaan yang dapat memberikan akses.',
  errGrantRestricted: 'Manajer tidak dapat memberikan akses untuk dokumen Terbatas. Hanya Direktur atau Sekretaris Perusahaan yang berwenang.',
  errGrantReason: 'Alasan wajib diisi (minimal 5 karakter).',
  errGrantUserNotFound: 'Pengguna penerima akses tidak ditemukan.',
  errGrantRevokeOnly: 'Hanya Sekretaris Perusahaan yang dapat mencabut pemberian akses.',
  errGrantNotFound: 'Pemberian akses tidak ditemukan.',
  errPendingNotFound: 'Dokumen pending tidak ditemukan.',
  errAdmEntityRequired: 'Nama entitas wajib diisi.',
  errAdmEntityExists: 'Entitas sudah ada dalam daftar pengecualian.',
  errAdmUserNotFound: 'Pengguna tidak ditemukan.',
  errAdmSelf: 'Anda tidak dapat mengubah akun Anda sendiri dari panel ini.',
  errAdmLevel: 'Hanya akun dengan level di bawah level Anda yang dapat dikelola.',
  errAdmUnknownRole: 'Peran tidak dikenal.',
  errAdmRoleLevel: 'Peran baru harus berada di bawah level peran Anda.',
  errAdmSameRole: 'Pengguna sudah memiliki peran ini.',
  errAdmSameState: 'Akun sudah berada dalam status ini.',
  errAdmDateFormat: 'Tanggal harus menggunakan format YYYY-MM-DD.',

  /* Durations + relative time (formatDuration / formatAgo in this module). */
  durDaysHours: '{d} hari {h} jam',
  durHoursMinutes: '{h} jam {m} menit',
  durMinutes: '{m} menit',
  agoSec: '{n} dtk lalu',
  agoMin: '{n} mnt lalu',
  agoHour: '{n} jam lalu',
  agoDay: '{n} hari lalu',

  /* Backend status vocabulary (statusLabel). The raw Indonesian values are
     stable DB enums and stay the filter keys; only the label is localized. */
  stBerlaku: 'Berlaku',
  stTidakBerlaku: 'Tidak Berlaku',
  stMemproses: 'Memproses',
  stMenunggu: 'Menunggu Konfirmasi',
  stGagal: 'Gagal',
  stDuplikat: 'Duplikat',
  stTidakBerubah: 'Tidak Berubah',
  stDiubah: 'Diubah',
  stBaru: 'Baru',
  stDicabut: 'Dicabut',
  stPerubahan: 'Perubahan',
  stRahasia: 'Rahasia',
  stTerbatas: 'Terbatas',
  stUmum: 'Umum',
  stSesuai: 'Sesuai',
  stBeresiko: 'Beresiko',
  stFatal: 'Fatal',
  stTidakDiatur: 'Tidak Diatur',
  stQueued: 'Menunggu',
  stRunning: 'Berjalan',
  stCompleted: 'Selesai',
  stCancelled: 'Dibatalkan',
  stActive: 'Aktif',
  stExpired: 'Kedaluwarsa',

  /* Processing-queue stage names (api/services/task_queue.py STAGES). */
  stageExtract: 'Ekstraksi teks',
  stageClassify: 'Klasifikasi AI',
  stageDedup: 'Deteksi duplikat',
  stageContext: 'Ringkasan konteks',
  stageEmbed: 'Chunking & embedding',
  stageGraph: 'Graf pengetahuan',

  /* Contract expiry (expiry.ts). One/Other pairs feed plural(). */
  expNone: 'Tidak terdeteksi',
  expExpiredAgoOne: 'Kedaluwarsa {n} hari lalu',
  expExpiredAgoOther: 'Kedaluwarsa {n} hari lalu',
  expDaysLeftOne: '{n} hari lagi',
  expDaysLeftOther: '{n} hari lagi',
  expExpiredSince: 'Dokumen telah kedaluwarsa sejak {date}',
  expUnderWeek: 'Kurang dari 1 minggu — kedaluwarsa {date}',
  expUnderMonth: 'Kurang dari 1 bulan — kedaluwarsa {date}',
  expWordActive: 'Aktif',
  expWordSoon: 'Segera Berakhir',
  expWordExpired: 'Kedaluwarsa',

  /* Legal Opinion: background toasts */
  opNotifyReady: 'Jawaban opini legal siap — kembali ke halaman untuk membaca.',
  opNotifyFailed: 'Opini legal gagal diproses — buka halaman untuk melihat detailnya.',
  opDialogOk: 'OK',

  /* App shell */
  appLoading: 'Memuat…',

  /* Notification dock */
  notifTypeOpinion: 'Opini Legal',
  notifTypeContract: 'Kontrak',
  notifTypeRepository: 'Repositori',
  notifClearFinished: 'Hapus yang selesai',
  notifClearFinishedAria: 'Hapus notifikasi yang selesai',
  notifClose: 'Tutup notifikasi',
  notifEmpty: 'Tidak ada aktivitas berjalan.',
  notifRunning: 'Berjalan',
  notifFinished: 'Selesai',
  notifRemove: 'Hapus',
  notifNewCount: '{n} notifikasi baru',

  /* Contract upload jobs + toasts (ContractUploadContext) */
  ucRunning: 'Analisis "{filename}" berjalan di latar belakang.',
  ucRetrying: 'Analisis "{filename}" dicoba ulang di latar belakang.',
  ucDone: 'Analisis "{filename}" selesai — dokumen ditambahkan ke Kontrak.',
  ucFailed: 'Analisis "{filename}" gagal: {reason}',
  ucFileGone: 'Berkas "{filename}" tidak lagi tersedia di sesi ini — unggah ulang dokumen untuk mencoba lagi.',
  ucFileGoneName: 'dokumen',

  /* Contract upload modal */
  cuTitle: 'Upload Dokumen',
  cuClose: 'Tutup dialog upload',
  cuSubtitle: 'Cross-check klausul dokumen PKS dengan Database Regulasi OJK secara otomatis.',
  cuBoxTitle: 'Upload Dokumen PKS',
  cuBoxHint: 'Format PDF, Word, Excel, PPT, JPG, PNG & TXT didukung · maksimal 50 MB.',
  cuClearFile: 'Hapus file terpilih',
  cuOcr: 'Gunakan OCR Tradisional (untuk dokumen hasil pindaian)',
  cuNote: 'Pipeline 4-tahap (ekstraksi teks → identifikasi klausul → validasi relevansi → audit kepatuhan) berjalan di latar belakang ±2–4 menit. Anda bebas berpindah halaman — notifikasi muncul saat selesai dan dokumen baru otomatis masuk ke daftar Kontrak.',
  cuCancel: 'Batal',
  cuErrFormat: 'Format tidak didukung — gunakan PDF, Word, Excel, PPT, JPG, PNG, atau TXT.',
  cuErrSize: 'Ukuran maksimum 50 MB — file ini {mb} MB.',

  /* Compliance results viewer */
  crTitle: 'Hasil Analisis: {filename}',
  crDocFallback: 'Dokumen',
  crScore: 'Kepatuhan',
  crExpires: 'Kedaluwarsa: {date}',
  crColArticle: 'Pasal',
  crColAnalysis: 'Analisis',
  crSources: 'Sumber Dokumen Yang Ditemukan:',
  crAdvice: 'Saran:',
  crAiImpact: 'AI Analysis (Dampak Bisnis)',

  /* Account page */
  acctTitle: 'Pengaturan Akun',
  acctIntro: 'Kelola informasi pribadi, preferensi keamanan, dan pengaturan identitas inti Anda dari satu tempat.',
  acctUserFallback: 'Pengguna',
  acctIdLine: 'ID: {id}',
  acctIdUnknown: 'Tidak diketahui',
  acctSignOut: 'Keluar',
  acctTabGeneral: 'Informasi Umum',
  acctTabSecurity: 'Pengaturan Keamanan',
  acctProfile: 'Detail Profil',
  acctUsername: 'Nama pengguna',
  acctUniqueId: 'ID unik',
  acctAuthority: 'Level otoritas',
  acctEmail: 'Email',
  acctNotConfigured: 'Belum diatur',
  acctMemberSince: 'Anggota sejak',
  acctToday: 'Hari ini',
  acctChangePw: 'Ubah Kata Sandi',
  acctPwRule: 'Kata sandi harus memuat setidaknya satu angka dan satu simbol.',
  acctCurrentPw: 'Kata sandi saat ini',
  acctNewPw: 'Kata sandi baru',
  acctConfirmPw: 'Konfirmasi kata sandi baru',
  acctPhCurrent: 'Masukkan kata sandi saat ini',
  acctPhNew: 'Masukkan kata sandi baru',
  acctPhConfirm: 'Konfirmasi kata sandi baru',
  acctUpdating: 'Memperbarui…',
  acctUpdate: 'Perbarui Kata Sandi',
  acctErrMismatch: 'Kata sandi baru tidak cocok.',
  acctErrUpper: 'Kata sandi harus memuat setidaknya satu huruf besar.',
  acctErrNumber: 'Kata sandi harus memuat setidaknya satu angka.',
  acctErrSymbol: 'Kata sandi harus memuat setidaknya satu simbol.',
  acctPwUpdated: 'Kata sandi berhasil diperbarui.',
  acctErrChange: 'Gagal mengubah kata sandi.',

  /* Activity feed */
  actTitle: 'Aktivitas terbaru',
  actToday: 'Hari ini',
  actWeek: 'Minggu ini',
  actEmpty: 'Belum ada aktivitas terbaru.',
  actYou: 'Anda',
  actChat: 'memulai obrolan analisis hukum baru',
  actCompliance: 'mengunggah dokumen untuk pemeriksaan kepatuhan',
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

  /* Sidebar (2026-10-11 monochrome redesign) */
  sbSearchPlaceholder: 'Search menus',
  sbMore: 'More',
  sbCollapse: 'Collapse sidebar',
  sbExpand: 'Expand sidebar',
  sbNoMatch: 'No matching menus',
  sbChildDocs: 'Documents',
  sbChildPending: 'Pending Confirmation',
  sbChildHistory: 'Upload History',
  sbHelp: 'Help',
  sbHelpTitle: 'Help & keyboard shortcuts',
  sbHelpClose: 'Close help',
  sbHelpKeysNav: 'Move through sidebar menus',
  sbHelpKeysOpen: 'Open the focused menu',
  sbHelpKeysClose: 'Close any open dialog',
  sbHelpVersion: 'Version',

  routeErrorTitle: 'This page failed to load',
  routeErrorBody: 'Something went wrong while loading this page. Try reloading, or open another page from the menu.',
  routeErrorReload: 'Reload page',
  routeErrorDetails: 'Technical details',

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
    'Changes the language of the whole application. Applies immediately and is saved on this device.',
  motionTitle: 'Reduce motion',
  motionDesc:
    'Shorten transitions and animations across the interface, including smooth chat scrolling. Useful if you are sensitive to on-screen motion.',
  autoTitle: 'Auto-scroll to the newest message',
  autoDesc:
    'In Legal Opinion, the view follows the latest message as new answers arrive. Turn off to read the history without scroll jumps.',
  avatarTitle: 'gemma avatar',
  avatarDesc:
    'Choose the gemma mascot shape used across the Legal Opinion chat surfaces.',
  avatarColorTitle: 'gemma avatar color',
  avatarColorDesc:
    'Body colour of the gemma mascot across the chat surfaces. The first chip follows the theme accent (default).',
  avatarColorAccent: 'Theme accent (default)',
  avatarNameClover: 'Clover',
  avatarNameFlower: 'Flower',
  avatarNameTriangle: 'Triangle',
  avatarNameSquare: 'Square',
  avatarNameBlob: 'Blob',
  avatarNameGhost: 'Ghost',
  avatarNameCircle: 'Circle',
  avatarNameDrop: 'Drop',
  avatarNameStar: 'Star',
  avatarNameDroid: 'Droid',
  avatarNameMech: 'Mech',
  avatarNameAlien: 'Alien',
  avatarNameHexagon: 'Hexagon',
  avatarNameCat: 'Cat',
  avatarNameCloud: 'Cloud',
  avatarNamePill: 'Pill',
  avatarNamePebble: 'Pebble',
  avatarNamePuddle: 'Puddle',
  avatarColorViolet: 'Violet',
  avatarColorRose: 'Rose',
  avatarColorEmerald: 'Emerald',
  avatarColorAmber: 'Amber',
  avatarColorTeal: 'Teal',
  avatarColorSlate: 'Slate',
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
  resetConfirm: 'Reset all settings to their defaults? This cannot be undone.',
  secJobsData: 'Analysis history',
  jobsRetTitle: 'Analysis history retention',
  jobsRetDesc:
    'Finished entries in the Analysis History panel (Contracts) are deleted from this device once older than this — including entries that already exist. Analyzed documents and running analyses are unaffected. Current: {v}.',
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
  jobsRetDaysHint: 'Between {min} and {max} days.',
  jobsRetDaysInvalid: 'Enter a number of days between {min} and {max}.',
  jobsRetPrunedOne: '{n} old history entry removed from this device.',
  jobsRetPrunedMany: '{n} old history entries removed from this device.',

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
  opAiName: 'gemma',
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
  /* Conversation panel round 4 (2026-10-12): multi-select bulk delete,
     sort menu, and pinning (Claude-style sidebar). */
  opSelectMode: 'Select conversations',
  opSelectedCount: '{n} selected',
  opSelectAll: 'Select all',
  opDeleteSelected: 'Delete selected',
  opDeleteManyTitle: 'Delete conversations?',
  opDeleteManyBody: '{n} conversations will be permanently deleted from this device.',
  opDeleteAllTitle: 'Delete all conversations?',
  opDeleteAllBody: 'All {n} conversations will be permanently deleted. A new conversation will be started for you.',
  opSortLabel: 'Sort conversations',
  opSortCreated: 'Date created',
  opSortName: 'Name (A–Z)',
  opSortActivity: 'Last activity',
  opPinned: 'Pinned',
  opPin: 'Pin',
  opUnpin: 'Unpin',
  opClearMessages: 'Clear messages',
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
  opGreetOffer: 'How can gemma help you?',
  /* Chat attachments (2026-10-12): paperclip upload of images + PDFs in
     the Legal Opinion composer; {e} interpolates the failure reason. */
  opAttach: 'Attach a file',
  opAttachProcessing: 'Processing…',
  opAttachFailed: 'Failed: {e}',
  opAttachSendHint: 'Wait for attachments to finish processing',
  opAttachGhost: 'File unavailable',
  opAttachRemove: 'Remove attachment',
  opAttachClose: 'Close',
  /* Critique remediation (2026-10-12) — see the id block. */
  opAttachPendingList: 'Pending attachments',
  opAttachTruncated: 'Up to {max} files per message — {n} files were not added',

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
  authBackLanding: '← Back to home',
  authRegisterRoleNote: 'New accounts are created with the user role.',
  authContactNote: 'Trouble signing in? Contact your organization\'s administrator.',
  authForgotNote:
    'Forgot your password? Your organization\'s administrator can help reset it.',
  authCredit: 'Powered by LA Lintasarta Core',
  authLangToggleAria: 'Switch language to Indonesian',
  authOrLoginWith: 'Or log in with',
  authPasskey: 'Passkey',
  authPasskeySoon: 'Passkey coming soon',
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
  adminRefresh: 'Refresh',
  adminLastUpdated: 'Last updated at {time}',
  adminRefreshAria: 'Refresh data. Last updated at {time}',

  errNetwork: 'Cannot reach the server. Check your connection and try again.',
  errUnexpected: 'An unexpected error occurred.',
  errServer: 'The server returned an error (code {code}). Please try again in a moment.',
  errSystem: 'A system error occurred.',
  errProcessDoc: 'Failed to process the document.',
  errSaveAnalysis: 'The analysis finished, but saving the result failed.',
  errFileFormat: 'Unsupported file format. Please upload a PDF, DOCX, XLSX, PPTX, JPG, PNG, or TXT file.',
  errFileTooLarge: 'The file is too large (maximum 50 MB).',
  errDocUnreadable: 'The document could not be read. Try uploading it again, or make sure the PDF is not encrypted.',
  errAccessDenied: 'Access denied.',
  errDocNotFound: 'Document not found.',
  errPdfNotFound: 'PDF file not found.',
  errDocBusy: 'The document is still being processed. Try again in a moment.',
  errPwCurrentWrong: 'The current password is incorrect.',
  errPwSame: 'The new password must be different from the current password.',
  errTaxEmpty: 'The document type name cannot be empty.',
  errTaxMax: 'The document type name can be at most {n} characters.',
  errTaxExists: 'A document type with that name already exists.',
  errTaxInUse: 'This type is still used by documents in the repository. Deactivate it instead, or contact an administrator to delete it permanently.',
  errTaxNotActive: 'The document type is not in the active taxonomy.',
  errRepoNoAuthority: 'System admins are not authorized to access the document repository.',
  errGrantRoleOnly: 'Only Managers, Directors, or the Corporate Secretary can grant access.',
  errGrantRestricted: 'Managers cannot grant access to Restricted documents. Only the Director or Corporate Secretary is authorized.',
  errGrantReason: 'A reason is required (at least 5 characters).',
  errGrantUserNotFound: 'The user receiving access was not found.',
  errGrantRevokeOnly: 'Only the Corporate Secretary can revoke an access grant.',
  errGrantNotFound: 'Access grant not found.',
  errPendingNotFound: 'Pending document not found.',
  errAdmEntityRequired: 'Entity name is required.',
  errAdmEntityExists: 'The entity is already in the exclusion list.',
  errAdmUserNotFound: 'User not found.',
  errAdmSelf: 'You cannot modify your own account from this panel.',
  errAdmLevel: 'Only accounts below your own role level can be managed.',
  errAdmUnknownRole: 'Unknown role.',
  errAdmRoleLevel: 'The new role must be below your own role level.',
  errAdmSameRole: 'The user already has this role.',
  errAdmSameState: 'The account is already in this state.',
  errAdmDateFormat: 'Dates must use the YYYY-MM-DD format.',

  durDaysHours: '{d}d {h}h',
  durHoursMinutes: '{h}h {m}m',
  durMinutes: '{m} min',
  agoSec: '{n}s ago',
  agoMin: '{n}m ago',
  agoHour: '{n}h ago',
  agoDay: '{n}d ago',

  stBerlaku: 'In force',
  stTidakBerlaku: 'Not in force',
  stMemproses: 'Processing',
  stMenunggu: 'Awaiting confirmation',
  stGagal: 'Failed',
  stDuplikat: 'Duplicate',
  stTidakBerubah: 'Unchanged',
  stDiubah: 'Amended',
  stBaru: 'New',
  stDicabut: 'Revoked',
  stPerubahan: 'Amendment',
  stRahasia: 'Confidential',
  stTerbatas: 'Restricted',
  stUmum: 'Public',
  stSesuai: 'Compliant',
  stBeresiko: 'At risk',
  stFatal: 'Fatal',
  stTidakDiatur: 'Not regulated',
  stQueued: 'Waiting',
  stRunning: 'Running',
  stCompleted: 'Completed',
  stCancelled: 'Cancelled',
  stActive: 'Active',
  stExpired: 'Expired',

  stageExtract: 'Text extraction',
  stageClassify: 'AI classification',
  stageDedup: 'Duplicate detection',
  stageContext: 'Context summary',
  stageEmbed: 'Chunking & embedding',
  stageGraph: 'Knowledge graph',

  expNone: 'Not detected',
  expExpiredAgoOne: 'Expired {n} day ago',
  expExpiredAgoOther: 'Expired {n} days ago',
  expDaysLeftOne: '{n} day left',
  expDaysLeftOther: '{n} days left',
  expExpiredSince: 'This document expired on {date}',
  expUnderWeek: 'Less than 1 week left: expires {date}',
  expUnderMonth: 'Less than 1 month left: expires {date}',
  expWordActive: 'Active',
  expWordSoon: 'Expiring Soon',
  expWordExpired: 'Expired',

  opNotifyReady: 'Your legal opinion answer is ready. Return to the page to read it.',
  opNotifyFailed: 'The legal opinion could not be processed. Open the page to see the details.',
  opDialogOk: 'OK',

  appLoading: 'Loading…',

  notifTypeOpinion: 'Legal Opinion',
  notifTypeContract: 'Contracts',
  notifTypeRepository: 'Repository',
  notifClearFinished: 'Clear finished',
  notifClearFinishedAria: 'Clear finished notifications',
  notifClose: 'Close notifications',
  notifEmpty: 'No activity in progress.',
  notifRunning: 'In progress',
  notifFinished: 'Finished',
  notifRemove: 'Remove',
  notifNewCount: '{n} new notifications',

  ucRunning: 'Analysis of "{filename}" is running in the background.',
  ucRetrying: 'Analysis of "{filename}" is being retried in the background.',
  ucDone: 'Analysis of "{filename}" finished. The document was added to Contracts.',
  ucFailed: 'Analysis of "{filename}" failed: {reason}',
  ucFileGone: 'The file "{filename}" is no longer available in this session. Upload the document again to retry.',
  ucFileGoneName: 'document',

  cuTitle: 'Upload Document',
  cuClose: 'Close upload dialog',
  cuSubtitle: 'Automatically cross-check the clauses of PKS documents against the OJK Regulation Database.',
  cuBoxTitle: 'Upload PKS Document',
  cuBoxHint: 'PDF, Word, Excel, PPT, JPG, PNG & TXT formats supported · maximum 50 MB.',
  cuClearFile: 'Remove selected file',
  cuOcr: 'Use traditional OCR (for scanned documents)',
  cuNote: 'A 4-stage pipeline (text extraction → clause identification → relevance validation → compliance audit) runs in the background for about 2–4 minutes. You are free to navigate away. A notification appears when it finishes and the new document is added to the Contracts list automatically.',
  cuCancel: 'Cancel',
  cuErrFormat: 'Unsupported format. Use PDF, Word, Excel, PPT, JPG, PNG, or TXT.',
  cuErrSize: 'Maximum size is 50 MB. This file is {mb} MB.',

  crTitle: 'Analysis Result: {filename}',
  crDocFallback: 'Document',
  crScore: 'Compliance',
  crExpires: 'Expires: {date}',
  crColArticle: 'Article',
  crColAnalysis: 'Analysis',
  crSources: 'Sources found:',
  crAdvice: 'Recommendation:',
  crAiImpact: 'AI Analysis (Business Impact)',

  acctTitle: 'Account Settings',
  acctIntro: 'Manage your personal information, security preferences, and core identity settings from one central hub.',
  acctUserFallback: 'User',
  acctIdLine: 'ID: {id}',
  acctIdUnknown: 'Unknown',
  acctSignOut: 'Sign Out',
  acctTabGeneral: 'General Information',
  acctTabSecurity: 'Security Settings',
  acctProfile: 'Profile Details',
  acctUsername: 'Username',
  acctUniqueId: 'Unique ID',
  acctAuthority: 'Authority Level',
  acctEmail: 'Email',
  acctNotConfigured: 'Not configured',
  acctMemberSince: 'Member Since',
  acctToday: 'Today',
  acctChangePw: 'Change Password',
  acctPwRule: 'Password must contain at least one number and one symbol.',
  acctCurrentPw: 'Current Password',
  acctNewPw: 'New Password',
  acctConfirmPw: 'Confirm New Password',
  acctPhCurrent: 'Enter current password',
  acctPhNew: 'Enter new password',
  acctPhConfirm: 'Confirm new password',
  acctUpdating: 'Updating…',
  acctUpdate: 'Update Password',
  acctErrMismatch: 'New passwords do not match.',
  acctErrUpper: 'Password must contain at least one uppercase letter.',
  acctErrNumber: 'Password must contain at least one number.',
  acctErrSymbol: 'Password must contain at least one symbol.',
  acctPwUpdated: 'Password updated successfully.',
  acctErrChange: 'Failed to change the password.',

  actTitle: 'Latest activities',
  actToday: 'Today',
  actWeek: 'This week',
  actEmpty: 'No recent activity.',
  actYou: 'You',
  actChat: 'started a new legal analysis chat',
  actCompliance: 'uploaded a document for compliance check',
};

export const STRINGS: Record<Locale, Record<StringKey, string>> = { id, en };

/* Greeting variant pools (2026-10-12 round-3 review: Claude-style
   rotating greetings). Lives beside STRINGS, not inside it — STRINGS'
   value type is string-only. Templates may use {time} (the time-of-day
   salutation) and {offer} (opGreetOffer); LegalOpinion picks one entry
   per conversation via a pure hash of the conversation id, so a
   conversation keeps its greeting across renders and reloads while
   each new chat rotates. */
export const GREETING_POOLS: Record<Locale, string[]> = {
  id: [
    /* 2026-10-12 critique (polish): register re-aim — the casual variants
       ("kita bedah", "gemma di sini", "bisa … carikan") drifted from the
       formal-Indonesian voice the rest of the product holds. */
    '{time}! {offer}',
    '{time}! Siap membantu — apa yang ingin Anda analisis lebih dulu?',
    '{time}! Regulasi mana yang ingin Anda tinjau hari ini?',
    'Halo, gemma siap mendampingi. {offer}',
    '{time}! Tanyakan apa saja soal regulasi keuangan dan perbankan.',
    'Selamat datang kembali! {offer}',
    '{time}! Dokumen atau aturan mana yang ingin Anda tinjau?',
    'Halo — gemma siap membantu. Apa yang dapat saya telusuri untuk Anda?',
  ],
  en: [
    /* 2026-10-12 critique (polish): register re-aim, mirroring the id pool. */
    '{time}! {offer}',
    '{time}! Ready when you are — what would you like to analyze first?',
    '{time}! Which regulation would you like to review today?',
    'Hello, gemma is here to assist. {offer}',
    '{time}! Ask me anything about financial and banking regulations.',
    'Welcome back! {offer}',
    '{time}! Which document or rule would you like to review?',
    'Hello — gemma at your service. What may I look up for you?',
  ],
};

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

/* ── Locale-safe message plumbing (2026-10-14) ───────────────────────────
   Rule: never store translated TEXT in state, localStorage or Error.message.
   Store a Msg (a key + params, or a `{ text }` passthrough for dynamic
   server/DB content) and resolve it with msg(t, m) while rendering, so a
   language switch re-renders the same message in the new language. */

export type Dict = Record<StringKey, string>;
export type MsgParams = Record<string, string | number | Msg>;
export type Msg = { key: StringKey; params?: MsgParams } | { text: string };

/** Resolve a Msg to display text. A plain string (legacy persisted data) is
    shown as-is; a key that no longer exists degrades to the generic error. */
export function msg(t: Dict, m: Msg | string): string {
  if (typeof m === 'string') return m;
  if ('text' in m) return m.text;
  const template = t[m.key];
  if (typeof template !== 'string') return t.errUnexpected;
  if (!m.params) return template;
  const vars: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(m.params)) {
    vars[k] = typeof v === 'object' ? msg(t, v) : v;
  }
  return fill(template, vars);
}

/** Error that carries a Msg instead of text: `throw new LocalizedError({ key })`
    in async code, then `e instanceof LocalizedError ? e.msg : { key: 'errUnexpected' }`
    in the catch and resolve at render. `message` is the key, for logs only. */
export class LocalizedError extends Error {
  readonly msg: Msg;
  constructor(m: Msg) {
    super('text' in m ? m.text : m.key);
    this.name = 'LocalizedError';
    this.msg = m;
  }
}

/** Keys that exist as a `${base}One` / `${base}Other` pair. */
type PluralBase = {
  [K in StringKey]: K extends `${infer B}One` ? (`${B}Other` extends StringKey ? B : never) : never;
}[StringKey];

/** Pick the One/Other variant for n (n === 1 is singular) and fill it; `{n}`
    is always provided. Indonesian has no plural forms, so both `id` variants
    carry the same text. */
export function plural(
  t: Dict,
  base: PluralBase,
  n: number,
  vars: Record<string, string | number> = {},
): string {
  const key = `${base}${n === 1 ? 'One' : 'Other'}` as StringKey;
  return fill(t[key], { n, ...vars });
}

/** "2 hari 3 jam" / "3 jam 5 menit" / "5 menit" from a span in seconds. */
export function formatDuration(t: Dict, seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return fill(t.durDaysHours, { d, h });
  if (h > 0) return fill(t.durHoursMinutes, { h, m });
  return fill(t.durMinutes, { m });
}

/** Relative age ("12 dtk lalu" / "12s ago") from an elapsed span in seconds. */
export function formatAgo(t: Dict, seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s < 60) return fill(t.agoSec, { n: s });
  if (s < 3600) return fill(t.agoMin, { n: Math.floor(s / 60) });
  if (s < 86400) return fill(t.agoHour, { n: Math.floor(s / 3600) });
  return fill(t.agoDay, { n: Math.floor(s / 86400) });
}

/* Backend status enums are stable Indonesian values stored in the DB (and
   used as filter/grouping keys). Only the DISPLAYED label is translated;
   unknown values fall back to the raw text. */
const STATUS_KEYS: Record<string, StringKey> = {
  'Berlaku': 'stBerlaku',
  'Tidak Berlaku': 'stTidakBerlaku',
  'Memproses': 'stMemproses',
  'Menunggu Konfirmasi': 'stMenunggu',
  'Gagal': 'stGagal',
  'Duplikat': 'stDuplikat',
  'Tidak Berubah': 'stTidakBerubah',
  'Diubah': 'stDiubah',
  'Baru': 'stBaru',
  'Dicabut': 'stDicabut',
  'Perubahan': 'stPerubahan',
  'Rahasia': 'stRahasia',
  'Terbatas': 'stTerbatas',
  'Umum': 'stUmum',
  'Selesai': 'stCompleted',
  'Menunggu': 'stQueued',
  'Berjalan': 'stRunning',
  'Dibatalkan': 'stCancelled',
  'Aktif': 'stActive',
  'Kedaluwarsa': 'stExpired',
  SESUAI: 'stSesuai',
  BERESIKO: 'stBeresiko',
  FATAL: 'stFatal',
  'TIDAK DIATUR': 'stTidakDiatur',
  QUEUED: 'stQueued',
  RUNNING: 'stRunning',
  COMPLETED: 'stCompleted',
  FAILED: 'stGagal',
  CANCELLED: 'stCancelled',
};

/** Localized label for a raw backend status. Composite values such as
    "Berlaku (Perubahan) (Diubah)" or "Gagal - Duplikat" are translated
    segment by segment; unrecognized segments are kept verbatim. */
export function statusLabel(t: Dict, raw: string): string {
  const whole = STATUS_KEYS[raw.trim()];
  if (whole) return t[whole];
  return raw
    .split(/(\([^)]*\)| - )/)
    .map((part) => {
      if (part === ' - ') return part;
      const paren = /^\(([^)]*)\)$/.exec(part);
      const inner = (paren ? paren[1] : part).trim();
      const key = STATUS_KEYS[inner];
      if (!key) return part;
      return paren ? `(${t[key]})` : part.replace(inner, t[key]);
    })
    .join('');
}

const STAGE_KEYS: Record<string, StringKey> = {
  'Ekstraksi teks': 'stageExtract',
  'Klasifikasi AI': 'stageClassify',
  'Deteksi duplikat': 'stageDedup',
  'Ringkasan konteks': 'stageContext',
  'Chunking & embedding': 'stageEmbed',
  'Graf pengetahuan': 'stageGraph',
};

/** Localized name for a backend processing-queue stage (fixed set in
    task_queue.py STAGES); unknown names pass through. */
export function stageLabel(t: Dict, raw: string): string {
  const key = STAGE_KEYS[raw];
  return key ? t[key] : raw;
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
