import { useContent } from '../../app/contentContext';
import { useToday } from '../../app/todayContext';
import { formatDueDate } from '../../domain/selectors';
import { recentDailyCounts, stageDistribution, todayDoneCount, totalCardCount } from '../../domain/stats';
import { STATS, stageLabel } from '../messages';
import s from '../screen.module.css';
import styles from './Stats.module.css';

// 조회 전용 화면이라 하단 버튼이 없다(뒤로가기는 플랫폼)
export function Stats() {
  const { state } = useContent();
  const { today } = useToday();
  const stages = stageDistribution(state);
  const total = totalCardCount(state);

  if (total === 0) {
    return (
      <main className={s.screen}>
        <header className={s.header}>
          <h1 className={s.title}>{STATS.title}</h1>
        </header>
        <section className={s.empty}>
          <p className={s.emptyTitle}>{STATS.emptyTitle}</p>
          <p className={s.emptyBody}>{STATS.emptyBody}</p>
        </section>
      </main>
    );
  }

  const recent = recentDailyCounts(state, today);
  return (
    <main className={s.screen}>
      <header className={s.header}>
        <h1 className={s.title}>{STATS.title}</h1>
      </header>

      <dl className={styles.summary}>
        <div className={styles.stat}>
          <dt>{STATS.todayDone}</dt>
          <dd>{todayDoneCount(state, today)}장</dd>
        </div>
        <div className={styles.stat}>
          <dt>{STATS.totalCards}</dt>
          <dd>{total}장</dd>
        </div>
      </dl>

      <BarList
        title={STATS.stagesTitle}
        rows={stages.map((count, stage) => ({ key: String(stage), label: stageLabel(stage), count }))}
      />
      <BarList
        title={STATS.recentTitle}
        rows={recent.map(({ date, count }) => ({ key: date, label: formatDueDate(date, today), count }))}
      />
    </main>
  );
}

// 라벨·막대·수 행 목록. 막대는 장식이고 수는 항상 텍스트로 보인다
function BarList({ title, rows }: { title: string; rows: { key: string; label: string; count: number }[] }) {
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <section aria-label={title}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <ul className={styles.bars}>
        {rows.map((r) => (
          <li key={r.key} className={styles.bar}>
            <span className={styles.barLabel}>{r.label}</span>
            <span className={styles.track} aria-hidden="true">
              <span className={styles.fill} style={{ width: max > 0 ? `${(r.count / max) * 100}%` : 0 }} />
            </span>
            <span className={styles.barCount}>{r.count}장</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
