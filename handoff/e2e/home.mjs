// day4-home-queue 홈·전체 세션·날짜 규칙 확인(헤드리스 Edge·CDP)
// 사용: E2E_SHIFT='{"tz":"...","date":"YYYY-MM-DD"}' node home.mjs <chromePath> <outDir>
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

// day4-home-queue 확인
const hash = () => evaluate(`location.hash`);
const text = () => t(`return __t.text()`);
const h1 = () => t(`return __t.h1()`);
const prog = () => t(`return document.querySelector('main header p')?.textContent ?? ''`);
const hasButton = (label) => t(`return __t.buttons(${JSON.stringify(label)}).length > 0`);
const click = async (label) => { await t(`__t.click(${JSON.stringify(label)})`); await sleep(300); };
const dialogShown = () => t(`return !!document.querySelector('[role=dialog]')`);
const question = () => t(`return document.querySelector('button[aria-expanded] span:nth-child(2)')?.textContent ?? ''`);
const meta = () => t(`return JSON.parse(__ls('bq:meta'))`);
const homeCount = () => t(`return document.querySelector('section[aria-label^="오늘 복습 "]')?.getAttribute('aria-label') ?? ''`); // 요약 카드의 '오늘 복습 N장'
const subjectRow = (name) => t(`return [...document.querySelectorAll('main li button')].map((b) => b.textContent).find((x) => x.startsWith(${JSON.stringify(name)})) ?? ''`);
const fresh = async (url) => { await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await load(url); await hook(); };
// 저장소를 비우고 홈부터 새로 연다
async function reset() {
  await evaluate(`localStorage.clear(); localStorage.setItem('__ait_storage:bq:guide', 'true')`);
  await fresh(APP);
}
// { 과목: { 덱: [다음 복습일, ...] } } 대로 만든다. 카드 질문은 덱이름+번호(만든 순서)
async function seed(spec) {
  const ids = await t(`
    const { actions } = await __mods();
    const { dispatch } = __app();
    const spec = ${JSON.stringify(spec)};
    const out = {}; let n = 0;
    for (const [sName, decks] of Object.entries(spec)) {
      const subj = actions.addSubject(sName); dispatch(subj);
      for (const [dName, dues] of Object.entries(decks)) {
        const deck = actions.addDeck(subj.id, dName); dispatch(deck); out[dName] = deck.id;
        for (const due of dues) {
          n++;
          dispatch({ type: 'card/add', id: 'e2e-' + n + '-' + Math.random().toString(36).slice(2, 8), deckId: deck.id,
            question: dName + n, answer: 'a' + n, now: new Date(Date.UTC(2026, 0, 1) + n * 1000).toISOString(), today: due });
        }
      }
    }
    await __wait(900); // 저장 지연(400ms) 뒤 저장소에 반영
    return out;
  `);
  await settle();
  return ids;
}
// 세션 카드를 차례로 뒤집고 판정한다
const judgeAll = (count, label = '기억함') => t(`
  for (let i = 0; i < ${count}; i++) {
    document.querySelector('button[aria-expanded]').click(); await __wait(40);
    [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '${label}').click(); await __wait(40);
  }`);

