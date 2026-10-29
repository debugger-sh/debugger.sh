const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const SHARE_ID_RE = /^[0-9A-Za-z]{8,16}$/;

export function isShareId(value: string): boolean {
  return SHARE_ID_RE.test(value);
}

export function shortId(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  let id = '';
  for (const b of bytes) id += ID_ALPHABET[b % ID_ALPHABET.length];
  return id;
}
