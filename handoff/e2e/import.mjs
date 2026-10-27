// day7-backup-import 백업 가져오기 확인(헤드리스 Edge·CDP). 5199 기본 빌드
// 사용: node import.mjs <chromePath> <outDir>
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
// day7-backup-import 확인: 기본 빌드(5199)
if (process.env.E2E_STREAM) { const push = results.push.bind(results); results.push = (...r) => (console.log(...r), push(...r)); }
const hash = () => evaluate(`location.hash`);
const text = () => t(`return __t.text()`);
const h1 = () => t(`return __t.h1()`);
const hasButton = (label) => t(`return __t.buttons(${JSON.stringify(label)}).length > 0`);
const click = async (label) => { await t(`__t.click(${JSON.stringify(label)})`); await sleep(400); };
const fresh = async (url) => { await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await load(url); await hook(); };
const ls = (k) => t(`return __ls(${JSON.stringify(k)})`);
const snapshot = () => t(`return JSON.stringify(Object.keys(localStorage).filter((k) => k.startsWith('__ait_storage:bq:') && !k.includes('backup:')).sort().map((k) => [k, localStorage.getItem(k)]))`);
const dialogTitle = () => t(`return document.querySelector('[role=dialog] h2')?.textContent ?? null`);
const dialogCancel = async () => { await t(`[...document.querySelectorAll('[role=dialog] button')].find((b) => b.textContent.trim() === '취소').click()`); await sleep(300); };
const paste = async (value) => { await t(`__t.setValue(document.querySelector('textarea'), ${JSON.stringify(value)})`); await sleep(100); await click('불러오기'); };
const today = () => t(`return (await __mods()).date.todayLocal()`);
// 과목 1·덱 1·카드 n장을 만들고(첫 카드는 오늘 판정) 덱 id를 돌려준다
const seedDeck = (subject, deck, cards, review) => t(`
  const { actions, date } = await __mods();
  const { dispatch } = __app();
  const s = actions.addSubject(${JSON.stringify(subject)}); dispatch(s);
  const d = actions.addDeck(s.id, ${JSON.stringify(deck)}); dispatch(d);
  const added = ${JSON.stringify(cards)}.map(([q, a]) => { const c = actions.addCard(d.id, q, a); dispatch(c); return c; });
  await __wait(100);
  if (${review}) dispatch(actions.reviewCard(added[0].id, d.id, 'remember', date.todayLocal()));
  await __wait(900);
  return d.id;`);

