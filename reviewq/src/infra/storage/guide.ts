import type { StorageAdapter } from './StorageAdapter';
import { GUIDE_KEY } from './keys';

// 최초 실행 가이드를 봤는지. 값이 있으면 본 것으로 본다(깨진 값이어도 가이드가 한 번 더 보일 뿐이라 검증하지 않는다).
// 읽기에 실패하면 안 본 것으로 본다
export async function readGuideSeen(storage: StorageAdapter): Promise<boolean> {
  try {
    const { [GUIDE_KEY]: raw } = await storage.getItems([GUIDE_KEY]);
    return raw != null;
  } catch {
    return false;
  }
}

export async function saveGuideSeen(storage: StorageAdapter): Promise<void> {
  await storage.setItems({ [GUIDE_KEY]: 'true' });
}
