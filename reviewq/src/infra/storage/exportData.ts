import type { ContentState } from '../../domain/content';
import type { Card, Deck, ReviewLog, Subject } from '../../domain/model';
import type { StorageAdapter } from './StorageAdapter';
import { logsKey } from './keys';
import { isCard, isDeck, isReviewLog, isSubject, parseValidList } from './validate';

export const EXPORT_FORMAT = 'reviewq-backup';
export const EXPORT_FORMAT_VERSION = 1;

// 사용자가 기기 밖에 보관하는 백업 문서. 알림 동의 기록·기기 식별자·자동 백업·격리 원본은 넣지 않는다
export interface ExportDoc {
  format: typeof EXPORT_FORMAT;
  formatVersion: number;
  exportedAt: string; // ISO 8601
  schemaVersion: number; // 내보낼 때의 앱 데이터 형식 버전(Meta)
  subjects: Subject[];
  decks: Deck[];
  cards: Record<string, Card[]>;
  logs: Record<string, ReviewLog[]>; // 'YYYY-MM' → 그 달의 판정 기록(빈 달은 뺀다)
}

// 'YYYY-MM' → 다음 달
function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// 판정 기록을 읽을 달 목록(오래된 달부터). 저장소에 키 목록 API가 없어서, 판정 기록은 카드가 있어야 생긴다는 점을 이용해
// 남아 있는 과목·덱·카드의 가장 이른 생성 달부터 이번 달까지로 정한다. createdAt은 UTC라 기기 로컬 달과 어긋날 수 있어 한 달 앞부터 본다
export function exportLogMonths(content: ContentState, today: string): string[] {
  const current = today.slice(0, 7);
  const created = [
    ...content.subjects.map((s) => s.createdAt),
    ...content.decks.map((d) => d.createdAt),
    ...Object.values(content.cards).flatMap((cards) => cards.map((c) => c.createdAt)),
  ].map((iso) => previousMonth(iso.slice(0, 7)));
  const loaded = Object.keys(content.logs);
  let month = [...created, ...loaded, current].reduce((a, b) => (b < a ? b : a));
  const months: string[] = [];
  while (month <= current) {
    months.push(month);
    month = nextMonth(month);
  }
  return months;
}

export class ExportCorruptError extends Error {
  readonly keys: string[];
  constructor(keys: string[]) {
    super(`형식이 맞지 않는 판정 기록: ${keys.join(', ')}`);
    this.keys = keys;
  }
}

interface BuildExportDeps {
  storage: StorageAdapter;
  content: ContentState; // 저장 대기 변경을 저장한 뒤의 과목·덱·카드
  schemaVersion: number;
  today: string;
  now?: Date;
}

// 내보내기 문서를 만든다. 메모리에 올라온 달(이번 달·지난달)의 판정 기록은 메모리 값을 쓴다. 저장이 실패한 상태에서도
// 카드 일정과 판정 기록이 어긋나지 않게 하기 위해서다. 그 밖의 달은 저장소에서 읽고, 형식이 맞지 않는 달이 있으면 일부만 내보내지 않도록 예외를 던진다
export async function buildExport({ storage, content, schemaVersion, today, now = new Date() }: BuildExportDeps): Promise<ExportDoc> {
  const months = exportLogMonths(content, today);
  const stored = months.filter((month) => !(month in content.logs));
  const keys = stored.map(logsKey);
  const raw = keys.length > 0 ? await storage.getItems(keys) : {};
  const fromStorage: Record<string, ReviewLog[]> = {};
  const corrupt: string[] = [];
  stored.forEach((month, i) => {
    const parsed = parseValidList(raw[keys[i]], isReviewLog);
    if (!parsed.ok) corrupt.push(keys[i]);
    else fromStorage[month] = parsed.value;
  });
  const logs: Record<string, ReviewLog[]> = {};
  for (const month of months) {
    const list = content.logs[month] ?? fromStorage[month] ?? [];
    if (list.length > 0) logs[month] = list;
  }
  if (corrupt.length > 0) throw new ExportCorruptError(corrupt);

  return {
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: now.toISOString(),
    schemaVersion,
    subjects: content.subjects,
    decks: content.decks,
    cards: content.cards,
    logs,
  };
}

const isRecordOf = <T>(v: unknown, isItem: (x: unknown) => x is T): v is Record<string, T[]> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  Object.values(v).every((list) => Array.isArray(list) && list.every(isItem));

// 앱이 저장 데이터를 불러올 때 쓰는 형식 검증으로 문서 전체를 검사한다(v1.1 가져오기에서도 쓴다)
export function validateExport(v: unknown): v is ExportDoc {
  if (typeof v !== 'object' || v === null) return false;
  const d = v as Record<string, unknown>;
  return (
    d.format === EXPORT_FORMAT &&
    typeof d.formatVersion === 'number' &&
    typeof d.exportedAt === 'string' &&
    typeof d.schemaVersion === 'number' &&
    Array.isArray(d.subjects) &&
    d.subjects.every(isSubject) &&
    Array.isArray(d.decks) &&
    d.decks.every(isDeck) &&
    isRecordOf(d.cards, isCard) &&
    isRecordOf(d.logs, isReviewLog)
  );
}

export function exportFileName(today: string): string {
  return `reviewq-backup-${today}.json`;
}

// 한글이 들어 있으므로 UTF-8 바이트로 바꾼 뒤 base64로 인코딩한다(파일 저장 API 입력)
export function toBase64Utf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}
