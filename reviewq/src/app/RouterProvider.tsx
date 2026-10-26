import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { type Route, formatRoute, parseRoute, seedRoutes } from './router';
import { RouteContext } from './routeContext';

// 이 앱이 쌓은 히스토리 항목 표시. 새로고침으로 다시 열려도 상위 화면을 중복으로 채우지 않기 위함
const ENTRY = { reviewq: true };

// 하위 화면으로 바로 열렸으면 상위 화면을 히스토리에 먼저 채워, 뒤로가기가 곧바로 종료가 되지 않게 한다
function initHistory(): Route {
  const route = parseRoute(window.location.hash);
  if (!(window.history.state as typeof ENTRY | null)?.reviewq) {
    const chain = [...seedRoutes(route), route];
    window.history.replaceState(ENTRY, '', formatRoute(chain[0]));
    for (const r of chain.slice(1)) window.history.pushState(ENTRY, '', formatRoute(r));
  }
  return route;
}

const initialRoute = initHistory();

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(initialRoute);
  const routeRef = useRef(route);
  const leaveGuardRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    routeRef.current = route;
  });

  useEffect(() => {
    const onPopState = () => {
      const guard = leaveGuardRef.current;
      if (guard) {
        // 이미 한 단계 되돌아간 히스토리에 현재 화면을 다시 넣어 머문다
        window.history.pushState(ENTRY, '', formatRoute(routeRef.current));
        guard();
        return;
      }
      setRoute(parseRoute(window.location.hash));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const value = useMemo(
    () => ({
      route,
      navigate(next: Route) {
        window.history.pushState(ENTRY, '', formatRoute(next));
        setRoute(next);
      },
      replace(next: Route) {
        window.history.replaceState(ENTRY, '', formatRoute(next));
        setRoute(next);
      },
      back() {
        window.history.back();
      },
      setLeaveGuard(guard: (() => void) | null) {
        leaveGuardRef.current = guard;
      },
    }),
    [route],
  );

  return <RouteContext.Provider value={value}>{children}</RouteContext.Provider>;
}
