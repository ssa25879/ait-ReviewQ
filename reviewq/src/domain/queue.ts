import { isDue } from '../utils/date';
import type { ContentState } from './content';
import type { Card } from './model';

export const DAILY_LIMIT = 100;

export interface QueueItem {
  cardId: string;
  deckId: string;
}

export interface ReviewQueue {
  cards: QueueItem[];
  overflow: number; // 상한 때문에 빠진 카드 수
}

// 다음 복습일이 기준일 이하인 카드를 오래 밀린 순(같으면 생성 순)으로 상한까지 담는다.
// deckId가 없으면 전체 덱이 대상이다
export function buildQueue(
  state: ContentState,
  today: string,
  { deckId, limit = DAILY_LIMIT }: { deckId?: string; limit?: number } = {},
): ReviewQueue {
  const source = deckId === undefined ? Object.values(state.cards).flat() : (state.cards[deckId] ?? []);
  const due = source.filter((c) => isDue(c.schedule.dueDate, today)).sort(compareDue);
  return {
    cards: due.slice(0, limit).map((c) => ({ cardId: c.id, deckId: c.deckId })),
    overflow: Math.max(due.length - limit, 0),
  };
}

function compareDue(a: Card, b: Card): number {
  if (a.schedule.dueDate !== b.schedule.dueDate) return a.schedule.dueDate < b.schedule.dueDate ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return 0;
}
