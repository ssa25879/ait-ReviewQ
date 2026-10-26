import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from './StorageAdapter';
import { DECKS_KEY, SUBJECTS_KEY, cardsKey, logsKey } from './keys';
import { loadContent } from './loadContent';
import { createMemoryStorage } from './memoryStorage';

const subject = { id: 's1', name: '영어', createdAt: 't', updatedAt: 't' };
const deck = (id: string) => ({ id, subjectId: 's1', name: id, createdAt: 't', updatedAt: 't' });
const today = '2026-10-26';
const emptyLogs = { '2026-10': [], '2026-09': [] };

describe('loadContent', () => {
  it('빈 저장소면 빈 상태를 돌려준다', async () => {
    expect(await loadContent(createMemoryStorage(), today)).toEqual({
      subjects: [],
      decks: [],
      cards: {},
      logs: emptyLogs,
    });
  });

  it('저장된 과목·덱·덱별 카드를 불러오고 카드 키가 없는 덱은 빈 배열이다', async () => {
    const storage = createMemoryStorage();
    const cards = [{ id: 'c1', deckId: 'd1' }];
    await storage.setItems({
      [SUBJECTS_KEY]: JSON.stringify([subject]),
      [DECKS_KEY]: JSON.stringify([deck('d1'), deck('d2')]),
      [cardsKey('d1')]: JSON.stringify(cards),
    });

    expect(await loadContent(storage, today)).toEqual({
      subjects: [subject],
      decks: [deck('d1'), deck('d2')],
      cards: { d1: cards, d2: [] },
      logs: emptyLogs,
    });
  });

  it('손상된 카드 키가 있으면 오류를 던지고 저장 값을 바꾸지 않는다', async () => {
    const storage = createMemoryStorage();
    await storage.setItems({
      [SUBJECTS_KEY]: JSON.stringify([subject]),
      [DECKS_KEY]: JSON.stringify([deck('d1')]),
      [cardsKey('d1')]: '[{broken',
    });

    await expect(loadContent(storage, today)).rejects.toThrow('bq:cards:d1');
    expect((await storage.getItems([cardsKey('d1')]))[cardsKey('d1')]).toBe('[{broken');
  });

  it('연초에는 이번 달과 지난해 12월 로그를 불러온다', async () => {
    const storage = createMemoryStorage();
    const requested: string[] = [];
    const spy: StorageAdapter = {
      ...storage,
      getItems: (keys) => {
        requested.push(...keys);
        return storage.getItems(keys);
      },
    };
    const log = { id: 'l1', cardId: 'c1', date: '2026-12-31' };
    await storage.setItems({ [logsKey('2026-12')]: JSON.stringify([log]), [logsKey('2026-11')]: '[]' });

    const state = await loadContent(spy, '2027-01-05');
    expect(requested).toEqual(expect.arrayContaining(['bq:logs:2027-01', 'bq:logs:2026-12']));
    expect(requested).not.toContain('bq:logs:2026-11');
    expect(state.logs).toEqual({ '2027-01': [], '2026-12': [log] });
  });

  it('손상된 로그 키가 있으면 오류를 던지고 저장 값을 바꾸지 않는다', async () => {
    const storage = createMemoryStorage();
    await storage.setItems({ [logsKey('2026-10')]: '[{broken' });

    await expect(loadContent(storage, today)).rejects.toThrow('bq:logs:2026-10');
    expect((await storage.getItems([logsKey('2026-10')]))[logsKey('2026-10')]).toBe('[{broken');
  });
});
