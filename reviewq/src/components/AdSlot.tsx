import { TossAds, isMinVersionSupported } from '@apps-in-toss/web-framework';
import { useEffect, useRef, useState } from 'react';
import { flags } from '../config/flags';
import styles from './AdSlot.module.css';

// 배너 API는 토스 앱 5.241.0 이상에서만 쓸 수 있고, 미만에서는 빈 화면이 생길 수 있다(공식 문서)
const MIN_BANNER_VERSION = { android: '5.241.0', ios: '5.241.0' } as const;

// 앱 실행 중 한 번만 초기화한다. 실패하면 배너를 붙이지 않는다
let initialized: Promise<boolean> | null = null;
function ensureAdsInitialized(): Promise<boolean> {
  initialized ??= new Promise((resolve) => {
    try {
      TossAds.initialize({
        callbacks: {
          onInitialized: () => resolve(true),
          onInitializationFailed: (error) => {
            console.error('[reviewq] 광고 초기화 실패', error);
            resolve(false);
          },
        },
      });
    } catch (error) {
      console.error('[reviewq] 광고 초기화 실패', error);
      resolve(false);
    }
  });
  return initialized;
}

function bannerSupported(): boolean {
  return flags.adsEnabled && TossAds.attachBanner.isSupported() && isMinVersionSupported(MIN_BANNER_VERSION);
}

// 개발 빌드에서만 콜백을 기록한다(이벤트를 바꾸거나 다시 요청하지 않는다)
const log = (name: string) => (payload: unknown) => {
  if (import.meta.env.DEV) console.info(`[reviewq] ad ${name}`, payload);
};

// 배너 광고 영역. 플래그가 꺼져 있거나 지원하지 않으면 아무것도 그리지 않는다.
// 광고가 없거나 렌더에 실패하면 영역을 접는다. 화면을 떠나면 배너를 해제하고, 다시 붙이거나 새로 고치지 않는다
export function AdSlot({ adGroupId, placement }: { adGroupId: string; placement: string }) {
  const [supported] = useState(bannerSupported);
  const [hidden, setHidden] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    let banner: { destroy: () => void } | null = null;
    const collapse = () => {
      banner?.destroy();
      banner = null;
      setHidden(true);
    };
    void ensureAdsInitialized().then((ok) => {
      if (cancelled) return;
      if (!ok || !ref.current) {
        setHidden(true);
        return;
      }
      banner = TossAds.attachBanner(adGroupId, ref.current, {
        callbacks: {
          onAdRendered: log('rendered'),
          onAdViewable: log('viewable'),
          onAdImpression: log('impression'),
          onAdClicked: log('clicked'),
          onNoFill: (payload) => {
            log('noFill')(payload);
            collapse();
          },
          onAdFailedToRender: (payload) => {
            log('failedToRender')(payload);
            collapse();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      banner?.destroy();
    };
  }, [supported, adGroupId]);

  if (!supported || hidden) return null;
  return <div ref={ref} className={styles.slot} data-ad-slot={placement} />;
}
