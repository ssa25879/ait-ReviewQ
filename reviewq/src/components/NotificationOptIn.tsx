import { NOTIFY } from '../screens/messages';
import ui from './ui.module.css';
import styles from './NotificationOptIn.module.css';
import { useNotificationAgreement } from './useNotificationAgreement';

// 학습 완료 화면의 "복습 알림 받기"(보조 버튼). 동의 기록이 없을 때만 보이고, 응답한 뒤에는 다시 묻지 않는다
// (다시 요청은 설정의 '복습 알림'에서만 한다)
export function NotificationOptIn() {
  const { supported, consent, phase, ask } = useNotificationAgreement();

  if (!supported) return null;
  if (phase === 'agreed') return <p className={styles.notice}>{NOTIFY.agreed}</p>;
  if (consent !== undefined) return null;

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
