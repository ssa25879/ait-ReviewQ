import type { ContentState } from '../../domain/content';
import { DECKS_KEY, SUBJECTS_KEY, cardsKey, logsKey } from './keys';

export interface ContentChanges {
  set: Record<string, unknown>; // 저장할 키 → 직렬화 전 값
  remove: string[]; // 삭제할 키
}

// 리듀서가 바뀌지 않은 배열의 참조를 유지하므로 참조 비교로 변경 키를 찾는다
export function diffContent(prev: ContentState, next: ContentState): ContentChanges {
  const set: Record<string, unknown> = {};
  const remove: string[] = [];

  if (prev.subjects !== next.subjects) set[SUBJECTS_KEY] = next.subjects;
  if (prev.decks !== next.decks) set[DECKS_KEY] = next.decks;

  if (prev.cards !== next.cards) {
    for (const [deckId, cards] of Object.entries(next.cards)) {
      if (prev.cards[deckId] !== cards) set[cardsKey(deckId)] = cards;
    }
    for (const deckId of Object.keys(prev.cards)) {
      if (!(deckId in next.cards)) remove.push(cardsKey(deckId));
    }
  }

  // 로그 월 키는 삭제하지 않는다
  if (prev.logs !== next.logs) {
    for (const [month, logs] of Object.entries(next.logs)) {
      if (prev.logs[month] !== logs) set[logsKey(month)] = logs;
    }
  }
  return { set, remove };
}
