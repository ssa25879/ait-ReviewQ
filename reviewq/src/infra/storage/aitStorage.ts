import type { StorageAdapter } from './StorageAdapter';

// @apps-in-toss/web-framework의 Storage 중 이 어댑터가 쓰는 부분(테스트에서 가짜 객체를 주입하기 위함)
export interface SdkStorage {
  getItem(key: string): Promise<string | null>;
  getItems: ((keys: string[]) => Promise<{ [key: string]: string | null }>) & {
    isSupported: () => boolean;
  };
  setItem(key: string, value: string): Promise<void>;
  setItems: ((items: Record<string, string>) => Promise<void>) & {
    isSupported: () => boolean;
  };
  removeItem(key: string): Promise<void>;
  clearItems(): Promise<void>;
}

// getItems·setItems는 토스 앱 5.270.0 이상에서만 지원되므로, 미지원이면 단건 API로 대체한다
export function createAitStorage(sdk: SdkStorage): StorageAdapter {
  return {
    async getItems(keys) {
      if (sdk.getItems.isSupported()) {
        const result = await sdk.getItems(keys);
        return Object.fromEntries(keys.map((key) => [key, result[key] ?? null]));
      }
      const values = await Promise.all(keys.map((key) => sdk.getItem(key)));
      return Object.fromEntries(keys.map((key, i) => [key, values[i] ?? null]));
    },
    async setItems(entries) {
      if (sdk.setItems.isSupported()) {
        await sdk.setItems(entries);
        return;
      }
      await Promise.all(Object.entries(entries).map(([key, value]) => sdk.setItem(key, value)));
    },
    async removeItem(key) {
      await sdk.removeItem(key);
    },
    async clearItems() {
      await sdk.clearItems();
    },
  };
}