try {
  // ── 가져올 백업 만들기: 과목 1·덱 1·카드 3장·오늘 판정 1건
  await load(APP); await hook();
  await evaluate(`localStorage.clear(); localStorage.setItem('__ait_storage:bq:guide', 'true')`); await fresh(APP);
  await seedDeck('영어', '단어', [['apple', '사과'], ['pear', '배'], ['plum', '자두']], true);
  await fresh(APP);
  const docText = await t(`
    const { buildExport } = await import('/src/infra/storage/exportData.ts');
    const { appStorage } = await import('/src/app/bootstrap.ts');
    const doc = await buildExport({ storage: appStorage, content: __app().state, schemaVersion: 2, today: (await __mods()).date.todayLocal() });
    return JSON.stringify(doc);`);
  const doc = JSON.parse(docText);
  check('백업 문서 준비(카드 3장·기록 1건)', Object.values(doc.cards).flat().length === 3 && Object.values(doc.logs).flat().length === 1);

  // ── 지금 데이터: 다른 과목 1·카드 1장, Meta에 알림 동의 기록
  await evaluate(`localStorage.clear(); localStorage.setItem('__ait_storage:bq:guide', 'true')`); await fresh(APP);
  const oldDeck = await seedDeck('옛과목', '옛단원', [['q', 'a']], false);
  await evaluate(`const m = JSON.parse(localStorage.getItem('__ait_storage:bq:meta')); localStorage.setItem('__ait_storage:bq:meta', JSON.stringify({ ...m, notification: { agreed: true, agreedAt: '2026-10-01T00:00:00.000Z', lastAskedAt: '2026-10-01T00:00:00.000Z' } }))`);
  const metaBefore = await ls('bq:meta');

  // ── 진입·입력
  await fresh(APP + '#/settings');
  check('설정에 백업 가져오기', await hasButton('백업 가져오기'));
  await click('백업 가져오기');
  check('펼치면 파일 선택·붙여넣기 입력란', (await hasButton('백업 파일 선택')) && (await t(`return !!document.querySelector('textarea')`)) && (await t(`return !!document.querySelector('input[type=file]')`)));
  await t(`window.__picked = 0; HTMLInputElement.prototype.click = function () { if (this.type === 'file') window.__picked++; }`);
  await click('백업 파일 선택');
  check('파일 선택 → 파일 입력을 연다', (await t(`return window.__picked`)) === 1);

  // ── 이유별 안내
  const snap0 = await snapshot();
  await paste('그냥 글');
  check('JSON 아님 → 안내·바꾸기 없음', (await text()).includes('백업 파일이 아니에요') && (await dialogTitle()) === null);
  await paste(JSON.stringify({ ...doc, subjects: [{ id: 'x' }] }));
  check('형식 틀림 → 안내', (await text()).includes('형식이 맞지 않아요') && (await dialogTitle()) === null);
  await paste(JSON.stringify({ ...doc, subjects: [] }));
  check('참조 불일치 → 안내', (await text()).includes('서로 맞지 않아') && (await dialogTitle()) === null);
  await paste(JSON.stringify({ ...doc, schemaVersion: 99 }));
  check('새 버전 → 업데이트 안내', (await text()).includes('앱을 업데이트한 뒤') && (await dialogTitle()) === null);
  check('불러오기만으로 저장소 불변', (await snapshot()) === snap0);

  // ── 확인 팝업·취소
  await paste(docText);
  check('정상 → 확인 팝업에 요약·내보낸 날짜·경고', (await dialogTitle()) === '이 백업으로 바꿀까요?' && (await text()).includes('과목 1개, 단원 1개, 카드 3장, 학습 기록 1건') && (await text()).includes('내보낸 백업이에요') && (await text()).includes('백업 내용으로 바뀌어요'));
  check('팝업 버튼: 취소·바꾸기', await t(`return ['취소', '바꾸기'].every((l) => [...document.querySelectorAll('[role=dialog] button')].some((b) => b.textContent.trim() === l))`));
  await audit('설정(가져오기 확인 팝업)'); await shot('import-confirm');
  await dialogCancel();
  check('취소 → 팝업 닫힘·저장소 불변·설정 유지', (await dialogTitle()) === null && (await snapshot()) === snap0 && (await h1()) === '설정');
  await paste(docText);
  check('다시 불러오면 팝업 다시 열림', (await dialogTitle()) === '이 백업으로 바꿀까요?');
  await dialogCancel();

  // ── 보관 실패 주입
  await t(`
    const { appStorage } = await import('/src/app/bootstrap.ts');
    window.__origSet = appStorage.setItems;
    appStorage.setItems = (entries) => ('bq:backup:beforeImport' in entries ? Promise.reject(new Error('보관 실패 주입')) : window.__origSet(entries));`);
  await click('불러오기'); await sleep(300); await click('바꾸기'); await sleep(500);
  check('보관 실패 → 안내·설정 유지', (await text()).includes('백업을 가져오지 못했어요') && (await h1()) === '설정');
  check('보관 실패 → 데이터 불변', (await snapshot()) === snap0);
  await t(`(await import('/src/app/bootstrap.ts')).appStorage.setItems = window.__origSet`);

  // ── 저장 대기 중 편집 직후 가져오기
  await t(`
    const { state, dispatch } = __app();
    const card = state.cards[${JSON.stringify(oldDeck)}][0];
    dispatch({ type: 'card/update', id: card.id, deckId: card.deckId, question: card.question, answer: '편집됨', now: new Date().toISOString() });
    await __wait(30);
    __t.click('불러오기'); await __wait(150);
    __t.click('바꾸기');`);
  await sleep(1500);
  check('가져오기 → 홈', (await hash()) === '#/' && (await h1()) === '오늘 복습');
  const subjects = JSON.parse(await ls('bq:subjects'));
  check('과목이 백업 내용으로 바뀜', subjects.length === 1 && subjects[0].name === '영어', JSON.stringify(subjects.map((s) => s.name)));
  check('지금에만 있던 단원의 카드 키 삭제·편집이 다시 저장되지 않음', (await ls(`bq:cards:${oldDeck}`)) === null);
  check('Meta(설치 식별자·알림 동의) 유지', (await ls('bq:meta')) === metaBefore);
  const before = JSON.parse(await ls('bq:backup:beforeImport'));
  check('이전 데이터 보관(편집 값 포함)', before.subjects[0]?.name === '옛과목' && Object.values(before.cards).flat()[0]?.answer === '편집됨');
  const cardsNow = Object.values(doc.cards).flat();
  const stored = JSON.parse(await ls(`bq:cards:${doc.decks[0].id}`));
  check('카드 일정이 백업과 같음', JSON.stringify(stored.map((c) => c.schedule)) === JSON.stringify(cardsNow.map((c) => c.schedule)));
  await fresh(APP + '#/stats');
  check('통계: 오늘 완료 1장·전체 3장', (await text()).includes('오늘 완료') && /오늘 완료\s*1장/.test(await text()) && /전체 카드\s*3장/.test(await text()));

  // ── 파일 입력 경로
  await evaluate(`localStorage.clear(); localStorage.setItem('__ait_storage:bq:guide', 'true')`); await fresh(APP + '#/settings');
  await click('백업 가져오기');
  await t(`
    const input = document.querySelector('input[type=file]');
    const dt = new DataTransfer();
    dt.items.add(new File([${JSON.stringify(docText)}], 'reviewq-backup.json', { type: 'application/json' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));`);
  await sleep(500);
  check('파일 입력 → 요약', (await text()).includes('과목 1개, 단원 1개, 카드 3장, 학습 기록 1건'));
  await click('바꾸기'); await sleep(1200);
  check('파일로 가져오기 → 홈 오늘 복습', (await hash()) === '#/' && (await t(`return JSON.parse(__ls('bq:subjects')).length`)) === 1);

  // ── 백업 코드 공유·복사·붙여넣기 가져오기
  await evaluate(`localStorage.clear(); localStorage.setItem('__ait_storage:bq:guide', 'true')`); await fresh(APP);
  await seedDeck('수학', '공식', [['원의 넓이', 'πr²'], ['근의 공식', 'x = (-b ± √(b²-4ac)) / 2a']], true);
  await fresh(APP + '#/settings');
  await t(`
    window.__shared = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: (d) => { window.__shared.push(d.text); return Promise.resolve(); } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (v) => { window.__clip = v; } } });`);
  check('설정에 백업 코드 공유·파일로 저장', (await hasButton('백업 코드 공유')) && (await hasButton('파일로 저장')));
  await t(`__t.click('백업 코드 공유'); __t.click('백업 코드 공유');`); await sleep(800);
  const shared = await t(`return window.__shared`);
  const shownCode = await t(`return document.querySelector('textarea[readonly]')?.value ?? ''`);
  check('공유 시트 1회·메시지에 안내와 코드', shared.length === 1 && shared[0].includes('복습큐 백업 코드예요') && /RQB1\.[A-Za-z0-9_-]+$/.test(shared[0]), String(shared.length));
  check('화면에 같은 코드 표시', shownCode.startsWith('RQB1.') && shared[0]?.endsWith(shownCode));
  await audit('설정(백업 코드)'); await shot('backup-code');
  await click('코드 복사');
  check('코드 복사 → 클립보드·안내', (await t(`return window.__clip`)) === shownCode && (await text()).includes('코드를 복사했어요'));
  // 공유 실패: SDK 모듈의 Share.sendMessage를 실패하게 바꾼다(devtools 모의는 navigator.share 오류를 삼킨다)
  const patched = await t(`
    const url = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('/@apps-in-toss/devtools/dist/mock/'));
    if (!url) return false;
    const mod = await import(url);
    const share = mod.Share ?? Object.values(mod).find((v) => v && typeof v.sendMessage === 'function');
    if (!share) return false;
    window.__origSend = share.sendMessage; window.__shareObj = share;
    share.sendMessage = () => Promise.reject(new Error('공유 실패 주입'));
    return true;`);
  if (patched) {
    await click('백업 코드 공유'); await sleep(600);
    check('공유 실패 → 안내·코드 표시', (await text()).includes('공유 창을 열지 못했어요') && (await t(`return (document.querySelector('textarea[readonly]')?.value ?? '').startsWith('RQB1.')`)));
    await t(`window.__shareObj.sendMessage = window.__origSend`);
  } else {
    results.push('INFO 공유 실패 주입 불가(SDK 모듈을 찾지 못함) — 확인 생략');
  }

  // 공유 메시지 전체를 다른(빈) 기기에 붙여넣어 가져오기
  const message = shared[0];
  await evaluate(`localStorage.clear(); localStorage.setItem('__ait_storage:bq:guide', 'true')`); await fresh(APP + '#/settings');
  await click('백업 가져오기');
  await paste(message.slice(0, -10));
  check('잘린 코드 → 안내·바꾸기 없음', (await text()).includes('백업 코드가 올바르지 않아요') && (await dialogTitle()) === null);
  await paste(message);
  check('공유 메시지 전체 붙여넣기 → 요약', (await text()).includes('과목 1개, 단원 1개, 카드 2장, 학습 기록 1건'));
  await click('바꾸기'); await sleep(1200);
  const restored = JSON.parse(await ls('bq:subjects'));
  check('코드로 가져오기 → 홈·과목 복원', (await hash()) === '#/' && restored.length === 1 && restored[0].name === '수학');
  const restoredCards = JSON.parse(await t(`return __ls('bq:cards:' + JSON.parse(__ls('bq:decks'))[0].id)`));
  check('코드로 가져오기 → 한글·특수문자 카드 그대로', restoredCards.some((c) => c.answer === 'x = (-b ± √(b²-4ac)) / 2a'));

  for (const [name, a] of Object.entries(audits)) {
    check(`글자 13px 이상: ${name}`, a.minFont >= 13, `최소 ${a.minFont}px("${a.minAt}")`);
    check(`터치 44px 이상: ${name}`, a.small.length === 0, a.small.join(', '));
  }
  const unexpected = consoleErrors.filter((e) => !/백업 가져오기 실패|백업 코드 공유 실패/.test(e));
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
