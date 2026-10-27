import type { ContentState } from '../../domain/content';
import type { Meta } from '../../domain/model';
import type { StorageAdapter } from './StorageAdapter';
import { saveBackup } from './backup';
import { META_KEY } from './keys';
import { loadContent } from './loadContent';
import { initMeta } from './meta';

// 시작 로드 결과. 손상(형식 문제)과 저장소 호출 실패(접근 문제)를 나눈다
export type AppLoad =
  | { kind: 'ok'; meta: Meta; content: ContentState }
  | { kind: 'corrupt'; corrupt: Record<string, string>; meta: Meta | null } // 키 → 손상된 원본 문자열
  | { kind: 'readFailed'; error: unknown };

interface LoadAppDeps {
  storage: StorageAdapter;
  today: string; // 'YYYY-MM-DD'
  newId: () => string;
}

// Meta와 콘텐츠를 불러와 검사한다. 손상이 있어도 저장 값은 바꾸지 않는다
export async function loadApp({ storage, today, newId }: LoadAppDeps): Promise<AppLoad> {
  try {
    const meta = await initMeta({ storage, today, newId });
    const content = await loadContent(storage, today);
    const corrupt = { ...(meta.ok ? {} : { [META_KEY]: meta.raw }), ...(content.ok ? {} : content.corrupt) };
    if (!meta.ok || !content.ok) return { kind: 'corrupt', corrupt, meta: meta.ok ? meta.meta : null };
    // 그날 첫 정상 실행(마지막으로 연 날이 오늘 이전)에만 백업한다. 큰 백업 키를 매번 읽지 않기 위해서다.
    // 백업 키는 카드 수에 비례해 커서, 홈이 늦게 열리지 않도록 저장을 기다리지 않는다
    if (meta.meta.lastOpenedDate < today) {
      saveBackup(storage, content.content, today).catch((error: unknown) => {
        console.error('[reviewq] 백업 저장 실패', error); // 다음 날 다시 시도된다
      });
    }
    return { kind: 'ok', meta: meta.meta, content: content.content };
  } catch (error) {
    return { kind: 'readFailed', error };
  }
}
