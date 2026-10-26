# Tasks

모든 경로는 `reviewq/` 기준이다. 화면 동작 검증은 scratchpad의 CDP 스크립트(devtools dev 서버, 헤드리스 Edge/Chrome)로 한다.

## 1. 경로와 뒤로가기 가드

- [x] 1.1 `src/app/router.ts`에 `{ name: 'study', deckId }`(`#/deck/{deckId}/study`)를 추가하고 `parseRoute`·`formatRoute`·`seedRoutes`·`routeTargetExists`를 맞춘다. 검증: `router.test.ts`에 study 경로 왕복, seed `[subjects, deck]`, 없는 덱이면 대상 없음, `#/deck/d1/studyx` 같은 잘못된 경로는 목록 테스트를 더해 통과한다
- [x] 1.2 `RouteContext`에 `setLeaveGuard(guard | null)`을 추가하고 `RouterProvider`의 popstate 처리에서 가드가 있으면 경로를 바꾸지 않고 현재 경로를 다시 pushState한 뒤 가드를 호출한다. 검증: `npx tsc -b` 통과, day2 CDP 스크립트 48항목이 그대로 통과한다(가드 없는 화면의 뒤로가기 회귀 없음)

## 2. 덱 상세 진입

- [x] 2.1 `DeckDetail`에 오늘 복습 수(`buildQueue` 담긴 수 + overflow)를 머리말에 보이고, 1장 이상이면 하단에 "카드 추가"(보조)·"학습하기"(주)를, 0장이면 "오늘 복습할 카드가 없어요"와 기존 "카드 추가"만 보인다. "학습하기"는 study 경로로 `navigate`한다. 문구는 `screens/messages.ts`에 둔다. 검증: CDP로 카드 2장 덱에서 "오늘 복습 2장"·학습하기 버튼, 모든 카드가 내일 예정인 덱에서 안내 문구, 버튼 높이 44px 이상을 확인한다

## 3. 학습 세션·완료 화면

- [x] 3.1 `src/screens/Study/StudySession.tsx`(+ CSS 모듈)를 만들고 `App.tsx`에 `key={deckId}`로 연결한다. 마운트 때 날짜·큐를 한 번 정해 세션을 시작하고, 진행 "n / 전체", 카드 영역 탭 뒤집기(질문 → 질문+정답), 하단 고정 판정 버튼 2개(뒤집기 전 비활성), ref 판정 잠금, `apply`가 있을 때만 `actions.reviewCard` 디스패치, 빈 큐 안내와 "덱으로 돌아가기"를 구현한다. 검증: CDP로 진행 1/3, 뒤집기 전 버튼 비활성·클릭 무변화, 뒤집기 후 정답 표시, 같은 프레임 두 번 클릭 → 로그 1건·다음 카드 질문 상태, 기억 못 함 후 진행 2/4, 빈 큐 주소 → 안내·돌아가기, 세션 중 새로고침 → 남은 카드로 1/2, 글자 13px·본문 15px·터치 44px 이상을 확인한다
- [x] 3.2 같은 컴포넌트에서 `isFinished`일 때 완료 화면(완료 수, 기억함 비율 %, 내일 예정 수, "덱으로 돌아가기" → `back()`)을 그린다. 검증: CDP로 카드 2장(기억함 1·기억 못 함 1, 재출제 판정) → 완료 2장·기억함 50%·내일 2장, 돌아가기 → 덱 상세에 갱신된 다음 복습일, 판정 직후 저장소에 로그가 있는지(D-01)를 확인한다

## 4. 세션 중 뒤로가기 확인

- [x] 4.1 세션 진행 중(큐 있음·미완료)에만 `graniteEvent` `backEvent`를 구독하고 `setLeaveGuard`를 등록해 둘 다 `ConfirmDialog`("학습을 그만할까요?" / "지금까지 판정한 카드는 저장됐어요." / "그만하기")를 열게 한다. 그만하기는 가드·구독 해제 후 `back()`, 취소는 다이얼로그만 닫는다. 완료·빈 큐에서는 해제한다. 검증: CDP로 브라우저 뒤로가기(`history.back()`)와 `__ait:backEvent` 각각 → 확인 표시·주소 study 유지, 취소 → 같은 카드 정답 상태 유지 후 판정 가능, 그만하기 → 덱 상세·판정 결과 유지, 이어서 뒤로가기 → 목록, 완료 화면에서 뒤로가기 → 확인 없이 덱 상세를 확인한다

## 5. 통합 확인

- [x] 5.1 `npx tsc -b`·`npm run lint`·`npm test -- --run`·`npm run build`가 통과하고, day2 CDP 스크립트 48항목과 day3-scheduler 브라우저 스크립트 24항목이 그대로 통과한다. 세션·완료 화면 캡처를 사용자에게 공유한다

## Workflow follow-up

- 리뷰 후 커밋·푸시하고 change를 archive한다.
- Day 6 실기기 체크리스트에 "세션 중 토스 내비게이션 바·Android 백버튼 → 그만하기 확인"을 넣는다.
- 다음 change는 Day 4(홈 오늘 큐·전체 덱 세션 `#/study`·연체·하루 상한 안내·날짜 규칙·통계)다.
