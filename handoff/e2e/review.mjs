// day3-scheduler 브라우저 확인: 실행 중인 앱의 Provider dispatch를 React fiber로 찾아 판정을 흘려 넣는다
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

try {
  await load(APP);
  await hook();
  const today = await t(`return (await __mods()).date.todayLocal()`);
  const tomorrow = await t(`return (await __mods()).date.addDays('${today}', 1)`);
  const month = today.slice(0, 7);
  const [, tm, td] = tomorrow.split('-').map(Number);
  const tomorrowLabel = `${tm}월 ${td}일`;

  // 준비: 과목·덱·카드 2장(UI)
  await t(`__t.click('과목 추가')`); await settle();
  await t(`__t.fillDialog('영어'); __t.click('만들기')`); await settle();
  await t(`__t.click('+ 덱 추가', 0)`); await settle();
  await t(`__t.fillDialog('단어'); __t.click('만들기')`); await settle();
  await t(`__t.clickRow('단어')`); await settle();
  await t(`__t.click('카드 추가')`); await settle();
  await t(`__t.fillCard('apple', '사과'); __t.click('저장 후 계속')`); await settle();
  await t(`__t.fillCard('banana', '바나나'); __t.click('저장')`); await sleep(800);
  await hook();
  const ids = await t(`const { state } = __app(); const d = state.decks[0]; return { deckId: d.id, cards: state.cards[d.id].map((c) => c.id) }`);
  const { deckId } = ids;
  const [apple, banana] = ids.cards;
  check('준비: 카드 2장 오늘 예정', (await t(`return __t.text()`)).match(/다음 복습 오늘/g)?.length === 2);

  // 큐(브라우저의 실제 상태로)
  const q1 = await t(`const { queue } = await __mods(); return queue.buildQueue(__app().state, '${today}', { deckId: '${deckId}' })`);
  check('오늘 큐: 2장, 생성 순', q1.cards.map((c) => c.cardId).join() === `${apple},${banana}` && q1.overflow === 0, JSON.stringify(q1));

  // 세션 → apple 기억함 → 400ms 전에 저장 (D-01)
  const flow = await t(`
    const { actions, queue, session: S } = await __mods();
    const q = queue.buildQueue(__app().state, '${today}', { deckId: '${deckId}' });
    const start = S.startSession(q.cards, '${today}');
    const early = S.judge(start, 'remember');
    const r = S.judge(S.flip(start), 'remember');
    const t0 = performance.now();
    __app().dispatch(actions.reviewCard(r.apply.cardId, r.apply.deckId, r.apply.grade, r.apply.date));
    let elapsed = null;
    while (performance.now() - t0 < 390) {
      const raw = __ls('bq:logs:${month}');
      if (raw && JSON.parse(raw).length === 1) { elapsed = Math.round(performance.now() - t0); break; }
      await __wait(5);
    }
    return { ignoredBeforeFlip: !early.apply && early.session === start, elapsed, progress: S.progress(r.session), next: r.session };
  `);
  check('뒤집기 전 판정 무시', flow.ignoredBeforeFlip);
  check('판정이 400ms 전에 저장됨 (D-01)', flow.elapsed !== null, `${flow.elapsed}ms`);
  check('진행 2/2', flow.progress.current === 2 && flow.progress.total === 2, JSON.stringify(flow.progress));
  const savedApple = await t(`return JSON.parse(__ls('bq:cards:${deckId}')).find((c) => c.id === '${apple}').schedule`);
  check('저장된 apple 일정: stage 1·내일·복습 1회', savedApple.stage === 1 && savedApple.dueDate === tomorrow
    && savedApple.reviewCount === 1 && savedApple.lastReviewedDate === today, JSON.stringify(savedApple));
  const log1 = await t(`return JSON.parse(__ls('bq:logs:${month}'))[0]`);
  check('저장된 로그: 날짜·판정·단계 0→1', log1.cardId === apple && log1.date === today && log1.grade === 'remember'
    && log1.prevStage === 0 && log1.nextStage === 1, JSON.stringify(log1));

  // 같은 날 재판정 → 상태·저장 그대로 (S-06)
  const same = await t(`
    const { actions } = await __mods();
    const before = __app().state;
    const rawBefore = __ls('bq:logs:${month}');
    __app().dispatch(actions.reviewCard('${apple}', '${deckId}', 'forget', '${today}'));
    await __wait(600);
    return { sameRef: __app().state === before, sameRaw: __ls('bq:logs:${month}') === rawBefore, logs: __app().state.logs['${month}'].length };
  `);
  check('같은 날 재판정: 상태 참조 그대로·로그 1건', same.sameRef && same.sameRaw && same.logs === 1, JSON.stringify(same));

  // banana 기억 못 함 → 즉시 저장, 재출제 판정은 apply 없음
  const fail = await t(`
    const { actions, session: S } = await __mods();
    const r = S.judge(S.flip(${JSON.stringify(flow.next)}), 'forget');
    __app().dispatch(actions.reviewCard(r.apply.cardId, r.apply.deckId, r.apply.grade, r.apply.date));
    await __wait(100);
    const saved = JSON.parse(__ls('bq:logs:${month}')).length;
    const retry = S.judge(S.flip(r.session), 'remember');
    return { order: r.session.order.length, retryApply: retry.apply ?? null, finished: S.isFinished(retry.session),
      saved, summary: S.summarize(retry.session, __app().state) };
  `);
  check('기억 못 함 → 재출제 1회 추가(총 3장)', fail.order === 3);
  check('재출제 판정은 apply 없음·세션 종료', fail.retryApply === null && fail.finished);
  check('banana 판정 100ms 안에 저장(로그 2건)', fail.saved === 2);
  check('요약: 완료 2·기억함 1·내일 2', fail.summary.completed === 2 && fail.summary.remembered === 1
    && fail.summary.dueTomorrow === 2, JSON.stringify(fail.summary));

  // 판정이 아닌 편집은 기존 400ms 지연 저장 유지
  const edit = await t(`
    const { actions } = await __mods();
    const q = () => JSON.parse(__ls('bq:cards:${deckId}')).find((c) => c.id === '${banana}').question;
    __app().dispatch(actions.updateCard('${banana}', '${deckId}', 'banana2', '바나나'));
    await __wait(150);
    const early = q();
    await __wait(600);
    return { early, late: q() };
  `);
  check('일반 편집: 150ms엔 미저장, 750ms엔 저장', edit.early === 'banana' && edit.late === 'banana2', JSON.stringify(edit));

  // 새로고침 → 일정·로그 유지, 화면에 내일 표시
  await reload(); await hook();
  check('새로고침 후 덱 상세 유지', (await t(`return __t.h1()`)) === '단어');
  const dueLabels = (await t(`return __t.text()`)).split(`다음 복습 ${tomorrowLabel}`).length - 1;
  check(`새로고침 후 두 카드 "다음 복습 ${tomorrowLabel}"`, dueLabels === 2, `${dueLabels}개`);
  await shot('day3-deck-detail-after-review');
  const reloaded = await t(`const { state } = __app(); return { logs: state.logs['${month}'].map((l) => l.grade + ':' + l.prevStage + '>' + l.nextStage), banana: state.cards['${deckId}'][1].schedule }`);
  check('새로고침 후 로그 2건 유지', reloaded.logs.join() === 'remember:0>1,forget:0>0', reloaded.logs.join());
  check('새로고침 후 banana: stage 0·실패 1·내일', reloaded.banana.stage === 0 && reloaded.banana.lapseCount === 1
    && reloaded.banana.dueDate === tomorrow, JSON.stringify(reloaded.banana));
  const q2 = await t(`const { queue } = await __mods(); return [queue.buildQueue(__app().state, '${today}').cards.length, queue.buildQueue(__app().state, '${tomorrow}').cards.length]`);
  check('큐: 오늘 0장, 내일 2장', q2[0] === 0 && q2[1] === 2, JSON.stringify(q2));

  // 날짜 계산(브라우저 시간대 그대로)
  const dates = await t(`const { date: D } = await __mods(); return [D.addDays('2026-01-31', 30), D.addDays('2028-02-28', 1), D.addDays('2028-02-29', 1), D.addDays('2026-12-31', 1), D.addDays('2026-03-28', 1), D.addDays('2026-10-24', 1)]`);
  check('addDays 경계(브라우저)', dates.join() === '2026-03-02,2028-02-29,2028-03-01,2027-01-01,2026-03-29,2026-10-25', dates.join());
  const tz = await t(`return Intl.DateTimeFormat().resolvedOptions().timeZone`);

  check('콘솔 오류 없음(정상 흐름)', consoleErrors.length === 0, consoleErrors.join(' | '));

  // 로그 로드 범위: 지난달은 읽고, 두 달 전(손상)은 읽지 않는다
  const prevMonth = await t(`const { date: D } = await __mods(); return D.addDays('${month}-01', -1).slice(0, 7)`);
  const twoAgo = await t(`const { date: D } = await __mods(); return D.addDays('${prevMonth}-01', -1).slice(0, 7)`);
  await t(`
    localStorage.setItem('__ait_storage:bq:logs:${prevMonth}', JSON.stringify([{ id: 'old', cardId: '${apple}', date: '${prevMonth}-15', grade: 'remember', prevStage: 0, nextStage: 1, reviewedAt: 'x' }]));
    localStorage.setItem('__ait_storage:bq:logs:${twoAgo}', '[{broken');
  `);
  await reload(); await hook();
  const range = await t(`return Object.fromEntries(Object.entries(__app().state.logs).map(([k, v]) => [k, v.length]))`);
  check(`로드 범위: ${month}·${prevMonth}만, ${twoAgo}(손상) 무시`,
    JSON.stringify(range) === JSON.stringify({ [month]: 2, [prevMonth]: 1 }), JSON.stringify(range));

  // 이번 달 로그 손상 → 오류 화면, 값 덮어쓰지 않음
  const goodRaw = await t(`return __ls('bq:logs:${month}')`);
  await t(`localStorage.setItem('__ait_storage:bq:logs:${month}', '[{broken')`);
  await send('Page.reload');
  await sleep(300);
  await waitFor(`document.querySelector('[role=alert]')`);
  await sleep(1000);
  check('손상된 이번 달 로그 → 오류 안내', (await evaluate(`document.querySelector('[role=alert]').innerText`)).includes('불러오지 못했어요'));
  check('손상 값 덮어쓰지 않음', (await evaluate(`localStorage.getItem('__ait_storage:bq:logs:${month}')`)) === '[{broken');
  await shot('day3-load-error');
  await evaluate(`localStorage.setItem('__ait_storage:bq:logs:${month}', ${JSON.stringify(goodRaw)})`);
  await reload();
  check('복구 후 정상 로드', (await t(`return __t.h1()`)) === '단어');
  results.push(`INFO today=${today} tz=${tz}`);
} catch (e) {
  check('스크립트 실행', false, e.message);
} finally {
  console.log(results.join('\n'));
  console.log(`\n${countable().length - failed}/${countable().length} 통과`);
  ws.close();
  chrome.kill();
  process.exitCode = failed ? 1 : 0;
}
