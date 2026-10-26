import type { StorageAdapter } from './StorageAdapter';

// 단위 테스트용 Map 기반 어댑터
export function createMemoryStorage(): StorageAdapter {
  const map = new Map<string, string>();
  return {
    async getItems(keys) {
      return Object.fromEntries(keys.map((key) => [key, map.get(key) ?? null]));
    },
    async setItems(entries) {
      for (const [key, value] of Object.entries(entries)) {
        map.set(key, value);
      }
    },
    async removeItem(key) {
      map.delete(key);
    },
    async clearItems() {
      map.clear();
    },
  };
}
