import { describe, expect, it } from 'vitest';
import { type ContentAction, contentReducer, emptyContent } from '../../domain/content';
import type { StorageAdapter } from './StorageAdapter';
import { DECKS_KEY, SUBJECTS_KEY, cardsKey, logsKey } from './keys';
import { loadContent } from './loadContent';
import { createMemoryStorage } from './memoryStorage';

const T = '2026-10-26T00:00:00.000Z';
const today = '2026-10-26';
const emptyLogs = { '2026-10': [], '2026-09': [] };
// 앱이 저장하는 형식 그대로의 항목
const fixture = (
  [
    { type: 'subject/add', id: 's1', name: '영어', now: T },
    { type: 'deck/add', id: 'd1', subjectId: 's1', name: '단어', now: T },
    { type: 'deck/add', id: 'd2', subjectId: 's1', name: '문법', now: T },
    { type: 'card/add', id: 'c1', deckId: 'd1', question: 'q', answer: 'a', now: T, today },
    { type: 'card/review', cardId: 'c1', deckId: 'd1', grade: 'remember', date: today, now: T, logId: 'l1' },
  ] as ContentAction[]
).reduce(contentReducer, emptyContent);
const [subject] = fixture.subjects;
const [d1, d2] = fixture.decks;
const card = fixture.cards.d1[0];
const log = fixture.logs['2026-10'][0];

describe('loadContent', () => {
  it('빈 저장소면 빈 상태를 돌려준다', async () => {
    expect(await loadContent(createMemoryStorage(), today)).toEqual({
      ok: true,
      content: { subjects: [], decks: [], cards: {}, logs: emptyLogs },
    });
  });

  it('저장된 과목·덱·덱별 카드를 불러오고 카드 키가 없는 덱은 빈 배열이다', async () => {
    const storage = createMemoryStorage();
    await storage.setItems({
      [SUBJECTS_KEY]: JSON.stringify([subject]),
      [DECKS_KEY]: JSON.stringify([d1, d2]),
      [cardsKey('d1')]: JSON.stringify([card]),
    });

    expect(await loadContent(storage, today)).toEqual({
      ok: true,
      content: { subjects: [subject], decks: [d1, d2], cards: { d1: [card], d2: [] }, logs: emptyLogs },
    });
  });

  it('손상된 카드 키는 원본과 함께 실패로 돌려주고 저장 값을 바꾸지 않는다', async () => {
    const storage = createMemoryStorage();
    await storage.setItems({
      [SUBJECTS_KEY]: JSON.stringify([subject]),
      [DECKS_KEY]: JSON.stringify([d1, d2]),
      [cardsKey('d1')]: '[{broken',
      [cardsKey('d2')]: JSON.stringify([]),
    });

    expect(await loadContent(storage, today)).toEqual({ ok: false, corrupt: { [cardsKey('d1')]: '[{broken' } });
    expect((await storage.getItems([cardsKey('d1')]))[cardsKey('d1')]).toBe('[{broken');
  });

  it('형식이 틀린 덱 목록은 손상이고 카드 키는 읽지 않는다', async () => {
    const storage = createMemoryStorage();
    const raw = JSON.stringify([{ ...d1, name: 'a'.repeat(31) }]);
    const requested: string[] = [];
    const spy: StorageAdapter = { ...storage, getItems: (keys) => (requested.push(...keys), storage.getItems(keys)) };
    await storage.setItems({ [DECKS_KEY]: raw, [cardsKey('d1')]: JSON.stringify([card]) });

    expect(await loadContent(spy, today)).toEqual({ ok: false, corrupt: { [DECKS_KEY]: raw } });
    expect(requested).not.toContain(cardsKey('d1'));
  });

  it('여러 키가 손상이면 모두 돌려준다', async () => {
    const storage = createMemoryStorage();
    await storage.setItems({ [SUBJECTS_KEY]: '{}', [logsKey('2026-09')]: 'x' });

    const result = await loadContent(storage, today);
    expect(result.ok ? [] : Object.keys(result.corrupt).sort()).toEqual([logsKey('2026-09'), SUBJECTS_KEY].sort());
  });

  it('연초에는 이번 달과 지난해 12월 로그를 불러온다', async () => {
    const storage = createMemoryStorage();
    const requested: string[] = [];
    const spy: StorageAdapter = { ...storage, getItems: (keys) => (requested.push(...keys), storage.getItems(keys)) };
    const decLog = { ...log, date: '2026-12-31' };
    await storage.setItems({ [logsKey('2026-12')]: JSON.stringify([decLog]), [logsKey('2026-11')]: '[]' });

    const result = await loadContent(spy, '2027-01-05');
    expect(requested).toEqual(expect.arrayContaining(['bq:logs:2027-01', 'bq:logs:2026-12']));
    expect(requested).not.toContain('bq:logs:2026-11');
    expect(result.ok && result.content.logs).toEqual({ '2027-01': [], '2026-12': [decLog] });
  });

  it('날짜 형식이 틀린 기록이 있으면 그 로그 키가 손상이고 저장 값을 바꾸지 않는다', async () => {
    const storage = createMemoryStorage();
    const raw = JSON.stringify([{ ...log, date: '2026/10/26' }]);
    await storage.setItems({ [logsKey('2026-10')]: raw });

    expect(await loadContent(storage, today)).toEqual({ ok: false, corrupt: { [logsKey('2026-10')]: raw } });
    expect((await storage.getItems([logsKey('2026-10')]))[logsKey('2026-10')]).toBe(raw);
  });

  it('저장소 읽기가 실패하면 예외를 던진다', async () => {
    const failing: StorageAdapter = { ...createMemoryStorage(), getItems: () => Promise.reject(new Error('io')) };
    await expect(loadContent(failing, today)).rejects.toThrow('io');
  });
});
