import { isDue } from '../utils/date';
import type { ContentState } from './content';
import type { Deck } from './model';

export function decksOfSubject(state: ContentState, subjectId: string): Deck[] {
  return state.decks.filter((d) => d.subjectId === subjectId);
}

export function cardCount(state: ContentState, deckId: string): number {
  return state.cards[deckId]?.length ?? 0;
}

// 과목을 지울 때 함께 지워지는 덱·카드 수
export function subjectDeleteSummary(state: ContentState, subjectId: string): { decks: number; cards: number } {
  const decks = decksOfSubject(state, subjectId);
  return { decks: decks.length, cards: decks.reduce((n, d) => n + cardCount(state, d.id), 0) };
}

// 같은 과목 안에 앞뒤 공백을 제거한 이름이 같은 덱이 있는지(경고용)
export function hasDuplicateDeckName(
  state: ContentState,
  subjectId: string,
  name: string,
  excludeDeckId?: string,
): boolean {
  const target = name.trim();
  if (!target) return false;
  return decksOfSubject(state, subjectId).some((d) => d.id !== excludeDeckId && d.name === target);
}

// 다음 복습일 표시: 오늘이면 '오늘', 아니면 'M월 D일'
export function formatDueDate(dueDate: string, today: string): string {
  if (dueDate === today) return '오늘';
  const [, m, d] = dueDate.split('-').map(Number);
  return `${m}월 ${d}일`;
}

// 연체 수: 다음 복습일이 오늘보다 이전인 카드 수(전체 덱)
export function overdueCount(state: ContentState, today: string): number {
  return Object.values(state.cards).reduce((n, cards) => n + cards.filter((c) => c.schedule.dueDate < today).length, 0);
}

// 과목별 오늘 복습 수(상한 무관). 덱별 buildQueue의 cards + overflow 합과 같다
export function dueCountBySubject(state: ContentState, today: string): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(state.subjects.map((s) => [s.id, 0]));
  for (const deck of state.decks) {
    const due = (state.cards[deck.id] ?? []).filter((c) => isDue(c.schedule.dueDate, today)).length;
    counts[deck.subjectId] = (counts[deck.subjectId] ?? 0) + due;
  }
  return counts;
}

// 과목별 전체 카드 수. 오늘 복습이 0이어도 카드가 있다는 것을 보여 주는 데 쓴다
export function cardCountBySubject(state: ContentState): Record<string, number> {
  const counts: Record<string, number> = Object.fromEntries(state.subjects.map((s) => [s.id, 0]));
  for (const deck of state.decks) {
    counts[deck.subjectId] = (counts[deck.subjectId] ?? 0) + (state.cards[deck.id] ?? []).length;
  }
  return counts;
}
