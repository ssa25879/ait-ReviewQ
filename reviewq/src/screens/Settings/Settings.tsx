import { File as AitFile, Share, isMinVersionSupported } from '@apps-in-toss/web-framework';
import { Suspense, lazy, useId, useRef, useState } from 'react';
import { appStorage, metaStore } from '../../app/bootstrap';
import { useContent } from '../../app/contentContext';
import { useRoute } from '../../app/routeContext';
import { useToday } from '../../app/todayContext';
import { ConfirmDialog } from '../../components/Dialog';
import ui from '../../components/ui.module.css';
import { useNotificationAgreement } from '../../components/useNotificationAgreement';
import { encodeBackupCode } from '../../infra/storage/backupCode';
import { type ExportDoc, buildExport, exportFileName, toBase64Utf8, validateExport } from '../../infra/storage/exportData';
import { type ParsedImport, parseImportInput } from '../../infra/storage/importData';
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
      <GuideSection />
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
  | { kind: 'code'; code: string; shareFailed: boolean } // 백업 코드(공유 시트를 닫아도 화면에 남는다)
  | { kind: 'saved'; fileName: string }
  | { kind: 'text'; text: string; reason: 'unsupported' | 'saveFailed' } // 파일로 저장할 수 없어 직접 복사
  | { kind: 'failed' };

function ExportSection() {
  const { state, flushSave } = useContent();
  const { today } = useToday();
  const [result, setResult] = useState<ExportState>({ kind: 'idle' });
  const workingRef = useRef(false);
  const textId = useId();

  // 저장 대기 변경을 먼저 저장해 저장소와 같은 값으로 문서를 만들고 형식 검증을 거친다
  const makeDoc = async (): Promise<ExportDoc> => {
    await flushSave();
    const doc = await buildExport({
      storage: appStorage,
      content: state,
      schemaVersion: metaStore.get()?.schemaVersion ?? SCHEMA_VERSION,
      today,
    });
    if (!validateExport(JSON.parse(JSON.stringify(doc)))) throw new Error('내보내기 문서가 형식 검증을 통과하지 못했다');
    return doc;
  };

  // 연타는 1회만 처리한다
  const run = async (task: () => Promise<void>) => {
    if (workingRef.current) return;
    workingRef.current = true;
    setResult({ kind: 'working' });
    try {
      await task();
    } catch (error) {
      console.error('[reviewq] 백업 만들기 실패', error);
      setResult({ kind: 'failed' });
    } finally {
      workingRef.current = false;
    }
  };

  // 공유 시트가 열려 있는 동안에도 코드를 볼 수 있게 먼저 화면에 보여 준다
  const shareCode = () =>
    run(async () => {
      const code = await encodeBackupCode(await makeDoc());
      setResult({ kind: 'code', code, shareFailed: false });
      try {
        await Share.sendMessage({ message: EXPORT.shareMessage(code) });
      } catch (error) {
        console.error('[reviewq] 백업 코드 공유 실패', error);
        setResult({ kind: 'code', code, shareFailed: true });
      }
    });

  const saveFile = () =>
    run(async () => {
      const text = JSON.stringify(await makeDoc(), null, 2);
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
    });

  const working = result.kind === 'working';
  return (
    <section className={styles.section} aria-labelledby="settings-backup">
      <h2 id="settings-backup" className={styles.sectionTitle}>
        {SETTINGS.backupTitle}
      </h2>
      <p className={styles.body}>{EXPORT.description}</p>
      <button type="button" className={ui.secondary} disabled={working} onClick={shareCode}>
        {working ? EXPORT.working : EXPORT.share}
      </button>
      <button type="button" className={ui.secondary} disabled={working} onClick={saveFile}>
        {EXPORT.action}
      </button>
      {result.kind === 'code' && <CodeBox code={result.code} shareFailed={result.shareFailed} />}
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

// 백업 코드 표시와 복사. 클립보드 API가 막힌 WebView면 선택 후 execCommand, 그것도 안 되면 길게 눌러 복사하도록 안내한다
function CodeBox({ code, shareFailed }: { code: string; shareFailed: boolean }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle');
  const ref = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopy('copied');
      return;
    } catch {
      // 아래 대체 경로로 넘어간다
    }
    const el = ref.current;
    el?.select();
    try {
      if (el && document.execCommand('copy')) {
        setCopy('copied');
        return;
      }
    } catch {
      // 안내로 넘어간다
    }
    setCopy('failed');
  };

  return (
    <div className={styles.codeBox}>
      <p className={shareFailed ? ui.error : styles.hint} role="status">
        {shareFailed ? EXPORT.shareFailed : EXPORT.shareHint}
      </p>
      <label htmlFor={id} className={ui.fieldLabel}>
        {EXPORT.codeLabel}
      </label>
      <textarea id={id} ref={ref} className={`${ui.textarea} ${styles.codeText}`} readOnly value={code} />
      <button type="button" className={ui.secondary} onClick={() => void copyCode()}>
        {EXPORT.copy}
      </button>
      {copy !== 'idle' && (
        <p className={copy === 'copied' ? styles.success : ui.error} role="status">
          {copy === 'copied' ? EXPORT.copied : EXPORT.copyFailed}
        </p>
      )}
    </div>
  );
}

