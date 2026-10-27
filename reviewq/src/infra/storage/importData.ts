import type { ContentState } from '../../domain/content';
import type { StorageAdapter } from './StorageAdapter';
import { saveBackup } from './backup';
import { decodeBackupCode, extractBackupCode } from './backupCode';
import { EXPORT_FORMAT, EXPORT_FORMAT_VERSION, type ExportDoc, buildExport, exportLogMonths, validateExport } from './exportData';
import { BEFORE_IMPORT_KEY, DECKS_KEY, SUBJECTS_KEY, cardsKey, logsKey } from './keys';
import { SCHEMA_VERSION } from './meta';

export interface ImportSummary {
  subjects: number;
  decks: number;
  cards: number;
  logs: number;
  exportedAt: string; // ISO 8601
}

export type ImportFailure = 'notJson' | 'invalid' | 'newer' | 'inconsistent' | 'badCode';
export type ParsedImport = { ok: true; doc: ExportDoc; summary: ImportSummary } | { ok: false; reason: ImportFailure };

// 문서 안에서 덱의 과목, 카드 목록의 덱, 카드의 deckId가 서로 맞는지
function isConsistent(doc: ExportDoc): boolean {
  const subjectIds = new Set(doc.subjects.map((s) => s.id));
  const deckIds = new Set(doc.decks.map((d) => d.id));
  return (
    doc.decks.every((d) => subjectIds.has(d.subjectId)) &&
    Object.entries(doc.cards).every(([deckId, cards]) => deckIds.has(deckId) && cards.every((c) => c.deckId === deckId))
  );
}

// 붙여넣었거나 파일에서 읽은 글을 가져올 수 있는 백업인지 검사한다. 새 버전 문서는 필드가 늘어 형식 검증에서 떨어질 수 있으므로
// "백업이 아니다"가 아니라 "업데이트하라"를 알리도록 버전을 먼저 본다
export function parseImport(text: string): ParsedImport {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'notJson' };
  }
  if (typeof value !== 'object' || value === null) return { ok: false, reason: 'invalid' };
  const head = value as Record<string, unknown>;
  if (head.format !== EXPORT_FORMAT) return { ok: false, reason: 'invalid' };
  if (
    (typeof head.formatVersion === 'number' && head.formatVersion > EXPORT_FORMAT_VERSION) ||
    (typeof head.schemaVersion === 'number' && head.schemaVersion > SCHEMA_VERSION)
  ) {
    return { ok: false, reason: 'newer' };
  }
  if (!validateExport(value)) return { ok: false, reason: 'invalid' };
  if (!isConsistent(value)) return { ok: false, reason: 'inconsistent' };
  return {
    ok: true,
    doc: value,
    summary: {
      subjects: value.subjects.length,
      decks: value.decks.length,
      cards: Object.values(value.cards).reduce((n, cards) => n + cards.length, 0),
      logs: Object.values(value.logs).reduce((n, logs) => n + logs.length, 0),
      exportedAt: value.exportedAt,
    },
  };
}

// 붙여넣었거나 파일에서 읽은 글을 검사한다. 백업 코드(공유 메시지 전체 포함)가 있으면 풀어서, 없으면 JSON으로 본다
export async function parseImportInput(text: string): Promise<ParsedImport> {
  const code = extractBackupCode(text);
  if (!code) return parseImport(text);
  try {
    return parseImport(await decodeBackupCode(code));
  } catch {
    return { ok: false, reason: 'badCode' }; // 잘렸거나 손상된 코드
  }
}

interface ImportBackupDeps {
  storage: StorageAdapter;
  doc: ExportDoc;
  current: ContentState; // 바꾸기 전 메모리 상태(저장 대기 변경 포함)
  schemaVersion: number;
  today: string;
  now?: Date;
}

// 과목·덱·카드·판정 기록을 문서 내용으로 바꾼다. Meta는 건드리지 않는다.
// 지금 데이터를 보관 키에 먼저 저장하고, 실패하면 아무것도 바꾸지 않은 채 예외를 던진다
export async function importBackup({ storage, doc, current, schemaVersion, today, now = new Date() }: ImportBackupDeps): Promise<void> {
  const before = await buildExport({ storage, content: current, schemaVersion, today, now });
  await storage.setItems({ [BEFORE_IMPORT_KEY]: JSON.stringify(before) });

  const entries: Record<string, string> = {
    [SUBJECTS_KEY]: JSON.stringify(doc.subjects),
    [DECKS_KEY]: JSON.stringify(doc.decks),
  };
  for (const deck of doc.decks) entries[cardsKey(deck.id)] = JSON.stringify(doc.cards[deck.id] ?? []);
  for (const [month, logs] of Object.entries(doc.logs)) entries[logsKey(month)] = JSON.stringify(logs);
  // 새 값을 먼저 다 쓰고 나서 지금 데이터에만 있던 키를 지운다(중간에 실패해도 문서 내용은 다 들어가 있게)
  await storage.setItems(entries);

  const keepDecks = new Set(doc.decks.map((d) => d.id));
  const stale = [
    ...current.decks.filter((d) => !keepDecks.has(d.id)).map((d) => cardsKey(d.id)),
    ...exportLogMonths(current, today)
      .filter((month) => !(month in doc.logs))
      .map(logsKey),
  ];
  for (const key of stale) await storage.removeItem(key);

  // 복구 화면이 가져오기 이전 데이터로 되돌리지 않도록 자동 백업도 새 내용으로 맞춘다
  await saveBackup(storage, { subjects: doc.subjects, decks: doc.decks, cards: doc.cards, logs: {} }, today, now);
}
