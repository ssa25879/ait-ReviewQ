import { useRef, useState } from 'react';
import { useContent } from '../../app/contentContext';
import { useRoute } from '../../app/routeContext';
import { sampleDeckActions } from '../../app/sampleDeck';
import { ChevronRight } from '../../components/icons';
import ui from '../../components/ui.module.css';
import { INTERVALS } from '../../domain/scheduler/fixedInterval';
import { GUIDE } from '../messages';
import s from '../screen.module.css';
import styles from './Guide.module.css';

// 최초 실행·설정에서 다시 보기 공용 가이드(전체 화면 3장). 처음 실행은 [홈, 가이드], 다시 보기는 [홈, 설정, 가이드]로
// 열리므로 끝낼 때 back()이 가이드를 연 화면으로 돌아간다
export function Guide() {
  const { state, dispatch, markGuideSeen } = useContent();
  const { back, replace } = useRoute();
  const [page, setPage] = useState(0);
  const doneRef = useRef(false);
  const total = GUIDE.pages.length;
  const last = page === total - 1;
  const hasCards = Object.values(state.cards).some((cards) => cards.length > 0);

  // 끝내기 동작은 한 번만 실행한다(연타·중복 이동 방지)
  const finish = (then: () => void) => {
    if (doneRef.current) return;
    doneRef.current = true;
    markGuideSeen();
    then();
  };
  const startWithSample = () =>
    finish(() => {
      for (const action of sampleDeckActions()) dispatch(action);
      back();
    });

  const { title, body } = GUIDE.pages[page];
  return (
    <main className={s.screen}>
      <div className={styles.top}>
        <span className={styles.progress}>{GUIDE.progress(page + 1, total)}</span>
        {!last && (
          <button type="button" className={styles.skip} onClick={() => finish(back)}>
            {GUIDE.skip}
          </button>
        )}
      </div>

      <section className={styles.illustration} aria-hidden="true">
        {page === 0 && <CardExample />}
        {page === 1 && <TodayExample />}
        {page === 2 && <IntervalExample />}
      </section>

      <header className={styles.copy}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.body}>{body}</p>
      </header>

      <div className={ui.bottomSpacer} />
      <div className={ui.bottomBar}>
        {!last ? (
          <button type="button" className={ui.primary} onClick={() => setPage(page + 1)}>
            {GUIDE.next}
          </button>
        ) : hasCards ? (
          <button type="button" className={ui.primary} onClick={() => finish(back)}>
            {GUIDE.done}
          </button>
        ) : (
          <div className={styles.actions}>
            <button type="button" className={ui.secondary} onClick={() => finish(() => replace({ name: 'subjects' }))}>
              {GUIDE.create}
            </button>
            <button type="button" className={ui.primary} onClick={startWithSample}>
              {GUIDE.sample}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}

function CardExample() {
  return (
    <div className={styles.card}>
      <span className={styles.cardLabel}>{GUIDE.exampleQuestion}</span>
      <span className={styles.cardText}>apple</span>
      <span className={styles.cardDivider} />
      <span className={styles.cardLabel}>{GUIDE.exampleAnswer}</span>
      <span className={styles.cardText}>사과</span>
    </div>
  );
}

function TodayExample() {
  return (
    <div className={styles.card}>
      <span className={styles.cardLabel}>{GUIDE.exampleToday}</span>
      <span className={styles.bigNumber}>12장</span>
      <span className={styles.cardSub}>{GUIDE.exampleSubjects}</span>
    </div>
  );
}

function IntervalExample() {
  return (
    <div className={styles.card}>
      <span className={styles.cardLabel}>{GUIDE.intervalsCaption}</span>
      <span className={styles.chips}>
        {INTERVALS.map((days, i) => (
          <span key={days} className={styles.chipGroup}>
            {i > 0 && (
              <span className={styles.chipArrow}>
                <ChevronRight />
              </span>
            )}
            <span className={styles.chip}>{days}일</span>
          </span>
        ))}
      </span>
      <span className={styles.cardSub}>{GUIDE.resetCaption}</span>
    </div>
  );
}
