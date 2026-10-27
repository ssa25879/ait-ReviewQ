import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { actions } from '../../app/actions';
import { useContent } from '../../app/contentContext';
import { useRoute } from '../../app/routeContext';
import ui from '../../components/ui.module.css';
import { BULK_MAX_LINES, parseBulkCards } from '../../domain/bulkCards';
import { BULK } from '../messages';
import s from '../screen.module.css';
import styles from './CardBulk.module.css';

// 미리 보기에 보여 줄 오류 줄 수
const ERROR_PREVIEW = 20;

// 붙여넣은 목록을 한 줄에 카드 한 장으로 만든다. 올바른 줄만 추가하고, 오류 줄은 입력란에 남긴다
export function CardBulk({ deckId }: { deckId: string }) {
  const { state, dispatch } = useContent();
  const { back } = useRoute();
  const [text, setText] = useState('');
  const [added, setAdded] = useState<number | null>(null);
  const addingRef = useRef(false);
  const inputId = useId();
  const parsed = useMemo(() => parseBulkCards(text), [text]);

  // 오류 줄만 남긴 입력이 반영된 뒤에야 다시 추가할 수 있다(같은 입력을 두 번 추가하지 않게)
  useEffect(() => {
    addingRef.current = false;
  }, [text]);

  const deck = state.decks.find((d) => d.id === deckId);
  if (!deck) return null; // 없는 덱 경로는 App이 홈으로 바꾼다

  const count = parsed.cards.length;
  const canAdd = count > 0 && !parsed.tooMany;

  const add = () => {
    if (!canAdd || addingRef.current) return;
    addingRef.current = true;
    for (const card of parsed.cards) dispatch(actions.addCard(deckId, card.question, card.answer));
    if (parsed.errors.length === 0) {
      back();
      return;
    }
    setText(parsed.errors.map((e) => e.text).join('\n'));
    setAdded(count);
  };

  return (
    <main className={s.screen}>
      <header className={s.header}>
        <h1 className={s.title}>{BULK.title}</h1>
        <p className={s.meta}>{deck.name}</p>
      </header>

      <section className={styles.help}>
        <p className={styles.helpText}>{BULK.help}</p>
        <pre className={styles.example}>{BULK.example}</pre>
      </section>

      <div className={styles.field}>
        <label htmlFor={inputId} className={ui.fieldLabel}>
          {BULK.inputLabel}
        </label>
        <textarea
          id={inputId}
          className={`${ui.textarea} ${styles.input}`}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setAdded(null);
          }}
          spellCheck={false}
        />
      </div>

      {added !== null && (
        <p className={styles.added} role="status">
          {BULK.added(added)}
        </p>
      )}

      {text.trim() !== '' && (
        <section className={styles.preview} aria-live="polite">
          <p className={styles.summary}>
            {BULK.ready(count)}
            {parsed.errors.length > 0 && <span className={styles.errorCount}> · {BULK.errorCount(parsed.errors.length)}</span>}
          </p>
          {parsed.tooMany && <p className={ui.error}>{BULK.tooMany(BULK_MAX_LINES)}</p>}
          {parsed.errors.length > 0 && (
            <ul className={styles.errors}>
              {parsed.errors.slice(0, ERROR_PREVIEW).map((e) => (
                <li key={e.line} className={styles.errorItem}>
                  <span className={styles.errorLine}>{BULK.lineLabel(e.line)}</span> {BULK.reason[e.reason]}
                </li>
              ))}
              {parsed.errors.length > ERROR_PREVIEW && (
                <li className={styles.errorItem}>{BULK.more(parsed.errors.length - ERROR_PREVIEW)}</li>
              )}
            </ul>
          )}
        </section>
      )}

      <div className={ui.bottomSpacer} />
      <div className={ui.bottomBar}>
        <button type="button" className={ui.primary} disabled={!canAdd} onClick={add}>
          {BULK.add(canAdd ? count : 0)}
        </button>
      </div>
    </main>
  );
}
