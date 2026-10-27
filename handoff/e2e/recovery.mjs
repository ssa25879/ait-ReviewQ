// day5-storage-recovery 복구·읽기 실패 화면 확인(헤드리스 Edge·CDP)
// 사용: node recovery.mjs <chromePath> <outDir>
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

// day5-storage-recovery 확인
const hash = () => evaluate(`location.hash`);
const text = () => t(`return __t.text()`);
const h1 = () => t(`return __t.h1()`);
const hasButton = (label) => t(`return __t.buttons(${JSON.stringify(label)}).length > 0`);
const click = async (label) => { await t(`__t.click(${JSON.stringify(label)})`); await sleep(400); };
const dialogShown = () => t(`return !!document.querySelector('[role=dialog]')`);
const fresh = async (url) => { await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await load(url); await hook(); };
const ls = (k) => evaluate(`localStorage.getItem('__ait_storage:' + ${JSON.stringify(k)})`);
const setLs = (k, v) => evaluate(`localStorage.setItem('__ait_storage:' + ${JSON.stringify(k)}, ${JSON.stringify(v)})`);
const delLs = (k) => evaluate(`localStorage.removeItem('__ait_storage:' + ${JSON.stringify(k)})`);
const TITLE = '저장된 데이터 일부를 읽을 수 없어요';
const EDIT_BUTTONS = ['카드 추가', '과목 추가', '학습 시작', '과목·덱 관리'];

