import { z } from 'zod';

const urlSchema = z
  .string()
  .min(1, 'URL is required')
  .refine((s) => {
    try {
      const u = new URL(s.trim());
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, 'Must be a valid http(s) URL');

export function normalizeEndpointUrl(raw: string): string {
  let s = raw.trim();
  if (!s) return s;
  if (!/^https?:\/\//i.test(s)) {
    s = `http://${s}`;
  }
  return s.replace(/\/+$/, '');
}

export function validateEndpointUrl(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const normalized = normalizeEndpointUrl(raw);
  const parsed = urlSchema.safeParse(normalized);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid URL' };
  }
  return { ok: true, value: normalized };
}
