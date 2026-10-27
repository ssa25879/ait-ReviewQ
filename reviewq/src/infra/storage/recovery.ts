import type { StorageAdapter } from './StorageAdapter';
import type { Backup } from './backup';
import { DECKS_KEY, META_KEY, SUBJECTS_KEY, cardsKey, isContentKey, isLogsKey, quarantineKey } from './keys';
import { createMeta } from './meta';
import { isDeck, parseValidList } from './validate';

interface RecoveryDeps {
  storage: StorageAdapter;
  corrupt: Record<string, string>; // 손상 키 → 원본 문자열
  today: string;
  newId: () => string;
}

// 손상된 원본을 격리 키에 먼저 저장한다. 실패하면 예외를 던져 이후 변경을 막는다
export async function quarantine(storage: StorageAdapter, corrupt: Record<string, string>): Promise<void> {
  const entries = Object.fromEntries(Object.entries(corrupt).map(([key, raw]) => [quarantineKey(key), raw]));
  await storage.setItems(entries);
}

// 과목·덱·카드를 백업으로 되돌린다. 손상된 로그 키는 빈 목록, 손상된 Meta는 새로 만든다
export async function restoreFromBackup({ storage, corrupt, today, newId }: RecoveryDeps, backup: Backup): Promise<void> {
  await quarantine(storage, corrupt);

  // 지금 덱 목록을 읽을 수 있으면 백업에 없는 덱의 카드 키를 정리한다
  const { [DECKS_KEY]: rawDecks } = await storage.getItems([DECKS_KEY]);
  const current = parseValidList(rawDecks, isDeck);
  const keep = new Set(backup.decks.map((d) => d.id));
  const stale = current.ok ? current.value.filter((d) => !keep.has(d.id)).map((d) => cardsKey(d.id)) : [];

  const entries: Record<string, string> = {
    [SUBJECTS_KEY]: JSON.stringify(backup.subjects),
    [DECKS_KEY]: JSON.stringify(backup.decks),
  };
  for (const deck of backup.decks) entries[cardsKey(deck.id)] = JSON.stringify(backup.cards[deck.id] ?? []);
  for (const key of Object.keys(corrupt)) if (isLogsKey(key)) entries[key] = '[]';
  await storage.setItems(entries);
  for (const key of stale) await storage.removeItem(key);
  if (META_KEY in corrupt) await createMeta(storage, today, newId);
}

// 손상 키를 격리한 뒤 지워 빈 값으로 열리게 한다. 손상된 Meta는 새로 만든다
export async function dropCorrupt({ storage, corrupt, today, newId }: RecoveryDeps): Promise<void> {
  await quarantine(storage, corrupt);
  for (const key of Object.keys(corrupt)) {
    if (key === META_KEY) await createMeta(storage, today, newId);
    else await storage.removeItem(key);
  }
}

// 백업은 과목·덱·카드만 담으므로, 그중 하나가 손상됐을 때만 백업 복구가 의미 있다.
// 판정 기록·Meta만 손상됐는데 백업으로 되돌리면 멀쩡한 콘텐츠만 백업 시점으로 돌아간다
export function canRestoreFromBackup(corruptKeys: string[], backup: Backup | null): backup is Backup {
  return backup !== null && corruptKeys.some(isContentKey);
}
