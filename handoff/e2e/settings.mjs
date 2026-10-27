// day6-settings 설정 화면 확인(헤드리스 Edge·CDP). 5199 기본 빌드, 5198 알림 플래그 on(VITE_NOTIFICATION_ENABLED=true, 테스트 템플릿 코드)
// 사용: node settings.mjs <chromePath> <outDir>
import { spawn } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [chromePath, outDir] = process.argv.slice(2);
const APP = 'http://localhost:5199/';
const PORT = 9333;
const profile = join(outDir, 'profile');
rmSync(profile, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const chrome = spawn(chromePath, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=390,844', '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const consoleErrors = [];
let failed = 0;
function check(name, ok, detail = '') {
  results.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
}

async function connect() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/new?${APP}`, { method: 'PUT' });
      return (await res.json()).webSocketDebuggerUrl;
    } catch { await sleep(200); }
  }
  throw new Error('Chrome 연결 실패');
}

const ws = new WebSocket(await connect());
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const pending = new Map();
const listeners = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  } else if (msg.method) listeners.forEach((l) => l(msg));
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

listeners.push((m) => {
  if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
    consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
});
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

// 페이지 안 도우미
const HELPERS = `
window.__t = {
  visible(el) { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; },
  buttons(text) { return [...document.querySelectorAll('button')].filter((b) => this.visible(b) && b.textContent.trim() === text); },
  click(text, index = 0) { const b = this.buttons(text)[index]; if (!b) throw new Error('버튼 없음: ' + text); b.click(); },
  clickLabel(label) { const b = document.querySelector('[aria-label="' + label + '"]'); if (!b) throw new Error('라벨 없음: ' + label); b.click(); },
  clickRow(text) { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes(text)); if (!b) throw new Error('행 없음: ' + text); b.click(); },
  setValue(el, value) {
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  },
  fillDialog(value) { this.setValue(document.querySelector('[role=dialog] input'), value); },
  fillCard(q, a) { const [tq, ta] = document.querySelectorAll('textarea'); if (q !== null) this.setValue(tq, q); if (a !== null) this.setValue(ta, a); },
  text() { return document.body.innerText; },
  h1() { return document.querySelector('h1')?.textContent ?? ''; },
  // 렌더된 텍스트의 최소 글자 크기와 44px 미만 버튼
  audit() {
    let minFont = Infinity, minAt = '';
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const n = walker.currentNode; if (!n.textContent.trim()) continue;
      const el = n.parentElement; if (!this.visible(el)) continue;
      const size = parseFloat(getComputedStyle(el).fontSize);
      if (size < minFont) { minFont = size; minAt = n.textContent.trim().slice(0, 20); }
    }
    const small = [...document.querySelectorAll('button, input, textarea')].filter((b) => this.visible(b))
      .filter((b) => b.getBoundingClientRect().height < 44).map((b) => b.textContent.trim() || b.getAttribute('aria-label'));
    return { minFont, minAt, small };
  },
};`;

async function load(url) {
  await send('Page.navigate', { url });
  await waitFor(`document.querySelector('h1')`);
  await evaluate(HELPERS);
}
async function reload() {
  await send('Page.reload');
  await sleep(300);
  await waitFor(`document.querySelector('h1')`);
  await evaluate(HELPERS);
}
async function waitFor(expr, timeout = 5000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { if (await evaluate(`!!(${expr})`)) return; } catch {}
    await sleep(100);
  }
  throw new Error('대기 시간 초과: ' + expr);
}
const t = (code) => evaluate(`(async () => { ${code} })()`);
const settle = () => sleep(150);
async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(data, 'base64'));
}
const audits = {};
async function audit(name) { audits[name] = await t(`return __t.audit()`); }

// 앱 안에서 ContentProvider 값({ status, state, dispatch })과 앱 모듈을 꺼내는 도우미
const APP_HOOK = `
window.__app = () => {
  const root = document.getElementById('root');
  const key = Object.keys(root).find((k) => k.startsWith('__reactContainer$'));
  const stack = [root[key]];
  while (stack.length) {
    const f = stack.pop();
    if (!f) continue;
    const v = f.memoizedProps?.value;
    if (v && typeof v.dispatch === 'function' && v.state?.logs) return v;
    stack.push(f.sibling, f.child);
  }
  throw new Error('ContentProvider 값을 찾지 못함');
};
window.__ls = (k) => localStorage.getItem('__ait_storage:' + k);
window.__mods = async () => ({
  actions: (await import('/src/app/actions.ts')).actions,
  date: await import('/src/utils/date.ts'),
  queue: await import('/src/domain/queue.ts'),
  session: await import('/src/domain/session.ts'),
});
window.__wait = (ms) => new Promise((res) => setTimeout(res, ms));`;
const hook = () => evaluate(APP_HOOK);
const countable = () => results.filter((r) => !r.startsWith('INFO'));
// day6-settings 확인: 기본 빌드(5199)와 알림 플래그 on 빌드(5198, 테스트 템플릿 코드)
const FLAGS_APP = 'http://localhost:5198/';
if (process.env.E2E_STREAM) { const push = results.push.bind(results); results.push = (...r) => (console.log(...r), push(...r)); }
const hash = () => evaluate(`location.hash`);
const text = () => t(`return __t.text()`);
const h1 = () => t(`return __t.h1()`);
const hasButton = (label) => t(`return __t.buttons(${JSON.stringify(label)}).length > 0`);
const click = async (label) => { await t(`__t.click(${JSON.stringify(label)})`); await sleep(400); };
const fresh = async (url) => { await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await load(url); await hook(); await capture(); };
const sdkCalls = (prefix) => t(`return __ait.state.sdkCallLog.filter((e) => e.method.includes(${JSON.stringify(prefix)})).length`);
const meta = () => t(`return JSON.parse(localStorage.getItem('__ait_storage:bq:meta'))`);
// bq: 키와 값 스냅샷(저장소가 바뀌지 않았는지 비교)
const snapshot = () => t(`return JSON.stringify(Object.keys(localStorage).filter((k) => k.startsWith('__ait_storage:bq:')).sort().map((k) => [k, localStorage.getItem(k)]))`);
const bqKeys = () => t(`return Object.keys(localStorage).filter((k) => k.startsWith('__ait_storage:bq:')).map((k) => k.slice('__ait_storage:'.length)).sort()`);
const dialogTitle = () => t(`return document.querySelector('[role=dialog] h2')?.textContent ?? null`);
const dialogCancel = async () => { await t(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === '취소').click()`); await sleep(300); };
// devtools 모의의 파일 저장은 a[download]를 누른다. 실제 다운로드 대신 인자를 모은다(__saveFail이면 예외)
async function capture() {
  await evaluate(`
    window.__saved = window.__saved ?? [];
    window.__saveFail = false;
    HTMLAnchorElement.prototype.click = function () {
      if (!this.download) return;
      if (window.__saveFail) throw new Error('저장 실패 주입');
      window.__saved.push({ href: this.href, fileName: this.download });
    };`);
}
const saved = () => t(`return window.__saved.length`);
// 마지막 저장 파일을 디코딩해 형식 검증 결과와 함께 돌려준다
const lastDoc = () => t(`
  const s = window.__saved.at(-1);
  const [head, b64] = s.href.split(',');
  const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  const text = new TextDecoder().decode(bytes);
  const { validateExport } = await import('/src/infra/storage/exportData.ts');
  return { head, fileName: s.fileName, text, doc: JSON.parse(text), valid: validateExport(JSON.parse(text)) };`);
