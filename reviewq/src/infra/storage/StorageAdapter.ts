export interface StorageAdapter {
  // 요청한 모든 키를 포함하고, 저장되지 않은 키는 null
  getItems(keys: string[]): Promise<Record<string, string | null>>;
  // 실패하면 reject한다
  setItems(entries: Record<string, string>): Promise<void>;
  removeItem(key: string): Promise<void>;
  clearItems(): Promise<void>;
}
