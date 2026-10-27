# Design

## Context

- SDK(`@apps-in-toss/web-framework` 3.8.1) 타입 정의로 확인한 API:
  - 배너: `TossAds.initialize({ callbacks: { onInitialized, onInitializationFailed } })`, `TossAds.attachBanner(adGroupId, target, { theme, tone, variant, callbacks })` → `{ destroy }`. 각 함수에 `isSupported()`가 있다. 콜백은 `onAdRendered`·`onAdViewable`·`onAdClicked`·`onAdImpression`·`onAdFailedToRender`·`onNoFill`. 공식 문서상 토스 앱 5.241.0 미만에서는 배너 API를 쓸 수 없다.
  - 알림: `Notification.requestAgreement({ options: { templateCode }, onEvent, onError })` → 콜백 해제 함수. `onEvent`의 `type`은 `newAgreement`·`alreadyAgreed`·`agreementRejected`. 토스 앱 5.255.0 이상이고 `isSupported()`가 있다. `templateCode`는 콘솔 스마트발송 템플릿 코드로, 기획서 9.4에는 없던 필수 입력이다.
- devtools 모의(`@apps-in-toss/devtools`)에 `TossAds` 배너(렌더·No-fill·클릭)와 알림 동의 모의가 있다.
- `bq:meta` 쓰기는 지금 `TodayProvider`(`app/today.tsx`)의 `recordOpened`만 한다. 알림 동의 저장이 더해지면 쓰는 곳이 둘이 된다.
- 선행 change `day5-storage-recovery`가 `infra/storage/validate.ts`(Meta 형식 검증)와 재호출 가능한 `loadApp()`을 만든다.
- 운영 광고 그룹 ID는 저장소에 넣지 않는다(프로젝트 원칙). 루트 `.gitignore`가 `.env`·`.env.*`를 제외하고 `.env.example`만 허용한다.

## Goals / Non-Goals

**Goals:**
- 플래그 off 기본 빌드에서 광고·알림 코드 경로가 화면과 SDK 호출에 전혀 드러나지 않게 한다.
- Day 6 QR 테스트 빌드에서 환경 변수만 바꿔 테스트 ID로 켜 볼 수 있게 한다.

**Non-Goals:**
- 광고 수익 측정, 실 ID 노출 확인.
- 설정 화면(거부한 사용자의 재요청 경로).

## Decisions

1. **플래그와 ID는 `src/config/flags.ts` 한 곳에서 읽는다.**
   - `ADS_ENABLED = import.meta.env.VITE_ADS_ENABLED === 'true'`, `NOTIFICATION_ENABLED`도 같은 방식으로 정한다. 값이 없으면 false다.
   - 광고 그룹 ID: `VITE_AD_GROUP_ID_SUBJECTS`·`VITE_AD_GROUP_ID_SESSION_DONE`, 값이 없으면 `ait-ad-test-banner-id`. 알림 템플릿 코드 `VITE_NOTIFICATION_TEMPLATE_CODE`, 값이 없으면 알림 버튼을 숨긴다.
   - 운영 값은 제출용 빌드를 만들 때만 로컬 `.env.production.local`(커밋 제외)에 둔다. 저장소에는 키 이름만 적은 `.env.example`을 둔다.
   - 대안: 런타임 원격 설정 → 기각. 서버가 없고, 빌드 시 결정으로 충분하다(기획서 10.2 "빌드 환경에 따라 고른다").
2. **`components/AdSlot.tsx` 하나로 배너를 감싼다.**
   - `ADS_ENABLED`가 false이거나 `TossAds.attachBanner.isSupported()`가 false면 `null`을 반환한다(DOM 없음).
   - 초기화는 모듈 수준 `ensureAdsInitialized()` Promise로 앱 실행 중 1회만 한다. 초기화 실패 시 배너를 부착하지 않는다.
   - 마운트 때 컨테이너에 `attachBanner`, 언마운트 때 `destroy`를 호출한다. `onNoFill`·`onAdFailedToRender`를 받으면 상태를 바꿔 컨테이너를 그리지 않는다. 콜백은 개발 빌드에서 콘솔 로그만 남긴다(이벤트 변조 금지).
   - 컨테이너는 위아래 `--space-5`(24px) 여백을 둔다. 크기·색은 SDK에 맡기고 덮어쓰지 않는다.
   - 배치: `SubjectList`의 목록 끝(하단 여백 앞), `StudySession` 완료 화면의 요약·상한 안내 아래. 그 밖의 화면에는 넣지 않는다.