try {
  await load(APP);
  await hook();
  const today = await t(`return (await __mods()).date.todayLocal()`);
  const yesterday = await t(`return (await __mods()).date.addDays('${today}', -1)`);
  const [, tm, td] = today.split('-').map(Number);

  // 준비: 덱 A(단어 3장)·덱 B(문법 2장)
  await evaluate(`localStorage.clear()`);
  await fresh(APP);
  const ids = await t(`
    const { actions } = await __mods();
    const { dispatch } = __app();
    const subj = actions.addSubject('영어'); dispatch(subj);
    const out = {};
    for (const [name, qs] of [['단어', ['apple', 'banana', 'cherry']], ['문법', ['g1', 'g2']]]) {
      const deck = actions.addDeck(subj.id, name); dispatch(deck); out[name] = deck.id;
      for (const q of qs) { dispatch(actions.addCard(deck.id, q, q + '의 정답')); await __wait(5); }
    }
    await __wait(900);
    return out;
  `);
  const cardsA = `bq:cards:${ids['단어']}`;
  const cardsB = `bq:cards:${ids['문법']}`;
  const goodA = await ls(cardsA);

  // 그날 첫 실행 → 백업
  await setLs('bq:meta', JSON.stringify({ ...JSON.parse(await ls('bq:meta')), lastOpenedDate: yesterday }));
  await fresh(APP);
  const backup = JSON.parse((await ls('bq:backup:last')) ?? 'null');
  check('그날 첫 정상 실행 → 백업 생성(오늘 날짜·카드 5장)', backup?.date === today && Object.values(backup.cards).flat().length === 5, JSON.stringify(backup)?.slice(0, 80));

  // ── 손상 + 백업 있음
  await setLs(cardsA, '[{broken');
  await fresh(APP);
  check('손상 → 복구 화면', (await h1()) === TITLE, await h1());
  const recText = await text();
  check('손상 1건·백업 날짜와 수 안내', recText.includes('항목 1개') && recText.includes(`${tm}월 ${td}일 백업`) && recText.includes('과목 1개 · 덱 2개 · 카드 5장'), recText.replace(/\n/g, ' / '));
  check('세 선택지 표시', (await hasButton('백업으로 복구')) && (await hasButton('손상 항목 빼고 열기')) && (await hasButton('다시 시도')));
  check('편집 버튼 없음', (await t(`return ${JSON.stringify(EDIT_BUTTONS)}.every((b) => __t.buttons(b).length === 0)`)));
  check('진입 시 대화상자 없음', !(await dialogShown()));
  check('손상 원본 그대로', (await ls(cardsA)) === '[{broken');
  check('손상 상태에서 백업 갱신 안 함', JSON.parse(await ls('bq:backup:last')).savedAt === backup.savedAt);
  await audit('복구 화면(백업 있음)'); await shot('recovery-backup');
  await click('다시 시도');
  check('다시 시도 → 여전히 손상이면 복구 화면', (await h1()) === TITLE);
  await click('백업으로 복구');
  await sleep(300);
  check('백업으로 복구 → 홈', (await h1()) === '오늘 복습' && (await hash()) === '#/', await h1());
  check('격리 키에 원본 보관', (await ls(`bq:quarantine:${cardsA}`)) === '[{broken');
  check('덱 A 카드가 백업 내용으로 복원', (await ls(cardsA)) === goodA);
  check('복구 후 오늘 복습 5장', (await text()).includes('5장'));

  // ── 판정 기록만 손상(백업 있음) → 백업 복구를 제공하지 않는다(멀쩡한 콘텐츠를 되돌리지 않도록)
  const logKey = `bq:logs:${today.slice(0, 7)}`;
  await setLs(logKey, 'x');
  await fresh(APP);
  const logText = await text();
  check('로그만 손상 → 복구 화면', (await h1()) === TITLE, await h1());
  check('로그만 손상 → 백업 안내·백업으로 복구 없음', !logText.includes('백업') && !(await hasButton('백업으로 복구')));
  check('로그만 손상 → 빼고 열기·다시 시도', (await hasButton('손상 항목 빼고 열기')) && (await hasButton('다시 시도')));
  await click('손상 항목 빼고 열기');
  check('로그만 손상 → 사라지는 항목은 학습 기록', (await t(`return document.querySelector('[role=dialog]').innerText`)).includes('월 학습 기록'));
  await t(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === '빼고 열기').click()`); await sleep(700);
  check('로그만 손상 → 빼고 열기 후 카드 5장 그대로', (await h1()) === '오늘 복습' && (await text()).includes('5장'));

  // ── 손상 + 백업 없음 → 손상 항목 빼고 열기
  await delLs('bq:backup:last');
  await delLs(`bq:quarantine:${cardsA}`);
  await setLs(cardsA, '{"not":"list"}');
  await fresh(APP);
  check('백업 없으면 두 선택지만', (await h1()) === TITLE && !(await hasButton('백업으로 복구')) && (await hasButton('손상 항목 빼고 열기')) && (await hasButton('다시 시도')));
  await audit('복구 화면(백업 없음)'); await shot('recovery-no-backup');
  await click('손상 항목 빼고 열기');
  check('확인 대화상자(사라지는 항목 안내)', (await dialogShown()) && (await t(`return document.querySelector('[role=dialog]').innerText`)).includes('덱 하나의 카드 목록'));
  await t(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === '취소').click()`); await sleep(300);
  check('취소 → 복구 화면에 머묾·저장 값 불변', (await h1()) === TITLE && !(await dialogShown()) && (await ls(cardsA)) === '{"not":"list"}');
  await click('손상 항목 빼고 열기');
  await t(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === '빼고 열기').click()`); await sleep(700);
  check('빼고 열기 → 홈', (await h1()) === '오늘 복습', await h1());
  check('격리 키 보관·원래 키 삭제', (await ls(`bq:quarantine:${cardsA}`)) === '{"not":"list"}' && (await ls(cardsA)) === null);
  await fresh(APP + `#/deck/${ids['단어']}`);
  check('덱 A 카드 0장', (await text()).includes('카드 0장'));
  await fresh(APP + `#/deck/${ids['문법']}`);
  check('덱 B 카드 2장 유지', (await text()).includes('카드 2장') && (await ls(cardsB)) !== null);

  // ── 저장소 읽기 실패: devtools 모의는 localStorage 읽기 오류를 삼키므로, 앱의 저장소 어댑터를 1회 실패시키고
  //    같은 시작 경로(startApp)를 다시 실행한다
  await fresh(APP);
  await t(`
    // 앱이 실제로 불러온 모듈 URL(HMR 뒤에는 ?t= 가 붙는다)
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/src/app/bootstrap.ts'));
    const b = await import(url);
    const orig = b.appStorage.getItems;
    let n = 0;
    b.appStorage.getItems = (keys) => (n++ === 0 ? Promise.reject(new Error('e2e read failure')) : orig(keys));
    await b.reloadApp();
  `);
  await sleep(300);
  check('읽기 실패 → 안내·다시 시도', (await h1()) === '데이터를 불러오지 못했어요' && (await hasButton('다시 시도')));
  check('읽기 실패에는 복구 동작 없음', !(await hasButton('백업으로 복구')) && !(await hasButton('손상 항목 빼고 열기')));
  await audit('읽기 실패'); await shot('read-failed');
  await click('다시 시도');
  check('다시 시도 → 홈', (await h1()) === '오늘 복습', await h1());

  // ── 저장 실패: devtools 모의는 localStorage 쓰기 오류를 UNKNOWN_ERROR로 돌려준다
  await fresh(APP + `#/deck/${ids['문법']}`);
  await evaluate(`(() => {
    const orig = Storage.prototype.setItem;
    window.__restoreSetItem = () => { Storage.prototype.setItem = orig; };
    Storage.prototype.setItem = function (key, value) {
      if (String(key).startsWith('__ait_storage:bq:')) throw new Error('e2e write failure');
      return orig.call(this, key, value);
    };
  })()`);
  const editedQ = 'g1 수정됨';
  await t(`
    const { actions } = await __mods();
    const { state, dispatch } = __app();
    const card = state.cards['${ids['문법']}'][0];
    dispatch(actions.updateCard(card.id, card.deckId, '${editedQ}', card.answer));
  `);
  await sleep(3000);
  check('재시도 중(3초)에는 안내 없음', !(await text()).includes('저장하지 못했어요'));
  await sleep(5000);
  const failText = await text();
  check('재시도 3회 모두 실패 → 저장 실패 안내·다시 시도', failText.includes('변경 내용을 저장하지 못했어요') && (await hasButton('다시 시도')));
  check('편집 결과는 화면에 유지', failText.includes(editedQ));
  check('저장소에는 아직 반영 안 됨', !(await ls(cardsB)).includes(editedQ));
  const overlap = await t(`
    const n = document.querySelector('[role=alert]').getBoundingClientRect();
    const bar = [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === '카드 추가').getBoundingClientRect();
    return n.bottom > bar.top;
  `);
  check('안내가 하단 버튼과 겹치지 않음', !overlap);
  await audit('저장 실패 안내'); await shot('save-failed');
  await evaluate(`window.__restoreSetItem()`);
  await click('다시 시도');
  check('다시 시도 → 저장소 반영·안내 사라짐', (await ls(cardsB)).includes(editedQ) && !(await text()).includes('저장하지 못했어요'));

  for (const [name, a] of Object.entries(audits)) {
    check(`글자 13px 이상: ${name}`, a.minFont >= 13, `최소 ${a.minFont}px("${a.minAt}")`);
    check(`터치 44px 이상: ${name}`, a.small.length === 0, a.small.join(', '));
  }
  // 의도한 실패 로그(읽기 실패·로드 실패)는 제외한다
  const unexpected = consoleErrors.filter((e) => !e.includes('e2e read failure') && !e.includes('데이터 로드 실패') && !e.includes('e2e write failure') && !e.includes('저장 실패'));
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
