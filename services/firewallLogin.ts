import axios, { type AxiosError } from 'axios';
import { Platform } from 'react-native';
import { HTTP_TIMEOUT_MS } from '@/constants/defaults';
import type { FirewallLoginFailureReason, FirewallLoginResult } from '@/types/models';

const USERNAME_KEYS = ['username', 'user', 'userid', 'login', 'email', 'uname', 'name'];
const PASSWORD_KEYS = ['password', 'passwd', 'pass', 'pwd'];
const CYBEROAM_LIVE = 'LIVE';
const CYBEROAM_LOGGED_OUT = 'LOGIN';
const CYBEROAM_CHALLENGE = 'CHALLENGE';

function mergeSetCookie(existing: string | undefined, setCookie: string | string[] | undefined): string {
  if (!setCookie) return existing ?? '';
  const parts = Array.isArray(setCookie) ? setCookie : [setCookie];
  const pairs = parts.map((p) => p.split(';')[0]).filter(Boolean);
  const map = new Map<string, string>();
  const all = [...(existing ? existing.split('; ').filter(Boolean) : []), ...pairs];
  for (const c of all) {
    const eq = c.indexOf('=');
    if (eq > 0) map.set(c.slice(0, eq).trim(), c.slice(eq + 1).trim());
  }
  return [...map.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

function extractInputs(html: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const inputRe = /<input[^>]+>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(html)) !== null) {
    const tag = m[0];
    const nameMatch = /name\s*=\s*["']([^"']+)["']/i.exec(tag);
    const valueMatch = /value\s*=\s*["']([^"']*)["']/i.exec(tag);
    const typeMatch = /type\s*=\s*["']([^"']+)["']/i.exec(tag);
    const type = typeMatch?.[1]?.toLowerCase() ?? 'text';
    if (type === 'submit' || type === 'button') continue;
    if (nameMatch) {
      fields[nameMatch[1]] = valueMatch?.[1] ?? '';
    }
  }
  return fields;
}

function findFormAction(html: string, baseUrl: string): { action: string; method: string } {
  const formMatch = /<form[^>]*>/i.exec(html);
  if (!formMatch) {
    return { action: baseUrl, method: 'POST' };
  }
  const formTag = formMatch[0];
  const actionMatch = /action\s*=\s*["']([^"']*)["']/i.exec(formTag);
  const methodMatch = /method\s*=\s*["']([^"']+)["']/i.exec(formTag);
  const method = (methodMatch?.[1] ?? 'POST').toUpperCase() === 'GET' ? 'GET' : 'POST';
  let action = actionMatch?.[1]?.trim() ?? '';
  if (!action || action === '#') {
    return { action: baseUrl, method };
  }
  try {
    return { action: new URL(action, baseUrl).toString(), method };
  } catch {
    return { action: baseUrl, method };
  }
}

function pickCredentialField(keys: string[], fields: Record<string, string>): string | null {
  const lower = Object.keys(fields).reduce<Record<string, string>>((acc, k) => {
    acc[k.toLowerCase()] = k;
    return acc;
  }, {});
  for (const want of keys) {
    if (lower[want]) return lower[want];
  }
  return null;
}

function readXmlTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
  const match = re.exec(xml);
  return match?.[1]?.trim() ?? null;
}

function isCyberoamLikePortal(html: string): boolean {
  const lower = html.toLowerCase();
  return (
    lower.includes('submitrequest()') &&
    lower.includes('login.xml') &&
    lower.includes('mode=191')
  );
}

async function performCyberoamLogin(
  baseUrl: string,
  userId: string,
  password: string,
  signal?: AbortSignal
): Promise<FirewallLoginResult | null> {
  const action = new URL('login.xml', `${baseUrl}/`).toString();
  let state: string | null = null;
  const productType = Platform.OS === 'android' ? '2' : '0';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const body = new URLSearchParams();
    body.set('mode', '191');
    body.set('username', userId);
    body.set('password', password);
    body.set('a', `${Date.now()}`);
    body.set('producttype', productType);
    if (state) body.set('state', state);

    const res = await axios.post<string>(action, body.toString(), {
      timeout: HTTP_TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: () => true,
      signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      responseType: 'text',
      transformResponse: (r) => r,
    });

    const xml = typeof res.data === 'string' ? res.data : String(res.data ?? '');
    if (!xml.toLowerCase().includes('<requestresponse')) {
      return null;
    }
    const status = readXmlTag(xml, 'status');
    const message = readXmlTag(xml, 'message') ?? undefined;

    if (status === CYBEROAM_LIVE) {
      return { ok: true };
    }
    if (status === CYBEROAM_CHALLENGE) {
      state = readXmlTag(xml, 'state');
      if (state) continue;
      return { ok: false, reason: 'unexpected_response', message, statusCode: res.status };
    }
    if (status === CYBEROAM_LOGGED_OUT) {
      return { ok: false, reason: 'invalid_credentials', message, statusCode: res.status };
    }

    return { ok: false, reason: 'unexpected_response', message, statusCode: res.status };
  }

  return { ok: false, reason: 'unexpected_response', message: 'Login challenge could not be completed.' };
}

