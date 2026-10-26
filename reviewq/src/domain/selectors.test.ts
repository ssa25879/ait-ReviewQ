import { describe, expect, it } from 'vitest';
import { type ContentAction, contentReducer, emptyContent } from './content';
import { formatDueDate, hasDuplicateDeckName, subjectDeleteSummary } from './selectors';
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
