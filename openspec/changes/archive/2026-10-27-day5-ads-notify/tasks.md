# Tasks

모든 경로는 `reviewq/` 기준이다. 선행 change `day5-storage-recovery`를 아카이브한 뒤 진행한다. 화면 동작 검증은 scratchpad의 CDP 스크립트(헤드리스 Edge, PowerShell에서 node 실행, 출력 폴더는 절대 경로)로 한다. 플래그 on 확인은 별도 포트의 dev 서버를 환경 변수와 함께 띄워 한다. 운영 광고 그룹 ID·템플릿 코드는 저장소에 쓰지 않는다.

## 1. 플래그와 Meta

- [x] 1.1 `src/config/flags.ts`와 `.env.example`(키 이름과 빈 값만)을 만든다(design 결정 1). 검증: `flags.test.ts`로 환경 변수가 없을 때 두 플래그 false·광고 ID가 테스트 ID·템플릿 코드 없음을, `'true'`일 때만 켜짐을 확인한다
- [x] 1.2 `Meta`에 `notification?: NotificationConsent`를 더하고, `migrateMeta`(v1 → v2)를 만들고 `initMeta`가 v2로 만들게 한다. `validate.ts`의 `isMeta`가 v1·v2를 허용하게 넓히고 `loadApp()`에서 버전 올림을 적용·저장한다(design 결정 4). 검증: 단위 테스트로 data-storage "v1 Meta 올림"·"빈 저장소에서 시작"(v2, notification 없음), 잘못된 `notification` 형식은 손상으로 판정, 다른 키 쓰기 0회를 확인한다
- [x] 1.3 `src/app/metaStore.ts`(`getMeta`·`updateMeta`·`subscribe`)를 만들고 `TodayProvider`의 `lastOpenedDate` 저장을 `updateMeta`로 바꾼다(design 결정 3). 검증: 단위 테스트로 날짜 갱신과 동의 기록을 동시에 요청해도 두 값이 모두 저장됨(data-storage "동의 기록 후 날짜 갱신"), 저장 순서 직렬화, 저장 실패 시 메모리 값 유지를 확인하고, 기존 `home.mjs` CDP(66항목)가 그대로 통과한다

## 2. 배너 광고

- [x] 2.1 `src/components/AdSlot.tsx`(+CSS 모듈)를 만들고 `SubjectList` 목록 끝과 학습 완료 화면 요약 아래에 둔다(design 결정 2). 검증: CDP 기본 빌드로 두 화면에 광고 컨테이너가 없고 `TossAds` 호출 0회, 플래그 on 빌드로 두 화면 각 1개·광고 그룹 ID가 테스트 ID·하단 고정 버튼과 겹침 없음·위아래 24px 이상, 홈·학습 판정 화면·카드 편집·통계·복구 화면에 광고 없음, 모의 No-fill → 컨테이너 사라짐, 지원 false → 컨테이너 없음, 목록 → 덱 상세 → 목록 왕복 시 initialize 1회·destroy 1회·attachBanner 2회, 광고가 있는 화면에서 뒤로가기 정상, 글자 13px·터치 44px 이상을 확인한다

## 3. 복습 알림 동의

- [x] 3.1 `src/components/NotificationOptIn.tsx`를 만들어 학습 완료 화면 요약 아래(광고 위)에 두고 문구는 `screens/messages.ts`의 `NOTIFY`에 둔다(design 결정 5). 검증: CDP 기본 빌드로 완료 화면에 버튼 없음(N-08), 플래그 on 빌드로 버튼 표시, 지원 false → 버튼 없음(N-01), 동의 → `bq:meta.notification.agreed` true·`agreedAt` 있음·동의 안내(N-02), 거부 → false·`lastAskedAt` 있음·다음 세션 완료 화면에 버튼 없음(N-03), 요청 오류 → 기록 없음·버튼 유지, 거부 후 학습·판정 저장 정상(N-05), 앱 진입 직후 요청 0회(N-07), 버튼과 광고 간격 24px 이상을 확인한다

## 4. 통합 확인

- [x] 4.1 `npx tsc -b`·`npm run lint`·`npm test -- --run`·`npm run build`가 통과하고, 기존 CDP 스크립트(crud·review·study·home·stats·recovery)가 기본 빌드에서 그대로 통과한다. 새 CDP 스크립트 `ads-notify.mjs`를 `handoff/e2e/`에 둔다. 기본 빌드 산출물(`dist/`)에 운영 ID가 없음을 검색으로 확인한다. 플래그 on 상태의 과목·덱 목록·학습 완료 화면 캡처를 사용자에게 공유한다

## Workflow follow-up

- 리뷰 후 커밋·푸시하고 change를 archive한다.
- Day 6: 콘솔 QR 테스트 빌드(플래그 on, 테스트 ID)로 기획서 10.7 광고 체크리스트와 12.4 알림 테스트를 실기기에서 기록한다.
- Day 7 결정 게이트(10.6) 전에 설정 화면과 알림 재요청 경로를 다룰지 결정한다.
