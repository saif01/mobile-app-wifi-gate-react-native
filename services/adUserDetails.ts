import axios from 'axios';

export const AD_USER_DETAILS_URL = 'https://it.cpbangladesh.com/api/ad_user_details';

/** Warn when remaining days until password expiry is below this threshold. */
export const PASSWORD_EXPIRY_WARNING_DAYS = 15;

export interface AdUserDetails {
  /** Flattened display rows (label → string value). */
  rows: { key: string; label: string; value: string }[];
  /** Row key to highlight as password expiry (matches `rows[].key`). */
  passwordExpiryRowKey: string | null;
  passwordExpiresAt: Date | null;
  /** Whole days from local midnight today to expiry day; null if unknown. */
  daysUntilPasswordExpiry: number | null;
  passwordExpiryRaw: string | null;
}

interface ApiEnvelope {
  code?: number;
  status?: string;
  msg?: string;
  data?: Record<string, unknown> | null;
  info?: { msg?: string; data?: Record<string, unknown> | null };
}

/** Fields hidden from the dashboard profile (API noise or redundant). */
const DASHBOARD_HIDDEN_KEY_NORMS = new Set([
  'accountexpires',
  'accountexpiry',
  'adcreatedat',
  'nationality',
  'wrongpasswordfield',
]);

function normKeyToken(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** True if this row should not appear on the account profile card. */
export function isHiddenDashboardProfileField(key: string, label: string): boolean {
  const leaf = key.split('.').pop() ?? key;
  const leafNorm = normKeyToken(leaf);
  if (DASHBOARD_HIDDEN_KEY_NORMS.has(leafNorm)) return true;

  const labelNorm = normKeyToken(label);
  if (labelNorm.includes('accountexpires') || labelNorm.includes('accountexpiry')) return true;
  if (labelNorm.includes('adcreated') && labelNorm.includes('at')) return true;
  if (labelNorm === 'nationality' || leafNorm === 'nationality') return true;
  if (labelNorm.includes('wrongpasswordfield')) return true;

  return false;
}

export function isPasswordExpiryKey(key: string): boolean {
  const k = key.toLowerCase();
  if (k.includes('password') && k.includes('expir')) return true;
  if (/^pwd.*expir|^expir.*pwd/.test(k)) return true;
  if (k === 'password_expires' || k === 'passwordexpire' || k === 'pwdexpires') return true;
  return false;
}

function coerceString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v.trim() || null;
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  return null;
}

/** Display format used in the app for parsed datetimes. */
export function formatDdMmYyyyHmAmPm(d: Date): string {
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const h24 = d.getHours();
  const min = d.getMinutes();
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  const hh = String(h12).padStart(2, '0');
  const mm = String(min).padStart(2, '0');
  return `${day}/${month}/${year} ${hh}:${mm} ${ampm}`;
}

