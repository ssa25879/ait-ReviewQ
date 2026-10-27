import { describe, expect, it } from 'vitest';
import { type ContentAction, type ContentState, contentReducer, emptyContent } from '../../domain/content';
import type { StorageAdapter } from './StorageAdapter';
import { readBackup } from './backup';
import { type ExportDoc, buildExport } from './exportData';
import { encodeBackupCode } from './backupCode';
import { importBackup, parseImport, parseImportInput } from './importData';
import { BEFORE_IMPORT_KEY, DECKS_KEY, META_KEY, SUBJECTS_KEY, cardsKey, logsKey } from './keys';
import { loadContent } from './loadContent';
import { createMemoryStorage } from './memoryStorage';

const today = '2026-10-27';
const at = (date: string) => `${date}T03:00:00.000Z`;
const build = (actions: ContentAction[]) => actions.reduce(contentReducer, emptyContent);

// 가져올 백업: 과목 2·덱 2·카드 3장, 오늘 판정 1건
const source = build([
  { type: 'subject/add', id: 's1', name: '영어', now: at('2026-09-10') },
  { type: 'subject/add', id: 's2', name: '수학', now: at('2026-09-11') },
  { type: 'deck/add', id: 'd1', subjectId: 's1', name: '단어', now: at('2026-09-10') },
  { type: 'deck/add', id: 'd2', subjectId: 's2', name: '공식', now: at('2026-09-11') },
  { type: 'card/add', id: 'c1', deckId: 'd1', question: 'apple', answer: '사과', now: at('2026-09-10'), today: '2026-09-10' },
  { type: 'card/add', id: 'c2', deckId: 'd1', question: 'pear', answer: '배', now: at('2026-09-10'), today: '2026-09-10' },
  { type: 'card/add', id: 'c3', deckId: 'd2', question: '원의 넓이', answer: 'πr²', now: at('2026-09-11'), today: '2026-09-11' },
  { type: 'card/review', cardId: 'c1', deckId: 'd1', grade: 'remember', date: today, now: at(today), logId: 'l1' },
]);

async function docOf(content: ContentState): Promise<ExportDoc> {
  const storage = createMemoryStorage();
  await storage.setItems(
    Object.fromEntries(Object.entries(content.logs).map(([month, logs]) => [logsKey(month), JSON.stringify(logs)])),
  );
  return buildExport({ storage, content, schemaVersion: 2, today, now: new Date(at(today)) });
}

describe('parseImport', () => {
  it('정상 백업은 요약과 함께 통과한다', async () => {
    const doc = await docOf(source);
    const parsed = parseImport(JSON.stringify(doc));
    expect(parsed).toEqual({
      ok: true,
      doc,
      summary: { subjects: 2, decks: 2, cards: 3, logs: 1, exportedAt: at(today) },
    });
  });

  it('JSON이 아니면 notJson, 형식이 틀리면 invalid', async () => {
    expect(parseImport('그냥 글')).toEqual({ ok: false, reason: 'notJson' });
    expect(parseImport('[]')).toEqual({ ok: false, reason: 'invalid' });
    expect(parseImport(JSON.stringify({ format: 'other' }))).toEqual({ ok: false, reason: 'invalid' });
    const doc = await docOf(source);
    expect(parseImport(JSON.stringify({ ...doc, subjects: [{ id: 's1' }] }))).toEqual({ ok: false, reason: 'invalid' });
  });

  it('형식 버전이나 데이터 버전이 더 높으면 newer(형식 검증보다 먼저)', async () => {
    const doc = await docOf(source);
    expect(parseImport(JSON.stringify({ ...doc, formatVersion: 2, subjects: 'changed' }))).toEqual({ ok: false, reason: 'newer' });
    expect(parseImport(JSON.stringify({ ...doc, schemaVersion: 3 }))).toEqual({ ok: false, reason: 'newer' });
  });

  it('과목 없는 덱·덱 없는 카드 목록·deckId 불일치는 inconsistent', async () => {
    const doc = await docOf(source);
    expect(parseImport(JSON.stringify({ ...doc, subjects: doc.subjects.slice(0, 1) }))).toEqual({ ok: false, reason: 'inconsistent' });
    expect(parseImport(JSON.stringify({ ...doc, cards: { ...doc.cards, dX: [] } }))).toEqual({ ok: false, reason: 'inconsistent' });
    expect(parseImport(JSON.stringify({ ...doc, cards: { d1: doc.cards.d2, d2: doc.cards.d1 } }))).toEqual({ ok: false, reason: 'inconsistent' });
  });
});

