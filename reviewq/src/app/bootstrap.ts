import { Storage } from '@apps-in-toss/web-framework';
import { type ClockCheck, checkClock } from '../domain/clock';
import { createAitStorage } from '../infra/storage/aitStorage';
import { type Backup, readBackup } from '../infra/storage/backup';
import { type AppLoad, loadApp } from '../infra/storage/loadApp';
import { recordOpened } from '../infra/storage/meta';
import { canRestoreFromBackup, dropCorrupt, restoreFromBackup } from '../infra/storage/recovery';
import { todayLocal } from '../utils/date';
import { newId } from '../utils/id';

export const appStorage = createAitStorage(Storage);

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
  let { meta } = loaded;
  let clock: ClockCheck;
  try {
    ({ meta, clock } = await recordOpened(appStorage, meta, today));
  } catch (error) {
    // 메타 저장 실패는 화면 동작에 영향이 없고 다음 복귀 때 다시 시도된다
    console.error('[reviewq] lastOpenedDate 저장 실패', error);
    clock = { rolledBack: checkClock(meta.lastOpenedDate, today).rolledBack, lastOpenedDate: meta.lastOpenedDate };
  }
  return { ...loaded, meta, clock, today };
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
