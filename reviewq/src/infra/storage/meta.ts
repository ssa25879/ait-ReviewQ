import type { Meta } from '../../domain/model';
import type { StorageAdapter } from './StorageAdapter';
import { META_KEY } from './keys';

export const SCHEMA_VERSION = 1;

interface InitMetaDeps {
  storage: StorageAdapter;
  today: string; // 'YYYY-MM-DD'
  newId: () => string;
}

// bq:meta가 있으면 그대로 불러오고, 없으면 새로 만들어 저장한다.
// 저장된 값이 손상되었으면 덮어쓰지 않고 오류를 던진다(복구는 Day 5).
export async function initMeta({ storage, today, newId }: InitMetaDeps): Promise<Meta> {
  const { [META_KEY]: raw } = await storage.getItems([META_KEY]);
  if (raw != null) {
    try {
      return JSON.parse(raw) as Meta;
    } catch (cause) {
      throw new Error(`${META_KEY} 파싱 실패`, { cause });
    }
  }
  const meta: Meta = { schemaVersion: SCHEMA_VERSION, lastOpenedDate: today, installId: newId() };
  await storage.setItems({ [META_KEY]: JSON.stringify(meta) });
  return meta;
}
