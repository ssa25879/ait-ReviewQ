import { type FormEvent, type Ref, useId, useRef, useState } from 'react';
import { actions } from '../../app/actions';
import { useContent } from '../../app/contentContext';
import { useRoute } from '../../app/routeContext';
import { ConfirmDialog } from '../../components/Dialog';
import ui from '../../components/ui.module.css';
import { CARD_TEXT_MAX, countChars, validateCardText } from '../../domain/validation';
import { type Field, validationMessage } from '../messages';
import s from '../screen.module.css';
import styles from './CardEditor.module.css';

// cardId가 없으면 새 카드 작성
export function CardEditor({ deckId, cardId }: { deckId: string; cardId?: string }) {
  const { state } = useContent();
  const deck = state.decks.find((d) => d.id === deckId);
  const card = cardId ? state.cards[deckId]?.find((c) => c.id === cardId) : undefined;
  if (!deck || (cardId && !card)) return null; // 없는 대상 경로는 App이 홈으로 바꾼다

  // 편집 대상이 바뀌면 입력 상태를 새로 시작한다
  return <CardForm key={cardId ?? 'new'} deckId={deckId} deckName={deck.name} cardId={cardId} initial={card} />;
}

interface CardFormProps {
  deckId: string;
  deckName: string;
  cardId?: string;
  initial?: { question: string; answer: string };
}

function CardForm({ deckId, deckName, cardId, initial }: CardFormProps) {
  const { dispatch } = useContent();
  const { back } = useRoute();
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [submitted, setSubmitted] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const isNew = cardId === undefined;

  const q = validateCardText(question);
  const a = validateCardText(answer);

  const save = (andContinue: boolean) => {
    setSubmitted(true);
    if (!q.ok || !a.ok) return;
    if (isNew) dispatch(actions.addCard(deckId, q.value, a.value));
    else dispatch(actions.updateCard(cardId, deckId, q.value, a.value));

    if (andContinue) {
      setQuestion('');
      setAnswer('');
      setSubmitted(false);
      setSavedCount((n) => n + 1);
      questionRef.current?.focus();
    } else {
      back();
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save(false);
  };

  return (
    <main className={s.screen}>
      <header className={s.header}>
        <h1 className={s.title}>{isNew ? '새 카드' : '카드 편집'}</h1>
        <p className={s.meta}>{deckName}</p>
      </header>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <TextField
          field="question"
          label="질문"
          value={question}
          onChange={setQuestion}
          error={errorFor('question', q, submitted)}
          inputRef={questionRef}
        />
        <TextField field="answer" label="정답" value={answer} onChange={setAnswer} error={errorFor('answer', a, submitted)} />

        <p className={styles.status} role="status">
          {savedCount > 0 ? `카드를 저장했어요(${savedCount}장)` : ''}
        </p>

        <div className={styles.actions}>
          {isNew ? (
            <button type="button" className={ui.secondary} onClick={() => save(true)}>
              저장 후 계속
            </button>
          ) : (
            <button type="button" className={ui.danger} onClick={() => setConfirmDelete(true)}>
              삭제
            </button>
          )}
          <button type="submit" className={ui.primary}>
            저장
          </button>
        </div>
      </form>

      {confirmDelete && cardId && (
        <ConfirmDialog
          title="이 카드를 삭제할까요?"
          detail="삭제한 카드와 복습 일정은 되돌릴 수 없어요."
          confirmLabel="삭제"
          onConfirm={() => {
            dispatch(actions.deleteCard(cardId, deckId));
            back();
          }}
          onClose={() => setConfirmDelete(false)}
        />
      )}
    </main>
  );
}

// 길이 초과는 바로, 빈 값은 저장을 시도한 뒤에 알린다
function errorFor(field: Field, result: ReturnType<typeof validateCardText>, submitted: boolean): string | null {
  if (result.ok) return null;
  return submitted || result.reason === 'tooLong' ? validationMessage(field, result) : null;
}

interface TextFieldProps {
  field: Field;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  inputRef?: Ref<HTMLTextAreaElement>;
}

function TextField({ field, label, value, onChange, error, inputRef }: TextFieldProps) {
  const id = useId();
  const count = countChars(value);
  return (
    <div>
      <label htmlFor={id} className={ui.fieldLabel}>
        {label}
        <span className={count > CARD_TEXT_MAX ? ui.counterOver : ui.counter} data-field={field}>
          {count}/{CARD_TEXT_MAX}
        </span>
      </label>
      <textarea
        id={id}
        ref={inputRef}
        className={ui.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
      />
      {error && <p className={ui.error}>{error}</p>}
    </div>
  );
}
