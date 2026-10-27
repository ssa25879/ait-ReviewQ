// day7-card-input 여러 장 추가·예시 덱·데모 데이터 확인(헤드리스 Edge·CDP). 5199 기본 빌드, 5197 데모 플래그(VITE_DEMO_DATA=true)
// 사용: node card-input.mjs <chromePath> <outDir>
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
// day7-card-input 확인: 기본 빌드(5199), 데모 플래그 빌드(5197, VITE_DEMO_DATA=true)
const DEMO_APP = 'http://localhost:5197/';
if (process.env.E2E_STREAM) { const push = results.push.bind(results); results.push = (...r) => (console.log(...r), push(...r)); }
const hash = () => evaluate(`location.hash`);
const text = () => t(`return __t.text()`);
const h1 = () => t(`return __t.h1()`);
const hasButton = (label) => t(`return __t.buttons(${JSON.stringify(label)}).length > 0`);
const click = async (label) => { await t(`__t.click(${JSON.stringify(label)})`); await sleep(400); };
const fresh = async (url) => { await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await load(url); await hook(); };
const ls = (k) => t(`return __ls(${JSON.stringify(k)})`);
const snapshot = () => t(`return JSON.stringify(Object.keys(localStorage).filter((k) => k.startsWith('__ait_storage:bq:')).sort().map((k) => [k, localStorage.getItem(k)]))`);
const dialogTitle = () => t(`return document.querySelector('[role=dialog] h2')?.textContent ?? null`);
const typeBulk = async (value) => { await t(`__t.setValue(document.querySelector('textarea'), ${JSON.stringify(value)})`); await sleep(200); };
const addLabel = () => t(`return document.querySelector('[class*="bottomBar"] button').textContent.trim()`);
const addDisabled = () => t(`return document.querySelector('[class*="bottomBar"] button').disabled`);
const today = () => t(`return (await __mods()).date.todayLocal()`);

