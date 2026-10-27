import type { ContentState } from '../../domain/content';
import type { Card, ReviewLog } from '../../domain/model';
import type { StorageAdapter } from './StorageAdapter';
import { DECKS_KEY, SUBJECTS_KEY, cardsKey, logsKey } from './keys';
import { isCard, isDeck, isReviewLog, isSubject, parseValidList } from './validate';

// 손상된 키는 원본 문자열을 담아 돌려준다(격리에 쓴다). 저장 값은 바꾸지 않는다
export type ContentLoad = { ok: true; content: ContentState } | { ok: false; corrupt: Record<string, string> };

// 'YYYY-MM-DD' → 지난달 'YYYY-MM'
function previousMonth(date: string): string {
  const [y, m] = date.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

// today(기기 로컬 'YYYY-MM-DD') 기준 과목·덱·카드와 이번 달·지난달 로그를 불러와 형식을 검사한다.
// 저장소 호출이 실패하면 예외를 그대로 던진다(손상과 구분)
export async function loadContent(storage: StorageAdapter, today: string): Promise<ContentLoad> {
  const months = [today.slice(0, 7), previousMonth(today)];
  const logKeys = months.map(logsKey);
  const base = await storage.getItems([SUBJECTS_KEY, DECKS_KEY, ...logKeys]);
  const corrupt: Record<string, string> = {};
  const read = <T>(key: string, raw: string | null, isItem: (v: unknown) => v is T): T[] => {
    const parsed = parseValidList(raw, isItem);
    if (parsed.ok) return parsed.value;
    corrupt[key] = raw as string; // 값이 없으면 손상이 아니므로 raw는 문자열이다
    return [];
  };

  const subjects = read(SUBJECTS_KEY, base[SUBJECTS_KEY], isSubject);
  const decks = read(DECKS_KEY, base[DECKS_KEY], isDeck);
  const logs: Record<string, ReviewLog[]> = {};
  months.forEach((month, i) => {
    logs[month] = read(logKeys[i], base[logKeys[i]], isReviewLog);
  });

  // 덱 목록이 손상이면 어떤 카드 키를 읽을지 알 수 없어 읽지 않는다
  const cards: Record<string, Card[]> = {};
  if (decks.length > 0) {
    const keys = decks.map((d) => cardsKey(d.id));
    const raw = await storage.getItems(keys);
    decks.forEach((d, i) => {
      cards[d.id] = read(keys[i], raw[keys[i]], isCard);
    });
  }

  if (Object.keys(corrupt).length > 0) return { ok: false, corrupt };
  return { ok: true, content: { subjects, decks, cards, logs } };
}
