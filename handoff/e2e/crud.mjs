// day2-crud-screens 통합 확인: 헤드리스 Chrome을 CDP로 조작한다(Node 내장 WebSocket)
// 사용: node crud.mjs <chromePath> <outDir>
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

try {
  await send('Page.navigate', { url: 'about:blank' }); await sleep(200); await load(APP + '#/subjects'); // day4: 최초 화면은 홈, 목록은 #/subjects

  // 3.1 과목·덱 목록
  check('#/subjects는 과목·단원 목록',(await t(`return __t.h1()`)) === '과목·단원');
  check('빈 상태 안내', (await t(`return __t.text()`)).includes('아직 과목이 없어요'));
  await audit('목록(빈 상태)');

  await t(`__t.click('과목 추가')`); await settle();
  await t(`__t.click('만들기')`); await settle();
  check('빈 과목 이름 안내', (await t(`return __t.text()`)).includes('과목 이름을 입력해 주세요'));
  await audit('과목 추가 다이얼로그');
  await shot('2-dialog-empty-name');
  await t(`__t.fillDialog('영어'); __t.click('만들기')`); await settle();
  await t(`__t.click('과목 추가')`); await settle();
  await t(`__t.fillDialog('토익'); __t.click('만들기')`); await settle();
  check('과목 2개 생성', (await t(`return [...document.querySelectorAll('h2')].map((h) => h.textContent).join(',')`)) === '영어,토익');

  await t(`__t.click('+ 단원 추가', 0)`); await settle();
  await t(`__t.fillDialog('${'가'.repeat(31)}')`); await settle();
  check('31자 단원 이름 안내', (await t(`return __t.text()`)).includes('30자 이하로 입력해 주세요'));
  await t(`__t.click('만들기')`); await settle();
  check('31자 단원 이름은 저장 안 됨', (await t(`return !!document.querySelector('[role=dialog]')`)));
  await t(`__t.fillDialog('단어'); __t.click('만들기')`); await settle();
  await t(`__t.click('+ 단원 추가', 0)`); await settle();
  await t(`__t.fillDialog(' 단어 ')`); await settle();
  check('중복 단원 이름 경고', (await t(`return __t.text()`)).includes('이 과목에 같은 이름의 단원이 있어요'));
  await t(`__t.click('취소')`); await settle();
  check('단원 카드 수 0장', (await t(`return __t.text()`)).includes('단어\n0장'));

  // 3.2 덱 상세
  await t(`__t.clickRow('단어')`); await settle();
  check('단원 상세 이동', (await t(`return __t.h1()`)) === '단어');
  check('빈 단원 안내', (await t(`return __t.text()`)).includes('아직 카드가 없어요'));
  await audit('단원 상세(빈 상태)');

  // 3.3 카드 작성
  await t(`__t.click('카드 추가')`); await settle();
  check('새 카드 화면', (await t(`return __t.h1()`)) === '새 카드');
  await t(`__t.fillCard('0123456789', null)`); await settle();
  check('글자 수 10/500', (await t(`return document.querySelector('[data-field=question]').textContent`)) === '10/500');
  await t(`__t.fillCard('apple', null); __t.click('저장')`); await settle();
  check('정답 누락 안내', (await t(`return __t.text()`)).includes('정답을 입력해 주세요'));
  check('정답 누락 시 화면 유지', (await t(`return __t.h1()`)) === '새 카드');
  await audit('카드 작성(오류 표시)');
  await shot('4-card-editor-error');
  await t(`__t.fillCard('apple', '사과'); __t.click('저장 후 계속')`); await settle();
  check('저장 후 계속: 입력란 초기화', (await t(`return [...document.querySelectorAll('textarea')].every((x) => x.value === '')`)));
  check('저장 후 계속: 화면 유지', (await t(`return __t.h1()`)) === '새 카드');
  await t(`__t.fillCard('banana', '바나나'); __t.click('저장 후 계속')`); await settle();
  await t(`__t.fillCard('삭제할 카드', '임시'); __t.click('저장')`); await sleep(400);
  check('저장 후 단원 상세 복귀', (await t(`return __t.h1()`)) === '단어');
  check('카드 3장 목록', (await t(`return __t.text()`)).includes('카드 3장'));
  check('다음 복습 오늘 표시', (await t(`return __t.text()`)).includes('다음 복습 오늘'));
  await audit('단원 상세(카드 목록)');
  await shot('3-deck-detail');

  // 카드 삭제
  await t(`__t.clickRow('삭제할 카드')`); await settle();
  check('카드 편집 화면', (await t(`return __t.h1()`)) === '카드 편집');
  await t(`__t.click('삭제')`); await settle();
  await t(`__t.buttons('삭제').at(-1).click()`); await sleep(400);
  check('카드 삭제 후 단원 상세 복귀·2장', (await t(`return __t.h1()`)) === '단어' && (await t(`return __t.text()`)).includes('카드 2장'));

  // 뒤로가기: 목록 → 덱 상세 → 카드 편집 → 뒤로 2회 → 목록
  await t(`__t.clickRow('apple')`); await settle();
  await t(`history.back()`); await sleep(300);
  check('뒤로가기 1회 → 단원 상세', (await t(`return __t.h1()`)) === '단어');
  await t(`history.back()`); await sleep(300);
  check('뒤로가기 2회 → 목록', (await t(`return __t.h1()`)) === '과목·단원');
  check('목록 카드 수 2장', (await t(`return __t.text()`)).includes('단어\n2장'));

  // 덱 이동
  await t(`__t.clickLabel('단어 단원 더보기')`); await settle();
  await t(`__t.click('다른 과목으로 옮기기')`); await settle();
  await t(`__t.click('토익')`); await settle();
  const sections = await t(`return [...document.querySelectorAll('section[aria-label]')].map((x) => x.getAttribute('aria-label') + ':' + x.innerText.replace(/\\n/g, '|'))`);
  check('단원 이동: 토익 아래 2장', sections.some((x) => x.startsWith('토익:') && x.includes('단어|2장')), sections.join(' / '));
  await shot('1-subject-list');
  await audit('목록(데이터 있음)');

  // 새로고침 후 유지
  await sleep(800);
  await reload();
  const afterReload = await t(`return __t.text()`);
  check('새로고침 후 유지(과목·단원·카드 수)', afterReload.includes('영어') && afterReload.includes('토익') && afterReload.includes('단어\n2장'));

  // 덱 상세에서 새로고침 → 같은 화면
  await t(`__t.clickRow('단어')`); await settle();
  await reload();
  check('단원 상세에서 새로고침 → 같은 단원', (await t(`return __t.h1()`)) === '단어');
  await t(`history.back()`); await sleep(300);
  check('새로고침 후 뒤로가기 → 목록', (await t(`return __t.h1()`)) === '과목·단원');

  // 없는 덱 주소 → 홈(day4)
  await t(`location.hash = '#/deck/nope'`); await sleep(300);
  check('없는 단원 주소 → 홈', (await t(`return __t.h1()`)) === '오늘 복습' && (await t(`return location.hash`)) === '#/');
  await t(`location.hash = '#/subjects'`); await sleep(300);

  // 과목 연쇄 삭제
  await t(`__t.clickLabel('토익 과목 더보기')`); await settle();
  await t(`__t.click('삭제')`); await settle();
  const confirmText = await t(`return document.querySelector('[role=dialog]').innerText`);
  check('삭제 확인 문구(단원 1개·카드 2장)', confirmText.includes('단원 1개·카드 2장도 함께 삭제돼요.'));
  await shot('5-delete-confirm');
  await t(`__t.buttons('삭제').at(-1).click()`); await settle();
  await sleep(800);
  await reload();
  const afterDelete = await t(`return __t.text()`);
  check('연쇄 삭제 후 새로고침: 토익·단어 없음, 영어 유지', !afterDelete.includes('토익') && !afterDelete.includes('단어') && afterDelete.includes('영어'));
  const keys = await t(`return Object.keys(localStorage).filter((k) => k.includes('bq:cards'))`);
  check('삭제된 단원의 카드 키 정리', keys.length === 0, JSON.stringify(keys));

  // 하위 화면으로 바로 진입(새 탭) → 뒤로가기 시 상위 화면
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await t(`localStorage.length`).catch(() => {});
  // 덱 하나 만들어 id 확보 후 해당 주소로 새 진입
  await load(APP + '#/subjects');
  await t(`__t.click('+ 단원 추가', 0)`); await settle();
  await t(`__t.fillDialog('숙어'); __t.click('만들기')`); await settle();
  await t(`__t.clickRow('숙어')`); await settle();
  const deckHash = await t(`return location.hash`);
  await sleep(800);
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(200);
  await send('Page.navigate', { url: `${APP}${deckHash}/card/new` });
  await waitFor(`document.querySelector('h1')`); await evaluate(HELPERS);
  check('카드 작성 주소로 바로 진입', (await t(`return __t.h1()`)) === '새 카드');
  await t(`history.back()`); await sleep(300);
  check('바로 진입 후 뒤로가기 → 단원 상세', (await t(`return __t.h1()`)) === '숙어');
  await t(`history.back()`); await sleep(300);
  check('한 번 더 뒤로가기 → 목록', (await t(`return __t.h1()`)) === '과목·단원');
  await t(`history.back()`); await sleep(300);
  check('목록에서 뒤로가기 → 홈(day4)', (await t(`return __t.h1()`)) === '오늘 복습');

  for (const [name, a] of Object.entries(audits)) {
    check(`글자 13px 이상: ${name}`, a.minFont >= 13, `최소 ${a.minFont}px("${a.minAt}")`);
    check(`터치 44px 이상: ${name}`, a.small.length === 0, a.small.join(', '));
  }
  check('콘솔 오류 없음', consoleErrors.length === 0, consoleErrors.join(' | '));
} catch (e) {
  check('스크립트 실행', false, e.message);
} finally {
  console.log(results.join('\n'));
  console.log(`\n${results.length - failed}/${results.length} 통과`);
  ws.close();
  chrome.kill();
  process.exitCode = failed ? 1 : 0;
}
