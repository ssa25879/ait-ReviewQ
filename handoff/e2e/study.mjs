// day3-study-session 화면 확인(헤드리스 Edge·CDP)
// 사용: node review.mjs <chromePath> <outDir>
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

// day3-study-session 확인
const hash = () => evaluate(`location.hash`);
const prog = () => t(`return document.querySelector('main header p')?.textContent ?? ''`);
const cardBtn = `document.querySelector('button[aria-expanded]')`;
const flipped = () => t(`return ${cardBtn}?.getAttribute('aria-expanded') === 'true'`);
const flipCard = async () => { await t(`${cardBtn}.click()`); await settle(); };
const dialogShown = () => t(`return !!document.querySelector('[role=dialog]')`);
const judgeBtn = (label) => `[...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '${label}')`;

// devtools 모의는 setIosSwipeGestureEnabled 호출을 console.log로 남긴다
const swipeLog = [];
listeners.push((m) => {
  if (m.method !== 'Runtime.consoleAPICalled') return;
  const line = m.params.args.map((a) => String(a.value ?? '')).join(' ');
  if (line.includes('setIosSwipeGestureEnabled')) swipeLog.push(line.trim().endsWith('false') ? 'off' : 'on');
});
const lastSwipe = async () => { await sleep(100); return swipeLog.at(-1); };
const activeIs = (expr) => evaluate(`document.activeElement === (${expr})`);
const fresh = async (url) => { await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await load(url); };
try {
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await load(APP + '#/subjects'); // day4: 최초 화면은 홈, 목록은 #/subjects
  await hook();
  const today = await t(`return (await __mods()).date.todayLocal()`);
  const tomorrow = await t(`return (await __mods()).date.addDays('${today}', 1)`);
  const month = today.slice(0, 7);
  const [, tm, td] = tomorrow.split('-').map(Number);
  const tomorrowLabel = `${tm}월 ${td}일`;
  const logCount = () => t(`return JSON.parse(__ls('bq:logs:${month}') ?? '[]').length`); // 판정은 즉시 저장되므로 저장소 기준으로 센다

  // 준비: 과목 1개, 덱 3개(숙어 2장·단어 3장·문법 3장)
  const ids = await t(`
    const { actions } = await __mods();
    const { dispatch } = __app();
    const subj = actions.addSubject('영어'); dispatch(subj);
    const out = {};
    for (const [name, cards] of [['숙어', ['q1', 'q2']], ['단어', ['apple', 'banana', 'cherry']], ['문법', ['g1', 'g2', 'g3']]]) {
      const deck = actions.addDeck(subj.id, name); dispatch(deck); out[name] = deck.id;
      for (const q of cards) { dispatch(actions.addCard(deck.id, q, q + '의 정답')); await __wait(5); }
    }
    return out;
  `);
  await sleep(600);
  const deckUrl = (id) => `${APP}#/deck/${id}`;

  // ── 2.1 덱 상세 진입(숙어 2장)
  await fresh(deckUrl(ids['숙어'])); await hook();
  check('덱 상세: "오늘 복습 2장"', (await t(`return __t.text()`)).includes('오늘 복습 2장'));
  const entryHeights = await t(`return ['카드 추가', '학습하기'].map((x) => __t.buttons(x)[0]?.getBoundingClientRect().height ?? 0)`);
  check('덱 상세: 카드 추가·학습하기 버튼 44px 이상', entryHeights.every((h) => h >= 44), entryHeights.join(','));
  await audit('덱 상세(오늘 복습 있음)');
  await t(`__t.click('학습하기')`); await settle();
  check('학습하기 → study 경로', (await hash()) === `#/deck/${ids['숙어']}/study`, await hash());

  // ── 3.2 완료 화면(2장: 기억함 1·기억 못 함 1·재출제)
  check('숙어 세션 진행 1 / 2', (await prog()) === '1 / 2', await prog());
  check('[수정4] 진행 aria-label "2장 중 1번째"', (await t(`return document.querySelector('main header p').getAttribute('aria-label')`)) === '2장 중 1번째');
  check('[수정3] 세션 시작 → iOS 스와이프 끔', (await lastSwipe()) === 'off', swipeLog.join(','));
  await flipCard();
  const d01 = await t(`
    const t0 = performance.now();
    ${judgeBtn('기억함')}.click();
    let elapsed = null;
    while (performance.now() - t0 < 390) {
      const raw = __ls('bq:logs:${month}');
      if (raw && JSON.parse(raw).length === 1) { elapsed = Math.round(performance.now() - t0); break; }
      await __wait(5);
    }
    return elapsed;
  `);
  check('판정 직후 저장소에 로그 (D-01)', d01 !== null, `${d01}ms`);
  await settle();
  await flipCard(); await t(`${judgeBtn('기억 못 함')}.click()`); await settle();
  check('기억 못 함 → 진행 3 / 3', (await prog()) === '3 / 3', await prog());
  await flipCard(); await t(`${judgeBtn('기억함')}.click()`); await settle();
  const doneText = await t(`return __t.text()`);
  check('완료 화면 제목', (await t(`return __t.h1()`)) === '오늘 학습을 마쳤어요');
  check('완료 2장·기억함 50%·내일 예정 2장', /완료\s*2장/.test(doneText) && /기억함\s*50%/.test(doneText) && /내일 예정\s*2장/.test(doneText), doneText.replace(/\n/g, ' '));
  check('재출제 판정은 로그 추가 없음(2건)', (await logCount()) === 2);
  await audit('학습 완료');
  await shot('study-done');
  check('[수정4] 완료 → 포커스가 완료 제목', await activeIs(`document.querySelector('h1')`));
  check('[수정3] 완료 → iOS 스와이프 다시 켬', (await lastSwipe()) === 'on', swipeLog.join(','));
  await t(`const b = __t.buttons('덱으로 돌아가기')[0]; b.click(); b.click();`); await sleep(400);
  check('[수정1] 돌아가기 두 번 탭 → 덱 상세(한 단계만)',(await t(`return __t.h1()`)) === '숙어' && (await hash()) === `#/deck/${ids['숙어']}`);
  const afterText = await t(`return __t.text()`);
  check(`덱 상세에 갱신된 다음 복습 ${tomorrowLabel} 2장`, afterText.split(`다음 복습 ${tomorrowLabel}`).length - 1 === 2);
  check('모두 내일 예정 → 안내 문구, 학습하기 없음', afterText.includes('오늘 복습할 카드가 없어요') && (await t(`return __t.buttons('학습하기').length`)) === 0);
  await audit('덱 상세(오늘 복습 없음)');

  // ── 3.1 빈 큐 주소
  await fresh(`${deckUrl(ids['숙어'])}/study`); await hook();
  check('빈 큐: 안내 문구', (await t(`return __t.text()`)).includes('오늘 복습할 카드가 없어요'));
  check('[수정2] 빈 큐 본문: 알림 약속 없음', (await t(`return __t.text()`)).includes('다음 복습일이 되면 이 덱에서 다시 학습할 수 있어요.')
    && !(await t(`return __t.text()`)).includes('알려 드릴게요'));
  await audit('빈 큐');
  await t(`__t.click('덱으로 돌아가기')`); await settle();
  check('빈 큐 돌아가기 → 덱 상세', (await t(`return __t.h1()`)) === '숙어');

  // ── 3.1 세션(단어 3장)
  await fresh(`${deckUrl(ids['단어'])}/study`); await hook();
  check('단어 세션 진행 1 / 3', (await prog()) === '1 / 3', await prog());
  check('질문 표시·정답 숨김', (await t(`return __t.text()`)).includes('apple') && !(await t(`return __t.text()`)).includes('apple의 정답'));
  check('뒤집기 전 판정 버튼 비활성', await t(`return ${judgeBtn('기억함')}.disabled && ${judgeBtn('기억 못 함')}.disabled`));
  await t(`${judgeBtn('기억함')}.click(); ${judgeBtn('기억 못 함')}.click()`); await settle();
  check('뒤집기 전 클릭 무변화', (await prog()) === '1 / 3' && !(await flipped()) && (await logCount()) === 2);
  await audit('세션(질문)');
  await flipCard();
  check('뒤집은 뒤 질문+정답', (await t(`return __t.text()`)).includes('apple의 정답') && (await flipped()));
  check('[수정4] 정답 live region', (await t(`return document.querySelector('[aria-live=polite]')?.textContent`)) === '정답 apple의 정답');
  await flipCard();
  check('다시 눌러도 정답 유지', await flipped());
  check('뒤집은 뒤 판정 버튼 활성', await t(`return !${judgeBtn('기억함')}.disabled`));
  const sizes = await t(`return { text: [...document.querySelectorAll('${'button[aria-expanded] span'}')].map((x) => parseFloat(getComputedStyle(x).fontSize)), judge: ['기억 못 함', '기억함'].map((x) => ${'__t.buttons(x)[0].getBoundingClientRect().height'}) }`);
  check('질문·정답 본문 15px 이상', [sizes.text[1], sizes.text[4]].every((x) => x >= 15), sizes.text.join(','));
  check('판정 버튼 높이 44px 이상', sizes.judge.every((h) => h >= 44), sizes.judge.join(','));
  await audit('세션(정답)');
  await shot('study-session');
  // 같은 프레임 두 번 클릭
  await t(`const b = ${judgeBtn('기억함')}; b.click(); b.click();`); await settle();
  check('연타: 로그 1건만 증가(3건)', (await logCount()) === 3, String(await logCount()));
  check('연타: 다음 카드 질문 상태·진행 2 / 3', (await prog()) === '2 / 3' && !(await flipped()) && (await t(`return __t.text()`)).includes('banana'));
  check('[수정4] 판정 후 포커스가 다음 카드', await activeIs(cardBtn));
  check('[수정4] 다음 카드에서 live region 비움', (await t(`return document.querySelector('[aria-live=polite]').textContent`)) === '');
  // 새로고침
  await reload(); await hook();
  check('새로고침 → 남은 카드로 1 / 2', (await prog()) === '1 / 2' && (await t(`return __t.text()`)).includes('banana'), await prog());
  // 끝까지 진행 후 완료 화면에서 뒤로가기 → 확인 없이 덱 상세
  for (let i = 0; i < 2; i++) { await flipCard(); await t(`${judgeBtn('기억함')}.click()`); await settle(); }
  check('단어 완료 화면', (await t(`return __t.h1()`)) === '오늘 학습을 마쳤어요');
  await evaluate(`history.back()`); await sleep(300);
  check('완료 후 뒤로가기 → 확인 없이 덱 상세', !(await dialogShown()) && (await t(`return __t.h1()`)) === '단어', await hash());

  // ── 진행 수(문법 3장): 첫 카드 기억 못 함 → 2 / 4
  await fresh(`${deckUrl(ids['문법'])}/study`); await hook();
  await flipCard(); await t(`${judgeBtn('기억 못 함')}.click()`); await settle();
  check('기억 못 함 후 진행 2 / 4', (await prog()) === '2 / 4', await prog());
  const logsBeforeBack = await logCount();

  // ── 4.1 뒤로가기 확인
  await flipCard();
  await evaluate(`history.back()`); await sleep(300);
  check('브라우저 뒤로가기 → 확인 표시', await dialogShown());
  check('브라우저 뒤로가기 → 주소 study 유지', (await hash()) === `#/deck/${ids['문법']}/study`, await hash());
  check('확인 문구', (await t(`return document.querySelector('[role=dialog]').innerText`)).includes('학습을 그만할까요?')
    && (await t(`return document.querySelector('[role=dialog]').innerText`)).includes('지금까지 판정한 카드는 저장됐어요.'));
  await audit('그만하기 확인');
  await shot('study-quit-confirm');
  await t(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === '취소').click()`); await settle();
  check('취소 → 같은 카드 정답 상태 유지', !(await dialogShown()) && (await flipped()) && (await prog()) === '2 / 4' && (await t(`return __t.text()`)).includes('g2의 정답'));
  await t(`${judgeBtn('기억함')}.click()`); await settle();
  check('취소 후 판정 가능 → 3 / 4', (await prog()) === '3 / 4' && (await logCount()) === logsBeforeBack + 1);
  await evaluate(`window.dispatchEvent(new CustomEvent('__ait:backEvent'))`); await settle();
  check('backEvent → 확인 표시·주소 study 유지', (await dialogShown()) && (await hash()) === `#/deck/${ids['문법']}/study`);
  const subs = await evaluate(`globalThis.__aitDevtoolsBackSubscribers__ ?? null`);
  check('세션 중 backEvent 구독 1개', subs === 1, String(subs));
  await evaluate(`window.dispatchEvent(new CustomEvent('__ait:backEvent'))`); await settle();
  check('[수정5] 확인 열린 채 backEvent → 확인 닫힘', !(await dialogShown()) && (await prog()) === '3 / 4');
  await evaluate(`window.dispatchEvent(new CustomEvent('__ait:backEvent'))`); await settle();
  await evaluate(`history.back()`); await sleep(300);
  check('[수정5] 확인 열린 채 브라우저 뒤로가기 → 확인 닫힘·주소 유지', !(await dialogShown()) && (await hash()) === `#/deck/${ids['문법']}/study`, await hash());
  await evaluate(`window.dispatchEvent(new CustomEvent('__ait:backEvent'))`); await settle();
  check('다시 backEvent → 확인 표시', await dialogShown());
  await t(`const b = [...document.querySelectorAll('[role=dialog] button')].find((x) => x.textContent.trim() === '그만하기'); b.click(); b.click();`); await sleep(400);
  check('[수정3] 그만하기 → iOS 스와이프 다시 켬', (await lastSwipe()) === 'on', swipeLog.join(','));
  check('[수정1] 그만하기 두 번 탭 → 덱 상세(한 단계만)', (await t(`return __t.h1()`)) === '문법' && (await hash()) === `#/deck/${ids['문법']}`, await hash());
  check('그만하기 후 판정 결과 유지(로그)', (await logCount()) === logsBeforeBack + 1);
  check('그만하기 후 backEvent 구독 해제', (await evaluate(`globalThis.__aitDevtoolsBackSubscribers__ ?? 0`)) === 0);
  check('덱 상세: 남은 오늘 복습 1장(g3)', (await t(`return __t.text()`)).includes('오늘 복습 1장'));
  await evaluate(`history.back()`); await sleep(300);
  check('이어서 뒤로가기 → 목록', (await hash()) === '#/subjects' &&!(await dialogShown()), await hash());

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
