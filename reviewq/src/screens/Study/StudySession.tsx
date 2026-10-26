import { graniteEvent, setIosSwipeGestureEnabled } from '@apps-in-toss/web-framework';
import { useEffect, useRef, useState } from 'react';
import { actions } from '../../app/actions';
import { useContent } from '../../app/contentContext';
import { useRoute } from '../../app/routeContext';
import { ConfirmDialog } from '../../components/Dialog';
import ui from '../../components/ui.module.css';
import { buildQueue } from '../../domain/queue';
import type { Grade } from '../../domain/scheduler/types';
import {
  type SessionState,
  currentItem,
  flip,
  isFinished,
  judge,
  progress,
  startSession,
  summarize,
} from '../../domain/session';
import { todayLocal } from '../../utils/date';
import { STUDY, progressLabel, rememberedPercent } from '../messages';
import s from '../screen.module.css';
import styles from './StudySession.module.css';

export function StudySession({ deckId }: { deckId: string }) {
  const { state } = useContent();
  const deck = state.decks.find((d) => d.id === deckId);
  if (!deck) return null; // 없는 덱 경로는 App이 목록으로 바꾼다
  return <SessionView deckId={deckId} deckName={deck.name} />;
}

function SessionView({ deckId, deckName }: { deckId: string; deckName: string }) {
  const { state, dispatch } = useContent();
  const { back, setLeaveGuard } = useRoute();
  // 마운트 때 날짜·큐를 한 번 정한다. 세션 중 콘텐츠가 바뀌어도 큐를 다시 만들지 않는다
  const [session, setSession] = useState<SessionState>(() => {
    const today = todayLocal();
    return startSession(buildQueue(state, today, { deckId }).cards, today);
  });
  const [confirmQuit, setConfirmQuit] = useState(false);
  // 같은 프레임의 두 번째 탭은 이전 세션을 클로저로 보므로 상태가 아니라 ref로 막는다
  const lockedRef = useRef(false);
  const releaseRef = useRef<(() => void) | null>(null);
  const leavingRef = useRef(false);
  const cardRef = useRef<HTMLButtonElement>(null);
  const doneTitleRef = useRef<HTMLHeadingElement>(null);
  const finished = isFinished(session);

  useEffect(() => {
    lockedRef.current = false;
    // 누른 판정 버튼이 비활성이 되거나 사라지므로 다음 카드(또는 완료 제목)로 포커스를 옮긴다
    if (session.index > 0) (finished ? doneTitleRef : cardRef).current?.focus();
  }, [session.index, finished]);

  // 판정할 카드가 남아 있을 때만 뒤로가기를 확인으로 바꾼다
  const active = session.order.length > 0 && !finished;
  useEffect(() => {
    if (!active) return;
    // 확인이 열린 채 뒤로가기를 다시 누르면 확인을 닫는다
    const toggle = () => setConfirmQuit((open) => !open);
    setLeaveGuard(toggle);
    const unsubscribe = graniteEvent.addEventListener('backEvent', { onEvent: toggle });
    // iOS 스와이프 뒤로가기는 backEvent로 오지 않아 세션 중에는 끈다. 거부돼도 popstate 가드가 남는다
    setIosSwipeGestureEnabled({ isEnabled: false }).catch(() => {});
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      setLeaveGuard(null);
      unsubscribe();
      setIosSwipeGestureEnabled({ isEnabled: true }).catch(() => {});
    };
    releaseRef.current = release;
    return release;
  }, [active, setLeaveGuard]);

  // 연타로 back()이 두 번 불려 화면을 두 단계 건너뛰지 않도록 한 번만 떠난다
  const leave = () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    releaseRef.current?.();
    back();
  };

  const onJudge = (grade: Grade) => {
    if (lockedRef.current || !session.flipped) return;
    lockedRef.current = true;
    const result = judge(session, grade);
    if (result.apply) {
      const { cardId, deckId: applyDeckId, grade: applyGrade, date } = result.apply;
      dispatch(actions.reviewCard(cardId, applyDeckId, applyGrade, date));
    }
    setSession(result.session);
  };

  if (session.order.length === 0) {
    return (
      <main className={s.screen}>
        <header className={s.header}>
          <h1 className={s.title}>{deckName}</h1>
        </header>
        <section className={s.empty}>
          <p className={s.emptyTitle}>{STUDY.emptyTitle}</p>
          <p className={s.emptyBody}>{STUDY.emptyBody}</p>
        </section>
        <div className={ui.bottomSpacer} />
        <div className={ui.bottomBar}>
          <button type="button" className={ui.primary} onClick={leave}>
            {STUDY.backToDeck}
          </button>
        </div>
      </main>
    );
  }

  if (finished) {
    const summary = summarize(session, state);
    return (
      <main className={s.screen}>
        <header className={s.header}>
          <h1 ref={doneTitleRef} className={s.title} tabIndex={-1}>
            {STUDY.doneTitle}
          </h1>
          <p className={s.meta}>{deckName}</p>
        </header>
        <dl className={styles.summary}>
          <div className={styles.stat}>
            <dt>완료</dt>
            <dd>{summary.completed}장</dd>
          </div>
          <div className={styles.stat}>
            <dt>기억함</dt>
            <dd>{rememberedPercent(summary.remembered, summary.completed)}%</dd>
          </div>
          <div className={styles.stat}>
            <dt>내일 예정</dt>
            <dd>{summary.dueTomorrow}장</dd>
          </div>
        </dl>
        <div className={ui.bottomSpacer} />
        <div className={ui.bottomBar}>
          <button type="button" className={ui.primary} onClick={leave}>
            {STUDY.backToDeck}
          </button>
        </div>
      </main>
    );
  }

  const item = currentItem(session);
  const card = item ? state.cards[item.deckId]?.find((c) => c.id === item.cardId) : undefined;
  const { current, total } = progress(session);

  return (
    <main className={s.screen}>
      <header className={s.header}>
        <h1 className={s.title}>{deckName}</h1>
        <p className={s.meta} aria-label={progressLabel(current, total)}>
          {current} / {total}
        </p>
      </header>

      <button
        ref={cardRef}
        type="button"
        className={styles.card}
        aria-expanded={session.flipped}
        onClick={() => setSession(flip)}
      >
        <span className={styles.label}>질문</span>
        <span className={styles.text}>{card?.question}</span>
        {session.flipped ? (
          <>
            <span className={styles.divider} />
            <span className={styles.label}>정답</span>
            <span className={styles.text}>{card?.answer}</span>
          </>
        ) : (
          <span className={styles.hint}>{STUDY.flipHint}</span>
        )}
      </button>
      {/* 뒤집어 나타난 정답을 스크린리더에 알린다 */}
      <p className={styles.srOnly} aria-live="polite">
        {session.flipped ? `정답 ${card?.answer ?? ''}` : ''}
      </p>

      <div className={ui.bottomSpacer} />
      <div className={ui.bottomBar}>
        <div className={styles.actions}>
          <button type="button" className={ui.secondary} disabled={!session.flipped} onClick={() => onJudge('forget')}>
            {STUDY.forget}
          </button>
          <button type="button" className={ui.primary} disabled={!session.flipped} onClick={() => onJudge('remember')}>
            {STUDY.remember}
          </button>
        </div>
      </div>

      {confirmQuit && (
        <ConfirmDialog
          title={STUDY.quitTitle}
          detail={STUDY.quitDetail}
          confirmLabel={STUDY.quitConfirm}
          onConfirm={leave}
          onClose={() => setConfirmQuit(false)}
        />
      )}
    </main>
  );
}
