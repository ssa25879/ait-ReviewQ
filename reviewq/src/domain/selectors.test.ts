import { describe, expect, it } from 'vitest';
import { type ContentAction, contentReducer, emptyContent } from './content';
import { buildQueue } from './queue';
import { dueCountBySubject, formatDueDate, hasDuplicateDeckName, overdueCount, subjectDeleteSummary } from './selectors';
import { countChars } from './validation';

const T = '2026-10-26T00:00:00.000Z';
const card = (id: string, deckId: string): ContentAction => ({
  type: 'card/add', id, deckId, question: 'q', answer: 'a', now: T, today: '2026-10-26',
});

const state = (
  [
    { type: 'subject/add', id: 's1', name: '영어', now: T },
    { type: 'deck/add', id: 'd1', subjectId: 's1', name: '단어', now: T },
    { type: 'deck/add', id: 'd2', subjectId: 's1', name: '문법', now: T },
    card('c1', 'd1'), card('c2', 'd1'), card('c3', 'd1'), card('c4', 'd2'), card('c5', 'd2'),
  ] as ContentAction[]
).reduce(contentReducer, emptyContent);

describe('selectors', () => {
  it('과목 삭제 요약은 덱 2개·카드 5장', () => {
    expect(subjectDeleteSummary(state, 's1')).toEqual({ decks: 2, cards: 5 });
  });

  it('앞뒤 공백만 다른 덱 이름도 중복으로 본다', () => {
    expect(hasDuplicateDeckName(state, 's1', '  단어 ')).toBe(true);
    expect(hasDuplicateDeckName(state, 's1', '단어', 'd1')).toBe(false);
    expect(hasDuplicateDeckName(state, 's1', '숙어')).toBe(false);
  });

  it('다음 복습일 표시', () => {
    expect(formatDueDate('2026-10-26', '2026-10-26')).toBe('오늘');
    expect(formatDueDate('2026-11-02', '2026-10-26')).toBe('11월 2일');
  });

  it('countChars는 앞뒤 공백을 빼고 코드 포인트로 센다', () => {
    expect(countChars(' 😀가 ')).toBe(2);
  });
});

describe('홈 요약 selectors', () => {
  const TODAY = '2026-10-26';
  // card/add는 다음 복습일을 today로 둔다
  const due = (id: string, deckId: string, dueDate: string): ContentAction => ({
    type: 'card/add', id, deckId, question: 'q', answer: 'a', now: T, today: dueDate,
  });
  const mixed = (
    [
      { type: 'subject/add', id: 'en', name: '영어', now: T },
      { type: 'subject/add', id: 'ma', name: '수학', now: T },
      { type: 'deck/add', id: 'd1', subjectId: 'en', name: '단어', now: T },
      { type: 'deck/add', id: 'd2', subjectId: 'en', name: '문법', now: T },
      { type: 'deck/add', id: 'd3', subjectId: 'ma', name: '공식', now: T },
      due('a', 'd1', TODAY), due('b', 'd1', TODAY), due('c', 'd2', '2026-10-23'),
      due('f1', 'd1', '2026-10-27'), due('f2', 'd2', '2026-10-27'), due('f3', 'd3', '2026-10-27'), due('f4', 'd3', '2026-10-30'),
    ] as ContentAction[]
  ).reduce(contentReducer, emptyContent);

  it('오늘 2장·연체 1장·미래 4장이면 연체 1장, 오늘 복습 3장', () => {
    expect(overdueCount(mixed, TODAY)).toBe(1);
    const q = buildQueue(mixed, TODAY);
    expect(q.cards.length + q.overflow).toBe(3);
  });

  it('과목별 오늘 복습 수는 덱별 큐 합과 같다', () => {
    expect(dueCountBySubject(mixed, TODAY)).toEqual({ en: 3, ma: 0 });
    const perDeck = (deckId: string) => {
      const q = buildQueue(mixed, TODAY, { deckId });
      return q.cards.length + q.overflow;
    };
    expect(perDeck('d1') + perDeck('d2')).toBe(3);
  });

  it('빈 상태면 0', () => {
    expect(overdueCount(emptyContent, TODAY)).toBe(0);
    expect(dueCountBySubject(emptyContent, TODAY)).toEqual({});
    const onlySubject = contentReducer(emptyContent, { type: 'subject/add', id: 'en', name: '영어', now: T });
    expect(dueCountBySubject(onlySubject, TODAY)).toEqual({ en: 0 });
  });
});