try {
  // ── 예시 덱
  await load(APP); await hook();
  await evaluate(`localStorage.clear()`); await fresh(APP);
  check('첫 사용 홈에 예시 카드로 둘러보기', await hasButton('예시 카드로 둘러보기') && (await text()).includes('과목·덱 관리에서 지울 수 있어요'));
  await audit('홈 첫 사용(예시 버튼)');
  await t(`__t.click('예시 카드로 둘러보기'); __t.buttons('예시 카드로 둘러보기')[0]?.click();`);
  await sleep(1200);
  const subjects = JSON.parse(await ls('bq:subjects'));
  const decks = JSON.parse(await ls('bq:decks'));
  check('예시 과목 1개·덱 1개(연타해도 한 번)', subjects.length === 1 && subjects[0].name === '예시' && decks.length === 1 && decks[0].name === '영단어 기초', JSON.stringify(subjects.map((s) => s.name)));
  const deckId = decks[0].id;
  check('예시 덱 카드 10장', JSON.parse(await ls(`bq:cards:${deckId}`)).length === 10);
  check('홈 오늘 복습 10장·학습 시작·예시 버튼 사라짐', (await text()).includes('10장') && (await hasButton('학습 시작')) && !(await hasButton('예시 카드로 둘러보기')));

  // ── 여러 장 추가: 진입·뒤로가기·직접 열기
  await fresh(APP + `#/deck/${deckId}`);
  check('덱 상세에 여러 장 한 번에 추가', await t(`return [...document.querySelectorAll('button')].some((b) => b.textContent.includes('여러 장 한 번에 추가'))`));
  await t(`__t.clickRow('여러 장 한 번에 추가')`); await sleep(400);
  check('덱 상세 → 여러 장 추가 화면', (await hash()) === `#/deck/${deckId}/cards/bulk` && (await h1()) === '여러 장 한 번에 추가');
  await evaluate(`history.back()`); await sleep(400);
  check('뒤로가기 → 덱 상세', (await hash()) === `#/deck/${deckId}` && (await h1()) === '영단어 기초');
  await fresh(APP + `#/deck/${deckId}/cards/bulk`);
  check('주소로 바로 열기', (await h1()) === '여러 장 한 번에 추가');
  check('입력 전 추가 버튼 비활성', await addDisabled());
  await evaluate(`history.back()`); await sleep(400);
  check('직접 연 화면에서 뒤로가기 → 덱 상세', (await hash()) === `#/deck/${deckId}`);

  // ── 모두 올바름 → 덱 상세 복귀(연타 1회)
  await fresh(APP + `#/deck/${deckId}/cards/bulk`);
  await typeBulk('table / 탁자\nchair | 의자\nwindow\t창문');
  check('미리 보기 3장', (await text()).includes('3장 추가 예정') && (await addLabel()) === '3장 추가' && !(await addDisabled()));
  await audit('여러 장 추가(미리 보기)'); await shot('bulk-preview');
  await t(`const b = document.querySelector('[class*="bottomBar"] button'); b.click(); b.click();`);
  await sleep(1000);
  const cards13 = JSON.parse(await ls(`bq:cards:${deckId}`));
  check('추가 → 덱 상세 복귀', (await hash()) === `#/deck/${deckId}`);
  check('연타해도 3장만 추가(10 → 13)', cards13.length === 13, String(cards13.length));
  const added = cards13.slice(-3);
  const td = await today();
  check('입력 순서·내용 그대로·오늘 복습', JSON.stringify(added.map((c) => [c.question, c.answer])) === JSON.stringify([['table', '탁자'], ['chair', '의자'], ['window', '창문']]) && added.every((c) => c.schedule.dueDate <= td));

  // ── 오류 줄 섞임 → 오류 줄만 남김
  await fresh(APP + `#/deck/${deckId}/cards/bulk`);
  await typeBulk('desk / 책상\n구분자 없는 줄\nlamp / 전등');
  check('미리 보기 2장·오류 1줄·줄 번호와 이유', (await text()).includes('2장 추가 예정') && (await text()).includes('오류 1줄') && (await text()).includes('2번째 줄') && (await text()).includes('또는 "|"가 없어요'));
  await audit('여러 장 추가(오류 줄)'); await shot('bulk-errors');
  await t(`document.querySelector('[class*="bottomBar"] button').click()`); await sleep(1000);
  check('오류 섞임 → 화면 유지·오류 줄만 남김·안내', (await h1()) === '여러 장 한 번에 추가' && (await t(`return document.querySelector('textarea').value`)) === '구분자 없는 줄' && (await text()).includes('2장을 추가했어요'));
  check('2장 추가(13 → 15)', JSON.parse(await ls(`bq:cards:${deckId}`)).length === 15);
  check('남은 오류 줄만으로는 추가 불가', await addDisabled());

  // ── 201줄
  await typeBulk(Array.from({ length: 201 }, (_, i) => `q${i} / a${i}`).join('\n'));
  check('201줄 → 안내·추가 비활성', (await text()).includes('200줄까지') && (await addDisabled()));

  // ── 기본 빌드에는 데모 데이터 항목 없음
  await fresh(APP + '#/settings');
  check('기본 빌드: 데모 데이터 채우기 없음', !(await hasButton('데모 데이터 채우기')) && !(await text()).includes('테스트용'));

  // ── 데모 플래그 빌드
  await fresh(DEMO_APP); await evaluate(`localStorage.clear()`); await fresh(DEMO_APP);
  await t(`
    const { actions } = await __mods(); const { dispatch } = __app();
    const s = actions.addSubject('내 과목'); dispatch(s);
    await __wait(900);`);
  await fresh(DEMO_APP + '#/settings'); await sleep(500);
  check('플래그 빌드: 데모 데이터 채우기 보임', await hasButton('데모 데이터 채우기'));
  await audit('설정(데모 항목)');
  const snapDemo = await snapshot();
  await click('데모 데이터 채우기');
  check('확인 대화상자', (await dialogTitle()) === '데모 데이터로 바꿀까요?');
  await t(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === '취소').click()`); await sleep(300);
  check('취소 → 무변경', (await snapshot()) === snapDemo);
  await click('데모 데이터 채우기'); await click('바꾸기'); await sleep(1500);
  const demoSubjects = JSON.parse(await ls('bq:subjects'));
  check('채우기 → 홈·과목 3개 이상', (await hash()) === '#/' && demoSubjects.length >= 3 && !demoSubjects.some((s) => s.name === '내 과목'), JSON.stringify(demoSubjects.map((s) => s.name)));
  check('홈 오늘 복습 카드 있음', await hasButton('학습 시작'));
  await fresh(DEMO_APP + '#/stats');
  const recent = await t(`return [...document.querySelectorAll('[aria-label="최근 7일 학습"] li')].map((li) => li.textContent)`);
  check('통계 최근 7일 학습에 0이 아닌 날', recent.length === 7 && recent.some((r) => /[1-9]\d*장$/.test(r)), JSON.stringify(recent));
  check('이전 데이터 보관', JSON.parse(await ls('bq:backup:beforeImport')).subjects[0]?.name === '내 과목');

  for (const [name, a] of Object.entries(audits)) {
    check(`글자 13px 이상: ${name}`, a.minFont >= 13, `최소 ${a.minFont}px("${a.minAt}")`);
    check(`터치 44px 이상: ${name}`, a.small.length === 0, a.small.join(', '));
  }
  check('예상 밖 콘솔 오류 없음', consoleErrors.length === 0, consoleErrors.join(' | '));
} catch (e) {
  check('스크립트 실행', false, e.message);
} finally {
  console.log(results.join('\n'));
  console.log(`\n${countable().length - failed}/${countable().length} 통과`);
  ws.close();
  chrome.kill();
  process.exitCode = failed ? 1 : 0;
}