const exportText = () => t(`return document.querySelector('textarea[readonly]')?.value ?? ''`);
// 페이지를 다시 열지 않고 홈을 거쳐 화면을 다시 마운트한다
const remount = async (target) => {
  await t(`history.pushState(null, '', '#/'); dispatchEvent(new PopStateEvent('popstate'))`); await sleep(300);
  await t(`history.pushState(null, '', ${JSON.stringify(target)}); dispatchEvent(new PopStateEvent('popstate'))`); await sleep(400);
};
const today = () =>t(`return (await __mods()).date.todayLocal()`);

try {
  // ── 진입·뒤로가기
  await load(APP); await hook();
  await evaluate(`localStorage.clear()`); await fresh(APP);
  check('홈에 설정 행', await hasButton('설정'));
  await click('설정');
  check('홈 → 설정', (await hash()) === '#/settings' && (await h1()) === '설정');
  await evaluate(`history.back()`); await sleep(400);
  check('설정에서 뒤로가기 → 홈', (await hash()) === '#/' && (await h1()) === '오늘 복습');
  await fresh(APP + '#/settings');
  check('#/settings 직접 열기', (await h1()) === '설정');
  await reload(); await hook(); await capture();
  check('새로고침 시 설정 유지', (await h1()) === '설정');
  await evaluate(`history.back()`); await sleep(400);
  check('직접 연 설정에서 뒤로가기 → 홈', (await hash()) === '#/' && (await h1()) === '오늘 복습');

  // ── 고지·기본 빌드의 알림 항목
  await fresh(APP + '#/settings');
  check('카드 0장에서도 저장 위치 고지', (await text()).includes('데이터는 이 기기에만 저장돼요') && (await text()).includes('백업을 내보내'));
  check('기본 빌드: 복습 알림 항목 없음·요청 0회', !(await text()).includes('복습 알림') && (await sdkCalls('otification')) === 0);
  check('설정 화면에 광고 없음', (await t(`return document.querySelectorAll('[data-ad-slot]').length`)) === 0);

  // ── 내보내기: 빈 데이터
  await click('백업 내보내기'); await sleep(300);
  let d = await lastDoc();
  check('빈 데이터 내보내기: 파일 1회·유효한 문서', (await saved()) === 1 && d.valid && d.doc.subjects.length === 0 && Object.keys(d.doc.logs).length === 0);
  check('파일 이름·MIME', d.fileName === `reviewq-backup-${await today()}.json` && d.head === 'data:application/json;base64', `${d.fileName} ${d.head}`);
  check('저장 완료 안내', (await text()).includes('저장했어요'));
  await audit('설정(기본)'); await shot('settings-default');

  // ── 내보내기: 데이터·석 달 전 기록·알림 기록·저장 대기 중 편집
  const deckId = await t(`
    const { actions } = await __mods();
    const { dispatch } = __app();
    dispatch({ type: 'subject/add', id: 's-old', name: '옛과목', now: '2026-07-01T00:00:00.000Z' });
    const deck = actions.addDeck('s-old', '단어'); dispatch(deck);
    dispatch(actions.addCard(deck.id, '사과', 'apple'));
    await __wait(900);
    localStorage.setItem('__ait_storage:bq:logs:2026-07', JSON.stringify([{ id: 'l-old', cardId: 'x', date: '2026-07-02', grade: 'remember', prevStage: 0, nextStage: 1, reviewedAt: '2026-07-02T00:00:00.000Z' }]));
    const m = JSON.parse(localStorage.getItem('__ait_storage:bq:meta'));
    localStorage.setItem('__ait_storage:bq:meta', JSON.stringify({ ...m, notification: { agreed: false, lastAskedAt: '2026-10-01T00:00:00.000Z' } }));
    return deck.id;`);
  await fresh(APP + '#/settings'); // 시드한 저장소를 다시 불러온다(__app()이 이전 fiber를 읽지 않도록)
  await t(`
    const { state, dispatch } = __app();
    const card = state.cards[${JSON.stringify(deckId)}][0];
    dispatch({ type: 'card/update', id: card.id, deckId: card.deckId, question: card.question, answer: '고친정답', now: new Date().toISOString() });
    await __wait(30);
    __t.click('백업 내보내기');`);
  await sleep(600);
  d = await lastDoc();
  const cards = Object.values(d.doc.cards).flat();
  check('데이터 내보내기: 과목·덱·카드 포함·형식 검증 통과', d.valid && d.doc.subjects.length === 1 && d.doc.decks.length === 1 && cards.length === 1);
  check('석 달 전 판정 기록 포함', d.doc.logs['2026-07']?.[0]?.id === 'l-old', JSON.stringify(Object.keys(d.doc.logs)));
  check('저장 대기 중 편집 값을 내보냄', cards[0]?.answer === '고친정답', cards[0]?.answer);
  check('알림 기록·기기 식별자 없음', !d.text.includes('notification') && !d.text.includes('installId') && !d.text.includes((await meta()).installId));
  check('내보내기 뒤 저장소에도 편집 값', (await t(`return __ls('bq:cards:' + ${JSON.stringify(deckId)})`)).includes('고친정답'));

  // 연타
  const before = await saved();
  await t(`__t.click('백업 내보내기'); __t.click('백업 내보내기')`); await sleep(600);
  check('연타 → 파일 저장 1회', (await saved()) === before + 1, `${before} → ${await saved()}`);

  // 저장 실패
  const snapFail = await snapshot();
  await evaluate(`window.__saveFail = true`);
  await click('백업 내보내기'); await sleep(300);
  const failText = await exportText();
  check('저장 실패 → 안내·텍스트 표시', (await text()).includes('파일로 저장하지 못했어요') && failText.includes('"reviewq-backup"') && failText.includes('고친정답'));
  check('저장 실패 → 저장소 값 불변', (await snapshot()) === snapFail);
  await audit('설정(저장 실패 텍스트)'); await shot('settings-export-text');
  await evaluate(`window.__saveFail = false`);

  // 파일 저장 미지원(토스 앱 5.218.0 미만)
  // 모의 상태는 페이지를 다시 열면 초기화되므로, 바꾼 뒤 화면만 다시 연다
  await fresh(APP + '#/settings');
  await evaluate(`__ait.update({ environment: 'toss', appVersion: '5.200.0' })`);
  await remount('#/settings');
  const beforeUnsup = await saved();
  await click('백업 내보내기'); await sleep(300);
  check('미지원 → 파일 저장 0회·텍스트 표시', (await saved()) === beforeUnsup && (await text()).includes('파일로 저장할 수 없어요') && (await exportText()).includes('"reviewq-backup"'));
  await evaluate(`__ait.update({ environment: 'sandbox', appVersion: '5.240.0' })`);

  // ── 전체 삭제: 취소
  await fresh(APP + '#/settings');
  const snapCancel = await snapshot();
  await click('모든 데이터 삭제');
  check('1단계 확인 대화상자', (await dialogTitle()) === '모든 데이터를 지울까요?' && (await text()).includes('되돌릴 수 없어요'));
  await dialogCancel();
  check('1단계 취소 → 저장소 불변·설정 유지', (await snapshot()) === snapCancel && (await dialogTitle()) === null && (await h1()) === '설정');
  await click('모든 데이터 삭제'); await click('계속');
  check('2단계 최종 확인 대화상자', (await dialogTitle()) === '정말 지울까요?');
  await dialogCancel();
  check('2단계 취소 → 저장소 불변', (await snapshot()) === snapCancel);

  // 삭제 실패 주입
  await t(`
    const { appStorage } = await import('/src/app/bootstrap.ts');
    window.__origClear = appStorage.clearItems;
    appStorage.clearItems = () => Promise.reject(new Error('삭제 실패 주입'));`);
  await click('모든 데이터 삭제'); await click('계속'); await click('삭제'); await sleep(300);
  check('삭제 실패 → 안내·다시 시도·설정 유지', (await text()).includes('데이터를 지우지 못했어요') && (await hasButton('다시 시도')) && (await h1()) === '설정');
  check('삭제 실패 → 데이터 남음', (await bqKeys()).includes('bq:subjects') && (await t(`return __app().state.subjects.length`)) === 1);
  await t(`(await import('/src/app/bootstrap.ts')).appStorage.clearItems = window.__origClear`);
  await click('다시 시도');
  check('다시 시도 → 최종 확인', (await dialogTitle()) === '정말 지울까요?');
  await dialogCancel();

  // 저장 대기 중 편집 직후 전체 삭제
  await t(`
    const { state, dispatch } = __app();
    const card = state.cards[${JSON.stringify(deckId)}][0];
    dispatch({ type: 'card/update', id: card.id, deckId: card.deckId, question: card.question, answer: '삭제직전', now: new Date().toISOString() });
    await __wait(30);
    __t.click('모든 데이터 삭제'); await __wait(50);
    __t.click('계속'); await __wait(50);
    __t.click('삭제');`);
  await sleep(1500);
  const afterKeys = await bqKeys();
  check('전체 삭제 → bq: 키는 새 bq:meta만', JSON.stringify(afterKeys) === '["bq:meta"]', JSON.stringify(afterKeys));
  check('전체 삭제 → 알림 기록 없음', (await meta())?.notification === undefined);
  check('전체 삭제 → 홈 첫 사용 상태', (await hash()) === '#/' && (await text()).includes('복습큐를 시작해 볼까요?'));
  check('편집 직후 삭제해도 카드가 다시 저장되지 않음', !(await t(`return Object.keys(localStorage).some((k) => k.includes('bq:cards:'))`)));
  await reload(); await hook();
  check('삭제 후 재실행 → 빈 상태', (await text()).includes('복습큐를 시작해 볼까요?') && (await t(`return __app().state.subjects.length`)) === 0);

  // ── 알림 플래그 on
  await fresh(FLAGS_APP); await evaluate(`localStorage.clear()`); await fresh(FLAGS_APP + '#/settings');
  check('플래그 on: 복습 알림 항목·아직 정하지 않음', (await text()).includes('복습 알림') && (await text()).includes('아직 정하지 않았어요') && (await hasButton('알림 받기')));
  check('플래그 on: 설정 진입만으로 요청 0회', (await sdkCalls('otification')) === 0);
  check('플래그 on: 설정 화면에 광고 없음', (await t(`return document.querySelectorAll('[data-ad-slot]').length`)) === 0);
  await audit('설정(알림 on)'); await shot('settings-notify');

  await evaluate(`__ait.patch('notification', { nextResult: 'agreementRejected' })`);
  await click('알림 받기'); await sleep(300);
  const rej1 = (await meta()).notification;
  check('설정에서 거부 → agreed false·상태 받지 않음', rej1?.agreed === false && !!rej1?.lastAskedAt && (await text()).includes('받지 않고 있어요') && (await hasButton('알림 받기')), JSON.stringify(rej1));
  await sleep(20);
  await click('알림 받기'); await sleep(300);
  const rej2 = (await meta()).notification;
  check('다시 거부 → lastAskedAt 갱신', rej2?.agreed === false && rej2.lastAskedAt > rej1.lastAskedAt, `${rej1?.lastAskedAt} → ${rej2?.lastAskedAt}`);

  // 거부 기록 후 학습 완료 화면에 버튼 없음
  const deck2 = await t(`
    const { actions } = await __mods();
    const { dispatch } = __app();
    const subj = actions.addSubject('영어'); dispatch(subj);
    const deck = actions.addDeck(subj.id, '단어'); dispatch(deck);
    dispatch(actions.addCard(deck.id, 'q', 'a'));
    await __wait(900);
    return deck.id;`);
  await fresh(`${FLAGS_APP}#/deck/${deck2}/study`);
  await t(`document.querySelector('button[aria-expanded]').click()`); await sleep(150);
  await click('기억함'); await sleep(400);
  check('설정에서 거부 후 학습 완료 화면에 알림 버튼 없음', (await h1()) === '오늘 학습을 마쳤어요' && !(await hasButton('복습 알림 받기')));

  // 요청 오류
  await fresh(FLAGS_APP + '#/settings');
  await evaluate(`__ait.patch('failureModes', { requestNotificationAgreement: '5000' })`);
  await click('알림 받기'); await sleep(300);
  check('재요청 오류 → 기록 불변·실패 안내', JSON.stringify((await meta()).notification) === JSON.stringify(rej2) && (await text()).includes('알림 설정을 열지 못했어요'));
  await evaluate(`__ait.patch('failureModes', { requestNotificationAgreement: null })`);

  // 거부한 사용자의 재요청 동의 (N-06)
  await evaluate(`__ait.patch('notification', { nextResult: 'newAgreement' })`);
  await click('알림 받기'); await sleep(300);
  const agreed = (await meta()).notification;
  check('재요청 동의 → agreed true·agreedAt·상태 받는 중 (N-06)', agreed?.agreed === true && !!agreed?.agreedAt && (await text()).includes('복습 알림을 받고 있어요') && !(await hasButton('알림 받기')), JSON.stringify(agreed));
  await fresh(FLAGS_APP + '#/settings');
  check('동의 기록이 있으면 받는 중·버튼 없음·끄는 방법 안내', (await text()).includes('복습 알림을 받고 있어요') && !(await hasButton('알림 받기')) && (await text()).includes('토스 앱 설정'));

  // 알림 미지원(토스 앱 5.255.0 미만)
  await evaluate(`__ait.update({ environment: 'toss', appVersion: '5.250.0' })`);
  await remount('#/settings');
  check('알림 미지원 → 항목 없음', !(await text()).includes('복습 알림'));
  await evaluate(`__ait.update({ environment: 'sandbox', appVersion: '5.240.0' })`);

  for (const [name, a] of Object.entries(audits)) {
    check(`글자 13px 이상: ${name}`, a.minFont >= 13, `최소 ${a.minFont}px("${a.minAt}")`);
    check(`터치 44px 이상: ${name}`, a.small.length === 0, a.small.join(', '));
  }
  const unexpected = consoleErrors.filter((e) => !/백업 파일 저장 실패|전체 삭제 실패|알림 동의 요청 실패/.test(e));
  check('예상 밖 콘솔 오류 없음', unexpected.length === 0, unexpected.join(' | '));
} catch (e) {
  check('스크립트 실행', false, e.message);
} finally {
  console.log(results.join('\n'));
  console.log(`\n${countable().length - failed}/${countable().length} 통과`);
  ws.close();
  chrome.kill();
  process.exitCode = failed ? 1 : 0;
}
