import type { ExportDoc } from './exportData';

// 메신저 메시지로 주고받는 백업 코드. RQB1 = gzip 압축, RQB0 = 압축 없음(CompressionStream이 없는 환경)
const PREFIX_GZIP = 'RQB1.';
const PREFIX_PLAIN = 'RQB0.';
const CODE_PATTERN = /RQB[01]\.[A-Za-z0-9_-]+/;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4)), (ch) => ch.charCodeAt(0));
}

async function pipe(bytes: Uint8Array<ArrayBuffer>, transform: CompressionStream | DecompressionStream): Promise<Uint8Array<ArrayBuffer>> {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

// 내보내기 문서를 한 덩어리 글자로 만든다(들여쓰기 없는 JSON을 압축해 URL 안전 base64로)
export async function encodeBackupCode(doc: ExportDoc): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(doc));
  if (typeof CompressionStream === 'undefined') return PREFIX_PLAIN + toBase64Url(bytes);
  return PREFIX_GZIP + toBase64Url(await pipe(bytes, new CompressionStream('gzip')));
}

// 공유 메시지 전체나 줄바꿈이 끼어든 붙여넣기에서도 코드를 찾는다(공백을 지운 글에서 찾은 쪽이 더 길면 그쪽). 없으면 null.
// 공유 메시지는 코드로 끝나므로 공백을 지워도 뒤에 다른 글이 붙지 않는다
export function extractBackupCode(text: string): string | null {
  const direct = text.match(CODE_PATTERN)?.[0];
  const joined = text.replace(/\s+/g, '').match(CODE_PATTERN)?.[0];
  if (!direct || !joined) return direct ?? joined ?? null;
  return joined.length > direct.length ? joined : direct;
}

// 코드를 풀어 JSON 글을 돌려준다. 잘렸거나 손상된 코드면 예외를 던진다
export async function decodeBackupCode(code: string): Promise<string> {
  const body = fromBase64Url(code.slice(PREFIX_GZIP.length));
  if (code.startsWith(PREFIX_PLAIN)) return new TextDecoder('utf-8', { fatal: true }).decode(body);
  if (!code.startsWith(PREFIX_GZIP)) throw new Error('백업 코드가 아니다');
  return new TextDecoder('utf-8', { fatal: true }).decode(await pipe(body, new DecompressionStream('gzip')));
}
