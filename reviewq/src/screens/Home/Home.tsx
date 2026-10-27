import { type ReactNode, useRef } from 'react';
import { useContent } from '../../app/contentContext';
import type { Route } from '../../app/router';
import { useRoute } from '../../app/routeContext';
import { sampleDeckActions } from '../../app/sampleDeck';
import { useToday } from '../../app/todayContext';
import { BookIcon, ChartIcon, ChevronRight, GearIcon } from '../../components/icons';
import ui from '../../components/ui.module.css';
import { buildQueue } from '../../domain/queue';
import { dueCountBySubject, overdueCount } from '../../domain/selectors';
import { HOME, SETTINGS, STATS, clockWarning, homeDate, overflowNotice } from '../messages';
import s from '../screen.module.css';
import styles from './Home.module.css';

export function Home() {
  const { state, dispatch } = useContent();
  const { navigate } = useRoute();
  const { today, clockRolledBack, lastOpenedDate } = useToday();

  const totalCards = Object.values(state.cards).reduce((n, cards) => n + cards.length, 0);
  // 홈 숫자와 전체 덱 세션 카드 수를 같은 큐에서 얻는다(F7)
  const queue = buildQueue(state, today);
  const dueCount = queue.cards.length + queue.overflow;
  const overdue = overdueCount(state, today);
  const bySubject = dueCountBySubject(state, today);
  const goSubjects = () => navigate({ name: 'subjects' });
  // 카드가 생기면 첫 사용 상태가 끝나 버튼이 사라진다. 그 전 연타는 ref로 막는다
  const sampleRef = useRef(false);
  const addSample = () => {
    if (sampleRef.current) return;
    sampleRef.current = true;
    for (const action of sampleDeckActions()) dispatch(action);
  };
  // 첫 사용이면 과목 만들기, 오늘 복습이 있으면 학습 시작만 하단에 둔다(과목 관리는 바로가기 타일)
  const bottom =
    totalCards === 0
      ? { label: HOME.create, onClick: goSubjects }
      : dueCount > 0
        ? { label: HOME.start, onClick: () => navigate({ name: 'studyAll' }) }
        : null;

  return (
    <main className={s.screen}>
      <header className={s.header}>
        <p className={styles.brand}>
          {HOME.brand} · {homeDate(today)}
        </p>
        <h1 className={s.title}>{HOME.title}</h1>
      </header>

      {totalCards === 0 ? (
        <section className={s.empty}>
          <p className={s.emptyTitle}>{HOME.firstTitle}</p>
          <p className={s.emptyBody}>{HOME.firstBody}</p>
          <button type="button" className={`${ui.secondary} ${styles.sampleButton}`} onClick={addSample}>
            {HOME.sample}
          </button>
          <p className={s.emptyBody}>{HOME.sampleHint}</p>
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

      <nav className={styles.tiles} aria-label={HOME.tilesLabel}>
        <Tile icon={<ChartIcon size={26} />} label={STATS.entry} route={{ name: 'stats' }} />
        <Tile icon={<BookIcon size={26} />} label={HOME.manage} route={{ name: 'subjects' }} />
        <Tile icon={<GearIcon size={26} />} label={SETTINGS.entry} route={{ name: 'settings' }} />
      </nav>

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

      {bottom && (
        <>
          <div className={ui.bottomSpacer} />
          <div className={ui.bottomBar}>
            <button type="button" className={ui.primary} onClick={bottom.onClick}>
              {bottom.label}
            </button>
          </div>
        </>
      )}
    </main>
  );
}

// 바로가기 타일(아이콘 + 이름). 누르면 해당 화면으로 이동하고 뒤로가기로 홈에 돌아온다
function Tile({ icon, label, route }: { icon: ReactNode; label: string; route: Route }) {
  const { navigate } = useRoute();
  return (
    <button type="button" className={styles.tile} onClick={() => navigate(route)}>
      <span className={styles.tileIcon}>{icon}</span>
      <span className={styles.tileLabel}>{label}</span>
    </button>
  );
}
