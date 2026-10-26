import type { ContentState } from '../domain/content';

// 해시 기반 경로: #/ · #/deck/{deckId} · #/deck/{deckId}/card/new · #/deck/{deckId}/card/{cardId}
export type Route =
  | { name: 'subjects' }
  | { name: 'deck'; deckId: string }
  | { name: 'cardNew'; deckId: string }
  | { name: 'cardEdit'; deckId: string; cardId: string };

const ROOT: Route = { name: 'subjects' };

// 알 수 없는 해시는 최초 화면(과목·덱 목록)으로 본다
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  if (parts[0] !== 'deck' || !parts[1]) return ROOT;
  const deckId = parts[1];
  if (parts.length === 2) return { name: 'deck', deckId };
  if (parts.length === 4 && parts[2] === 'card') {
    return parts[3] === 'new' ? { name: 'cardNew', deckId } : { name: 'cardEdit', deckId, cardId: parts[3] };
  }
  return ROOT;
}

export function formatRoute(route: Route): string {
  switch (route.name) {
    case 'subjects':
      return '#/';
    case 'deck':
      return `#/deck/${encodeURIComponent(route.deckId)}`;
    case 'cardNew':
      return `#/deck/${encodeURIComponent(route.deckId)}/card/new`;
    case 'cardEdit':
      return `#/deck/${encodeURIComponent(route.deckId)}/card/${encodeURIComponent(route.cardId)}`;
  }
}

// 하위 화면으로 바로 열렸을 때 히스토리에 먼저 채울 상위 화면(바깥쪽부터)
export function seedRoutes(route: Route): Route[] {
  switch (route.name) {
    case 'subjects':
      return [];
    case 'deck':
      return [ROOT];
    case 'cardNew':
    case 'cardEdit':
      return [ROOT, { name: 'deck', deckId: route.deckId }];
  }
}

// 경로가 가리키는 덱·카드가 있는지(없으면 목록 화면으로 바꾼다)
export function routeTargetExists(state: ContentState, route: Route): boolean {
  if (route.name === 'subjects') return true;
  if (!state.decks.some((d) => d.id === route.deckId)) return false;
  if (route.name === 'cardEdit') return state.cards[route.deckId]?.some((c) => c.id === route.cardId) ?? false;
  return true;
}
