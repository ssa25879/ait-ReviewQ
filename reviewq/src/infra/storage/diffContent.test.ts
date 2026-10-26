import { describe, expect, it } from 'vitest';
import { type ContentAction, type ContentState, contentReducer, emptyContent } from '../../domain/content';
import { diffContent } from './diffContent';

const T = '2026-10-26T00:00:00.000Z';

function seed(): ContentState {
  const actions: ContentAction[] = [
    { type: 'subject/add', id: 's1', name: '영어', now: T },
    { type: 'subject/add', id: 's2', name: '수학', now: T },
    { type: 'deck/add', id: 'A', subjectId: 's1', name: 'A', now: T },
    { type: 'deck/add', id: 'B', subjectId: 's1', name: 'B', now: T },
    { type: 'deck/add', id: 'C', subjectId: 's2', name: 'C', now: T },
    { type: 'card/add', id: 'c1', deckId: 'A', question: 'q', answer: 'a', now: T, today: '2026-10-26' },
  ];
  return actions.reduce(contentReducer, emptyContent);
}

describe('diffContent', () => {
  it('바뀐 것이 없으면 빈 결과', () => {
    const s = seed();
    expect(diffContent(s, s)).toEqual({ set: {}, remove: [] });
  });

  it('덱 A 카드 수정은 bq:cards:A만 저장한다', () => {
    const prev = seed();
    const next = contentReducer(prev, { type: 'card/update', id: 'c1', deckId: 'A', question: 'q2', answer: 'a', now: T });
    expect(diffContent(prev, next)).toEqual({ set: { 'bq:cards:A': next.cards.A }, remove: [] });
  });

  it('덱 이동은 bq:decks만 저장한다', () => {
    const prev = seed();
    const next = contentReducer(prev, { type: 'deck/move', id: 'A', subjectId: 's2', now: T });
    expect(diffContent(prev, next)).toEqual({ set: { 'bq:decks': next.decks }, remove: [] });
  });

  it('과목 연쇄 삭제는 과목·덱 목록을 저장하고 해당 덱 카드 키를 삭제한다', () => {
    const prev = seed();
    const next = contentReducer(prev, { type: 'subject/delete', id: 's1' });
    const { set, remove } = diffContent(prev, next);
    expect(set).toEqual({ 'bq:subjects': next.subjects, 'bq:decks': next.decks });
    expect(remove.sort()).toEqual(['bq:cards:A', 'bq:cards:B']);
  });
});
