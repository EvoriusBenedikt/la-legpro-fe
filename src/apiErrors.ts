import { isHttpError, isNetworkError } from './services/api';
import type { Msg, StringKey } from './i18n';

/* Backend `detail` strings are free text in mixed Indonesian/English
   (api/routers/{admin,taxonomy,repository,compliance}.py, auth.py).
   Showing them raw would freeze the UI in whichever language the server
   happened to use, so recognized details are mapped to i18n keys here and
   everything else degrades to the caller's locale-correct fallback key.
   The raw detail is only ever written to the console. */

type Rule = { match: string | RegExp; key: StringKey; param?: string };

/* Exact matches compare the trimmed detail; RegExp rules may capture the
   first group into the named `param` (e.g. a max length). */
const RULES: Rule[] = [
  // auth.py
  { match: 'Current password is incorrect', key: 'errPwCurrentWrong' },
  { match: 'New password must be different from the current password', key: 'errPwSame' },
  { match: /^Akses ditolak/, key: 'errAccessDenied' },
  // admin.py
  { match: 'Entity name is required', key: 'errAdmEntityRequired' },
  { match: 'Entity already in exclusion list', key: 'errAdmEntityExists' },
  { match: 'User not found', key: 'errAdmUserNotFound' },
  { match: 'You cannot modify your own account from this panel', key: 'errAdmSelf' },
  { match: 'Only accounts below your own role level can be managed', key: 'errAdmLevel' },
  { match: 'Unknown role', key: 'errAdmUnknownRole' },
  { match: 'The new role must be below your own role level', key: 'errAdmRoleLevel' },
  { match: 'User already has this role', key: 'errAdmSameRole' },
  { match: 'Account already in this state', key: 'errAdmSameState' },
  { match: 'Dates must use the YYYY-MM-DD format', key: 'errAdmDateFormat' },
  // taxonomy.py
  { match: 'Nama jenis dokumen tidak boleh kosong', key: 'errTaxEmpty' },
  { match: /^Nama jenis dokumen maksimal (\d+) karakter$/, key: 'errTaxMax', param: 'n' },
  { match: 'Jenis dokumen dengan nama tersebut sudah ada', key: 'errTaxExists' },
  { match: /^Jenis ini masih digunakan oleh dokumen/, key: 'errTaxInUse' },
  { match: 'Jenis dokumen tidak ada dalam taksonomi aktif.', key: 'errTaxNotActive' },
  // repository.py
  { match: /^PDF '.*' not found$/, key: 'errPdfNotFound' },
  { match: /^Admin sistem tidak memiliki kewenangan/, key: 'errRepoNoAuthority' },
  { match: /^Hanya Manajer, Direktur, atau Sekretaris Perusahaan/, key: 'errGrantRoleOnly' },
  { match: 'Dokumen tidak ditemukan', key: 'errDocNotFound' },
  { match: /^Manajer tidak dapat memberikan akses/, key: 'errGrantRestricted' },
  { match: /^Alasan wajib diisi/, key: 'errGrantReason' },
  { match: /^Pengguna penerima akses tidak ditemukan/, key: 'errGrantUserNotFound' },
  { match: /^Hanya Sekretaris Perusahaan yang dapat mencabut/, key: 'errGrantRevokeOnly' },
  { match: /^Grant tidak ditemukan/, key: 'errGrantNotFound' },
  { match: /^Dokumen sedang diproses/, key: 'errDocBusy' },
  { match: /^Dokumen pending tidak ditemukan/, key: 'errPendingNotFound' },
  // compliance.py
  { match: 'Only PDF files are supported.', key: 'errFileFormat' },
  { match: /^Format file tidak didukung/, key: 'errFileFormat' },
  { match: /^File too large/, key: 'errFileTooLarge' },
  { match: /^Terjadi kesalahan (internal )?saat memproses dokumen/, key: 'errProcessDoc' },
  { match: /^Dokumen tidak dapat dibaca/, key: 'errDocUnreadable' },
];

/** Map a raw backend detail to a Msg, or null when it is not recognized. */
export function mapApiDetail(detail: string): Msg | null {
  const text = detail.trim();
  for (const rule of RULES) {
    if (typeof rule.match === 'string') {
      if (text === rule.match) return { key: rule.key };
      continue;
    }
    const m = rule.match.exec(text);
    if (m) {
      return rule.param && m[1] !== undefined
        ? { key: rule.key, params: { [rule.param]: m[1] } }
        : { key: rule.key };
    }
  }
  return null;
}

/**
 * Locale-safe Msg for a failed request:
 * - no response at all (backend down, DNS, CORS) → `errNetwork`;
 * - HTTP error with a recognized `detail` → that detail's key;
 * - anything else → `fallbackKey` (never raw server text; the detail is
 *   logged for debugging).
 */
export function apiErrorMsg(e: unknown, fallbackKey: StringKey): Msg {
  if (isNetworkError(e)) return { key: 'errNetwork' };
  if (isHttpError(e)) {
    const detail = e.response.data?.detail;
    if (typeof detail === 'string' && detail) {
      const mapped = mapApiDetail(detail);
      if (mapped) return mapped;
      console.error('Unmapped API error detail:', detail);
    }
  }
  return { key: fallbackKey };
}
