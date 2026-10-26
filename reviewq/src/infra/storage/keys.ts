const PREFIX = 'bq:';

export const META_KEY = `${PREFIX}meta`;
export const SUBJECTS_KEY = `${PREFIX}subjects`;
export const DECKS_KEY = `${PREFIX}decks`;
export const BACKUP_KEY = `${PREFIX}backup:last`;

export function cardsKey(deckId: string): string {
  return `${PREFIX}cards:${deckId}`;
}

// date: 'YYYY-MM-DD' 또는 'YYYY-MM'
export function logsKey(date: string): string {
  return `${PREFIX}logs:${date.slice(0, 7)}`;
}
