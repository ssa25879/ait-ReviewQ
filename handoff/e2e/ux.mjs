// day8-ux-improvements 가이드·홈 머리말·타일·단원 용어 확인(헤드리스 Edge·CDP). 5199 기본 빌드
// 사용: node ux.mjs <chromePath> <outDir>
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
// day8-ux-improvements 확인: 기본 빌드(5199)
if (process.env.E2E_STREAM) { const push = results.push.bind(results); results.push = (...r) => (console.log(...r), push(...r)); }
const hash = () => evaluate(`location.hash`);
const text = () => t(`return __t.text()`);
const h1 = () => t(`return __t.h1()`);
const hasButton = (label) => t(`return __t.buttons(${JSON.stringify(label)}).length > 0`);
const click = async (label) => { await t(`__t.click(${JSON.stringify(label)})`); await sleep(400); };
const fresh = async (url) => { await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await load(url); await hook(); await sleep(300); };
const ls = (k) => t(`return __ls(${JSON.stringify(k)})`);
const progress = () => t(`return [...document.querySelectorAll('span')].map((s) => s.textContent.trim()).find((x) => /^\\d \\/ 3$/.test(x)) ?? null`);
const clearAll = () => evaluate(`localStorage.clear()`); // 가이드 본 기록까지 지운다(처음 실행 상태)
const noDeck = async (where) => check(`화면에 "덱" 없음: ${where}`, !(await text()).includes('덱'), (await text()).match(/.{0,10}덱.{0,10}/)?.[0] ?? '');
const backTo = async () => { await evaluate(`history.back()`); await sleep(400); };

