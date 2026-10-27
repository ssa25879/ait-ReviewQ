import { Storage } from '@apps-in-toss/web-framework';
import { type ClockCheck, checkClock } from '../domain/clock';
import { createAitStorage } from '../infra/storage/aitStorage';
import { loadContent } from '../infra/storage/loadContent';
import { initMeta, recordOpened } from '../infra/storage/meta';
import { todayLocal } from '../utils/date';
import { newId } from '../utils/id';

export const appStorage = createAitStorage(Storage);

// StrictMode의 effect 이중 실행과 무관하게 앱 시작 시 1회만 실행한다
export const bootstrap = (async () => {
  const today = todayLocal();
  let meta = await initMeta({ storage: appStorage, today, newId });
  let clock: ClockCheck;
  try {
    ({ meta, clock } = await recordOpened(appStorage, meta, today));
  } catch (error) {
    // 메타 저장 실패는 화면 동작에 영향이 없고 다음 복귀 때 다시 시도된다
    console.error('[reviewq] lastOpenedDate 저장 실패', error);
    clock = { rolledBack: checkClock(meta.lastOpenedDate, today).rolledBack, lastOpenedDate: meta.lastOpenedDate };
  }
  const content = await loadContent(appStorage, today);
  return { meta, content, clock, today };
})();