function guessSuccess(html: string, status: number): boolean {
  if (status >= 200 && status < 300) {
    const lower = html.toLowerCase();
    if (
      lower.includes('invalid') ||
      lower.includes('incorrect') ||
      lower.includes('failed') ||
      lower.includes('error') ||
      lower.includes('denied')
    ) {
      return false;
    }
    if (lower.includes('welcome') || lower.includes('success') || lower.includes('logged')) {
      return true;
    }
    return status === 200 && html.length < 500_000;
  }
  return false;
}

export interface FirewallLoginOptions {
  baseUrl: string;
  userId: string;
  password: string;
  signal?: AbortSignal;
}

let inFlight: Promise<FirewallLoginResult> | null = null;

/**
 * Analyzes the portal HTML (GET), preserves cookies, then POSTs credentials.
 * If the page shape differs, use WebView-assisted login from the app screen.
 */
export async function performFirewallLogin(opts: FirewallLoginOptions): Promise<FirewallLoginResult> {
  if (inFlight) {
    return { ok: false, reason: 'cancelled', message: 'Another login is in progress.' };
  }
  const run = (async (): Promise<FirewallLoginResult> => {
    const base = opts.baseUrl.replace(/\/+$/, '');
    let cookieHeader = '';

    try {
      const directPortalResult = await performCyberoamLogin(base, opts.userId, opts.password, opts.signal);
      if (directPortalResult) {
        return directPortalResult;
      }

      const getRes = await axios.get<string>(base, {
        timeout: HTTP_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: () => true,
        signal: opts.signal,
        headers: { Cookie: cookieHeader },
        responseType: 'text',
        transformResponse: (r) => r,
      });
      cookieHeader = mergeSetCookie(cookieHeader, getRes.headers['set-cookie']);

      const html = typeof getRes.data === 'string' ? getRes.data : String(getRes.data ?? '');
      if (isCyberoamLikePortal(html)) {
        const portalResult = await performCyberoamLogin(base, opts.userId, opts.password, opts.signal);
        if (portalResult) return portalResult;
      }

      const { action, method } = findFormAction(html, getRes.request?.responseURL ?? base);
      const hidden = extractInputs(html);

      const userField =
        pickCredentialField(USERNAME_KEYS, hidden) ??
        USERNAME_KEYS.find((k) => Object.keys(hidden).some((h) => h.toLowerCase() === k)) ??
        'username';
      const passField =
        pickCredentialField(PASSWORD_KEYS, hidden) ??
        PASSWORD_KEYS.find((k) => Object.keys(hidden).some((h) => h.toLowerCase() === k)) ??
        'password';

      const body = new URLSearchParams();
      for (const [k, v] of Object.entries(hidden)) {
        const kl = k.toLowerCase();
        if (USERNAME_KEYS.includes(kl) || kl === userField.toLowerCase()) continue;
        if (PASSWORD_KEYS.includes(kl) || kl === passField.toLowerCase()) continue;
        body.append(k, v);
      }
      body.append(userField, opts.userId);
      body.append(passField, opts.password);

      if (method === 'GET') {
        const u = new URL(action);
        for (const [k, v] of body.entries()) u.searchParams.set(k, v);
        const res = await axios.get<string>(u.toString(), {
          timeout: HTTP_TIMEOUT_MS,
          maxRedirects: 5,
          validateStatus: () => true,
          signal: opts.signal,
          headers: { Cookie: cookieHeader },
          responseType: 'text',
        });
        cookieHeader = mergeSetCookie(cookieHeader, res.headers['set-cookie']);
        const ok = guessSuccess(typeof res.data === 'string' ? res.data : String(res.data), res.status);
        return ok
          ? { ok: true }
          : { ok: false, reason: 'invalid_credentials', statusCode: res.status };
      }

      const postRes = await axios.post<string>(action, body.toString(), {
        timeout: HTTP_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: () => true,
        signal: opts.signal,
        headers: {
          Cookie: cookieHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        responseType: 'text',
        transformResponse: (r) => r,
      });
      cookieHeader = mergeSetCookie(cookieHeader, postRes.headers['set-cookie']);
      const respHtml = typeof postRes.data === 'string' ? postRes.data : String(postRes.data ?? '');
      const ok = guessSuccess(respHtml, postRes.status);
      if (ok) return { ok: true };
      return {
        ok: false,
        reason: postRes.status >= 500 ? 'unexpected_response' : 'invalid_credentials',
        statusCode: postRes.status,
      };
    } catch (e) {
      const err = e as AxiosError;
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        return { ok: false, reason: 'timeout', message: 'Request timed out.' };
      }
      if (!err.response) {
        return { ok: false, reason: 'unreachable', message: err.message };
      }
      return { ok: false, reason: 'unexpected_response', statusCode: err.response.status };
    }
  })();

  inFlight = run;
  try {
    return await run;
  } finally {
    inFlight = null;
  }
}

export function mapFailureToMessage(reason: FirewallLoginFailureReason | undefined): string {
  switch (reason) {
    case 'unauthorized_wifi':
      return 'Connect to an allowed Wi‑Fi network before logging in.';
    case 'invalid_credentials':
      return 'Login failed. Check your ID and password.';
    case 'timeout':
      return 'The firewall did not respond in time.';
    case 'unreachable':
      return 'Cannot reach the firewall. Check the endpoint and network.';
    case 'unexpected_response':
      return 'Unexpected response from the firewall. Try WebView login or verify the portal.';
    case 'parse_error':
      return 'Could not read the login page. Try WebView login.';
    case 'cancelled':
      return 'Login was cancelled or already running.';
    default:
      return 'Login failed.';
  }
}
