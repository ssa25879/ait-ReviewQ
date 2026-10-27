import { useContent } from '../../app/contentContext';
import { useRoute } from '../../app/routeContext';
import { useToday } from '../../app/todayContext';
import { ChevronRight } from '../../components/icons';
import ui from '../../components/ui.module.css';
import { buildQueue } from '../../domain/queue';
import { formatDueDate } from '../../domain/selectors';
import { BULK, STUDY, dueTodayLabel, overflowNotice } from '../messages';
import s from '../screen.module.css';
import styles from './DeckDetail.module.css';

export function DeckDetail({ deckId }: { deckId: string }) {
  const { state } = useContent();
  const { navigate } = useRoute();
  const { today } = useToday();
  const deck = state.decks.find((d) => d.id === deckId);
  if (!deck) return null; // 없는 덱 경로는 App이 홈으로 바꾼다

  const subject = state.subjects.find((x) => x.id === deck.subjectId);
  const cards = state.cards[deckId] ?? [];
  const queue = buildQueue(state, today, { deckId });
  const dueCount = queue.cards.length + queue.overflow;
  // 목록 위(빈 덱이면 안내 아래)에 둔다. 하단 버튼 구성은 그대로다
  const bulkRow = (
    <button type="button" className={`${s.row} ${styles.bulkRow}`} onClick={() => navigate({ name: 'cardBulk', deckId })}>
      <span className={s.rowMain}>
        <span className={s.rowTitle}>{BULK.entry}</span>
      </span>
      <span className={s.rowChevron}>
        <ChevronRight />
      </span>
    </button>
  );

  return (
    <main className={s.screen}>
      <header className={s.header}>
        <h1 className={s.title}>{deck.name}</h1>
        <p className={s.meta}>
          {subject?.name} · 카드 {cards.length}장
        </p>
        {cards.length > 0 && <p className={styles.due}>{dueTodayLabel(dueCount)}</p>}
        {queue.overflow > 0 && <p className={s.meta}>{overflowNotice(queue.overflow)}</p>}
      </header>

      {cards.length === 0 ? (
        <>
          <section className={s.empty}>
            <p className={s.emptyTitle}>아직 카드가 없어요</p>
            <p className={s.emptyBody}>질문과 정답을 적어 첫 카드를 만들어 보세요.</p>
          </section>
          {bulkRow}
        </>
      ) : (
        <>
          {bulkRow}
          <ul className={s.list}>
            {cards.map((card) => (
              <li key={card.id} className={styles.cardItem}>
                <button
                  type="button"
                  className={s.row}
                  onClick={() => navigate({ name: 'cardEdit', deckId, cardId: card.id })}
                >
                  <span className={s.rowMain}>
                    <span className={`${s.rowTitle} ${styles.question}`}>{card.question}</span>
                    <span className={s.rowSub}>다음 복습 {formatDueDate(card.schedule.dueDate, today)}</span>
                  </span>
                  <span className={s.rowChevron}>
                    <ChevronRight />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className={ui.bottomSpacer} />
      <div className={ui.bottomBar}>
        {dueCount > 0 ? (
          <div className={styles.actions}>
            <button type="button" className={ui.secondary} onClick={() => navigate({ name: 'cardNew', deckId })}>
              카드 추가
            </button>
            <button type="button" className={ui.primary} onClick={() => navigate({ name: 'study', deckId })}>
              {STUDY.start}
            </button>
          </div>
        ) : (
          <button type="button" className={ui.primary} onClick={() => navigate({ name: 'cardNew', deckId })}>
            카드 추가
          </button>
        )}
      </div>
    </main>
  );
}
