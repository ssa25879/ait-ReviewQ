import { useState } from 'react';
import { useContent } from '../../app/contentContext';
import { ConfirmDialog } from '../../components/Dialog';
import ui from '../../components/ui.module.css';
import { RECOVERY, corruptItemLabel } from '../messages';
import s from '../screen.module.css';
import styles from './Recovery.module.css';

// 손상된 데이터가 있을 때의 화면. 편집 동작은 없고, 복구 선택지만 둔다(진입 시 대화상자 없음)
export function Recovery() {
  const { recovery, reload } = useContent();
  const [confirmDrop, setConfirmDrop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!recovery) return null;

  const { corruptKeys, backup } = recovery;
  const cardCount = backup ? Object.values(backup.cards).reduce((n, cards) => n + cards.length, 0) : 0;
  // 연타·중복 실행을 막고, 실패하면 저장 값이 그대로라는 안내를 남긴다
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    setConfirmDrop(false);
    try {
      await action();
    } catch (error) {
      console.error('[reviewq] 복구 실패', error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={s.screen}>
      <header className={s.header}>
        <h1 className={s.title}>{RECOVERY.title}</h1>
        <p className={s.meta}>{RECOVERY.body(corruptKeys.length)}</p>
      </header>

      {backup && (
        <section className={s.empty}>
          <p className={s.emptyTitle}>{RECOVERY.backupTitle(backup.date)}</p>
          <p className={s.emptyBody}>
            {RECOVERY.backupBody(backup.subjects.length, backup.decks.length, cardCount)}
          </p>
        </section>
      )}

      {failed && (
        <p className={styles.error} role="alert">
          {RECOVERY.failed}
        </p>
      )}

      <button type="button" className={styles.retry} disabled={busy} onClick={() => run(reload)}>
        {RECOVERY.retry}
      </button>

      <div className={backup ? styles.tallSpacer : ui.bottomSpacer} />
      <div className={ui.bottomBar}>
        {backup ? (
          <div className={styles.actions}>
            <button type="button" className={ui.primary} disabled={busy} onClick={() => run(() => recovery.recover('restore'))}>
              {RECOVERY.restore}
            </button>
            <button type="button" className={ui.secondary} disabled={busy} onClick={() => setConfirmDrop(true)}>
              {RECOVERY.drop}
            </button>
          </div>
        ) : (
          <button type="button" className={ui.primary} disabled={busy} onClick={() => setConfirmDrop(true)}>
            {RECOVERY.drop}
          </button>
        )}
      </div>

      {confirmDrop && (
        <ConfirmDialog
          title={RECOVERY.dropTitle}
          detail={RECOVERY.dropDetail([...new Set(corruptKeys.map(corruptItemLabel))])}
          confirmLabel={RECOVERY.dropConfirm}
          onConfirm={() => run(() => recovery.recover('drop'))}
          onClose={() => setConfirmDrop(false)}
        />
      )}
    </main>
  );
}

// 저장소 읽기 자체가 실패했을 때. 데이터는 그대로이므로 다시 시도만 둔다
export function LoadFailed() {
  const { reload } = useContent();
  return (
    <main className={s.screen}>
      <header className={s.header}>
        <h1 className={s.title}>{RECOVERY.readFailedTitle}</h1>
        <p className={s.meta}>{RECOVERY.readFailedBody}</p>
      </header>
      <div className={ui.bottomSpacer} />
      <div className={ui.bottomBar}>
        <button type="button" className={ui.primary} onClick={() => void reload()}>
          {RECOVERY.retry}
        </button>
      </div>
    </main>
  );
}
