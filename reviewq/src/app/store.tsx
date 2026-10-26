import { type ReactNode, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { type ContentState, contentReducer, emptyContent } from '../domain/content';
import { diffContent } from '../infra/storage/diffContent';
import { createSaveQueue } from '../infra/storage/saveQueue';
import { appStorage, bootstrap } from './bootstrap';
import { ContentContext, type LoadStatus } from './contentContext';

const saveQueue = createSaveQueue({ storage: appStorage });

export function ContentProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(contentReducer, emptyContent);
  const [status, setStatus] = useState<LoadStatus>('loading');
  // 마지막으로 저장 큐에 반영한 상태. 로드 전·로드 실패 시 null이라 저장하지 않는다
  const savedRef = useRef<ContentState | null>(null);

  useEffect(() => {
    let active = true;
    bootstrap.then(
      ({ meta, content }) => {
        if (!active) return;
        savedRef.current = content;
        dispatch({ type: 'content/replace', state: content });
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
      },
      (error: unknown) => {
        if (!active) return;
        console.error('[reviewq] 데이터 로드 실패', error);
        setStatus('error');
      },
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const saved = savedRef.current;
    if (status !== 'ready' || saved === null || saved === state) return;
    saveQueue.enqueue(diffContent(saved, state));
    savedRef.current = state;
  }, [state, status]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') void saveQueue.flush();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, []);

  const value = useMemo(() => ({ status, state, dispatch }), [status, state]);
  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}