try {
  // ── 처음 실행: 가이드
  await load(APP); await hook();
  await clearAll(); await fresh(APP);
  check('처음 실행 → 가이드 첫 장(홈 아님)', (await hash()) === '#/guide' && (await h1()) === '외울 내용을 카드로 만들어요' && (await progress()) === '1 / 3', `${await hash()} ${await h1()}`);
  check('첫 장: 다음·건너뛰기', (await hasButton('다음')) && (await hasButton('건너뛰기')));
  check('진입 시 대화상자 없음', !(await t(`return !!document.querySelector('[role=dialog]')`)));
  await audit('가이드 1장'); await shot('guide-1');
  await noDeck('가이드 1장');
  await click('다음');
  check('2장', (await progress()) === '2 / 3' && (await h1()) === '복습할 날이 되면 홈에 모여요');
  await audit('가이드 2장'); await shot('guide-2');
  await click('다음');
  check('3장: 직접 만들기·예시 카드로 시작, 건너뛰기 없음', (await progress()) === '3 / 3' && (await hasButton('직접 만들기')) && (await hasButton('예시 카드로 시작')) && !(await hasButton('건너뛰기')));
  await audit('가이드 3장'); await shot('guide-3');
  await t(`__t.click('예시 카드로 시작'); __t.buttons('예시 카드로 시작')[0]?.click();`); await sleep(1200);
  check('예시 카드로 시작 → 홈 오늘 복습 10장·본 기록', (await hash()) === '#/' && (await text()).includes('10장') && (await ls('bq:guide')) === 'true');
  check('연타해도 예시 과목 1개', JSON.parse(await ls('bq:subjects')).length === 1);
  await reload(); await hook(); await sleep(300);
  check('다시 열어도 가이드 없음', (await hash()) === '#/');

  // ── 건너뛰기
  await clearAll(); await fresh(APP);
  await click('건너뛰기');
  check('건너뛰기 → 홈 첫 사용·본 기록', (await hash()) === '#/' && (await text()).includes('복습큐를 시작해 볼까요?') && (await ls('bq:guide')) === 'true');
  await reload(); await hook(); await sleep(300);
  check('건너뛴 뒤 다시 열어도 가이드 없음', (await hash()) === '#/');

  // ── 직접 만들기
  await clearAll(); await fresh(APP);
  await click('다음'); await click('다음'); await click('직접 만들기');
  check('직접 만들기 → 과목·단원 목록', (await hash()) === '#/subjects' && (await h1()) === '과목·단원');
  await backTo();
  check('뒤로가기 → 홈', (await hash()) === '#/' && (await h1()) === '오늘 복습');

  // ── 가이드에서 뒤로가기
  await clearAll(); await fresh(APP);
  await backTo();
  check('가이드에서 뒤로가기 → 홈·본 기록 없음', (await hash()) === '#/' && (await ls('bq:guide')) === null);
  await click('과목 관리'); await backTo();
  check('같은 실행 중 화면 이동 후에도 가이드 다시 안 열림', (await hash()) === '#/');

  // ── 카드가 이미 있으면 가이드 없음
  await t(`
    const { actions } = await __mods(); const { dispatch } = __app();
    const s = actions.addSubject('영어'); dispatch(s);
    const d = actions.addDeck(s.id, '단어'); dispatch(d);
    dispatch(actions.addCard(d.id, 'q', 'a'));
    await __wait(900);
    localStorage.removeItem('__ait_storage:bq:guide');`);
  await fresh(APP);
  check('본 기록 없어도 카드가 있으면 홈', (await hash()) === '#/' && (await h1()) === '오늘 복습');

  // ── 설정에서 다시 보기(카드 있음)
  await click('설정');
  check('설정에 사용 방법 보기', await hasButton('사용 방법 보기'));
  await click('사용 방법 보기');
  check('사용 방법 보기 → 가이드', (await hash()) === '#/guide' && (await progress()) === '1 / 3');
  await click('건너뛰기');
  check('다시 보기 건너뛰기 → 설정으로', (await hash()) === '#/settings');
  await click('사용 방법 보기'); await click('다음'); await click('다음');
  check('카드 있으면 마지막 장은 확인만', (await hasButton('확인')) && !(await hasButton('예시 카드로 시작')) && !(await hasButton('직접 만들기')));
  await click('확인');
  check('확인 → 설정으로', (await hash()) === '#/settings');
  await backTo();

  // ── 홈 머리말·바로가기 타일
  const td = await t(`return (await import('/src/screens/messages.ts')).homeDate((await __mods()).date.todayLocal())`);
  check('홈 머리말: 복습큐·오늘 날짜', (await text()).includes(`복습큐 · ${td}`), td);
  const tiles = await t(`return [...document.querySelectorAll('nav button')].map((b) => ({ label: b.textContent.trim(), h: b.getBoundingClientRect().height }))`);
  check('바로가기 타일 3칸(통계·과목 관리·설정)·44px 이상', JSON.stringify(tiles.map((x) => x.label)) === '["통계","과목 관리","설정"]' && tiles.every((x) => x.h >= 44), JSON.stringify(tiles));
  check('맨 아래 통계·설정 행 없음(타일만)', (await t(`return [...document.querySelectorAll('button')].filter((b) => ['통계', '설정'].includes(b.textContent.trim())).length`)) === 2);
  for (const [label, target] of [['통계', '#/stats'], ['과목 관리', '#/subjects'], ['설정', '#/settings']]) {
    await click(label);
    const at = await hash();
    await backTo();
    check(`${label} 타일 → ${target} → 뒤로가기 홈`, at === target && (await hash()) === '#/', at);
  }
  check('오늘 복습 있음 → 하단은 학습 시작만', (await t(`return [...document.querySelectorAll('[class*="bottomBar"] button')].map((b) => b.textContent.trim()).join(',')`)) === '학습 시작');
  await audit('홈(카드 있음)'); await shot('home-tiles');

  // ── 화면 전체에 "덱" 없음
  await noDeck('홈');
  const deckId = await t(`return JSON.parse(__ls('bq:decks'))[0].id`);
  for (const [where, url] of [
    ['과목·단원 목록', '#/subjects'], ['단원 상세', `#/deck/${deckId}`], ['새 카드', `#/deck/${deckId}/card/new`],
    ['여러 장 추가', `#/deck/${deckId}/cards/bulk`], ['통계', '#/stats'], ['가이드', '#/guide'],
  ]) { await fresh(APP + url); await noDeck(where); }
  await fresh(APP + '#/subjects');
  await t(`document.querySelector('[aria-label$="더보기"]')?.click()`); await sleep(300);
  await noDeck('과목·단원 목록 메뉴');
  await fresh(APP + '#/settings');
  await click('백업 가져오기');
  await noDeck('설정(가져오기 열림)');

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
