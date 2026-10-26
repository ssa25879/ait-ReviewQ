import { describe, expect, it } from 'vitest';
import { contentReducer, emptyContent } from '../domain/content';
import { createActions } from './actions';

describe('createActions', () => {
  it('카드 생성 액션은 기기 로컬 오늘 날짜의 신규 일정을 만든다', () => {
    let seq = 0;
    const now = new Date(2026, 9, 26, 23, 59);
    const a = createActions({ newId: () => `id${++seq}`, now: () => now });

    const state = [a.addSubject('영어'), a.addDeck('id1', '단어'), a.addCard('id2', '질문', '정답')].reduce(
      contentReducer,
      emptyContent,
    );

    const card = state.cards.id2[0];
    expect(card).toMatchObject({ id: 'id3', deckId: 'id2', createdAt: now.toISOString() });
    expect(card.schedule).toMatchObject({ stage: 0, dueDate: '2026-10-26' });
  });
});

describe('reviewCard', () => {
  it('세션 날짜·현재 시각·새 로그 id로 판정 액션을 만든다', () => {
    const now = new Date(2026, 9, 27, 0, 1);
    const a = createActions({ newId: () => 'log1', now: () => now });
    expect(a.reviewCard('c1', 'd1', 'remember', '2026-10-26')).toEqual({
      type: 'card/review', cardId: 'c1', deckId: 'd1', grade: 'remember', date: '2026-10-26',
      now: now.toISOString(), logId: 'log1',
    });
  });
});
