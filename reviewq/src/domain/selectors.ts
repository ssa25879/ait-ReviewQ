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
