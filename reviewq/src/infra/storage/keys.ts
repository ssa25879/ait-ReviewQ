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

// 복구 전에 손상된 원본 값을 옮겨 두는 키
export function quarantineKey(key: string): string {
  return `${PREFIX}quarantine:${key}`;
}

export function isLogsKey(key: string): boolean {
  return key.startsWith(`${PREFIX}logs:`);
}

// 과목·덱·카드 키(백업에 담기는 키)
export function isContentKey(key: string): boolean {
  return key === SUBJECTS_KEY || key === DECKS_KEY || key.startsWith(`${PREFIX}cards:`);
}
