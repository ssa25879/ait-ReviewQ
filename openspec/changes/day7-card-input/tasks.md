# Tasks

모든 경로는 `reviewq/` 기준이다. 선행 change `day7-backup-import`를 구현한 뒤 진행한다. 화면 동작 검증은 CDP 스크립트(헤드리스 Edge, PowerShell에서 node 실행, 출력 폴더는 절대 경로)로 하고, 데모 플래그 확인은 별도 포트 dev 서버를 `VITE_DEMO_DATA=true`로 띄워 한다.

## 1. 여러 장 한 번에 추가

- [x] 1.1 `domain/bulkCards.ts`에 `parseBulkCards`를 만든다(design 결정 1). 검증: 단위 테스트로 세 구분자와 우선순위(탭 > " / " > "|"), 정답 안 구분자 유지, 빈 줄·`\r\n`, 오류 이유 4종, 500자 경계, 200줄 경계를 확인한다
- [x] 1.2 경로 `cardBulk`와 `screens/CardBulk`를 만들고 덱 상세에 진입 버튼을 둔다(design 결정 2). 검증: `router.test.ts` 케이스 추가, CDP로 진입·뒤로가기·직접 열기, 미리 보기 수·오류 줄 표시, 모두 올바름 → 덱 상세 복귀·카드 증가·오늘 복습, 오류 섞임 → 오류 줄만 남김·안내, 연타 1회, 201줄 → 버튼 비활성, 글자 13px·터치 44px

## 2. 예시 덱

- [x] 2.1 `domain/sampleDeck.ts`와 홈 첫 사용 안내의 "예시 카드로 둘러보기"를 만든다(design 결정 3). 검증: CDP로 생성 후 "예시" 과목·덱 10장·홈 오늘 복습 10장·학습 시작 버튼, 카드가 있으면 버튼 없음, 연타 시 과목 1개, 기존 `home.mjs`가 첫 사용 기대를 고친 뒤 통과(바꾼 줄은 보고에 적기)

## 3. 데모 데이터(테스트 빌드 전용)

- [x] 3.1 `dev/demoData.ts`·`screens/Settings/DemoSection.tsx`, `.env.example`을 만든다(design 결정 4). 검증: 단위 테스트로 `buildDemoDoc` 형식 검증 통과·과목 3 이상·오늘 복습·미래 복습일·최근 7일 기록, CDP로 기본 빌드에 버튼 없음, 플래그 빌드에서 채우기 → 홈 과목 3 이상·통계 최근 7일 기록, 취소 → 무변경, 기본 빌드 `dist/`에 데모 전용 문자열 0건

## 4. 통합 확인

- [x] 4.1 `npx tsc -b`·lint·`npm test -- --run`·`npm run build`가 통과하고, 새 CDP 스크립트 `handoff/e2e/card-input.mjs`를 두어 통과시킨다. 기존 CDP 스크립트(crud·review·study·home·stats·recovery·ads-notify·settings·import)가 그대로 통과한다
