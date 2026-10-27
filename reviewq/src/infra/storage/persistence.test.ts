import { afterEach, describe, expect, it, vi } from 'vitest';
import { type ContentAction, type ContentState, contentReducer } from '../../domain/content';
import { diffContent } from './diffContent';
import { cardsKey, logsKey } from './keys';
import type { StorageAdapter } from './StorageAdapter';
import { loadContent } from './loadContent';
import { createMemoryStorage } from './memoryStorage';
import { createSaveQueue } from './saveQueue';

const T = '2026-10-26T00:00:00.000Z';
const today = '2026-10-26';

// 손상 없이 로드된 콘텐츠
async function loadOk(storage: StorageAdapter): Promise<ContentState> {
  const result = await loadContent(storage, today);
  if (!result.ok) throw new Error('로드 손상');
  return result.content;
}

// Provider와 같은 흐름: 로드 → 리듀서 → 변경 키 → 저장 큐 → 재로드
describe('저장 왕복', () => {
  it('편집과 연쇄 삭제 결과가 재로드 후 그대로이고 삭제된 덱의 카드 키는 null이다', async () => {
    const storage = createMemoryStorage();
    const queue = createSaveQueue({ storage, delayMs: 0 });
    let state: ContentState = await loadOk(storage);

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
    expect(await loadOk(storage)).toEqual(state);

    dispatch({ type: 'subject/delete', id: 's1' });
    await queue.flush();

    const reloaded = await loadOk(storage);
    expect(reloaded).toEqual(state);
    expect(reloaded.decks.map((d) => d.id)).toEqual(['d3']);
    expect(await storage.getItems([cardsKey('d1'), cardsKey('d2')])).toEqual({
      [cardsKey('d1')]: null,
      [cardsKey('d2')]: null,
    });
  });
});

describe('판정 즉시 저장 (D-01)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('판정은 저장 지연 전에 저장되고 재로드 후 일정·로그가 유지된다', async () => {
    vi.useFakeTimers();
    const storage = createMemoryStorage();
    const queue = createSaveQueue({ storage });
    let state: ContentState = await loadOk(storage);

    // Provider와 같은 규칙: 판정 뒤에는 변경 키를 넣고 바로 flush한다
    const dispatch = async (action: ContentAction) => {
      const next = contentReducer(state, action);
      queue.enqueue(diffContent(state, next));
      state = next;
      if (action.type === 'card/review') await queue.flush();
    };

    await dispatch({ type: 'subject/add', id: 's1', name: '영어', now: T });
    await dispatch({ type: 'deck/add', id: 'd1', subjectId: 's1', name: '단어', now: T });
    await dispatch({ type: 'card/add', id: 'c1', deckId: 'd1', question: 'apple', answer: '사과', now: T, today });
    await dispatch({ type: 'card/add', id: 'c2', deckId: 'd1', question: 'be', answer: '이다', now: T, today });
    await dispatch({ type: 'card/review', cardId: 'c1', deckId: 'd1', grade: 'remember', date: today, now: T, logId: 'l1' });
    await dispatch({ type: 'card/review', cardId: 'c2', deckId: 'd1', grade: 'forget', date: today, now: T, logId: 'l2' });

    // 지연 저장 타이머(400ms)를 진행하지 않은 상태에서 이미 저장되어 있다
    expect(vi.getTimerCount()).toBe(0);
    const raw = await storage.getItems([cardsKey('d1'), logsKey(today)]);
    expect(JSON.parse(raw[cardsKey('d1')]!)[0].schedule).toMatchObject({ stage: 1, dueDate: '2026-10-27' });
    expect(JSON.parse(raw[logsKey(today)]!)).toHaveLength(2);

    const reloaded = await loadOk(storage);
    expect(reloaded).toEqual(state);
    expect(reloaded.logs['2026-10'].map((l) => l.id)).toEqual(['l1', 'l2']);
  });
});
