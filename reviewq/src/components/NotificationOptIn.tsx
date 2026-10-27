import { Notification, isMinVersionSupported } from '@apps-in-toss/web-framework';
import { useEffect, useRef, useState } from 'react';
import { metaStore } from '../app/bootstrap';
import { flags } from '../config/flags';
import type { NotificationConsent } from '../domain/model';
import { NOTIFY } from '../screens/messages';
import ui from './ui.module.css';
import styles from './NotificationOptIn.module.css';

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

type Phase = 'idle' | 'asking' | 'agreed' | 'failed';

// 학습 완료 화면의 "복습 알림 받기"(보조 버튼). 동의 기록이 없을 때만 보이고, 응답한 뒤에는 다시 묻지 않는다
export function NotificationOptIn() {
  const [supported] = useState(canAsk);
  const [consent, setConsent] = useState<NotificationConsent | undefined>(() => metaStore.get()?.notification);
  const [phase, setPhase] = useState<Phase>('idle');
  const cancelRef = useRef<(() => void) | null>(null);

  useEffect(() => metaStore.subscribe((meta) => setConsent(meta.notification)), []);
  // 결과를 받기 전에 화면을 떠나면 콜백을 해제한다
  useEffect(() => () => cancelRef.current?.(), []);

  if (!supported) return null;
  if (phase === 'agreed') return <p className={styles.notice}>{NOTIFY.agreed}</p>;
  if (consent !== undefined) return null;

  const ask = () => {
    if (phase === 'asking' || !flags.notificationTemplateCode) return;
    setPhase('asking');
    const askedAt = new Date().toISOString();
    const finish = () => {
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
  };

  return (
    <div className={styles.optIn}>
      <button type="button" className={ui.secondary} disabled={phase === 'asking'} onClick={ask}>
        {NOTIFY.ask}
      </button>
      {phase === 'failed' && (
        <p className={styles.error} role="alert">
          {NOTIFY.failed}
        </p>
      )}
    </div>
  );
}
