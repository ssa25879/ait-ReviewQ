import { useState } from 'react';
import { actions } from '../../app/actions';
import { useContent } from '../../app/contentContext';
import { useRoute } from '../../app/routeContext';
import { flags } from '../../config/flags';
import { AdSlot } from '../../components/AdSlot';
import { ConfirmDialog, MenuDialog, NameDialog } from '../../components/Dialog';
import { ChevronRight, More } from '../../components/icons';
import ui from '../../components/ui.module.css';
import type { Deck, Subject } from '../../domain/model';
import { cardCount, decksOfSubject, hasDuplicateDeckName, subjectDeleteSummary } from '../../domain/selectors';
import { DUPLICATE_DECK_WARNING, deleteDeckDetail, deleteSubjectDetail } from '../messages';
import s from '../screen.module.css';
import styles from './SubjectList.module.css';

// 한 번에 하나의 다이얼로그만 연다
type Modal =
  | { kind: 'addSubject' }
  | { kind: 'subjectMenu'; subject: Subject }
  | { kind: 'renameSubject'; subject: Subject }
  | { kind: 'deleteSubject'; subject: Subject }
  | { kind: 'addDeck'; subject: Subject }
  | { kind: 'deckMenu'; deck: Deck }
  | { kind: 'renameDeck'; deck: Deck }
  | { kind: 'moveDeck'; deck: Deck }
  | { kind: 'deleteDeck'; deck: Deck };

