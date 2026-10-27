import type { Meta } from '../domain/model';
import type { StorageAdapter } from '../infra/storage/StorageAdapter';
import { META_KEY } from '../infra/storage/keys';

export interface MetaStore {
  get(): Meta | null; // 로드 전·로드 실패 시 null
  reset(meta: Meta): void; // 시작 로드 결과로 현재 Meta를 정한다(저장하지 않는다)
  // 변경을 순서대로 적용해 bq:meta에 저장한다. 앞선 변경이 반영된 최신 값에 fn을 적용하므로
  // 마지막으로 연 날 갱신과 알림 동의 기록이 서로를 덮어쓰지 않는다
  update(fn: (meta: Meta) => Meta): Promise<Meta>;
  subscribe(listener: (meta: Meta) => void): () => void;
}

// bq:meta를 쓰는 유일한 곳. 저장이 실패해도 메모리 값은 유지되어 다음 저장 때 함께 저장된다
export function createMetaStore(storage: StorageAdapter): MetaStore {
  let current: Meta | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  const listeners = new Set<(meta: Meta) => void>();
  const notify = (meta: Meta) => listeners.forEach((listener) => listener(meta));

  return {
    get: () => current,
    reset(meta) {
      current = meta;
      notify(meta);
    },
    update(fn) {
      const run = async (): Promise<Meta> => {
        if (!current) throw new Error('Meta가 아직 로드되지 않았다');
        const next = fn(current);
        if (next === current) return current;
        current = next;
        notify(next);
        await storage.setItems({ [META_KEY]: JSON.stringify(next) });
        return next;
      };
      const result = tail.then(run, run);
      tail = result.catch(() => {}); // 앞선 저장이 실패해도 다음 변경은 진행한다
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
