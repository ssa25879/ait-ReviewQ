import type { ContentState } from '../domain/content';

// 해시 기반 경로: #/ · #/subjects · #/study · #/stats · #/settings · #/deck/{deckId} · #/deck/{deckId}/card/new · #/deck/{deckId}/card/{cardId} · #/deck/{deckId}/study
export type Route =
  | { name: 'home' }
  | { name: 'subjects' }
  | { name: 'studyAll' }
  | { name: 'stats' }
  | { name: 'settings' }
  | { name: 'deck'; deckId: string }
  | { name: 'cardNew'; deckId: string }
  | { name: 'cardEdit'; deckId: string; cardId: string }
  | { name: 'study'; deckId: string };

const ROOT: Route = { name: 'home' };
const SUBJECTS: Route = { name: 'subjects' };

// 알 수 없는 해시는 최초 화면(홈)으로 본다
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts.length === 1 && parts[0] === 'subjects') return SUBJECTS;
  if (parts.length === 1 && parts[0] === 'study') return { name: 'studyAll' };
  if (parts.length === 1 && parts[0] === 'stats') return { name: 'stats' };
  if (parts.length === 1 && parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] !== 'deck' || !parts[1]) return ROOT;
  const deckId = parts[1];
  if (parts.length === 2) return { name: 'deck', deckId };
  if (parts.length === 3 && parts[2] === 'study') return { name: 'study', deckId };
  if (parts.length === 4 && parts[2] === 'card') {
    return parts[3] === 'new' ? { name: 'cardNew', deckId } : { name: 'cardEdit', deckId, cardId: parts[3] };
  }
  return ROOT;
}

export function formatRoute(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'subjects':
      return '#/subjects';
    case 'studyAll':
      return '#/study';
    case 'stats':
      return '#/stats';
    case 'settings':
      return '#/settings';
    case 'deck':
      return `#/deck/${encodeURIComponent(route.deckId)}`;
    case 'cardNew':
      return `#/deck/${encodeURIComponent(route.deckId)}/card/new`;
    case 'cardEdit':
      return `#/deck/${encodeURIComponent(route.deckId)}/card/${encodeURIComponent(route.cardId)}`;
    case 'study':
      return `#/deck/${encodeURIComponent(route.deckId)}/study`;
  }
}

// 하위 화면으로 바로 열렸을 때 히스토리에 먼저 채울 상위 화면(바깥쪽부터)
export function seedRoutes(route: Route): Route[] {
  switch (route.name) {
    case 'home':
      return [];
    case 'subjects':
    case 'studyAll':
    case 'stats':
    case 'settings':
      return [ROOT];
    case 'deck':
      return [ROOT, SUBJECTS];
    case 'cardNew':
    case 'cardEdit':
    case 'study':
      return [ROOT, SUBJECTS, { name: 'deck', deckId: route.deckId }];
  }
}

// 경로가 가리키는 덱·카드가 있는지(없으면 홈으로 바꾼다)
export function routeTargetExists(state: ContentState, route: Route): boolean {
  if (!('deckId' in route)) return true; // 홈·목록·전체 세션·통계·설정은 대상이 없다
  if (!state.decks.some((d) => d.id === route.deckId)) return false;
  if (route.name === 'cardEdit') return state.cards[route.deckId]?.some((c) => c.id === route.cardId) ?? false;
  return true;
}