describe('importBackup', () => {
  // 지금 데이터: 과목 1·덱 1(dOld)·카드 1장, 지난달 판정 1건, Meta에 알림 동의 기록
  const current = build([
    { type: 'subject/add', id: 'sOld', name: '옛과목', now: at('2026-09-01') },
    { type: 'deck/add', id: 'dOld', subjectId: 'sOld', name: '옛덱', now: at('2026-09-01') },
    { type: 'card/add', id: 'cOld', deckId: 'dOld', question: 'q', answer: 'a', now: at('2026-09-01'), today: '2026-09-01' },
    { type: 'card/review', cardId: 'cOld', deckId: 'dOld', grade: 'remember', date: '2026-09-02', now: at('2026-09-02'), logId: 'lOld' },
  ]);
  const meta = JSON.stringify({ schemaVersion: 2, lastOpenedDate: today, installId: 'i1', notification: { agreed: true, agreedAt: at(today), lastAskedAt: at(today) } });

  async function seeded(): Promise<StorageAdapter> {
    const storage = createMemoryStorage();
    await storage.setItems({
      [META_KEY]: meta,
      [SUBJECTS_KEY]: JSON.stringify(current.subjects),
      [DECKS_KEY]: JSON.stringify(current.decks),
      [cardsKey('dOld')]: JSON.stringify(current.cards.dOld),
      [logsKey('2026-09')]: JSON.stringify(current.logs['2026-09']),
    });
    return storage;
  }

  it('문서 내용으로 바꾸고 지금에만 있던 키를 지우며, 이전 데이터 보관·Meta 유지·자동 백업 갱신', async () => {
    const storage = await seeded();
    const doc = await docOf(source);
    await importBackup({ storage, doc, current, schemaVersion: 2, today, now: new Date(at(today)) });

    const raw = await storage.getItems([META_KEY, cardsKey('dOld'), logsKey('2026-09'), BEFORE_IMPORT_KEY]);
    expect(raw[META_KEY]).toBe(meta);
    expect(raw[cardsKey('dOld')]).toBeNull();
    expect(raw[logsKey('2026-09')]).toBeNull();
    const before = JSON.parse(raw[BEFORE_IMPORT_KEY] as string);
    expect(before.subjects.map((s: { id: string }) => s.id)).toEqual(['sOld']);
    expect(before.logs['2026-09'][0].id).toBe('lOld');

    // 내보내기 → 가져오기 왕복 후 상태가 같다(D-06)
    const loaded = await loadContent(storage, today);
    expect(loaded).toEqual({ ok: true, content: { ...source, logs: { '2026-10': source.logs['2026-10'], '2026-09': [] } } });
    expect((await readBackup(storage))?.subjects).toEqual(source.subjects);
  });

  it('보관 저장이 실패하면 아무것도 바꾸지 않는다', async () => {
    const storage = await seeded();
    const snapshot = await storage.getItems([SUBJECTS_KEY, DECKS_KEY, cardsKey('dOld'), logsKey('2026-09')]);
    const failing: StorageAdapter = {
      ...storage,
      setItems: (entries) => (BEFORE_IMPORT_KEY in entries ? Promise.reject(new Error('저장 실패')) : storage.setItems(entries)),
    };
    await expect(importBackup({ storage: failing, doc: await docOf(source), current, schemaVersion: 2, today })).rejects.toThrow('저장 실패');
    expect(await storage.getItems([SUBJECTS_KEY, DECKS_KEY, cardsKey('dOld'), logsKey('2026-09')])).toEqual(snapshot);
  });
});

describe('parseImportInput', () => {
  it('백업 코드·공유 메시지 전체·JSON을 모두 받는다', async () => {
    const doc = await docOf(source);
    const code = await encodeBackupCode(doc);
    const summary = { subjects: 2, decks: 2, cards: 3, logs: 1, exportedAt: at(today) };
    expect(await parseImportInput(code)).toMatchObject({ ok: true, summary });
    expect(await parseImportInput(`복습큐 백업 코드예요.\n\n${code}`)).toMatchObject({ ok: true, summary });
    expect(await parseImportInput(JSON.stringify(doc))).toMatchObject({ ok: true, summary });
  });

  it('잘린 코드는 badCode, 코드가 없는 글은 기존 이유', async () => {
    const code = await encodeBackupCode(await docOf(source));
    expect(await parseImportInput(code.slice(0, -12))).toEqual({ ok: false, reason: 'badCode' });
    expect(await parseImportInput('그냥 글')).toEqual({ ok: false, reason: 'notJson' });
  });
});