type ImportStep = 'closed' | 'open' | 'confirm' | 'replacing';

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

// 백업 가져오기: 백업 코드·JSON 붙여넣기(주 경로) 또는 파일 선택 → 검증 → 요약이 담긴 확인 팝업 → 전체 교체
function ImportPanel() {
  const { replaceAll } = useContent();
  const { back } = useRoute();
  const [step, setStep] = useState<ImportStep>('closed');
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const workingRef = useRef(false);
  const checkRef = useRef(0); // 코드 해독이 끝나기 전에 입력이 바뀌면 늦게 온 결과를 버린다
  const textId = useId();

  const check = async (raw: string) => {
    const id = ++checkRef.current;
    const result = await parseImportInput(raw);
    if (id !== checkRef.current) return;
    setParsed(result);
    setMessage(result.ok ? null : IMPORT[result.reason]);
    if (result.ok) setStep('confirm'); // 검증을 통과하면 바로 확인 팝업을 연다
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      await check(await file.text());
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
      <label htmlFor={textId} className={ui.fieldLabel}>
        {IMPORT.pasteLabel}
      </label>
      <textarea
        id={textId}
        className={ui.textarea}
        value={text}
        onChange={(e) => {
          // 다시 불러오기 전까지는 이전 요약으로 바꾸지 않게 결과를 지운다
          checkRef.current++;
          setText(e.target.value);
          setParsed(null);
          setMessage(null);
        }}
      />
      <button type="button" className={ui.secondary} disabled={text.trim() === ''} onClick={() => void check(text)}>
        {IMPORT.load}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".json,.txt,application/json,text/plain"
        className={styles.fileInput}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <button type="button" className={ui.secondary} onClick={() => fileRef.current?.click()}>
        {IMPORT.pickFile}
      </button>
      {message && (
        <p className={ui.error} role="alert">
          {message}
        </p>
      )}
      {step === 'replacing' && (
        <p className={styles.hint} role="status">
          {IMPORT.replacing}
        </p>
      )}
      {step === 'confirm' && parsed?.ok && (
        <ConfirmDialog
          title={IMPORT.confirmTitle}
          detail={
            <>
              <span className={styles.dialogStrong}>{IMPORT.summary(parsed.summary)}</span>
              <span className={styles.dialogLine}>{IMPORT.exportedAt(formatDate(parsed.summary.exportedAt))}</span>
              <span className={styles.dialogLine}>{IMPORT.confirmBody}</span>
            </>
          }
          confirmLabel={IMPORT.confirmLabel}
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

function GuideSection() {
  const { navigate } = useRoute();
  return (
    <section className={styles.section} aria-labelledby="settings-guide">
      <h2 id="settings-guide" className={styles.sectionTitle}>
        {SETTINGS.guideTitle}
      </h2>
      <button type="button" className={ui.secondary} onClick={() => navigate({ name: 'guide' })}>
        {SETTINGS.guideOpen}
      </button>
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
