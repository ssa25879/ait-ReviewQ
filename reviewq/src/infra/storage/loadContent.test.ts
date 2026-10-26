import { describe, expect, it } from 'vitest';
import { DECKS_KEY, SUBJECTS_KEY, cardsKey } from './keys';
import { loadContent } from './loadContent';
import { createMemoryStorage } from './memoryStorage';

const subject = { id: 's1', name: '영어', createdAt: 't', updatedAt: 't' };
const deck = (id: string) => ({ id, subjectId: 's1', name: id, createdAt: 't', updatedAt: 't' });

describe('loadContent', () => {
  it('빈 저장소면 빈 상태를 돌려준다', async () => {
    expect(await loadContent(createMemoryStorage())).toEqual({ subjects: [], decks: [], cards: {} });
  });

  it('저장된 과목·덱·덱별 카드를 불러오고 카드 키가 없는 덱은 빈 배열이다', async () => {
    const storage = createMemoryStorage();
    const cards = [{ id: 'c1', deckId: 'd1' }];
    await storage.setItems({
      [SUBJECTS_KEY]: JSON.stringify([subject]),
      [DECKS_KEY]: JSON.stringify([deck('d1'), deck('d2')]),
      [cardsKey('d1')]: JSON.stringify(cards),
    });

    expect(await loadContent(storage)).toEqual({
      subjects: [subject],
      decks: [deck('d1'), deck('d2')],
      cards: { d1: cards, d2: [] },
    });
  });

  it('손상된 카드 키가 있으면 오류를 던지고 저장 값을 바꾸지 않는다', async () => {
    const storage = createMemoryStorage();
    await storage.setItems({
      [SUBJECTS_KEY]: JSON.stringify([subject]),
      [DECKS_KEY]: JSON.stringify([deck('d1')]),
      [cardsKey('d1')]: '[{broken',
    });

    await expect(loadContent(storage)).rejects.toThrow('bq:cards:d1');
    expect((await storage.getItems([cardsKey('d1')]))[cardsKey('d1')]).toBe('[{broken');
  });
});
