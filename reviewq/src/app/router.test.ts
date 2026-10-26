import { describe, expect, it } from 'vitest';
import { type ContentAction, contentReducer, emptyContent } from '../domain/content';
import { type Route, formatRoute, parseRoute, routeTargetExists, seedRoutes } from './router';

describe('parseRoute / formatRoute', () => {
  const routes: Route[] = [
    { name: 'subjects' },
    { name: 'deck', deckId: 'd1' },
    { name: 'cardNew', deckId: 'd1' },
    { name: 'cardEdit', deckId: 'd1', cardId: 'c1' },
  ];

  it.each(routes)('$name 경로는 해시로 바꿨다가 되돌려도 같다', (route) => {
    expect(parseRoute(formatRoute(route))).toEqual(route);
  });

  it('형식', () => {
    expect(formatRoute({ name: 'cardEdit', deckId: 'd1', cardId: 'c1' })).toBe('#/deck/d1/card/c1');
  });

  it.each(['', '#', '#/', '#/unknown', '#/deck', '#/deck/d1/x', '#/deck/d1/card'])('알 수 없는 해시 %j는 목록', (hash) => {
    expect(parseRoute(hash)).toEqual({ name: 'subjects' });
  });
});

describe('seedRoutes', () => {
  it('목록은 채울 것이 없다', () => {
    expect(seedRoutes({ name: 'subjects' })).toEqual([]);
  });

  it('카드 편집으로 시작하면 목록·덱 상세를 채운다', () => {
    expect(seedRoutes({ name: 'cardEdit', deckId: 'd1', cardId: 'c1' })).toEqual([
      { name: 'subjects' },
      { name: 'deck', deckId: 'd1' },
    ]);
  });
});

const T = '2026-10-26T00:00:00.000Z';
const state = (
  [
    { type: 'subject/add', id: 's1', name: '영어', now: T },
    { type: 'deck/add', id: 'd1', subjectId: 's1', name: '단어', now: T },
    { type: 'deck/add', id: 'd2', subjectId: 's1', name: '문법', now: T },
    { type: 'card/add', id: 'c1', deckId: 'd1', question: 'q', answer: 'a', now: T, today: '2026-10-26' },
    { type: 'card/add', id: 'c4', deckId: 'd2', question: 'q', answer: 'a', now: T, today: '2026-10-26' },
  ] as ContentAction[]
).reduce(contentReducer, emptyContent);

describe('routeTargetExists', () => {
  it('없는 덱·카드를 가리키면 false', () => {
    expect(routeTargetExists(state, { name: 'subjects' })).toBe(true);
    expect(routeTargetExists(state, { name: 'deck', deckId: 'd1' })).toBe(true);
    expect(routeTargetExists(state, { name: 'deck', deckId: 'nope' })).toBe(false);
    expect(routeTargetExists(state, { name: 'cardNew', deckId: 'd2' })).toBe(true);
    expect(routeTargetExists(state, { name: 'cardEdit', deckId: 'd1', cardId: 'c1' })).toBe(true);
    expect(routeTargetExists(state, { name: 'cardEdit', deckId: 'd1', cardId: 'c4' })).toBe(false);
  });
});
