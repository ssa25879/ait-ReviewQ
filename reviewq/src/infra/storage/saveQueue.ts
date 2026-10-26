import type { ContentChanges } from './diffContent';
import type { StorageAdapter } from './StorageAdapter';

export const SAVE_DELAY_MS = 400;

const REMOVE = Symbol('remove');
type Pending = { value: unknown } | typeof REMOVE;

interface SaveQueueOptions {
  storage: StorageAdapter;
  delayMs?: number;
  onError?: (error: unknown) => void;
}

export interface SaveQueue {
  enqueue(changes: ContentChanges): void;
  // 대기 중인 타이머를 취소하고 즉시 저장한다. 실행 중인 저장이 있으면 끝난 뒤 실행한다
  flush(): Promise<void>;
}

// 키별 마지막 값만 보관했다가 디바운스 후 한 번에 저장한다.
// 실패하면 그 사이 새 값으로 덮이지 않은 항목을 되돌려 다음 저장 때 함께 쓴다(재시도·안내는 Day 5)
export function createSaveQueue({
  storage,
  delayMs = SAVE_DELAY_MS,
  onError = (error) => console.error('[reviewq] 저장 실패', error),
}: SaveQueueOptions): SaveQueue {
  const pending = new Map<string, Pending>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let tail: Promise<void> = Promise.resolve();

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
    } catch (error) {
      for (const [key, item] of batch) {
        if (!pending.has(key)) pending.set(key, item);
      }
      onError(error);
    }
  }

  function flush(): Promise<void> {
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
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void flush();
      }, delayMs);
    },
    flush,
  };
}
