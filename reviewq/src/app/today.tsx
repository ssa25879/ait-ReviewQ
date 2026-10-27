import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { checkClock } from '../domain/clock';
import type { Meta } from '../domain/model';
import { recordOpened } from '../infra/storage/meta';
import { todayLocal } from '../utils/date';
import { appStorage, subscribeAppStart } from './bootstrap';
import { useRoute } from './routeContext';
import { TodayContext, type TodayValue } from './todayContext';

const sameValue = (a: TodayValue, b: TodayValue) =>
  a.today === b.today && a.clockRolledBack === b.clockRolledBack && a.lastOpenedDate === b.lastOpenedDate;

// 화면이 기준으로 삼는 "오늘"을 한 곳에서 관리한다. 앱이 다시 보이거나 화면을 이동하면 날짜와 시계 판정을 다시 한다
// (WebView에서 visibilitychange가 오지 않아도 화면 이동 때는 갱신된다).
// 학습 세션은 마운트 때 todayLocal()을 직접 써서 세션 날짜를 고정하므로 이 값을 쓰지 않는다
export function TodayProvider({ children }: { children: ReactNode }) {
  const { route } = useRoute();
  const [value, setValue] = useState<TodayValue>(() => {
    const today = todayLocal();
    return { today, clockRolledBack: false, lastOpenedDate: today };
  });
  // 저장된 Meta. 로드 전·로드 실패 시 null이라 시계 판정·저장을 하지 않는다
  const metaRef = useRef<Meta | null>(null);
  const activeRef = useRef(true);

  const update = useCallback((next: TodayValue) => {
    if (activeRef.current) setValue((prev) => (sameValue(prev, next) ? prev : next));
  }, []);

  // 오늘을 다시 구해 판정한다. 마지막으로 연 날이 바뀐 경우에만 저장된다
  const refresh = useCallback(async () => {
    const today = todayLocal();
    const meta = metaRef.current;
    if (!meta) {
      update({ today, clockRolledBack: false, lastOpenedDate: today });
      return;
    }
    try {
      const result = await recordOpened(appStorage, meta, today);
      metaRef.current = result.meta;
      update({ today, clockRolledBack: result.clock.rolledBack, lastOpenedDate: result.clock.lastOpenedDate });
    } catch (error) {
      // 저장에 실패해도 화면은 새 날짜로 갱신한다. 다음 판정 때 다시 시도된다
      console.error('[reviewq] lastOpenedDate 저장 실패', error);
      const clock = checkClock(meta.lastOpenedDate, today);
      update({ today, clockRolledBack: clock.rolledBack, lastOpenedDate: meta.lastOpenedDate });
    }
  }, [update]);

  useEffect(() => {
    activeRef.current = true;
    // 복구 후 다시 불러온 결과도 받는다
    const unsubscribe = subscribeAppStart((start) => {
      if (start.kind !== 'ok') return; // 로드 실패는 ContentProvider가 알린다
      metaRef.current = start.meta;
      update({ today: start.today, clockRolledBack: start.clock.rolledBack, lastOpenedDate: start.clock.lastOpenedDate });
    });

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      activeRef.current = false;
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [update, refresh]);

  // 화면 이동 때 다시 판정한다(첫 렌더에서는 Meta 로드 전이라 값이 그대로다)
  useEffect(() => {
    void refresh();
  }, [route, refresh]);

  return <TodayContext.Provider value={value}>{children}</TodayContext.Provider>;
}
