import { type ReactNode, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { type ContentAction, type ContentState, contentReducer, emptyContent } from '../domain/content';
import { diffContent } from '../infra/storage/diffContent';
import type { ExportDoc } from '../infra/storage/exportData';
import { importBackup } from '../infra/storage/importData';
import { SCHEMA_VERSION } from '../infra/storage/meta';
import { canRestoreFromBackup } from '../infra/storage/recovery';
import { todayLocal } from '../utils/date';
import { type SaveStatus, createSaveQueue } from '../infra/storage/saveQueue';
import { type AppStart, appStorage, metaStore, recover, reloadApp, subscribeAppStart } from './bootstrap';
import { ContentContext, type LoadStatus, type RecoveryInfo } from './contentContext';

// 재시도까지 모두 실패했는지를 Provider가 받아 화면에 알린다
let onSaveStatus: (status: SaveStatus) => void = () => {};
const saveQueue = createSaveQueue({ storage: appStorage, onStatus: (status) => onSaveStatus(status) });
const retrySave = () => void saveQueue.flush();
const flushSave = () => saveQueue.flush();

export function ContentProvider({ children }: { children: ReactNode }) {
  const [state, rawDispatch] = useReducer(contentReducer, emptyContent);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [saveFailed, setSaveFailed] = useState(false);
  const [corrupt, setCorrupt] = useState<Extract<AppStart, { kind: 'corrupt' }> | null>(null);
  // 마지막으로 저장 큐에 반영한 상태. 로드 전·로드 실패 시 null이라 저장하지 않는다
  const savedRef = useRef<ContentState | null>(null);
  // 판정이 디스패치되면 다음 저장 반영 때 지연 없이 바로 저장한다(D-01)
  const flushRef = useRef(false);
  const dispatch = useCallback((action: ContentAction) => {
    if (action.type === 'card/review') flushRef.current = true;
    rawDispatch(action);
  }, []);

  useEffect(
    () =>
      subscribeAppStart((start) => {
        if (start.kind !== 'ok') {
          // 손상·읽기 실패에서는 저장하지 않는다(손상 원본을 덮어쓰지 않도록)
          savedRef.current = null;
          setCorrupt(start.kind === 'corrupt' ? start : null);
          setStatus(start.kind);
          if (start.kind === 'readFailed') console.error('[reviewq] 데이터 로드 실패', start.error);
          return;
        }
        const { meta, content } = start;
        savedRef.current = content;
        rawDispatch({ type: 'content/replace', state: content });
        setCorrupt(null);
        setStatus('ready');
        if (import.meta.env.DEV) {
          const cardCount = Object.values(content.cards).reduce((n, cards) => n + cards.length, 0);
          console.info('[reviewq] loaded', {
            installId: meta.installId,
            subjects: content.subjects.length,
            decks: content.decks.length,
            cards: cardCount,
          });
        }
      }),
    [],
  );

  const reload = useCallback(async () => {
    setStatus('loading');
    await reloadApp();
  }, []);

  const clearAll = useCallback(async () => {
    // 지우는 동안 상태가 바뀌어도 저장 큐에 다시 넣지 않는다(다시 불러오면 새 상태로 채워진다)
    savedRef.current = null;
    await saveQueue.discard();
    try {
      await appStorage.clearItems();
    } catch (error) {
      await reloadApp(); // 저장소의 실제 상태로 맞춘다
      throw error;
    }
    await reloadApp();
  }, []);

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const replaceAll = useCallback(async (doc: ExportDoc) => {
    const current = stateRef.current; // 저장 대기 변경까지 담긴 지금 상태를 보관한다
    savedRef.current = null;
    await saveQueue.discard();
    try {
      await importBackup({
        storage: appStorage,
        doc,
        current,
        schemaVersion: metaStore.get()?.schemaVersion ?? SCHEMA_VERSION,
        today: todayLocal(),
      });
    } catch (error) {
      await reloadApp(); // 저장소의 실제 상태로 맞춘다
      throw error;
    }
    await reloadApp();
  }, []);

  const recovery = useMemo<RecoveryInfo | null>(
    () =>
      corrupt && {
        corruptKeys: Object.keys(corrupt.corrupt),
        backup: canRestoreFromBackup(Object.keys(corrupt.corrupt), corrupt.backup) ? corrupt.backup : null,
        recover: (how) => recover(corrupt, how),
      },
    [corrupt],
  );

  useEffect(() => {
    const saved = savedRef.current;
    const flushNow = flushRef.current;
    flushRef.current = false;
    if (status !== 'ready' || saved === null || saved === state) return;
    saveQueue.enqueue(diffContent(saved, state));
    savedRef.current = state;
    if (flushNow) void saveQueue.flush();
  }, [state, status]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void saveQueue.flush();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  useEffect(() => {
    onSaveStatus = (status) => setSaveFailed(status === 'failed');
    return () => {
      onSaveStatus = () => {};
    };
  }, []);

  const value = useMemo(
    () => ({ status, state, dispatch, recovery, reload, saveFailed, retrySave, flushSave, clearAll, replaceAll }),
    [status, state, dispatch, recovery, reload, saveFailed, clearAll, replaceAll],
  );
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}
