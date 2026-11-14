import { ACCEPTED_IMAGE_TYPES, MAX_IMAGE_BYTES } from './config';

/** Returns a user-facing problem description, or null when the file is acceptable. */
export function validateImageFile(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  const okType = (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type);
  if (!okType) {
    return `${file.name || 'That file'} isn't a PNG, JPG or WEBP picture. Choose one of those formats.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return `${file.name || 'That picture'} is ${mb} MB. The limit is 10 MB, so try a smaller or more compressed copy.`;
  }
  if (file.size === 0) return `${file.name || 'That file'} is empty.`;
  return null;
}

/** First image file found in a clipboard or drop payload. */
export function firstImageFile(items: DataTransferItemList | null | undefined): File | null {
  if (!items) return null;
  for (const item of Array.from(items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile();
      if (f) return f;
    }
  }
  return null;
}
