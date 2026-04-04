import axios, { type AxiosError } from 'axios';
import { Platform } from 'react-native';
import { HTTP_TIMEOUT_MS } from '@/constants/defaults';
import type {
  FirewallLoginFailureReason,
  FirewallLoginResult,
  PortalSessionProbeResult,
} from '@/types/models';

const USERNAME_KEYS = ['username', 'user', 'userid', 'login', 'email', 'uname', 'name'];
const PASSWORD_KEYS = ['password', 'passwd', 'pass', 'pwd'];
const CYBEROAM_PORTAL_PATH = 'httpclient.html';
const CYBEROAM_LIVE = 'LIVE';
const CYBEROAM_LOGGED_OUT = 'LOGIN';
const CYBEROAM_CHALLENGE = 'CHALLENGE';

/** Captive portals often reject non-browser clients; WebView sends a real Chrome UA. */
const PORTAL_BROWSER_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Mobile Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

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

function describeAxiosNetworkError(err: AxiosError): string {
  const message = String(err.message ?? '').trim();
  const code = String(err.code ?? '').trim();

  if (/cleartext/i.test(message)) {
    return 'HTTP traffic is blocked on Android. Rebuild the app with cleartext enabled.';
  }
  if (message === 'Network Error' && code) {
    return `Network Error (${code}). Check that the device can open the portal URL over WiFi.`;
  }
  if (message === 'Network Error') {
    return 'Network Error. Check that the phone is on the portal WiFi and can open the endpoint in a browser.';
  }
  return message || 'Network request failed.';
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
    (lower.includes('submitrequest') || lower.includes('submitrequest()')) &&
    lower.includes('login.xml') &&
    (lower.includes('mode=191') || lower.includes('mode="191"') || lower.includes("mode='191'"))
  );
}

/** Use login.xml API when the URL or HTML matches Sophos/Cyberoam-style captive portal. */
function shouldTryCyberoamXmlApi(html: string | undefined, endpointUrl: string): boolean {
  if (html && isCyberoamLikePortal(html)) return true;
  const u = endpointUrl.toLowerCase();
  const h = (html ?? '').toLowerCase();
  if (u.includes('httpclient')) return true;
  if (h.includes('submitrequest') && h.includes('login.xml')) return true;
  if (h.includes('getstate') && h.includes('username')) return true;
  return false;
}

/** Hidden fields from the portal page (e.g. usertype) must be sent with login.xml / logout.xml. */
function appendCyberoamPageExtras(body: URLSearchParams, portalHtml: string | undefined) {
  if (!portalHtml) return;
  const fields = extractInputs(portalHtml);
  const skip = new Set(
    [...USERNAME_KEYS, ...PASSWORD_KEYS, 'mode'].map((s) => s.toLowerCase())
  );
  for (const [k, v] of Object.entries(fields)) {
    if (skip.has(k.toLowerCase())) continue;
    if (!body.has(k)) body.set(k, v);
  }
}