try {
  await load(APP);
  await hook();
  const today = await t(`return (await __mods()).date.todayLocal()`);
  const D = async (k) => t(`return (await __mods()).date.addDays('${today}', ${k})`);
  const [m3, m1, p1, p5] = [await D(-3), await D(-1), await D(1), await D(5)];
  const label = (d) => { const [, m, dd] = d.split('-').map(Number); return `${m}월 ${dd}일`; };
  const NOTICE = (n) => `오늘은 100장까지 학습해요. 나머지 ${n}장은 내일 이어서 나와요.`;

  // ── 첫 사용
  await reset();
  check('최초 화면 #/ = 홈', (await hash()) === '#/' && (await h1()) === '오늘 복습', await hash());
  check('카드 0장 → 첫 사용 안내', (await text()).includes('복습큐를 시작해 볼까요?'));
  check('카드 0장 → 과목·단원 만들기 버튼·학습 시작 없음', (await hasButton('과목·단원 만들기')) && !(await hasButton('학습 시작')));
  check('카드 0장 → 예시 카드로 둘러보기 버튼', await hasButton('예시 카드로 둘러보기'));
  check('진입 시 대화상자 없음', !(await dialogShown()));
  await audit('홈 첫 사용'); await shot('home-first');
  await click('과목·단원 만들기');
  check('과목·단원 만들기 → 목록', (await hash()) === '#/subjects' && (await h1()) === '과목·단원');

  // ── 오늘 2장 + 연체 1장 + 내일 4장
  await reset();
  const mixed = { 영어: { 단어: [today, today], 문법: [m3, p1] }, 수학: { 공식: [p1, p1, p1] } };
  await seed(mixed);
  const homeText = await text();
  check('오늘 복습 3장·연체 1장', homeText.includes('3장') && homeText.includes('연체 1장'), homeText.replace(/\n/g, ' ').slice(0, 80));
  check('과목별: 영어 3장·수학 0장', (await subjectRow('영어')).includes('3장') && (await subjectRow('수학')).includes('0장'), `${await subjectRow('영어')} / ${await subjectRow('수학')}`);
  check('과목 관리 타일 + 하단 학습 시작', (await hasButton('과목 관리')) && (await hasButton('학습 시작')));
  check('상한 안내·시계 경고 없음', !homeText.includes('내일 이어서') && !homeText.includes('기기 날짜'));
  await audit('홈'); await shot('home');
  await click('과목 관리');
  check('과목·단원 관리 → 목록', (await hash()) === '#/subjects' && (await h1()) === '과목·단원');
  await evaluate(`history.back()`); await sleep(300);
  check('목록에서 뒤로가기 → 홈', (await hash()) === '#/' && (await h1()) === '오늘 복습');
  await t(`__t.clickRow('수학')`); await sleep(300);
  check('과목 행 → 목록', (await hash()) === '#/subjects');
  await evaluate(`history.back()`); await sleep(300);

  // 전체 덱 세션
  await click('학습 시작');
  check('학습 시작 → #/study·제목 오늘 복습', (await hash()) === '#/study' && (await h1()) === '오늘 복습');
  check('진행 1 / 3', (await prog()) === '1 / 3', await prog());
  const order = [];
  for (let i = 0; i < 3; i++) { order.push(await question()); await judgeAll(1); await settle(); }
  check('오래 밀린 순(문법3 → 단어1 → 단어2)', order.join(',') === '문법3,단어1,단어2', order.join(','));
  check('완료 화면·홈으로 버튼', (await h1()) === '오늘 학습을 마쳤어요' && (await hasButton('홈으로')));
  check('상한 없으면 완료 화면 안내 없음', !(await text()).includes('내일 이어서'));
  await audit('전체 세션 완료'); await shot('study-all-done');
  await click('홈으로');
  check('홈으로 → 홈', (await hash()) === '#/' && (await h1()) === '오늘 복습');
  check('홈: 오늘 복습 없음 안내·학습 시작 없음', (await text()).includes('오늘 복습할 카드가 없어요') && !(await hasButton('학습 시작')));
  check('완료 후 홈: 과목 관리 타일', await hasButton('과목 관리'));

  // 그만하기 → 홈
  await reset();
  await seed(mixed);
  await click('학습 시작');
  await judgeAll(1); await settle();
  check('1장 판정 후 2 / 3', (await prog()) === '2 / 3', await prog());
  await evaluate(`window.dispatchEvent(new CustomEvent('__ait:backEvent'))`); await settle();
  check('세션 중 backEvent → 그만하기 확인', await dialogShown());
  await t(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === '그만하기').click()`); await sleep(400);
  check('그만하기 → 홈·오늘 복습 2장', (await hash()) === '#/' && (await text()).includes('2장') && (await hasButton('학습 시작')), await hash());

  // ── 모두 내일
  await reset();
  await seed({ 영어: { 단어: [p1, p1] } });
  check('모두 내일 → 안내·학습 시작 없음', (await text()).includes('오늘 복습할 카드가 없어요') && !(await hasButton('학습 시작')) && (await hasButton('과목 관리')));
  await audit('홈 오늘 없음');
  await fresh(APP + '#/study');
  check('빈 큐 #/study → 안내·홈으로', (await h1()) === '오늘 복습' && (await text()).includes('오늘 복습할 카드가 없어요') && (await hasButton('홈으로')));
  await click('홈으로');
  check('빈 큐 홈으로 → 홈', (await hash()) === '#/' && (await h1()) === '오늘 복습', await hash());

  // ── 상한: 단어 120장 + 문법 10장 = 130장
  await reset();
  const big = await seed({ 영어: { 단어: Array(120).fill(today), 문법: Array(10).fill(today) } });
  const bigText = await text();
  check('홈 130장·나머지 30장 안내', bigText.includes('130장') && bigText.includes(NOTICE(30)));
  await shot('home-overflow');
  await fresh(APP + `#/deck/${big['단어']}`);
  const deckText = await text();
  check('단원 상세 120장·나머지 20장 안내', deckText.includes('오늘 복습 120장') && deckText.includes(NOTICE(20)));
  await audit('단원 상세 상한'); await shot('deck-overflow');
  await fresh(APP + `#/deck/${big['문법']}`);
  check('상한 미만 단원은 안내 없음', !(await text()).includes('내일 이어서'));
  await fresh(APP);
  await click('학습 시작');
  check('130장 세션 진행 1 / 100', (await prog()) === '1 / 100', await prog());
  await judgeAll(100); await sleep(300);
  check('130장 세션 완료 → 나머지 30장 안내', (await h1()) === '오늘 학습을 마쳤어요' && (await text()).includes(NOTICE(30)));
  await audit('전체 세션 완료 상한'); await shot('study-all-overflow');
  await click('홈으로');
  check('완료 후 홈 30장', (await text()).includes('30장') && !(await text()).includes('내일 이어서'));

  // ── 시계 되돌림
  await reset();
  await seed(mixed);
  const installId = (await meta()).installId;
  await evaluate(`localStorage.setItem('__ait_storage:bq:meta', JSON.stringify({ ...JSON.parse(__ls('bq:meta')), lastOpenedDate: '${p5}' }))`);
  await reload(); await hook(); await settle();
  const warnText = await text();
  check('되돌림 → 경고 표시', warnText.includes(`기기 날짜가 마지막으로 앱을 연 날(${label(p5)})보다 이전이에요. 날짜 설정을 확인해 주세요.`));
  check('되돌림 → 오늘 복습 3장·학습 시작 가능', warnText.includes('3장') && (await hasButton('학습 시작')));
  check('되돌림 → 대화상자 없음', !(await dialogShown()));
  const m1st = await meta();
  check('되돌림 → lastOpenedDate 유지', m1st.lastOpenedDate === p5 && m1st.installId === installId, JSON.stringify(m1st));
  await audit('홈 시계 경고'); await shot('home-clock-warning');
  await click('학습 시작');
  check('경고 상태에서 학습 시작 1 / 3', (await prog()) === '1 / 3');
  await evaluate(`localStorage.setItem('__ait_storage:bq:meta', JSON.stringify({ ...JSON.parse(__ls('bq:meta')), lastOpenedDate: '${m1}' }))`);
  await fresh(APP);
  const m2nd = await meta();
  check('정상 진행 → lastOpenedDate 오늘로 갱신·installId 유지', m2nd.lastOpenedDate === today && m2nd.installId === installId && m2nd.schemaVersion === 2, JSON.stringify(m2nd));
  check('정상 진행 → 경고 없음', !(await text()).includes('기기 날짜'));

  // ── 포그라운드 복귀 시 재계산
  const shift = JSON.parse(process.env.E2E_SHIFT); // { tz, date }
  const origTz = await evaluate(`Intl.DateTimeFormat().resolvedOptions().timeZone`);
  await reset();
  const fg = await seed({ 영어: { 단어: [m1, today, p1] } });
  const expected = shift.date > today ? 3 : 1;
  results.push(`INFO 시간대 ${origTz} → ${shift.tz}(${shift.date}), 기대 ${expected}장`);
  await fresh(APP + `#/deck/${fg['단어']}`);
  check('단원 상세 오늘 복습 2장(이동 전)', (await text()).includes('오늘 복습 2장'));
  await send('Emulation.setTimezoneOverride', { timezoneId: shift.tz });
  check('시간대 이동 후 이벤트 전에는 그대로', (await text()).includes('오늘 복습 2장'));
  await evaluate(`document.dispatchEvent(new Event('visibilitychange'))`); await sleep(300);
  check(`visibilitychange → 단원 상세 오늘 복습 ${expected}장`, (await text()).includes(`오늘 복습 ${expected}장`), (await text()).split('\n').slice(0, 4).join(' / '));
  await evaluate(`history.back()`); await sleep(200); await evaluate(`history.back()`); await sleep(300);
  const fgHome = await text();
  check(`홈도 새 날짜 기준 ${expected}장`, (await hash()) === '#/' && (await homeCount()) === `오늘 복습 ${expected}장`, await hash());
  if (shift.date < today) check('과거로 이동 → 홈 시계 경고', fgHome.includes('기기 날짜가'));
  else check('미래로 이동 → lastOpenedDate 갱신', (await meta()).lastOpenedDate === shift.date);
  await send('Emulation.setTimezoneOverride', { timezoneId: origTz });
  await evaluate(`document.dispatchEvent(new Event('visibilitychange'))`); await sleep(300);
  if (shift.date < today) check('원래 날짜로 복귀 → 경고 해소·2장', !(await text()).includes('기기 날짜') && (await text()).includes('2장'));
  // visibilitychange 없이 화면 이동만으로 재판정(WebView에서 이벤트가 오지 않는 경우)
  await fresh(APP + `#/deck/${fg['단어']}`);
  check('[회귀] 단원 상세 2장(이동 전)', (await text()).includes('오늘 복습 2장'));
  await send('Emulation.setTimezoneOverride', { timezoneId: shift.tz });
  await evaluate(`history.back()`); await sleep(300);
  await t(`__t.clickRow('단어')`); await sleep(300);
  check(`[회귀] 이벤트 없이 화면 이동 → 단원 상세 ${expected}장`, (await text()).includes(`오늘 복습 ${expected}장`), (await text()).split('\n').slice(0, 4).join(' / '));
  await evaluate(`history.back()`); await sleep(200); await evaluate(`history.back()`); await sleep(300);
  const navHome = await text();
  check(`[회귀] 이벤트 없이 홈 ${expected}장`, (await hash()) === '#/' && (await homeCount()) === `오늘 복습 ${expected}장`, await hash());
  if (shift.date < today) check('[회귀] 이벤트 없이 홈 시계 경고', navHome.includes('기기 날짜가'));
  await send('Emulation.setTimezoneOverride', { timezoneId: origTz });
  await click('과목 관리');
  await evaluate(`history.back()`); await sleep(300);
  check('[회귀] 원래 날짜에서 화면 이동 → 홈 2장·경고 없음', (await homeCount()) === '오늘 복습 2장' && !(await text()).includes('기기 날짜'));
  // 세션 중 복귀: 세션 날짜·순서 유지
  await fresh(APP + `#/deck/${fg['단어']}/study`);
  const firstQ = await question();
  await send('Emulation.setTimezoneOverride', { timezoneId: shift.tz });
  await evaluate(`document.dispatchEvent(new Event('visibilitychange'))`); await sleep(300);
  check('세션 중 복귀 → 진행·카드 그대로', (await prog()) === '1 / 2' && (await question()) === firstQ, `${await prog()} ${await question()}`);
  await send('Emulation.setTimezoneOverride', { timezoneId: origTz });

  for (const [name, a] of Object.entries(audits)) {
    check(`글자 13px 이상: ${name}`, a.minFont >= 13, `최소 ${a.minFont}px("${a.minAt}")`);
    check(`터치 44px 이상: ${name}`, a.small.length === 0, a.small.join(', '));
  }
  check('콘솔 오류 없음', consoleErrors.length === 0, consoleErrors.join(' | '));
} catch (e) {
  check('스크립트 실행', false, e.message);
} finally {
  console.log(results.join('\n'));
  console.log(`\n${countable().length - failed}/${countable().length} 통과`);
  ws.close();
  chrome.kill();
  process.exitCode = failed ? 1 : 0;
}
