import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react';
import { validateName } from '../domain/validation';
import { type Field, validationMessage } from '../screens/messages';
import styles from './Dialog.module.css';
import { Close } from './icons';
import ui from './ui.module.css';

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

// 아래에서 올라오는 시트. dim 영역·닫기 버튼·Esc로 닫는다
export function Dialog({ title, onClose, children }: DialogProps) {
  const titleId = useId();

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div
        className={styles.sheet}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={ui.iconButton} aria-label="닫기" onClick={onClose}>
            <Close />
          </button>
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
}

interface NameDialogProps {
  title: string;
  field: Extract<Field, 'subjectName' | 'deckName'>;
  initialName?: string;
  submitLabel: string;
  warningFor?: (name: string) => string | null; // 저장은 막지 않는 경고(예: 중복 덱 이름)
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function NameDialog({ title, field, initialName = '', submitLabel, warningFor, onSubmit, onClose }: NameDialogProps) {
  const [name, setName] = useState(initialName);
  const [submitted, setSubmitted] = useState(false);
  const inputId = useId();
  const result = validateName(name);
  // 길이 초과는 바로, 빈 값은 저장을 시도한 뒤에 알린다
  const error = submitted || (!result.ok && result.reason === 'tooLong') ? validationMessage(field, result) : null;
  const warning = result.ok ? (warningFor?.(name) ?? null) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (result.ok) onSubmit(result.value);
  };

  return (
    <Dialog title={title} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label htmlFor={inputId} className={ui.fieldLabel}>
          {field === 'subjectName' ? '과목 이름' : '단원 이름'}
        </label>
        <input
          id={inputId}
          className={ui.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          enterKeyHint="done"
          aria-invalid={error ? true : undefined}
        />
        {error && <p className={ui.error}>{error}</p>}
        {!error && warning && <p className={ui.warning}>{warning}</p>}
        <div className={styles.actions}>
          <button type="button" className={ui.secondary} onClick={onClose}>
            취소
          </button>
          <button type="submit" className={ui.primary}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

interface ConfirmDialogProps {
  title: string;
  detail: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({ title, detail, confirmLabel, onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <Dialog title={title} onClose={onClose}>
      <p>{detail}</p>
      <div className={styles.actions}>
        <button type="button" className={ui.secondary} onClick={onClose}>
          취소
        </button>
        <button type="button" className={ui.danger} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}

export interface MenuItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

// 항목별 동작 목록(더보기)·선택지 목록에 쓴다
export function MenuDialog({ title, items, onClose }: { title: string; items: MenuItem[]; onClose: () => void }) {
  return (
    <Dialog title={title} onClose={onClose}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={item.danger ? styles.optionDanger : styles.option}
          disabled={item.disabled}
          onClick={item.onSelect}
        >
          {item.label}
        </button>
      ))}
    </Dialog>
  );
}
