import { describe, expect, it } from 'vitest';
import type { StorageAdapter } from './StorageAdapter';

// 어댑터 구현이 공통으로 지켜야 할 계약 테스트(테스트 파일에서만 import한다)
export function describeStorageContract(name: string, create: () => StorageAdapter): void {
  describe(`${name}: StorageAdapter 계약`, () => {
    it('일부 키만 저장된 상태에서 조회하면 없는 키는 null이다', async () => {
      const storage = create();
      await storage.setItems({ 'bq:meta': '{"a":1}' });
      expect(await storage.getItems(['bq:meta', 'bq:subjects'])).toEqual({
        'bq:meta': '{"a":1}',
        'bq:subjects': null,
      });
    });

    it('여러 키를 저장한 뒤 재조회하면 그대로 돌아온다', async () => {
      const storage = create();
      await storage.setItems({ 'bq:subjects': '[1]', 'bq:decks': '[2]' });
      expect(await storage.getItems(['bq:subjects', 'bq:decks'])).toEqual({
        'bq:subjects': '[1]',
        'bq:decks': '[2]',
      });
    });

    it('단일 키를 삭제하면 null이다', async () => {
      const storage = create();
      await storage.setItems({ 'bq:subjects': '[1]', 'bq:decks': '[2]' });
      await storage.removeItem('bq:decks');
      expect(await storage.getItems(['bq:subjects', 'bq:decks'])).toEqual({
        'bq:subjects': '[1]',
        'bq:decks': null,
      });
    });

    it('전체 삭제하면 모든 키가 null이다', async () => {
      const storage = create();
      await storage.setItems({ 'bq:meta': '{}', 'bq:subjects': '[]', 'bq:decks': '[]' });
      await storage.clearItems();
      expect(await storage.getItems(['bq:meta', 'bq:subjects', 'bq:decks'])).toEqual({
        'bq:meta': null,
        'bq:subjects': null,
        'bq:decks': null,
      });
    });
  });
}
