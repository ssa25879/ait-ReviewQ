import { Notification, isMinVersionSupported } from '@apps-in-toss/web-framework';
import { useCallback, useEffect, useRef, useState } from 'react';
import { metaStore } from '../app/bootstrap';
import { flags } from '../config/flags';
import type { NotificationConsent } from '../domain/model';

// 알림 동의 요청은 토스 앱 5.255.0 이상에서만 쓸 수 있다(SDK MIN_TOSS_APP_VERSION)
const MIN_NOTIFICATION_VERSION = { android: '5.255.0', ios: '5.255.0' } as const;

function canAsk(): boolean {
  return (
    flags.notificationEnabled &&
    flags.notificationTemplateCode !== null &&
    Notification.requestAgreement.isSupported() &&
    isMinVersionSupported(MIN_NOTIFICATION_VERSION)
  );
}

export type AgreementPhase = 'idle' | 'asking' | 'agreed' | 'failed';

// 알림 동의 요청과 결과 기록(학습 완료 화면·설정이 함께 쓴다). 요청은 사용자가 ask를 불렀을 때만 한다
export function useNotificationAgreement() {
  const [supported] = useState(canAsk);
  const [consent, setConsent] = useState<NotificationConsent | undefined>(() => metaStore.get()?.notification);
  const [phase, setPhase] = useState<AgreementPhase>('idle');
  const cancelRef = useRef<(() => void) | null>(null);
  const askingRef = useRef(false);

  useEffect(() => metaStore.subscribe((meta) => setConsent(meta.notification)), []);
  // 결과를 받기 전에 화면을 떠나면 콜백을 해제한다
  useEffect(() => () => cancelRef.current?.(), []);

  const ask = useCallback(() => {
    if (askingRef.current || !flags.notificationTemplateCode) return;
    askingRef.current = true;
    setPhase('asking');
    const askedAt = new Date().toISOString();
    const finish = () => {
      askingRef.current = false;
      cancelRef.current?.();
      cancelRef.current = null;
    };
    cancelRef.current = Notification.requestAgreement({
      options: { templateCode: flags.notificationTemplateCode },
      onEvent: ({ type }) => {
        finish();
        const agreed = type !== 'agreementRejected'; // newAgreement·alreadyAgreed는 동의
        const record: NotificationConsent = agreed
          ? { agreed: true, agreedAt: new Date().toISOString(), lastAskedAt: askedAt }
          : { agreed: false, lastAskedAt: askedAt };
        setPhase(agreed ? 'agreed' : 'idle');
        metaStore
          .update((meta) => ({ ...meta, notification: record }))
          .catch((error: unknown) => console.error('[reviewq] 알림 동의 기록 저장 실패', error));
      },
      onError: (error) => {
        finish();
        console.error('[reviewq] 알림 동의 요청 실패', error);
        setPhase('failed');
      },
    });
  }, []);

  return { supported, consent, phase, ask };
}
