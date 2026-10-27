import type { ContentState } from '../../domain/content';
import type { Card, Deck, Subject } from '../../domain/model';
import type { StorageAdapter } from './StorageAdapter';
import { BACKUP_KEY } from './keys';
import { isCard, isDeck, isSubject, parseValid } from './validate';

// 마지막으로 정상 로드된 과목·덱·카드. 판정 기록은 넣지 않는다(일정은 카드 schedule에 있다)
export interface Backup {
  date: string; // 'YYYY-MM-DD' 백업한 날(기기 로컬)
  savedAt: string; // ISO 8601
  subjects: Subject[];
  decks: Deck[];
  cards: Record<string, Card[]>;
}

function isBackup(v: unknown): v is Backup {
  if (typeof v !== 'object' || v === null) return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.date === 'string' &&
    typeof b.savedAt === 'string' &&
    Array.isArray(b.subjects) &&
    b.subjects.every(isSubject) &&
    Array.isArray(b.decks) &&
    b.decks.every(isDeck) &&
    typeof b.cards === 'object' &&
    b.cards !== null &&
    Object.values(b.cards).every((cards) => Array.isArray(cards) && cards.every(isCard))
  );
}

// 백업을 읽는다. 없거나 형식이 틀리면 사용할 수 없으므로 null
export async function readBackup(storage: StorageAdapter): Promise<Backup | null> {
  const { [BACKUP_KEY]: raw } = await storage.getItems([BACKUP_KEY]);
  if (raw == null) return null;
  const parsed = parseValid(raw, isBackup);
  return parsed.ok ? parsed.value : null;
}

// 정상 로드된 콘텐츠를 백업한다. 하루 한 번 부르는 판단은 호출하는 쪽(loadApp)이 한다
export async function saveBackup(
  storage: StorageAdapter,
  content: ContentState,
  today: string,
  now: Date = new Date(),
): Promise<void> {
  const backup: Backup = {
    date: today,
    savedAt: now.toISOString(),
    subjects: content.subjects,
    decks: content.decks,
    cards: content.cards,
  };
  await storage.setItems({ [BACKUP_KEY]: JSON.stringify(backup) });
}
