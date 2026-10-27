import { File as AitFile, isMinVersionSupported } from '@apps-in-toss/web-framework';
import { Suspense, lazy, useId, useRef, useState } from 'react';
import { appStorage, metaStore } from '../../app/bootstrap';
import { useContent } from '../../app/contentContext';
import { useRoute } from '../../app/routeContext';
import { useToday } from '../../app/todayContext';
import { ConfirmDialog } from '../../components/Dialog';
import ui from '../../components/ui.module.css';
import { useNotificationAgreement } from '../../components/useNotificationAgreement';
import { buildExport, exportFileName, toBase64Utf8, validateExport } from '../../infra/storage/exportData';
import { type ParsedImport, parseImport } from '../../infra/storage/importData';
import { SCHEMA_VERSION } from '../../infra/storage/meta';
import { EXPORT, IMPORT, NOTIFY, SETTINGS } from '../messages';
import s from '../screen.module.css';
import styles from './Settings.module.css';

// 최소 버전 미만에서는 파일 저장이 오류 없이 아무것도 하지 않으므로(SDK 문서) 버전도 확인한다
function canSaveFile(): boolean {
  return AitFile.saveBase64.isSupported() && isMinVersionSupported(AitFile.saveBase64.MIN_TOSS_APP_VERSION);
}

// 테스트 빌드에서만 데모 데이터 항목을 불러온다. 조건을 이 자리의 상수식으로 써야 꺼진 빌드에서 모듈이 번들에서 빠진다
const DemoSection = import.meta.env.VITE_DEMO_DATA === 'true' ? lazy(() => import('./DemoSection')) : null;

// 조회·관리 화면이라 하단 고정 버튼이 없다(뒤로가기는 플랫폼)
export function Settings() {
  return (
    <main className={s.screen}>
      <header className={s.header}>
        <h1 className={s.title}>{SETTINGS.title}</h1>
      </header>

      <section className={styles.notice} aria-labelledby="settings-storage">
        <p id="settings-storage" className={styles.noticeTitle}>
          {SETTINGS.storageTitle}
        </p>
        <p className={styles.noticeBody}>{SETTINGS.storageBody}</p>
      </section>

      <ExportSection />
      <NotificationSection />
      <ClearSection />
      {DemoSection && (
        <Suspense fallback={null}>
          <DemoSection />
        </Suspense>
      )}
    </main>
  );
}

type ExportState =
  | { kind: 'idle' }
  | { kind: 'working' }
  | { kind: 'saved'; fileName: string }
  | { kind: 'text'; text: string; reason: 'unsupported' | 'saveFailed' } // 파일로 저장할 수 없어 직접 복사
  | { kind: 'failed' };