/** Parse DD/MM/YYYY with optional time (12h or 24h), European day-first order. */
function parseDdMmYyyyWithOptionalTime(s: string): Date | null {
  const re =
    /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[T\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*(AM|PM|am|pm))?)?/;
  const m = re.exec(s.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]) - 1;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  let h = m[4] != null ? Number(m[4]) : 0;
  const min = m[5] != null ? Number(m[5]) : 0;
  const sec = m[6] != null ? Number(m[6]) : 0;
  const ap = m[7]?.toUpperCase();
  if (ap === 'PM' && h < 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  const dt = new Date(year, month, day, h, min, sec);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/**
 * Try common date formats from AD / APIs (ISO, DD/MM/YYYY, with optional time, 13-digit epoch ms).
 */
export function parseExpiryDate(raw: string): Date | null {
  const s = raw.trim().replace(/\s+/g, ' ');
  if (!s) return null;

  // 13-digit Unix ms (common in JSON)
  if (/^\d{13}$/.test(s)) {
    const n = Number(s);
    const d = new Date(n);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // Prefer explicit DD/MM/YYYY before Date.parse (avoids locale ambiguity on 11/04/2026)
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(s)) {
    const dm = parseDdMmYyyyWithOptionalTime(s);
    if (dm) return dm;
  }

  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return new Date(iso);

  return parseDdMmYyyyWithOptionalTime(s);
}

/** If the value parses as a date, return formatted DD/MM/YYYY HH:MM AM/PM; otherwise original. */
export function formatProfileValueIfDateTime(value: string): string {
  const s = value.trim();
  if (!s) return value;
  const d = parseExpiryDate(s);
  if (!d || Number.isNaN(d.getTime())) return value;
  return formatDdMmYyyyHmAmPm(d);
}

/** Raw expiry string from structured fields or from profile rows (API shape varies). */
export function getPasswordExpiryRawFromDetails(p: AdUserDetails): string | null {
  if (p.passwordExpiryRaw?.trim()) return p.passwordExpiryRaw.trim();
  if (p.passwordExpiryRowKey) {
    const hit = p.rows.find((x) => x.key === p.passwordExpiryRowKey);
    if (hit?.value?.trim()) return hit.value.trim();
  }
  for (const r of p.rows) {
    const leaf = r.key.split('.').pop() ?? r.key;
    if (isPasswordExpiryKey(leaf) && r.value.trim()) return r.value.trim();
  }
  return null;
}

function daysUntilExpiry(expiry: Date): number {
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function collectRows(obj: Record<string, unknown>): { key: string; label: string; value: string }[] {
  const rows: { key: string; label: string; value: string }[] = [];
  const seen = new Set<string>();

  for (const [key, val] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (lower === 'password' || lower.endsWith('_password')) continue;
    if (val != null && typeof val === 'object' && !Array.isArray(val)) {
      const nested = collectRows(val as Record<string, unknown>);
      for (const r of nested) {
        const k = `${key}.${r.key}`;
        if (!seen.has(k)) {
          seen.add(k);
          rows.push({ key: k, label: `${humanizeKey(key)} · ${r.label}`, value: r.value });
        }
      }
      continue;
    }
    const str = coerceString(val);
    if (str == null) continue;
    if (!seen.has(key)) {
      seen.add(key);
      rows.push({ key, label: humanizeKey(key), value: str });
    }
  }

  return rows.sort((a, b) => a.label.localeCompare(b.label));
}

function findPasswordExpiry(obj: Record<string, unknown>): string | null {
  for (const [key, val] of Object.entries(obj)) {
    if (isPasswordExpiryKey(key)) {
      const s = coerceString(val);
      if (s) return s;
    }
    if (val != null && typeof val === 'object' && !Array.isArray(val)) {
      const inner = findPasswordExpiry(val as Record<string, unknown>);
      if (inner) return inner;
    }
  }
  return null;
}

function normalizeDetails(data: Record<string, unknown>): AdUserDetails {
  const rows = collectRows(data);
  let passwordExpiryRaw = findPasswordExpiry(data);
  if (!passwordExpiryRaw) {
    for (const r of rows) {
      if (isPasswordExpiryKey(r.key.split('.').pop() ?? r.key)) {
        passwordExpiryRaw = r.value;
        break;
      }
    }
  }

  const passwordExpiresAt: Date | null = passwordExpiryRaw ? parseExpiryDate(passwordExpiryRaw) : null;

  let daysUntilPasswordExpiry: number | null = null;
  if (passwordExpiresAt) {
    daysUntilPasswordExpiry = daysUntilExpiry(passwordExpiresAt);
  }

  const expiryKeys = new Set(
    rows.filter((r) => isPasswordExpiryKey(r.key.split('.').pop() ?? r.key)).map((r) => r.key)
  );

  const orderedRows = [...rows]
    .filter((r) => !isHiddenDashboardProfileField(r.key, r.label))
    .sort((a, b) => {
      const ae = expiryKeys.has(a.key) ? 0 : 1;
      const be = expiryKeys.has(b.key) ? 0 : 1;
      if (ae !== be) return ae - be;
      return a.label.localeCompare(b.label);
    });

  let passwordExpiryRowKey: string | null = null;
  for (const r of orderedRows) {
    const leaf = r.key.split('.').pop() ?? r.key;
    if (isPasswordExpiryKey(leaf) || (passwordExpiryRaw && r.value === passwordExpiryRaw)) {
      passwordExpiryRowKey = r.key;
      break;
    }
  }

  return {
    rows: orderedRows,
    passwordExpiryRowKey,
    passwordExpiresAt,
    daysUntilPasswordExpiry,
    passwordExpiryRaw,
  };
}

export type FetchAdUserDetailsResult =
  | { ok: true; details: AdUserDetails }
  | { ok: false; message: string };

/** Server accepts login or UserID and password or pass (form body). */
function buildFormBody(login: string, password: string): URLSearchParams {
  const body = new URLSearchParams();
  body.set('login', login);
  body.set('UserID', login);
  body.set('password', password);
  body.set('pass', password);
  return body;
}

/** IT API often expects sAMAccountName, not DOMAIN\\user or user@domain. */
function buildLoginVariants(login: string): string[] {
  const t = login.trim();
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const x = s.trim();
    if (x && !seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  };
  add(t);
  if (t.includes('\\')) {
    add(t.split('\\').pop() ?? '');
  }
  if (t.includes('/')) {
    add(t.split('/').pop() ?? '');
  }
  const at = t.indexOf('@');
  if (at > 0) {
    add(t.slice(0, at));
  }
  return out;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function extractPayload(json: Record<string, unknown>): Record<string, unknown> | null {
  const data = json.data;
  const r1 = asRecord(data);
  if (r1) return r1;

  if (typeof data === 'string' && data.trim()) {
    try {
      const parsed = JSON.parse(data) as unknown;
      const r = asRecord(parsed);
      if (r) return r;
    } catch {
      /* ignore */
    }
  }

  if (Array.isArray(data) && data[0]) {
    const r = asRecord(data[0]);
    if (r) return r;
  }

  const info = json.info as { data?: unknown; msg?: string } | undefined;
  const infoData = info?.data;
  const r2 = asRecord(infoData);
  if (r2) return r2;
  if (Array.isArray(infoData) && infoData[0]) {
    const r = asRecord(infoData[0]);
    if (r) return r;
  }

  const skip = new Set(['code', 'status', 'msg', 'message', 'info', 'data', 'errors']);
  const flat: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(json)) {
    if (skip.has(k)) continue;
    if (v === null || typeof v === 'object') continue;
    flat[k] = v;
  }
  if (Object.keys(flat).length) return flat;

  return null;
}

function isAuthFailure(json: ApiEnvelope, httpStatus: number): boolean {
  const st = String(json.status ?? '').toLowerCase();
  if (st === 'error') return true;
  const code = json.code;
  if (typeof code === 'number' && code >= 400) return true;
  if (httpStatus >= 400) return true;
  return false;
}

function combineErrorMessage(json: ApiEnvelope): string {
  const top = coerceString(json.msg);
  const nested = coerceString((json.info as { msg?: unknown } | undefined)?.msg);
  if (top && nested && top !== nested) return `${top} (${nested})`;
  return top ?? nested ?? 'Could not load account details.';
}

async function postAdUserDetailsOnce(login: string, password: string): Promise<FetchAdUserDetailsResult> {
  const body = buildFormBody(login, password);
  const bodyStr = body.toString();

  const res = await axios.post<ApiEnvelope | string>(AD_USER_DETAILS_URL, bodyStr, {
    timeout: 25_000,
    validateStatus: () => true,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    transformResponse: (r) => {
      if (typeof r === 'string') {
        try {
          return JSON.parse(r) as ApiEnvelope;
        } catch {
          return { parseError: true, raw: r };
        }
      }
      return r;
    },
  });

  const json = res.data as ApiEnvelope & { parseError?: boolean };
  if ((json as { parseError?: boolean }).parseError) {
    return { ok: false, message: 'Invalid response from account server.' };
  }

  if (isAuthFailure(json, res.status)) {
    return { ok: false, message: combineErrorMessage(json) };
  }

  const payload = extractPayload(json as Record<string, unknown>);
  if (!payload) {
    return { ok: false, message: combineErrorMessage(json) || 'No profile data in response.' };
  }

  return { ok: true, details: normalizeDetails(payload) };
}

function shouldRetryOtherLoginVariant(result: FetchAdUserDetailsResult): boolean {
  if (result.ok) return false;
  const m = (result.message ?? '').toLowerCase();
  return (
    m.includes('invalid credential') ||
    m.includes('not found') ||
    m.includes('unauthor') ||
    m.includes('wrong') ||
    m.includes('failed')
  );
}

export async function fetchAdUserDetails(login: string, password: string): Promise<FetchAdUserDetailsResult> {
  const pwd = password.trim();
  if (!pwd) {
    return { ok: false, message: 'Password is missing.' };
  }

  const variants = buildLoginVariants(login);
  let last: FetchAdUserDetailsResult = { ok: false, message: 'Could not load account details.' };

  try {
    for (let i = 0; i < variants.length; i += 1) {
      const user = variants[i];
      const r = await postAdUserDetailsOnce(user, pwd);
      last = r;
      if (r.ok) return r;
      if (i < variants.length - 1 && shouldRetryOtherLoginVariant(r)) {
        continue;
      }
      return r;
    }
    return last;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error loading account details.';
    return { ok: false, message: msg };
  }
}

export function shouldWarnPasswordExpiry(days: number | null): boolean {
  if (days == null) return false;
  if (days < 0) return true;
  return days < PASSWORD_EXPIRY_WARNING_DAYS;
}
