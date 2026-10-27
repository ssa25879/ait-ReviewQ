import { type ClockCheck, checkClock } from '../../domain/clock';
import type { Meta } from '../../domain/model';
import type { StorageAdapter } from './StorageAdapter';
import { META_KEY } from './keys';
import { isMeta, parseValid } from './validate';

export const SCHEMA_VERSION = 2;

// 버전 N → N+1 변환. 각 함수는 이전 버전 Meta를 받아 다음 버전 Meta를 돌려주는 순수 함수다(기획서 7.5)
const MIGRATIONS: Record<number, (meta: Meta) => Meta> = {
  // v2: 알림 동의 기록(notification)을 추가한다. 필드는 비운 채(아직 묻지 않음) 버전만 올린다
  1: (meta) => ({ ...meta, schemaVersion: 2 }),
};

// 저장된 Meta를 현재 버전으로 올린다. 이미 현재 버전이면 같은 객체를 돌려준다
export function migrateMeta(meta: Meta): Meta {
  let current = meta;
  while (current.schemaVersion < SCHEMA_VERSION) {
    const step = MIGRATIONS[current.schemaVersion];
    if (!step) throw new Error(`Meta v${current.schemaVersion} 마이그레이션 없음`);
    current = step(current);
  }
  return current;
}

interface InitMetaDeps {
  storage: StorageAdapter;
  today: string; // 'YYYY-MM-DD'
  newId: () => string;
}

export type MetaLoad = { ok: true; meta: Meta } | { ok: false; raw: string };

// bq:meta가 있으면 형식을 검사해 불러오고, 없으면 새로 만들어 저장한다.
// 저장된 값이 손상되었으면 덮어쓰지 않고 원본을 돌려준다(격리·복구에 쓴다)
export async function initMeta({ storage, today, newId }: InitMetaDeps): Promise<MetaLoad> {
  const { [META_KEY]: raw } = await storage.getItems([META_KEY]);
  if (raw != null) {
    const parsed = parseValid(raw, isMeta);
    return parsed.ok ? { ok: true, meta: parsed.value } : { ok: false, raw };
  }
  return { ok: true, meta: await createMeta(storage, today, newId) };
}

// 새 Meta를 만들어 저장한다(첫 실행, 손상된 Meta 복구)
export async function createMeta(storage: StorageAdapter, today: string, newId: () => string): Promise<Meta> {
  const meta: Meta = { schemaVersion: SCHEMA_VERSION, lastOpenedDate: today, installId: newId() };
  await storage.setItems({ [META_KEY]: JSON.stringify(meta) });
  return meta;
}

// 마지막으로 연 날만 바꿔 bq:meta를 바로 저장한다(installId·schemaVersion은 그대로)
export async function saveLastOpenedDate(storage: StorageAdapter, meta: Meta, date: string): Promise<Meta> {
  const next: Meta = { ...meta, lastOpenedDate: date };
  await storage.setItems({ [META_KEY]: JSON.stringify(next) });
  return next;
}

// 앱 시작·포그라운드 복귀 때 시계를 판정하고, 마지막으로 연 날이 바뀐 경우에만 저장한다
export async function recordOpened(
  storage: StorageAdapter,
  meta: Meta,
  today: string,
): Promise<{ meta: Meta; clock: ClockCheck }> {
  const clock = checkClock(meta.lastOpenedDate, today);
  if (clock.lastOpenedDate === meta.lastOpenedDate) return { meta, clock };
  return { meta: await saveLastOpenedDate(storage, meta, clock.lastOpenedDate), clock };
}
