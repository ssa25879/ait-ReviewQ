import { describe, expect, it } from 'vitest';
import { type ContentAction, type ContentState, contentReducer } from '../../domain/content';
import { diffContent } from './diffContent';
import { cardsKey } from './keys';
import { loadContent } from './loadContent';
import { createMemoryStorage } from './memoryStorage';
import { createSaveQueue } from './saveQueue';

const T = '2026-10-26T00:00:00.000Z';
const today = '2026-10-26';

// Provider와 같은 흐름: 로드 → 리듀서 → 변경 키 → 저장 큐 → 재로드
describe('저장 왕복', () => {
  it('편집과 연쇄 삭제 결과가 재로드 후 그대로이고 삭제된 덱의 카드 키는 null이다', async () => {
    const storage = createMemoryStorage();
    const queue = createSaveQueue({ storage, delayMs: 0 });
    let state: ContentState = await loadContent(storage);

    const dispatch = (action: ContentAction) => {
      const next = contentReducer(state, action);
      queue.enqueue(diffContent(state, next));
      state = next;
    };

    dispatch({ type: 'subject/add', id: 's1', name: '영어', now: T });
    dispatch({ type: 'subject/add', id: 's2', name: '수학', now: T });
    dispatch({ type: 'deck/add', id: 'd1', subjectId: 's1', name: '단어', now: T });
    dispatch({ type: 'deck/add', id: 'd2', subjectId: 's1', name: '문법', now: T });
    dispatch({ type: 'deck/add', id: 'd3', subjectId: 's2', name: '공식', now: T });
    dispatch({ type: 'card/add', id: 'c1', deckId: 'd1', question: 'apple', answer: '사과', now: T, today });
    dispatch({ type: 'card/add', id: 'c2', deckId: 'd2', question: 'be', answer: '이다', now: T, today });
    dispatch({ type: 'card/add', id: 'c3', deckId: 'd3', question: '1+1', answer: '2', now: T, today });
    await queue.flush();
    expect(await loadContent(storage)).toEqual(state);

    dispatch({ type: 'subject/delete', id: 's1' });
    await queue.flush();

    const reloaded = await loadContent(storage);
    expect(reloaded).toEqual(state);
    expect(reloaded.decks.map((d) => d.id)).toEqual(['d3']);
    expect(await storage.getItems([cardsKey('d1'), cardsKey('d2')])).toEqual({
      [cardsKey('d1')]: null,
      [cardsKey('d2')]: null,
    });
  });
});
