import { useContent } from '../../app/contentContext';
import { useRoute } from '../../app/routeContext';
import { useToday } from '../../app/todayContext';
import { ChevronRight } from '../../components/icons';
import ui from '../../components/ui.module.css';
import { buildQueue } from '../../domain/queue';
import { dueCountBySubject, overdueCount } from '../../domain/selectors';
import { HOME, STATS, clockWarning, overflowNotice } from '../messages';
import s from '../screen.module.css';
import styles from './Home.module.css';

export function Home() {
  const { state } = useContent();
  const { navigate } = useRoute();
  const { today, clockRolledBack, lastOpenedDate } = useToday();

  const totalCards = Object.values(state.cards).reduce((n, cards) => n + cards.length, 0);
  // 홈 숫자와 전체 덱 세션 카드 수를 같은 큐에서 얻는다(F7)
  const queue = buildQueue(state, today);
  const dueCount = queue.cards.length + queue.overflow;
  const overdue = overdueCount(state, today);
  const bySubject = dueCountBySubject(state, today);
  const goSubjects = () => navigate({ name: 'subjects' });

  return (
    <main className={s.screen}>
      <header className={s.header}>
        <h1 className={s.title}>{HOME.title}</h1>
      </header>

      {totalCards === 0 ? (
        <section className={s.empty}>
          <p className={s.emptyTitle}>{HOME.firstTitle}</p>
          <p className={s.emptyBody}>{HOME.firstBody}</p>
        </section>
      ) : dueCount === 0 ? (
        <section className={s.empty}>
          <p className={s.emptyTitle}>{HOME.noneTitle}</p>
          <p className={s.emptyBody}>{HOME.noneBody}</p>
        </section>
      ) : (
        <section className={styles.summary} aria-label={`${HOME.title} ${dueCount}장`}>
          <p className={styles.count}>{dueCount}장</p>
          {overdue > 0 && <p className={styles.overdue}>{HOME.overdue(overdue)}</p>}
        </section>
      )}

      {queue.overflow > 0 && <p className={styles.notice}>{overflowNotice(queue.overflow)}</p>}

      {clockRolledBack && (
        <p className={styles.warning} role="status">
          {clockWarning(lastOpenedDate)}
        </p>
      )}

      {totalCards > 0 && state.subjects.length > 0 && (
        <section aria-labelledby="home-subjects">
          <h2 id="home-subjects" className={styles.sectionTitle}>
            {HOME.subjectsTitle}
          </h2>
          <ul className={s.list}>
            {state.subjects.map((subject) => (
              <li key={subject.id} className={styles.subjectItem}>
                <button type="button" className={s.row} onClick={goSubjects}>
                  <span className={s.rowMain}>
                    <span className={s.rowTitle}>{subject.name}</span>
                  </span>
                  <span className={styles.subjectCount}>{bySubject[subject.id] ?? 0}장</span>
                  <span className={s.rowChevron}>
                    <ChevronRight />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <button type="button" className={`${s.row} ${styles.statsRow}`} onClick={() => navigate({ name: 'stats' })}>
        <span className={s.rowMain}>
          <span className={s.rowTitle}>{STATS.entry}</span>
        </span>
        <span className={s.rowChevron}>
          <ChevronRight />
        </span>
      </button>

      <div className={ui.bottomSpacer} />
      <div className={ui.bottomBar}>
        {totalCards === 0 ? (
          <button type="button" className={ui.primary} onClick={goSubjects}>
            {HOME.create}
          </button>
        ) : dueCount > 0 ? (
          <div className={styles.actions}>
            <button type="button" className={ui.secondary} onClick={goSubjects}>
              {HOME.manage}
            </button>
            <button type="button" className={ui.primary} onClick={() => navigate({ name: 'studyAll' })}>
              {HOME.start}
            </button>
          </div>
        ) : (
          <button type="button" className={ui.primary} onClick={goSubjects}>
            {HOME.manage}
          </button>
        )}
      </div>
    </main>
  );
}
