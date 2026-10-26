import { describe, expect, it } from 'vitest';
import type { ContentState } from './content';
import type { Card } from './model';
import { buildQueue } from './queue';

function card(id: string, deckId: string, dueDate: string, createdAt = '2026-10-01T00:00:00.000Z'): Card {
  return {
    id,
    deckId,
    question: 'q',
    answer: 'a',
    createdAt,
    updatedAt: createdAt,
    schedule: {
      stage: 1,
      dueDate,
      lastReviewedDate: null,
      reviewCount: 0,
      lapseCount: 0,
      algorithmId: 'fixed-interval',
      algorithmVersion: 1,
    },
  };
}

function state(cards: Card[]): ContentState {
  const byDeck: Record<string, Card[]> = {};
  for (const c of cards) (byDeck[c.deckId] ??= []).push(c);
  return { subjects: [], decks: [], cards: byDeck, logs: {} };
}

const ids = (s: ContentState, today: string, opts?: Parameters<typeof buildQueue>[2]) =>
  buildQueue(s, today, opts).cards.map((c) => c.cardId);

describe('buildQueue', () => {
  it('연체 카드를 포함한다 (S-05)', () => {
    expect(ids(state([card('c1', 'A', '2026-10-23')]), '2026-10-26')).toEqual(['c1']);
  });

  it('예정일이 기준일 이후인 카드는 제외한다 (S-10)', () => {
    expect(ids(state([card('c1', 'A', '2026-10-27'), card('c2', 'A', '2026-10-20')]), '2026-10-20')).toEqual(['c2']);
  });

  it('예정일이 오래된 순, 같으면 생성 순으로 정렬한다', () => {
    const s = state([
      card('c26', 'A', '2026-10-26'),
      card('c24b', 'B', '2026-10-24', '2026-10-02T00:00:00.000Z'),
      card('c20', 'B', '2026-10-20'),
      card('c24a', 'A', '2026-10-24', '2026-10-01T00:00:00.000Z'),
    ]);
    expect(ids(s, '2026-10-26')).toEqual(['c20', 'c24a', 'c24b', 'c26']);
  });

  it('130장이면 가장 오래 밀린 100장과 넘친 수 30을 돌려준다', () => {
    const cards = Array.from({ length: 130 }, (_, i) =>
      card(`c${i}`, 'A', '2026-10-26', new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString()),
    );
    const q = buildQueue(state(cards), '2026-10-26');
    expect(q.cards).toHaveLength(100);
    expect(q.overflow).toBe(30);
    expect(q.cards[0].cardId).toBe('c0');
    expect(q.cards[99].cardId).toBe('c99');
  });

  it('덱 하나를 대상으로 하면 그 덱 카드만 담는다', () => {
    const s = state([
      card('a1', 'A', '2026-10-26'),
      card('a2', 'A', '2026-10-25'),
      card('b1', 'B', '2026-10-26'),
      card('b2', 'B', '2026-10-26'),
      card('b3', 'B', '2026-10-26'),
    ]);
    expect(buildQueue(s, '2026-10-26', { deckId: 'A' })).toEqual({
      cards: [{ cardId: 'a2', deckId: 'A' }, { cardId: 'a1', deckId: 'A' }],
      overflow: 0,
    });
    expect(ids(s, '2026-10-26')).toHaveLength(5);
  });
});
