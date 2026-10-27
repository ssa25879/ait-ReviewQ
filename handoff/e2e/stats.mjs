// day4-stats 통계 화면 확인(헤드리스 Edge·CDP)
// 사용: node stats.mjs <chromePath> <outDir>
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

// day4-stats 확인
const hash = () => evaluate(`location.hash`);
const text = () => t(`return __t.text()`);
const h1 = () => t(`return __t.h1()`);
const fresh = async (url) => { await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await load(url); await hook(); };
// 막대 목록 섹션의 [라벨, 수] 행
const rows = (title) => t(`return [...document.querySelectorAll('section[aria-label="${title}"] li')].map((li) => [li.children[0].textContent, li.children[2].textContent])`);
const stat = (label) => t(`return [...document.querySelectorAll('dl div')].find((d) => d.querySelector('dt').textContent === '${label}')?.querySelector('dd').textContent ?? ''`);
const clickStats = async () => { await t(`[...document.querySelectorAll('main button')].find((b) => b.textContent.trim() === '통계').click()`); await sleep(300); };

try {
  await load(APP);
  await hook();
  const today = await t(`return (await __mods()).date.todayLocal()`);
  const D = async (k) => t(`return (await __mods()).date.addDays('${today}', ${k})`);
  const m2 = await D(-2);

  // ── 빈 상태
  await evaluate(`localStorage.clear()`);
  await fresh(APP);
  check('홈에 통계 행(카드 0장)', await t(`return [...document.querySelectorAll('main button')].some((b) => b.textContent.trim() === '통계')`));
  await clickStats();
  check('홈 → 통계', (await hash()) === '#/stats' && (await h1()) === '통계', await hash());
  check('카드 0장 → 빈 상태 안내', (await text()).includes('아직 통계가 없어요') && (await text()).includes('카드를 만들고 학습하면'));
  await audit('통계 빈 상태'); await shot('stats-empty');
  await evaluate(`history.back()`); await sleep(300);
  check('통계에서 뒤로가기 → 홈', (await hash()) === '#/' && (await h1()) === '오늘 복습', await hash());

  // ── 카드 4장: stage 0 2장(A·C)·1 1장(B)·3 1장(D)
  //    D는 6·5·4일 전 기억함으로 stage 3, B는 오늘 기억함으로 stage 1, A는 2일 전 기억 못 함(stage 0)
  const [m6, m5, m4] = [await D(-6), await D(-5), await D(-4)];
  await t(`
    const { actions } = await __mods();
    const { dispatch } = __app();
    const subj = actions.addSubject('영어'); dispatch(subj);
    const deck = actions.addDeck(subj.id, '단어'); dispatch(deck);
    for (const q of ['A', 'B', 'C', 'D']) {
      dispatch({ type: 'card/add', id: 'card-' + q, deckId: deck.id, question: q, answer: q + '의 정답', now: new Date().toISOString(), today: '${today}' });
    }
    const review = (id, grade, date) => dispatch(actions.reviewCard('card-' + id, deck.id, grade, date));
    review('D', 'remember', '${m6}'); review('D', 'remember', '${m5}'); review('D', 'remember', '${m4}');
    review('B', 'remember', '${today}');
    review('A', 'forget', '${m2}');
    await __wait(900); // 저장 지연 뒤 저장소 반영
  `);
  await settle();
  await clickStats();
  check('오늘 완료 1장·전체 카드 4장', (await stat('오늘 완료')) === '1장' && (await stat('전체 카드')) === '4장', `${await stat('오늘 완료')} / ${await stat('전체 카드')}`);
  const stages = await rows('단계별 카드');
  check('단계 분포 2·1·0·1·0·0·0', stages.map((r) => r[1]).join(',') === '2장,1장,0장,1장,0장,0장,0장', JSON.stringify(stages));
  check('단계 라벨', stages.map((r) => r[0]).join(',') === '새 카드·다시 학습,1일 간격,3일 간격,7일 간격,14일 간격,30일 간격,60일 간격');
  const recent = await rows('최근 7일 학습');
  const [, mm, dd] = m2.split('-').map(Number);
  check('최근 7일 행 7개·마지막 오늘', recent.length === 7 && recent[6][0] === '오늘', JSON.stringify(recent));
  check('최근 7일 수: 6·5·4·2일 전과 오늘 1장, 3·1일 전 0장', recent.map((r) => r[1]).join(',') === '1장,1장,1장,0장,1장,0장,1장' && recent[4][0] === `${mm}월 ${dd}일`, JSON.stringify(recent));
  check('막대는 aria-hidden', await t(`return [...document.querySelectorAll('section[aria-label] li')].every((li) => li.children[1].getAttribute('aria-hidden') === 'true')`));
  check('하단 고정 버튼 없음', await t(`return !document.querySelector('main button')`));
  await audit('통계'); await shot('stats');

  // 새로고침 유지·뒤로가기 → 홈
  await reload(); await hook(); await settle();
  check('통계 새로고침 → 통계 유지·수치 유지', (await hash()) === '#/stats' && (await stat('전체 카드')) === '4장');
  await evaluate(`history.back()`); await sleep(300);
  check('새로고침 후 뒤로가기 → 홈', (await hash()) === '#/' && (await h1()) === '오늘 복습', await hash());
  await fresh(APP + '#/stats');
  check('통계 주소로 바로 진입', (await h1()) === '통계');
  await evaluate(`history.back()`); await sleep(300);
  check('바로 진입 후 뒤로가기 → 홈', (await hash()) === '#/' && (await h1()) === '오늘 복습', await hash());
  await fresh(APP + '#/statsx');
  check('#/statsx → 홈', (await h1()) === '오늘 복습');

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
