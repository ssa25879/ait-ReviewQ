import { Storage } from '@apps-in-toss/web-framework';
import { type ClockCheck, checkClock } from '../domain/clock';
import type { Meta } from '../domain/model';
import { createAitStorage } from '../infra/storage/aitStorage';
import { type Backup, readBackup } from '../infra/storage/backup';
import { type AppLoad, loadApp } from '../infra/storage/loadApp';
import { canRestoreFromBackup, dropCorrupt, restoreFromBackup } from '../infra/storage/recovery';
import { todayLocal } from '../utils/date';
import { newId } from '../utils/id';
import { createMetaStore } from './metaStore';

export const appStorage = createAitStorage(Storage);
// bq:meta를 쓰는 유일한 곳(마지막으로 연 날·알림 동의 기록)
export const metaStore = createMetaStore(appStorage);

// 정상 로드면 시계 판정 결과를, 손상이면 사용할 수 있는 백업을 더한다
export type AppStart =
  | (Extract<AppLoad, { kind: 'ok' }> & { clock: ClockCheck; today: string })
  | (Extract<AppLoad, { kind: 'corrupt' }> & { backup: Backup | null; today: string })
  | (Extract<AppLoad, { kind: 'readFailed' }> & { today: string });

// 앱 데이터를 불러온다
async function startApp(): Promise<AppStart> {
  const today = todayLocal();
  const loaded = await loadApp({ storage: appStorage, today, newId });
  if (loaded.kind === 'readFailed') return { ...loaded, today };
  if (loaded.kind === 'corrupt') {
    const backup = await readBackup(appStorage).catch(() => null);
    return { ...loaded, backup, today };
  }
  metaStore.reset(loaded.meta);
  const clock = await openWith(loaded.meta, today);
  return { ...loaded, meta: metaStore.get() ?? loaded.meta, clock, today };
}

// 오늘 날짜로 시계를 판정하고, 되돌림이 아니면 마지막으로 연 날을 오늘로 저장한다(앱 시작·포그라운드 복귀·화면 이동).
// 저장이 실패해도 판정 결과는 돌려준다(메모리 값은 metaStore가 유지한다). Meta 로드 전이면 null
export async function markOpened(today: string): Promise<ClockCheck | null> {
  const meta = metaStore.get();
  return meta ? openWith(meta, today) : null;
}

async function openWith(meta: Meta, today: string): Promise<ClockCheck> {
  const clock = checkClock(meta.lastOpenedDate, today);
  if (clock.lastOpenedDate !== meta.lastOpenedDate) {
    await metaStore
      .update((m) => ({ ...m, lastOpenedDate: checkClock(m.lastOpenedDate, today).lastOpenedDate }))
      .catch((error: unknown) => console.error('[reviewq] lastOpenedDate 저장 실패', error));
  }
  return clock;
}

// StrictMode의 effect 이중 실행과 무관하게 앱 시작 시 1회만 실행하고, "다시 시도"·복구 때만 다시 실행한다
let latest = startApp();
const listeners = new Set<(start: AppStart) => void>();

// 가장 최근 시작 결과를 바로 받고, 이후 다시 불러올 때마다 다시 받는다. 해제 함수를 돌려준다
export function subscribeAppStart(listener: (start: AppStart) => void): () => void {
  listeners.add(listener);
  void latest.then((start) => {
    if (listeners.has(listener)) listener(start);
  });
  return () => listeners.delete(listener);
}

export function reloadApp(): Promise<AppStart> {
  latest = startApp();
  void latest.then((start) => listeners.forEach((listener) => listener(start)));
  return latest;
}

// 손상 상태에서 고른 복구를 실행하고 다시 불러온다. 격리·저장에 실패하면 예외를 던진다(저장 값은 바뀌지 않았거나 일부만 바뀜)
export async function recover(start: Extract<AppStart, { kind: 'corrupt' }>, how: 'restore' | 'drop'): Promise<void> {
  const deps = { storage: appStorage, corrupt: start.corrupt, today: start.today, newId };
  if (how === 'restore' && canRestoreFromBackup(Object.keys(start.corrupt), start.backup)) {
    await restoreFromBackup(deps, start.backup);
  } else {
    await dropCorrupt(deps);
  }
  await reloadApp();
}
