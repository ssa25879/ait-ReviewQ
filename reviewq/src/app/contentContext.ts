import { type Dispatch, createContext, useContext } from 'react';
import type { ContentAction, ContentState } from '../domain/content';

export type LoadStatus = 'loading' | 'ready' | 'error';

export interface ContentContextValue {
  status: LoadStatus;
  state: ContentState;
  dispatch: Dispatch<ContentAction>;
}

export const ContentContext = createContext<ContentContextValue | null>(null);

export function useContent(): ContentContextValue {
  const value = useContext(ContentContext);
  if (!value) throw new Error('useContent는 ContentProvider 안에서만 쓸 수 있다');
  return value;
}