3. **Meta 쓰기는 `app/metaStore.ts`가 단독으로 맡는다.**
   - 현재 Meta를 들고, `updateMeta(fn)`이 변경을 직렬화해 순서대로 `bq:meta`에 저장한다. 앞선 저장이 끝난 최신 값에 다음 변경을 적용하므로 날짜 갱신과 동의 기록이 서로를 덮지 않는다.
   - `bootstrap`의 `loadApp()`이 로드한 Meta로 초기화하고, `TodayProvider`는 `recordOpened` 대신 `updateMeta`로 `lastOpenedDate`를 바꾼다.
   - 구독(`subscribe`)으로 알림 동의 기록 변화를 화면에 알린다.
   - 대안: Meta를 `ContentState`에 넣고 기존 저장 큐로 저장 → 기각. 콘텐츠 저장 큐는 콘텐츠 키 전용이고, Meta는 즉시 저장이 필요하다(day4 design 결정 3).
4. **Meta 버전 올림은 `infra/storage/meta.ts`의 `migrateMeta`.**
   - `MIGRATIONS: Record<number, (m) => m>`를 순서대로 적용하는 순수 함수이며, v1 → v2는 `schemaVersion`만 2로 바꾼다.
   - `loadApp()`이 형식 검증 뒤에 적용하고, 버전이 올랐으면 저장한다. `validate.ts`의 `isMeta`는 v1·v2와 선택 필드 `notification`을 허용하도록 넓힌다.
   - 새 Meta 생성(`initMeta`)은 `schemaVersion` 2로 만든다.
5. **알림 동의 UI는 `components/NotificationOptIn.tsx`.**
   - 노출 조건: `NOTIFICATION_ENABLED && templateCode && Notification.requestAgreement.isSupported() && meta.notification === undefined`.
   - 학습 완료 화면 본문의 요약 아래, 광고 영역보다 위에 텍스트형 보조 버튼으로 두고 광고와 24px 이상 띄운다.
   - 누르면 `requestAgreement`를 부르고, 받은 해제 함수는 결과를 받거나 언마운트될 때 호출한다. 요청 중에는 버튼을 비활성화한다.
   - `newAgreement`·`alreadyAgreed`는 `{ agreed: true, agreedAt, lastAskedAt }`로, `agreementRejected`는 `{ agreed: false, lastAskedAt }`로 `updateMeta`에 저장한다. 동의하면 "알림을 받을 수 있어요" 안내로 바꾼다(토스트 컴포넌트를 새로 만들지 않는다). `onError`면 기록 없이 실패 안내를 보여 준다.
6. **검증.**
   - 단위 테스트: `migrateMeta`, `metaStore` 직렬화(날짜 갱신과 동의 기록 동시 발생), `flags`의 기본값.
   - CDP: 기본 빌드(플래그 off)와 플래그 on 빌드(dev 서버를 `VITE_ADS_ENABLED=true`·`VITE_NOTIFICATION_ENABLED=true`·`VITE_NOTIFICATION_TEMPLATE_CODE=test`로 따로 실행)를 확인한다. devtools 모의 패널의 No-fill·지원 여부를 쓰고, SDK 호출 수는 모의 콘솔 로그나 함수 래핑으로 센다.

## Risks / Trade-offs

- [동의 창을 그냥 닫았을 때 어떤 결과가 오는지 모른다(기획서 9.4.8 [검증 필요])] → 결과가 오지 않으면 기록을 남기지 않아 다음 완료 화면에서 다시 보인다. Day 6 실기기에서 확인하고, 거부로 오면 그대로 거부 처리된다(N-04).
- [설정 화면이 없어 거부한 사용자가 다시 동의할 길이 없다] → 플래그를 켜는 v1.0 결정 게이트(Day 7) 전에 설정 화면 change에서 재요청 경로를 다루거나, 결정이 날 때까지 플래그를 off로 둔다.
- [제출용 빌드에 운영 ID를 넣지 않으면 테스트 ID로 배포된다] → 10.6 게이트 체크리스트에 "제출용 빌드의 광고 그룹 ID 확인"을 두고, 빌드 산출물에서 테스트 ID 문자열을 검색해 확인한다.
- [완료 화면에 알림 버튼·광고가 함께 놓여 오클릭 위험이 있다] → 순서(요약 → 알림 버튼 → 광고)와 24px 이상 간격을 지키고, 광고는 하단 고정 버튼과 겹치지 않게 본문 흐름에 둔다.

## Migration Plan

- 배포 후 첫 실행에서 v1 Meta가 v2로 올라간다. 되돌리면 이전 번들의 `initMeta`는 저장된 Meta를 그대로 읽고, `notification`·`schemaVersion` 2를 쓰지 않아 동작에 영향이 없다. 단, 이전 번들의 형식 검증(`day5-storage-recovery`가 포함된 경우)이 v2를 허용하는지 롤백 전에 확인한다.
