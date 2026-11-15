import { classifyError, ProviderError } from '../providers/errors';

export interface SniffedImage {
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  ext: 'png' | 'jpg' | 'webp';
}

/** Identify an image by its first bytes, since servers often label files as plain binary. */
export function sniffImageType(buffer: ArrayBuffer): SniffedImage | null {
  const b = new Uint8Array(buffer.slice(0, 12));
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { mime: 'image/png', ext: 'png' };
  }
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { mime: 'image/jpeg', ext: 'jpg' };
  const riff = String.fromCharCode(b[0], b[1], b[2], b[3]);
  const webp = String.fromCharCode(b[8], b[9], b[10], b[11]);
  if (riff === 'RIFF' && webp === 'WEBP') return { mime: 'image/webp', ext: 'webp' };
  return null;
}

/** First file URL found anywhere in a Gradio output (handles lists and wrapper objects). */
export function firstFileUrl(value: unknown): string | null {
  if (typeof value === 'string') return /^https?:\/\//.test(value) ? value : null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = firstFileUrl(v);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    if (typeof o.url === 'string') return o.url;
    for (const key of ['image', 'value', 'path']) {
      if (key in o) {
        const found = firstFileUrl(o[key]);
        if (found) return found;
      }
    }
  }
  return null;
}

/** Download a generated picture and return it as a File the input step can use. */
export async function downloadImage(
  outputs: unknown[],
  token: string | undefined,
  signal: AbortSignal,
  name: string,
): Promise<File> {
  const url = firstFileUrl(outputs);
  if (!url) throw new ProviderError('bad-output', 'No file URL in output');
  let res: Response;
  try {
    res = await fetch(url, {
      signal,
      headers: token && token.startsWith('hf_') ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch (e) {
    throw classifyError(e);
  }
  if (!res.ok) throw new ProviderError('offline', `Download failed (${res.status})`);
  const buffer = await res.arrayBuffer();
  const type = sniffImageType(buffer);
  if (!type) throw new ProviderError('bad-output', 'File is not a PNG, JPG or WEBP picture');
  return new File([buffer], `${name}.${type.ext}`, { type: type.mime });
}
