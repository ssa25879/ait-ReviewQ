import type { ContentState } from '../../domain/content';
import type { Card, Deck, Subject } from '../../domain/model';
import type { StorageAdapter } from './StorageAdapter';
import { DECKS_KEY, SUBJECTS_KEY, cardsKey } from './keys';

// 값이 없는 키는 빈 목록. JSON 파싱에 실패하면 덮어쓰지 않도록 오류를 던진다(형식 검증은 Day 5)
function parseList<T>(key: string, raw: string | null): T[] {
  if (raw == null) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch (cause) {
    throw new Error(`${key} 파싱 실패`, { cause });
  }
}

export async function loadContent(storage: StorageAdapter): Promise<ContentState> {
  const base = await storage.getItems([SUBJECTS_KEY, DECKS_KEY]);
  const subjects = parseList<Subject>(SUBJECTS_KEY, base[SUBJECTS_KEY]);
  const decks = parseList<Deck>(DECKS_KEY, base[DECKS_KEY]);

  const cards: Record<string, Card[]> = {};
  if (decks.length > 0) {
    const keys = decks.map((d) => cardsKey(d.id));
    const raw = await storage.getItems(keys);
    decks.forEach((d, i) => {
      cards[d.id] = parseList<Card>(keys[i], raw[keys[i]]);
    });
  }
  return { subjects, decks, cards };
}
