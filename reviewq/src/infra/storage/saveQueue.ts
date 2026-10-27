import type { ContentChanges } from './diffContent';
import type { StorageAdapter } from './StorageAdapter';

export const SAVE_DELAY_MS = 400;
// 저장 실패 후 다시 시도하기까지의 간격(최대 3회). 모두 실패하면 자동 재시도를 멈춘다
export const RETRY_DELAYS_MS = [1000, 2000, 4000];

export type SaveStatus = 'ok' | 'failed';

const REMOVE = Symbol('remove');
type Pending = { value: unknown } | typeof REMOVE;

interface SaveQueueOptions {
  storage: StorageAdapter;
  delayMs?: number;
  retryDelaysMs?: number[];
  onError?: (error: unknown) => void;
  onStatus?: (status: SaveStatus) => void; // 재시도까지 모두 실패하면 failed, 이후 저장이 성공하면 ok
}

export interface SaveQueue {
  enqueue(changes: ContentChanges): void;
  // 대기 중인 타이머를 취소하고 즉시 저장한다. 실행 중인 저장이 있으면 끝난 뒤 실행한다
  flush(): Promise<void>;
}

// 키별 마지막 값만 보관했다가 디바운스 후 한 번에 저장한다.
// 실패하면 그 사이 새 값으로 덮이지 않은 항목을 되돌려 간격을 늘려 가며 다시 저장하고, 다음 변경·flush 때도 함께 쓴다
export function createSaveQueue({
  storage,
  delayMs = SAVE_DELAY_MS,
  retryDelaysMs = RETRY_DELAYS_MS,
  onError = (error) => console.error('[reviewq] 저장 실패', error),
  onStatus,
}: SaveQueueOptions): SaveQueue {
  const pending = new Map<string, Pending>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let retries = 0;
  let status: SaveStatus = 'ok';
  let tail: Promise<void> = Promise.resolve();

  const setStatus = (next: SaveStatus) => {
    if (next === status) return;
    status = next;
    onStatus?.(next);
  };

  // 새 변경이나 flush가 오면 예약된 재시도를 지우고 횟수를 처음부터 센다
  function resetRetry() {
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
    retries = 0;
  }

  async function writeOnce(): Promise<void> {
    if (pending.size === 0) return;
    const batch = new Map(pending);
    pending.clear();

    const entries: Record<string, string> = {};
    const removals: string[] = [];
    for (const [key, item] of batch) {
      if (item === REMOVE) removals.push(key);
      else entries[key] = JSON.stringify(item.value);
    }

    try {
      if (Object.keys(entries).length > 0) await storage.setItems(entries);
      for (const key of removals) await storage.removeItem(key);
      retries = 0;
      setStatus('ok');
    } catch (error) {
      for (const [key, item] of batch) {
        if (!pending.has(key)) pending.set(key, item);
      }
      onError(error);
      if (retries < retryDelaysMs.length) {
        retryTimer = setTimeout(() => {
          retryTimer = undefined;
          tail = tail.then(writeOnce);
        }, retryDelaysMs[retries++]);
      } else {
        retries = 0;
        setStatus('failed');
      }
    }
  }

  function flush(): Promise<void> {
    resetRetry();
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    tail = tail.then(writeOnce);
    return tail;
  }

  return {
    enqueue({ set, remove }) {
      for (const [key, value] of Object.entries(set)) pending.set(key, { value });
      for (const key of remove) pending.set(key, REMOVE);
      if (pending.size === 0) return;
      resetRetry();
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void flush();
      }, delayMs);
    },
    flush,
  };
}
