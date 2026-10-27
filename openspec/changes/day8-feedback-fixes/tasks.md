# Tasks

모든 경로는 `reviewq/` 기준이다. 선행 change `day7-backup-code`·`day8-ux-improvements`를 보관한 뒤 진행한다. 화면 동작 검증은 CDP 스크립트(헤드리스 Edge, PowerShell에서 node 실행, 출력 폴더는 절대 경로)로 하고, dev 서버는 프로젝트의 `node_modules/.bin/vite`로 띄운다.

## 1. 가이드 기기 뒤로가기

- [ ] 1.1 `screens/Guide/Guide.tsx`에서 마운트 동안 `backEvent`를 구독해 `back()`하고 iOS 스와이프를 끈 뒤 언마운트 때 해제·복원한다(design 결정 1). 검증: `ux.mjs`에 `__ait:backEvent`로 처음 실행 가이드 → 홈, 다시 보기 가이드 → 설정, 가이드를 벗어나면 구독 수 0, 본 기록 미저장 항목 추가

## 2. 학습 진행 표시

- [ ] 2.1 `domain/session.ts`에 `initialCount`, 두 구간 `progress`, `summarize`의 `retried`를 더한다(design 결정 2). 검증: `session.test.ts`로 첫 회차 분모 고정·`pendingRetry`·다시 보기 구간 순번과 수·끝난 세션 값·`retried`를 확인하고 기존 세션 테스트를 새 반환 형태에 맞춘다
- [ ] 2.2 `StudySession.tsx`·`messages.ts`에 첫 회차·다시 볼 카드·다시 보기 구간 표시와 스크린리더 문장, 완료 화면의 다시 본 카드 항목을 반영한다(design 결정 3). 검증: `study.mjs` 재출제 기대값을 새 표시로 고치고(바꾼 줄은 보고에 적기) 데모 데이터로 홈 13장 → "1 / 13" → 기억 못 함 3번 후에도 "/ 13" → "다시 보기 1 / 3" → 완료 13장·다시 본 카드 3장을 확인한다

## 3. 홈 과목별

- [ ] 3.1 `selectors.ts`에 `cardCountBySubject`를 더하고 홈 과목 행을 "오늘 N장 · 전체 M장"으로 바꾼다(design 결정 4). 검증: `selectors.test.ts`, `home.mjs` 과목별 기대값 갱신(바꾼 줄은 보고에 적기), 오늘 복습 0인 과목도 전체 수가 보이는지 CDP로 확인

## 4. 통합 확인

- [ ] 4.1 `npx tsc -b`·lint·`npm test -- --run`·`npm run build`가 통과하고 CDP 11종(`ux` 포함)이 통과한다. 세션 진행·완료 화면·홈 과목별 캡처를 공유하고, 실기기 확인 항목(처음 실행 가이드에서 토스 내비게이션 바·Android 백버튼 → 홈)을 남긴다