function ExportSection() {
  const { state, flushSave } = useContent();
  const { today } = useToday();
  const [result, setResult] = useState<ExportState>({ kind: 'idle' });
  const workingRef = useRef(false);
  const textId = useId();

  const exportBackup = async () => {
    if (workingRef.current) return; // 연타는 1회만 처리한다
    workingRef.current = true;
    setResult({ kind: 'working' });
    try {
      await flushSave(); // 저장 대기 변경을 먼저 저장해 저장소와 같은 값을 내보낸다
      const doc = await buildExport({
        storage: appStorage,
        content: state,
        schemaVersion: metaStore.get()?.schemaVersion ?? SCHEMA_VERSION,
        today,
      });
      const text = JSON.stringify(doc, null, 2);
      if (!validateExport(JSON.parse(text))) throw new Error('내보내기 문서가 형식 검증을 통과하지 못했다');

      const fileName = exportFileName(today);
      if (!canSaveFile()) {
        setResult({ kind: 'text', text, reason: 'unsupported' });
        return;
      }
      try {
        await AitFile.saveBase64({ data: toBase64Utf8(text), fileName, mimeType: 'application/json' });
        setResult({ kind: 'saved', fileName });
      } catch (error) {
        console.error('[reviewq] 백업 파일 저장 실패', error);
        setResult({ kind: 'text', text, reason: 'saveFailed' });
      }
    } catch (error) {
      console.error('[reviewq] 백업 만들기 실패', error);
      setResult({ kind: 'failed' });
    } finally {
      workingRef.current = false;
    }
  };

  return (
    <section className={styles.section} aria-labelledby="settings-backup">
      <h2 id="settings-backup" className={styles.sectionTitle}>
        {SETTINGS.backupTitle}
      </h2>
      <p className={styles.body}>{EXPORT.description}</p>
      <button type="button" className={ui.secondary} disabled={result.kind === 'working'} onClick={exportBackup}>
        {result.kind === 'working' ? EXPORT.working : EXPORT.action}
      </button>
      {result.kind === 'saved' && (
        <p className={styles.success} role="status">
          {EXPORT.saved(result.fileName)}
        </p>
      )}
      {result.kind === 'failed' && (
        <p className={ui.error} role="alert">
          {EXPORT.failed}
        </p>
      )}
      {result.kind === 'text' && (
        <>
          <p className={result.reason === 'saveFailed' ? ui.error : styles.body} role="status">
            {result.reason === 'saveFailed' ? EXPORT.saveFailed : EXPORT.unsupported}
          </p>
          <label htmlFor={textId} className={ui.fieldLabel}>
            {EXPORT.textLabel}
          </label>
          <textarea id={textId} className={`${ui.textarea} ${styles.exportText}`} readOnly value={result.text} />
          <p className={styles.hint}>{EXPORT.copyHint}</p>
        </>
      )}
      <ImportPanel />
    </section>
  );
}

type ImportStep = 'closed' | 'open' | 'confirm' | 'final' | 'replacing';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 백업 가져오기: 파일 선택(토스 WebView에서 열리지 않을 수 있어) 또는 붙여넣기 → 검증·요약 → 2단계 확인 → 전체 교체
function ImportPanel() {
  const { replaceAll } = useContent();
  const { back } = useRoute();
  const [step, setStep] = useState<ImportStep>('closed');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const workingRef = useRef(false);
  const textId = useId();

  const check = (raw: string) => {
    const result = parseImport(raw);
    setParsed(result);
    setMessage(result.ok ? null : IMPORT[result.reason]);
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      check(await file.text());
    } catch (error) {
      console.error('[reviewq] 백업 파일 읽기 실패', error);
      setParsed(null);
      setMessage(IMPORT.readFailed);
    } finally {
      if (fileRef.current) fileRef.current.value = ''; // 같은 파일을 다시 골라도 change가 오게
    }
  };

  const replace = async () => {
    if (!parsed?.ok || workingRef.current) return;
    workingRef.current = true;
    setStep('replacing');
    try {
      await replaceAll(parsed.doc);
      back(); // 설정 아래에는 항상 홈이 있다(seed)
    } catch (error) {
      console.error('[reviewq] 백업 가져오기 실패', error);
      setMessage(IMPORT.failed);
      setStep('open');
    } finally {
      workingRef.current = false;
    }
  };

  if (step === 'closed') {
    return (
      <button type="button" className={ui.secondary} onClick={() => setStep('open')}>
        {IMPORT.action}
      </button>
    );
  }

  return (
    <div className={styles.importPanel}>
      <h3 className={styles.subTitle}>{IMPORT.action}</h3>
      <p className={styles.body}>{IMPORT.description}</p>
      <input
        ref={fileRef}
        type="file"
        accept=".json,application/json"
        className={styles.fileInput}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <button type="button" className={ui.secondary} onClick={() => fileRef.current?.click()}>
        {IMPORT.pickFile}
      </button>
      <label htmlFor={textId} className={ui.fieldLabel}>
        {IMPORT.pasteLabel}
      </label>
      <textarea
        id={textId}
        className={ui.textarea}
        value={text}
        onChange={(e) => {
          // 다시 불러오기 전까지는 이전 요약으로 바꾸지 않게 결과를 지운다
          setText(e.target.value);
          setParsed(null);
          setMessage(null);
        }}
      />
      <button type="button" className={ui.secondary} disabled={text.trim() === ''} onClick={() => check(text)}>
        {IMPORT.load}
      </button>
      {message && (
        <p className={ui.error} role="alert">
          {message}
        </p>
      )}
      {parsed?.ok && (
        <>
          <div className={styles.summary} role="status">
            <p className={styles.body}>{IMPORT.summary(parsed.summary)}</p>
            <p className={styles.hint}>{IMPORT.exportedAt(formatDate(parsed.summary.exportedAt))}</p>
          </div>
          <button type="button" className={ui.danger} disabled={step === 'replacing'} onClick={() => setStep('confirm')}>
            {step === 'replacing' ? IMPORT.replacing : IMPORT.replace}
          </button>
        </>
      )}
      {step === 'confirm' && (
        <ConfirmDialog
          title={IMPORT.confirmTitle}
          detail={IMPORT.confirmBody}
          confirmLabel={IMPORT.confirmContinue}
          onConfirm={() => setStep('final')}
          onClose={() => setStep('open')}
        />
      )}
      {step === 'final' && (
        <ConfirmDialog
          title={IMPORT.finalTitle}
          detail={IMPORT.finalBody}
          confirmLabel={IMPORT.finalConfirm}
          onConfirm={replace}
          onClose={() => setStep('open')}
        />
      )}
    </div>
  );
}