function hasPasswordField(html: string): boolean {
  return /<input[^>]+type\s*=\s*["']password["'][^>]*>/i.test(html);
}

function inferPortalState(html: string): PortalSessionProbeResult['state'] {
  const lower = html.toLowerCase();
  if (isCyberoamLikePortal(html) || hasPasswordField(html)) {
    return 'authentication_required';
  }
  if (
    lower.includes('logout') ||
    lower.includes('sign out') ||
    lower.includes('already logged in') ||
    lower.includes('session active') ||
    lower.includes('internet access is enabled') ||
    lower.includes('welcome')
  ) {
    return 'authenticated';
  }
  return 'unknown';
}

export function resolvePortalEntryUrl(baseUrl: string): string {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  const parsed = new URL(normalized);
  if (/\/[^/]+\.html?$/i.test(parsed.pathname)) {
    return parsed.toString();
  }
  return new URL(CYBEROAM_PORTAL_PATH, `${parsed.toString()}/`).toString();
}

function getPortalUrlCandidates(baseUrl: string): string[] {
  const direct = baseUrl.trim().replace(/\/+$/, '');
  const portal = resolvePortalEntryUrl(baseUrl);
  return portal === direct ? [portal] : [portal, direct];
}

async function fetchPortalPage(
  baseUrl: string,
  signal?: AbortSignal
): Promise<{ portalUrl: string; html: string; cookieHeader: string } | null> {
  let cookieHeader = '';

  for (const candidate of getPortalUrlCandidates(baseUrl)) {
    const res = await axios.get<string>(candidate, {
      timeout: HTTP_TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: () => true,
      signal,
      headers: {
        ...PORTAL_BROWSER_HEADERS,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        Cookie: cookieHeader,
      },
      responseType: 'text',
      transformResponse: (r) => r,
    });

    cookieHeader = mergeSetCookie(cookieHeader, res.headers['set-cookie']);
    const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
    const lower = html.toLowerCase();
    const contentType = String(res.headers['content-type'] ?? '').toLowerCase();
    const looksHtml =
      contentType.includes('text/html') ||
      lower.includes('<html') ||
      lower.includes('<!doctype') ||
      candidate.toLowerCase().includes('httpclient');

    if (res.status >= 200 && res.status < 400 && looksHtml && html.trim().length > 0) {
      return {
        portalUrl: res.request?.responseURL ?? candidate,
        html,
        cookieHeader,
      };
    }
  }

  return null;
}

export async function inspectFirewallSession(baseUrl: string, signal?: AbortSignal): Promise<PortalSessionProbeResult> {
  const base = baseUrl.trim().replace(/\/+$/, '');

  try {
    const portalPage = await fetchPortalPage(base, signal);
    if (portalPage) {
      return {
        state: inferPortalState(portalPage.html),
        portalUrl: portalPage.portalUrl,
      };
    }

    const res = await axios.get<string>(base, {
      timeout: HTTP_TIMEOUT_MS,
      maxRedirects: 5,
      validateStatus: () => true,
      signal,
      headers: { ...PORTAL_BROWSER_HEADERS },
      responseType: 'text',
      transformResponse: (r) => r,
    });
    const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
    return {
      state: inferPortalState(html),
      portalUrl: res.request?.responseURL ?? base,
    };
  } catch (e) {
    const err = e as AxiosError;
    if (!err.response) {
      return {
        state: 'offline',
        message: err.message,
      };
    }
    return {
      state: 'unknown',
      message: `HTTP ${err.response.status}`,
    };
  }
}

async function performCyberoamLogin(
  portalUrl: string,
  userId: string,
  password: string,
  cookieHeader = '',
  signal?: AbortSignal,
  portalHtml?: string
): Promise<FirewallLoginResult | null> {
  const action = new URL('login.xml', portalUrl).toString();
  const origin = new URL(portalUrl).origin;
  let state: string | null = null;
  const productType = Platform.OS === 'android' ? '2' : '0';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const body = new URLSearchParams();
    appendCyberoamPageExtras(body, portalHtml);
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
      headers: {
        ...PORTAL_BROWSER_HEADERS,
        Accept: 'application/xml, text/xml, */*;q=0.1',
        Origin: origin,
        Referer: portalUrl,
        Cookie: cookieHeader,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      responseType: 'text',
      transformResponse: (r) => r,
    });

    const xml = typeof res.data === 'string' ? res.data : String(res.data ?? '');
    const statusQuick = readXmlTag(xml, 'status');
    if (statusQuick === CYBEROAM_LIVE) {
      return { ok: true };
    }
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
  /** Manual attempts preempt auto-login; auto-login defers while manual is active. */
  initiator?: 'auto' | 'manual';
}

let loginAbortController: AbortController | null = null;
let inFlightPromise: Promise<FirewallLoginResult> | null = null;
let manualFirewallLoginDepth = 0;

export function beginManualFirewallLoginScope(): void {
  manualFirewallLoginDepth += 1;
}

export function endManualFirewallLoginScope(): void {
  manualFirewallLoginDepth = Math.max(0, manualFirewallLoginDepth - 1);
}

export function isManualFirewallLoginActive(): boolean {
  return manualFirewallLoginDepth > 0;
}

function combineAbortSignals(userSignal: AbortSignal | undefined, runSignal: AbortSignal): AbortSignal {
  if (!userSignal) return runSignal;
  if (userSignal.aborted) return userSignal;
  if (runSignal.aborted) {
    const dead = new AbortController();
    dead.abort();
    return dead.signal;
  }
  const merged = new AbortController();
  const forward = () => {
    try {
      merged.abort();
    } catch {
      /* noop */
    }
  };
  userSignal.addEventListener('abort', forward, { once: true });
  runSignal.addEventListener('abort', forward, { once: true });
  return merged.signal;
}

function isRequestAbortedError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const err = e as AxiosError & { name?: string };
  if (typeof axios.isCancel === 'function' && axios.isCancel(e)) return true;
  if (err.code === 'ERR_CANCELED') return true;
  if (err.name === 'CanceledError' || err.name === 'AbortError') return true;
  const msg = String(err.message ?? '');
  if (/cancell?ed/i.test(msg) && !err.response) return true;
  return false;
}

/**
 * Analyzes the portal HTML (GET), preserves cookies, then POSTs credentials.
 * If the page shape differs, use WebView-assisted login from the app screen.
 *
 * Manual login preempts auto-login. Overlapping auto attempts cancel each other.
 */