export function SubjectList() {
  const { state, dispatch } = useContent();
  const { navigate } = useRoute();
  const [modal, setModal] = useState<Modal | null>(null);
  const close = () => setModal(null);

  return (
    <main className={s.screen}>
      <header className={s.header}>
        <h1 className={s.title}>과목·단원</h1>
      </header>

      {state.subjects.length === 0 ? (
        <section className={s.empty}>
          <p className={s.emptyTitle}>아직 과목이 없어요</p>
          <p className={s.emptyBody}>과목을 만들고 그 안에 단원과 카드를 추가해 보세요.</p>
        </section>
      ) : (
        <div className={styles.subjects}>
          {state.subjects.map((subject) => (
            <section key={subject.id} className={styles.subject} aria-label={subject.name}>
              <div className={styles.subjectHeader}>
                <h2 className={styles.subjectName}>{subject.name}</h2>
                <button
                  type="button"
                  className={ui.iconButton}
                  aria-label={`${subject.name} 과목 더보기`}
                  onClick={() => setModal({ kind: 'subjectMenu', subject })}
                >
                  <More />
                </button>
              </div>
              <ul className={s.list}>
                {decksOfSubject(state, subject.id).map((deck) => (
                  <li key={deck.id} className={styles.deckItem}>
                    <button
                      type="button"
                      className={s.row}
                      onClick={() => navigate({ name: 'deck', deckId: deck.id })}
                    >
                      <span className={s.rowMain}>
                        <span className={s.rowTitle}>{deck.name}</span>
                        <span className={s.rowSub}>{cardCount(state, deck.id)}장</span>
                      </span>
                      <span className={s.rowChevron}>
                        <ChevronRight />
                      </span>
                    </button>
                    <button
                      type="button"
                      className={ui.iconButton}
                      aria-label={`${deck.name} 단원 더보기`}
                      onClick={() => setModal({ kind: 'deckMenu', deck })}
                    >
                      <More />
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className={styles.addDeck} onClick={() => setModal({ kind: 'addDeck', subject })}>
                + 단원 추가
              </button>
            </section>
          ))}
        </div>
      )}

      {/* 과목을 만들기 전의 빈 화면에는 광고를 두지 않는다(목록이 있는 화면에만 배너) */}
      {state.subjects.length > 0 && <AdSlot adGroupId={flags.adGroupIds.subjects} placement="subjects" />}
      <div className={ui.bottomSpacer} />
      <div className={ui.bottomBar}>
        <button type="button" className={ui.primary} onClick={() => setModal({ kind: 'addSubject' })}>
          과목 추가
        </button>
      </div>

      {modal?.kind === 'addSubject' && (
        <NameDialog
          title="과목 추가"
          field="subjectName"
          submitLabel="만들기"
          onSubmit={(name) => {
            dispatch(actions.addSubject(name));
            close();
          }}
          onClose={close}
        />
      )}

      {modal?.kind === 'subjectMenu' && (
        <MenuDialog
          title={modal.subject.name}
          onClose={close}
          items={[
            { label: '이름 바꾸기', onSelect: () => setModal({ kind: 'renameSubject', subject: modal.subject }) },
            { label: '삭제', danger: true, onSelect: () => setModal({ kind: 'deleteSubject', subject: modal.subject }) },
          ]}
        />
      )}

      {modal?.kind === 'renameSubject' && (
        <NameDialog
          title="과목 이름 바꾸기"
          field="subjectName"
          initialName={modal.subject.name}
          submitLabel="저장"
          onSubmit={(name) => {
            dispatch(actions.renameSubject(modal.subject.id, name));
            close();
          }}
          onClose={close}
        />
      )}

      {modal?.kind === 'deleteSubject' && (
        <ConfirmDialog
          title={`'${modal.subject.name}' 과목을 삭제할까요?`}
          detail={deleteSubjectDetail(subjectDeleteSummary(state, modal.subject.id))}
          confirmLabel="삭제"
          onConfirm={() => {
            dispatch(actions.deleteSubject(modal.subject.id));
            close();
          }}
          onClose={close}
        />
      )}

      {modal?.kind === 'addDeck' && (
        <NameDialog
          title={`${modal.subject.name}에 단원 추가`}
          field="deckName"
          submitLabel="만들기"
          warningFor={(name) => (hasDuplicateDeckName(state, modal.subject.id, name) ? DUPLICATE_DECK_WARNING : null)}
          onSubmit={(name) => {
            dispatch(actions.addDeck(modal.subject.id, name));
            close();
          }}
          onClose={close}
        />
      )}

      {modal?.kind === 'deckMenu' && (
        <MenuDialog
          title={modal.deck.name}
          onClose={close}
          items={[
            { label: '이름 바꾸기', onSelect: () => setModal({ kind: 'renameDeck', deck: modal.deck }) },
            {
              label: '다른 과목으로 옮기기',
              disabled: state.subjects.length < 2,
              onSelect: () => setModal({ kind: 'moveDeck', deck: modal.deck }),
            },
            { label: '삭제', danger: true, onSelect: () => setModal({ kind: 'deleteDeck', deck: modal.deck }) },
          ]}
        />
      )}

      {modal?.kind === 'renameDeck' && (
        <NameDialog
          title="단원 이름 바꾸기"
          field="deckName"
          initialName={modal.deck.name}
          submitLabel="저장"
          warningFor={(name) =>
            hasDuplicateDeckName(state, modal.deck.subjectId, name, modal.deck.id) ? DUPLICATE_DECK_WARNING : null
          }
          onSubmit={(name) => {
            dispatch(actions.renameDeck(modal.deck.id, name));
            close();
          }}
          onClose={close}
        />
      )}

      {modal?.kind === 'moveDeck' && (
        <MenuDialog
          title="어느 과목으로 옮길까요?"
          onClose={close}
          items={state.subjects
            .filter((subject) => subject.id !== modal.deck.subjectId)
            .map((subject) => ({
              label: subject.name,
              onSelect: () => {
                dispatch(actions.moveDeck(modal.deck.id, subject.id));
                close();
              },
            }))}
        />
      )}

      {modal?.kind === 'deleteDeck' && (
        <ConfirmDialog
          title={`'${modal.deck.name}' 단원을 삭제할까요?`}
          detail={deleteDeckDetail(cardCount(state, modal.deck.id))}
          confirmLabel="삭제"
          onConfirm={() => {
            dispatch(actions.deleteDeck(modal.deck.id));
            close();
          }}
          onClose={close}
        />
      )}
    </main>
  );
}
