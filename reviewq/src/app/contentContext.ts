import { type Dispatch, createContext, useContext } from 'react';
import type { ContentAction, ContentState } from '../domain/content';
import type { Backup } from '../infra/storage/backup';
import type { ExportDoc } from '../infra/storage/exportData';

export type LoadStatus = 'loading' | 'ready' | 'corrupt' | 'readFailed';

// 손상 상태에서 복구 화면이 쓰는 정보와 동작
export interface RecoveryInfo {
  corruptKeys: string[];
  backup: Backup | null; // 복구에 쓸 수 있는 백업. 과목·덱·카드가 손상되지 않았으면 null
  recover: (how: 'restore' | 'drop') => Promise<void>; // 실패하면 예외를 던진다
}

export interface ContentContextValue {
  status: LoadStatus;
  state: ContentState;
  dispatch: Dispatch<ContentAction>;
  recovery: RecoveryInfo | null; // status가 corrupt일 때만 있다
  reload: () => Promise<void>; // 저장소에서 다시 불러온다("다시 시도")
  saveFailed: boolean; // 재시도까지 모두 실패해 저장하지 못한 변경이 있다
  retrySave: () => void; // 저장하지 못한 변경을 바로 다시 저장한다
  flushSave: () => Promise<void>; // 저장 대기 중인 변경을 바로 저장한다(내보내기 전)
  // 저장 대기 변경을 버리고 앱 저장소를 모두 지운 뒤 빈 상태로 다시 불러온다. 지우지 못하면 저장소를 다시 읽고 예외를 던진다
  clearAll: () => Promise<void>;
  // 저장 대기 변경을 버리고 과목·덱·카드·판정 기록을 문서 내용으로 바꾼 뒤 다시 불러온다(백업 가져오기·데모 데이터).
  // 실패하면 저장소를 다시 읽고 예외를 던진다
  replaceAll: (doc: ExportDoc) => Promise<void>;
}

export const ContentContext = createContext<ContentContextValue | null>(null);

export function useContent(): ContentContextValue {
  const value = useContext(ContentContext);
  if (!value) throw new Error('useContent는 ContentProvider 안에서만 쓸 수 있다');
  return value;
}
