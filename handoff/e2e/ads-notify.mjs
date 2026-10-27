// day5-ads-notify 광고·알림 확인(헤드리스 Edge·CDP). 5199 기본 빌드, 5198 플래그 on(VITE_ADS_ENABLED·VITE_NOTIFICATION_ENABLED=true, 테스트 템플릿 코드)
// 사용: node ads-notify.mjs <chromePath> <outDir>
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

// day5-ads-notify 확인: 기본 빌드(5199, 플래그 off)와 플래그 on 빌드(5198, 테스트 ID·테스트 템플릿 코드)
const FLAGS_APP = 'http://localhost:5198/';
// 진행 상황을 바로 출력한다(멈춘 단계 확인용)
if (process.env.E2E_STREAM) { const push = results.push.bind(results); results.push = (...r) => (console.log(...r), push(...r)); }
const hash = () => evaluate(`location.hash`);
const text = () => t(`return __t.text()`);
const h1 = () => t(`return __t.h1()`);
const hasButton = (label) => t(`return __t.buttons(${JSON.stringify(label)}).length > 0`);
const click = async (label) => { await t(`__t.click(${JSON.stringify(label)})`); await sleep(400); };
const fresh = async (url) => { await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await load(url); await hook(); };
const slots = () => t(`return [...document.querySelectorAll('[data-ad-slot]')].map((s) => s.dataset.adSlot)`);
const adCalls = (method) => t(`return __ait.state.sdkCallLog.filter((e) => e.method === ${JSON.stringify(method)}).length`);
const sdkCalls = (prefix) => t(`return __ait.state.sdkCallLog.filter((e) => e.method.includes(${JSON.stringify(prefix)})).length`);
const meta = () => t(`return JSON.parse(localStorage.getItem('__ait_storage:bq:meta'))`);
const placeholders = () => t(`return document.querySelectorAll('[data-ait-slot-id]').length`);
// 과목 1·덱 1과 오늘 복습 카드 1장을 더 만든다(학습 완료 화면을 보기 위해)
async function addDueCard(deckId, q) {
  return t(`
    const { actions } = await __mods();
    const { state, dispatch } = __app();
    let id = ${JSON.stringify(deckId)};
    if (!id) {
      const subj = actions.addSubject('영어'); dispatch(subj);
      const deck = actions.addDeck(subj.id, '단어'); dispatch(deck); id = deck.id;
    }
    dispatch(actions.addCard(id, ${JSON.stringify(q)}, '정답'));
    await __wait(900);
    return id;
  `);
}
// 덱 학습을 열어 카드 1장을 기억함으로 판정해 완료 화면까지 간다
async function finishSession(base, deckId) {
  await fresh(`${base}#/deck/${deckId}/study`);
  await t(`document.querySelector('button[aria-expanded]').click()`); await sleep(150);
  await click('기억함'); await sleep(300);
}
const gap = (upperSel, lowerSel) => t(`
  const a = ${upperSel}, b = ${lowerSel};
  return a && b ? b.getBoundingClientRect().top - a.getBoundingClientRect().bottom : null;`);
const barTop = `document.querySelector('[class*="bottomBar"]')`;
// 광고 내용은 SDK(개발 환경에서는 devtools 모의)가 그리며 스타일을 바꾸면 안 되므로 글자·터치 검사에서 뺀다
async function auditApp(name) {
  await evaluate(`document.querySelectorAll('[data-ad-slot] > *').forEach((el) => { el.dataset.e2eDisplay = el.style.display; el.style.display = 'none'; })`);
  await audit(name);
  await evaluate(`document.querySelectorAll('[data-ad-slot] > *').forEach((el) => { el.style.display = el.dataset.e2eDisplay; })`);
}