export async function performFirewallLogin(opts: FirewallLoginOptions): Promise<FirewallLoginResult> {
  const initiator = opts.initiator ?? 'auto';

  if (initiator === 'auto' && manualFirewallLoginDepth > 0) {
    return { ok: false, reason: 'deferred' };
  }

  if (loginAbortController) {
    loginAbortController.abort();
  }
  if (inFlightPromise) {
    await inFlightPromise.catch(() => {});
  }

  const runController = new AbortController();
  loginAbortController = runController;
  const signal = combineAbortSignals(opts.signal, runController.signal);

  const run = (async (): Promise<FirewallLoginResult> => {
    const base = opts.baseUrl.replace(/\/+$/, '');

    try {
      const portalPage = await fetchPortalPage(base, signal);
      let effectiveCookies = portalPage?.cookieHeader ?? '';

      const useXmlFirst =
        (portalPage && shouldTryCyberoamXmlApi(portalPage.html, base)) ||
        (!portalPage && shouldTryCyberoamXmlApi(undefined, base));

      if (useXmlFirst && portalPage) {
        const portalResult = await performCyberoamLogin(
          portalPage.portalUrl,
          opts.userId,
          opts.password,
          effectiveCookies,
          signal,
          portalPage.html
        );
        if (portalResult) return portalResult;
      }

      if (useXmlFirst && !portalPage) {
        const entryUrl = resolvePortalEntryUrl(base);
        const warm = await axios.get<string>(entryUrl, {
          timeout: HTTP_TIMEOUT_MS,
          maxRedirects: 5,
          validateStatus: () => true,
          signal,
          headers: { ...PORTAL_BROWSER_HEADERS },
          responseType: 'text',
          transformResponse: (r) => r,
        });
        effectiveCookies = mergeSetCookie('', warm.headers['set-cookie']);
        const warmHtml = typeof warm.data === 'string' ? warm.data : String(warm.data ?? '');
        const pUrl = String(warm.request?.responseURL ?? entryUrl);
        const warmed = await performCyberoamLogin(
          pUrl,
          opts.userId,
          opts.password,
          effectiveCookies,
          signal,
          warmHtml
        );
        if (warmed) return warmed;
      }

      const getRes = await axios.get<string>(base, {
        timeout: HTTP_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: () => true,
        signal,
        headers: { ...PORTAL_BROWSER_HEADERS, Cookie: effectiveCookies },
        responseType: 'text',
        transformResponse: (r) => r,
      });
      const mergedCookieHeader = mergeSetCookie(effectiveCookies, getRes.headers['set-cookie']);

      const html = typeof getRes.data === 'string' ? getRes.data : String(getRes.data ?? '');
      if (shouldTryCyberoamXmlApi(html, base)) {
        const portalResult = await performCyberoamLogin(
          getRes.request?.responseURL ?? resolvePortalEntryUrl(base),
          opts.userId,
          opts.password,
          mergedCookieHeader,
          signal,
          html
        );
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
          signal,
          headers: { ...PORTAL_BROWSER_HEADERS, Cookie: mergedCookieHeader },
          responseType: 'text',
        });
        const ok = guessSuccess(typeof res.data === 'string' ? res.data : String(res.data), res.status);
        return ok
          ? { ok: true }
          : { ok: false, reason: 'invalid_credentials', statusCode: res.status };
      }

      const postRes = await axios.post<string>(action, body.toString(), {
        timeout: HTTP_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: () => true,
        signal,
        headers: {
          ...PORTAL_BROWSER_HEADERS,
          Cookie: mergedCookieHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        responseType: 'text',
        transformResponse: (r) => r,
      });
      const respHtml = typeof postRes.data === 'string' ? postRes.data : String(postRes.data ?? '');
      const ok = guessSuccess(respHtml, postRes.status);
      if (ok) return { ok: true };
      return {
        ok: false,
        reason: postRes.status >= 500 ? 'unexpected_response' : 'invalid_credentials',
        statusCode: postRes.status,
      };
    } catch (e) {
      if (isRequestAbortedError(e)) {
        return { ok: false, reason: 'cancelled', message: 'Login was replaced by a newer attempt.' };
      }
      const err = e as AxiosError;
      if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
        return { ok: false, reason: 'timeout', message: 'Request timed out.' };
      }
      if (!err.response) {
        return { ok: false, reason: 'unreachable', message: describeAxiosNetworkError(err) };
      }
      return { ok: false, reason: 'unexpected_response', statusCode: err.response.status };
    }
  })();

  inFlightPromise = run;
  try {
    return await run;
  } finally {
    if (inFlightPromise === run) {
      inFlightPromise = null;
    }
    if (loginAbortController === runController) {
      loginAbortController = null;
    }
  }
}

