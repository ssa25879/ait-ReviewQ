import type { ContentState } from '../../domain/content';
import type { Card, Deck, ReviewLog, Subject } from '../../domain/model';
import type { StorageAdapter } from './StorageAdapter';
import { DECKS_KEY, SUBJECTS_KEY, cardsKey, logsKey } from './keys';

// 값이 없는 키는 빈 목록. JSON 파싱에 실패하면 덮어쓰지 않도록 오류를 던진다(형식 검증은 Day 5)
function parseList<T>(key: string, raw: string | null): T[] {
  if (raw == null) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch (cause) {
    throw new Error(`${key} 파싱 실패`, { cause });
  }
}

// 'YYYY-MM-DD' → 지난달 'YYYY-MM'
function previousMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// today(기기 로컬 'YYYY-MM-DD') 기준 이번 달·지난달 로그를 함께 불러온다
export async function loadContent(storage: StorageAdapter, today: string): Promise<ContentState> {
  const months = [today.slice(0, 7), previousMonth(today)];
  const logKeys = months.map(logsKey);
  const base = await storage.getItems([SUBJECTS_KEY, DECKS_KEY, ...logKeys]);
  const subjects = parseList<Subject>(SUBJECTS_KEY, base[SUBJECTS_KEY]);
  const decks = parseList<Deck>(DECKS_KEY, base[DECKS_KEY]);
  const logs: Record<string, ReviewLog[]> = {};
  months.forEach((month, i) => {
    logs[month] = parseList<ReviewLog>(logKeys[i], base[logKeys[i]]);
  });

  const cards: Record<string, Card[]> = {};
  if (decks.length > 0) {
    const keys = decks.map((d) => cardsKey(d.id));
    const raw = await storage.getItems(keys);
    decks.forEach((d, i) => {
      cards[d.id] = parseList<Card>(keys[i], raw[keys[i]]);
    });
  }
  return { subjects, decks, cards, logs };
}
