import { createContext, useContext } from 'react';
import type { Route } from './router';

export interface RouteContextValue {
  route: Route;
  navigate: (route: Route) => void; // 히스토리에 쌓는다
  replace: (route: Route) => void; // 현재 항목을 바꾼다
  back: () => void; // 히스토리를 한 단계 되돌린다(뒤로가기와 같음)
}

export const RouteContext = createContext<RouteContextValue | null>(null);

export function useRoute(): RouteContextValue {
  const value = useContext(RouteContext);
  if (!value) throw new Error('useRoute는 RouterProvider 안에서만 쓸 수 있다');
  return value;
}