async function performCyberoamLogout(
  portalUrl: string,
  userId: string | undefined,
  cookieHeader: string,
  signal?: AbortSignal,
  portalHtml?: string
): Promise<void> {
  const action = new URL('logout.xml', portalUrl).toString();
  const origin = new URL(portalUrl).origin;
  const body = new URLSearchParams();
  appendCyberoamPageExtras(body, portalHtml);
  body.set('mode', '193');
  body.set('a', `${Date.now()}`);
  body.set('producttype', Platform.OS === 'android' ? '2' : '0');
  if (userId?.trim()) body.set('username', userId.trim());

  await axios.post<string>(action, body.toString(), {
    timeout: HTTP_TIMEOUT_MS,
    maxRedirects: 5,
    validateStatus: () => true,
    signal,
    headers: {
      ...PORTAL_BROWSER_HEADERS,
      Accept: 'application/xml, text/xml, */*;q=0.1',
      Origin: origin,
      Referer: portalUrl,
      Cookie: cookieHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    responseType: 'text',
    transformResponse: (r) => r,
  });
}

/**
 * Tells the captive portal to end the session (Cyberoam/Sophos logout.xml).
 * Safe to call even if the device is offline — failures are ignored.
 */
export async function performFirewallLogout(baseUrl: string, userId?: string, signal?: AbortSignal): Promise<void> {
  const base = baseUrl.trim().replace(/\/+$/, '');
  try {
    const portalPage = await fetchPortalPage(base, signal);
    let cookieHeader = portalPage?.cookieHeader ?? '';
    let portalUrl = portalPage?.portalUrl ?? resolvePortalEntryUrl(base);
    let html = portalPage?.html;

    if (!portalPage) {
      const entryUrl = resolvePortalEntryUrl(base);
      const warm = await axios.get<string>(entryUrl, {
        timeout: HTTP_TIMEOUT_MS,
        maxRedirects: 5,
        validateStatus: () => true,
        signal,
        headers: { ...PORTAL_BROWSER_HEADERS },
        responseType: 'text',
        transformResponse: (r) => r,
      });
      cookieHeader = mergeSetCookie('', warm.headers['set-cookie']);
      html = typeof warm.data === 'string' ? warm.data : String(warm.data ?? '');
      portalUrl = String(warm.request?.responseURL ?? entryUrl);
    }

    await performCyberoamLogout(portalUrl, userId, cookieHeader, signal, html);
  } catch {
    /* portal unreachable or non-Cyberoam */
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
    case 'deferred':
      return 'Login was deferred.';
    default:
      return 'Login failed.';
  }
}

const PORTAL_DETAIL_MAX = 220;

function trimPortalDetail(message: string | undefined): string | null {
  const t = message?.trim();
  if (!t) return null;
  return t.length > PORTAL_DETAIL_MAX ? `${t.slice(0, PORTAL_DETAIL_MAX - 1)}…` : t;
}

function httpPart(statusCode?: number): string {
  return statusCode != null ? ` HTTP ${statusCode}.` : '';
}

function detailWorthShowing(detail: string, headline: string): boolean {
  if (detail.length < 3) return false;
  const d = detail.toLowerCase();
  const h = headline.toLowerCase();
  if (d === h || h.includes(d)) return false;
  return true;
}

/**
 * Full user-visible explanation: failure kind + optional portal text + HTTP status.
 */
export function describeFirewallLoginFailure(result: FirewallLoginResult): string {
  if (result.ok) return '';
  const reason = result.reason;
  const detail = trimPortalDetail(result.message);
  const http = httpPart(result.statusCode);

  switch (reason) {
    case 'invalid_credentials': {
      const head = 'Invalid ID or password.';
      if (detail && detailWorthShowing(detail, head)) {
        return `${head} ${detail}${http}`.trim();
      }
      return http ? `${head}${http}` : head;
    }
    case 'unexpected_response': {
      const head = 'Unexpected response from the firewall.';
      const tail = 'Try Browser login or check the portal URL in Settings.';
      const parts: string[] = [head];
      if (detail && detailWorthShowing(detail, head)) {
        parts.push(detail);
      }
      if (result.statusCode != null) {
        parts.push(`HTTP ${result.statusCode}`);
      }
      parts.push(tail);
      return parts.join(' ');
    }
    case 'timeout': {
      const base = detail ?? 'Request timed out — the firewall did not respond in time.';
      return `${base} Check Wi‑Fi, the endpoint, and try again.`;
    }
    case 'unreachable': {
      return detail ?? mapFailureToMessage('unreachable');
    }
    case 'cancelled': {
      return detail ?? mapFailureToMessage('cancelled');
    }
    case 'parse_error': {
      const head = mapFailureToMessage('parse_error');
      return detail && detailWorthShowing(detail, head) ? `${head} ${detail}` : head;
    }
    case 'unauthorized_wifi':
      return mapFailureToMessage('unauthorized_wifi');
    case 'deferred':
      return '';
    default: {
      if (detail) return `${detail}${http}`.trim();
      return mapFailureToMessage(reason);
    }
  }
}