try {
  // ── 기본 빌드(플래그 off)
  await load(APP); await hook();
  await evaluate(`localStorage.clear()`); await fresh(APP);
  const deckOff = await addDueCard(null, 'off-1');
  await fresh(APP + '#/subjects');
  check('기본 빌드: 과목·덱 목록에 광고 없음', (await slots()).length === 0);
  await finishSession(APP, deckOff);
  check('기본 빌드: 학습 완료 화면 도달', (await h1()) === '오늘 학습을 마쳤어요');
  check('기본 빌드: 학습 완료에 광고·알림 버튼 없음 (N-08)', (await slots()).length === 0 && !(await hasButton('복습 알림 받기')));
  check('기본 빌드: TossAds·알림 동의 호출 0회', (await sdkCalls('TossAds')) === 0 && (await sdkCalls('otification')) === 0);

  // ── 플래그 on 빌드
  await fresh(FLAGS_APP); await evaluate(`localStorage.clear()`); await fresh(FLAGS_APP);
  check('플래그 on: 앱 진입 직후 동의 요청 0회·대화상자 없음 (N-07)', (await sdkCalls('otification')) === 0 && !(await t(`return !!document.querySelector('[role=dialog]')`)));
  check('플래그 on: 홈에 광고 없음', (await slots()).length === 0);
  await fresh(FLAGS_APP + '#/subjects'); await sleep(600);
  check('빈 과목·덱 목록에는 광고 없음', (await text()).includes('아직 과목이 없어요') && (await slots()).length === 0 && (await adCalls('TossAds.attachBanner')) === 0);
  await fresh(FLAGS_APP);
  const deck = await addDueCard(null, 'on-1');
  await fresh(FLAGS_APP + '#/subjects'); await sleep(600);
  check('과목·덱 목록 광고 1개', JSON.stringify(await slots()) === '["subjects"]', JSON.stringify(await slots()));
  check('광고 그룹 ID = 테스트 ID', (await t(`return __ait.state.sdkCallLog.filter((e) => e.method === 'TossAds.attachBanner').map((e) => e.args[0])`)).every((id) => id === 'ait-ad-test-banner-id'));
  check('배너 렌더(모의 placeholder)', (await placeholders()) === 1);
  check('광고와 하단 고정 버튼 겹침 없음·24px 이상', (await gap(`document.querySelector('[data-ad-slot]')`, barTop)) >= 24);
  check('광고 위 요소와 24px 이상', (await gap(`document.querySelector('[data-ad-slot]').previousElementSibling`, `document.querySelector('[data-ad-slot]')`)) >= 24);
  await auditApp('과목·덱 목록(광고)'); await shot('ads-subjects');
  const init1 = await adCalls('TossAds.initialize');
  // 목록 → 덱 상세 → 목록 왕복
  await t(`__t.clickRow('단어')`); await sleep(400);
  check('덱 상세로 이동하면 배너 해제', (await slots()).length === 0 && (await placeholders()) === 0);
  await evaluate(`history.back()`); await sleep(600);
  check('왕복: initialize 1회·attachBanner 2회·배너 1개', init1 === 1 && (await adCalls('TossAds.initialize')) === 1 && (await adCalls('TossAds.attachBanner')) === 2 && (await placeholders()) === 1,
    `init ${await adCalls('TossAds.initialize')} attach ${await adCalls('TossAds.attachBanner')}`);
  await evaluate(`history.back()`); await sleep(400);
  check('광고 화면에서 뒤로가기 → 홈', (await hash()) === '#/' && (await h1()) === '오늘 복습');
  // 광고가 없어야 하는 화면
  await fresh(FLAGS_APP + '#/stats'); await sleep(300);
  check('통계 화면에 광고 없음', (await slots()).length === 0);
  const cardId = await t(`return __app().state.cards[${JSON.stringify(deck)}][0].id`);
  await fresh(FLAGS_APP + `#/deck/${deck}/card/${cardId}`); await sleep(300);
  check('카드 편집 화면에 광고 없음', (await slots()).length === 0);
  await fresh(FLAGS_APP + `#/deck/${deck}/study`); await sleep(300);
  check('학습 판정 화면에 광고 없음', (await slots()).length === 0 && (await t(`return !!document.querySelector('button[aria-expanded]')`)));

  // 학습 완료 화면: 알림 버튼과 광고
  await t(`document.querySelector('button[aria-expanded]').click()`); await sleep(150);
  await click('기억함'); await sleep(600);
  check('학습 완료 화면 광고 1개·알림 버튼', JSON.stringify(await slots()) === '["sessionDone"]' && (await hasButton('복습 알림 받기')));
  const notifyBtn = `__t.buttons('복습 알림 받기')[0]`;
  check('알림 버튼과 광고 24px 이상', (await gap(notifyBtn, `document.querySelector('[data-ad-slot]')`)) >= 24);
  check('학습 완료 광고와 하단 버튼 겹침 없음', (await gap(`document.querySelector('[data-ad-slot]')`, barTop)) >= 0);
  await auditApp('학습 완료(광고·알림)'); await shot('ads-session-done');
  // 동의 (N-02)
  await click('복습 알림 받기'); await sleep(300);
  const agreedMeta = await meta();
  check('동의 → notification.agreed true·agreedAt (N-02)', agreedMeta.notification?.agreed === true && !!agreedMeta.notification?.agreedAt && !!agreedMeta.notification?.lastAskedAt, JSON.stringify(agreedMeta));
  check('동의 → 버튼 대신 동의 안내', !(await hasButton('복습 알림 받기')) && (await text()).includes('복습 알림을 받을 수 있어요'));
  check('동의 기록과 함께 schemaVersion 2·lastOpenedDate 유지', agreedMeta.schemaVersion === 2 && !!agreedMeta.lastOpenedDate);
  await addDueCard(deck, 'on-2');
  await finishSession(FLAGS_APP, deck);
  check('동의 후 다음 완료 화면에 버튼 없음', !(await hasButton('복습 알림 받기')));

  // 거부 (N-03)·다른 기능 정상 (N-05)
  await evaluate(`localStorage.clear()`); await fresh(FLAGS_APP);
  const deck2 = await addDueCard(null, 'rej-1');
  await finishSession(FLAGS_APP, deck2);
  await evaluate(`__ait.patch('notification', { nextResult: 'agreementRejected' })`);
  await click('복습 알림 받기'); await sleep(300);
  const rejMeta = await meta();
  check('거부 → agreed false·lastAskedAt (N-03)', rejMeta.notification?.agreed === false && !!rejMeta.notification?.lastAskedAt && rejMeta.notification?.agreedAt === undefined, JSON.stringify(rejMeta.notification));
  check('거부 → 버튼 사라짐', !(await hasButton('복습 알림 받기')));
  await addDueCard(deck2, 'rej-2');
  await finishSession(FLAGS_APP, deck2);
  check('거부 후 다음 완료 화면에 버튼 없음·판정 저장 정상 (N-05)', !(await hasButton('복습 알림 받기')) && (await h1()) === '오늘 학습을 마쳤어요'
    && JSON.parse(await t(`return __ls('bq:logs:' + (await __mods()).date.todayLocal().slice(0, 7))`)).length === 2);

  // 요청 오류
  await evaluate(`localStorage.clear()`); await fresh(FLAGS_APP);
  const deck3 = await addDueCard(null, 'err-1');
  await finishSession(FLAGS_APP, deck3);
  await evaluate(`__ait.patch('failureModes', { requestNotificationAgreement: '5000' })`);
  await click('복습 알림 받기'); await sleep(300);
  check('요청 오류 → 기록 없음·버튼 유지·안내', (await meta()).notification === undefined && (await hasButton('복습 알림 받기')) && (await text()).includes('알림 설정을 열지 못했어요'));
  await auditApp('알림 요청 오류');
  await evaluate(`__ait.patch('failureModes', { requestNotificationAgreement: null })`);

  // 지원 여부: 토스 앱 버전으로 판정(sandbox가 아닌 환경)
  await evaluate(`__ait.update({ environment: 'toss', appVersion: '5.250.0' })`);
  await addDueCard(deck3, 'err-2');
  // 같은 학습 경로로는 다시 마운트되지 않으므로 홈을 거쳐 연다
  await t(`history.pushState(null, '', '#/'); dispatchEvent(new PopStateEvent('popstate'))`); await sleep(300);
  await t(`history.pushState(null, '', '#/deck/${deck3}/study'); dispatchEvent(new PopStateEvent('popstate'))`); await sleep(400);
  await t(`document.querySelector('button[aria-expanded]').click()`); await sleep(150);
  await click('기억함'); await sleep(600);
  check('5.250.0: 알림 미지원 → 버튼 없음·광고는 표시 (N-01)', (await h1()) === '오늘 학습을 마쳤어요' && !(await hasButton('복습 알림 받기')) && (await slots()).length === 1, `${await h1()} ${JSON.stringify(await slots())}`);
  await evaluate(`__ait.update({ appVersion: '5.240.0' })`);
  await t(`history.pushState(null, '', '#/subjects'); dispatchEvent(new PopStateEvent('popstate'))`); await sleep(500);
  check('5.240.0: 배너 미지원 → 광고 영역·빈 공간 없음', (await h1()) === '과목·덱' && (await slots()).length === 0 && (await placeholders()) === 0);
  await evaluate(`__ait.update({ environment: 'sandbox' })`);

  // 광고 없음(No fill) → 영역 접힘
  await evaluate(`__ait.patch('ads', { forceNoFill: true })`);
  await t(`history.pushState(null, '', '#/'); dispatchEvent(new PopStateEvent('popstate'))`); await sleep(300);
  await t(`history.pushState(null, '', '#/subjects'); dispatchEvent(new PopStateEvent('popstate'))`); await sleep(1500);
  check('No fill → 광고 영역 사라짐', (await slots()).length === 0 && (await placeholders()) === 0, JSON.stringify(await slots()));
  await evaluate(`__ait.patch('ads', { forceNoFill: false })`);

  for (const [name, a] of Object.entries(audits)) {
    check(`글자 13px 이상: ${name}`, a.minFont >= 13, `최소 ${a.minFont}px("${a.minAt}")`);
    check(`터치 44px 이상: ${name}`, a.small.length === 0, a.small.join(', '));
  }
  const unexpected = consoleErrors.filter((e) => !e.includes('알림 동의 요청 실패'));
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
