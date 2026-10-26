import { Storage } from '@apps-in-toss/web-framework';
import { createAitStorage } from '../infra/storage/aitStorage';
import { loadContent } from '../infra/storage/loadContent';
import { initMeta } from '../infra/storage/meta';
import { todayLocal } from '../utils/date';
import { newId } from '../utils/id';

export const appStorage = createAitStorage(Storage);

// StrictMode의 effect 이중 실행과 무관하게 앱 시작 시 1회만 실행한다
export const bootstrap = (async () => {
  const today = todayLocal();
  const meta = await initMeta({ storage: appStorage, today, newId });
  const content = await loadContent(appStorage, today);
  return { meta, content };
})();