// 알림 플래그·템플릿 코드·기기 지원을 모두 만족할 때만 보인다. 화면을 연 것만으로는 요청하지 않는다
function NotificationSection() {
  const { supported, consent, phase, ask } = useNotificationAgreement();
  if (!supported) return null;

  const agreed = consent?.agreed === true;
  const stateText = agreed ? NOTIFY.stateAgreed : consent ? NOTIFY.stateRejected : NOTIFY.stateUnset;
  return (
    <section className={styles.section} aria-labelledby="settings-notify">
      <h2 id="settings-notify" className={styles.sectionTitle}>
        {NOTIFY.settingsTitle}
      </h2>
      <p className={styles.body} role="status">
        {stateText}
      </p>
      {agreed ? (
        <p className={styles.hint}>{NOTIFY.offHint}</p>
      ) : (
        <button type="button" className={ui.secondary} disabled={phase === 'asking'} onClick={ask}>
          {NOTIFY.settingsAsk}
        </button>
      )}
      {phase === 'failed' && (
        <p className={ui.error} role="alert">
          {NOTIFY.failed}
        </p>
      )}
    </section>
  );
}

type ClearStep = 'idle' | 'confirm' | 'final' | 'clearing' | 'failed';

function ClearSection() {
  const { clearAll } = useContent();
  const { back } = useRoute();
  const [step, setStep] = useState<ClearStep>('idle');

  const clear = async () => {
    setStep('clearing');
    try {
      await clearAll();
      back(); // 설정 아래에는 항상 홈이 있다(seed)
    } catch (error) {
      console.error('[reviewq] 전체 삭제 실패', error);
      setStep('failed');
    }
  };

  return (
    <section className={styles.section} aria-labelledby="settings-data">
      <h2 id="settings-data" className={styles.sectionTitle}>
        {SETTINGS.dataTitle}
      </h2>
      <button
        type="button"
        className={ui.danger}
        disabled={step === 'clearing'}
        onClick={() => setStep(step === 'failed' ? 'final' : 'confirm')}
      >
        {step === 'clearing' ? SETTINGS.clearing : step === 'failed' ? SETTINGS.retry : SETTINGS.clear}
      </button>
      {step === 'failed' && (
        <p className={ui.error} role="alert">
          {SETTINGS.clearFailed}
        </p>
      )}
      {step === 'confirm' && (
        <ConfirmDialog
          title={SETTINGS.clearConfirmTitle}
          detail={SETTINGS.clearConfirmBody}
          confirmLabel={SETTINGS.clearContinue}
          onConfirm={() => setStep('final')}
          onClose={() => setStep('idle')}
        />
      )}
      {step === 'final' && (
        <ConfirmDialog
          title={SETTINGS.clearFinalTitle}
          detail={SETTINGS.clearFinalBody}
          confirmLabel={SETTINGS.clearFinalConfirm}
          onConfirm={clear}
          onClose={() => setStep('idle')}
        />
      )}
    </section>
  );
}
