# Design

## Context

- 프로젝트는 `reviewq/`(create-ait-app `react-ts`, `@apps-in-toss/web-framework` 3.8.1, devtools 배선 완료)다. 아직 앱 코드는 스타터 화면뿐이고, `src/domain`·`src/infra`·`src/utils`는 없다. 테스트 러너도 없다.
- SDK 타입 정의(`web-framework/dist/index.d.ts`)에서 확인한 사실:
  - `Storage.getItems(keys)`의 반환 형태는 `{ [key: string]: string | null }`이다. 기획서 7.8의 [검증 필요] 항목은 어댑터 인터페이스 형태와 그대로 맞는 것으로 해소된다.
  - `getItems`·`setItems`는 토스 앱 Android·iOS 5.270.0 이상에서만 지원되고, 각각 `isSupported()`를 가진다. `getItem`·`setItem`·`removeItem`·`clearItems`에는 버전 조건이 없다.
- devtools mock(`@apps-in-toss/devtools/dist/mock/3x.js`)에서 확인한 사실:
  - `Storage`는 브라우저 localStorage에 `__ait_storage:` 접두사로 저장하므로 새로고침 후에도 유지된다. `getItems`·`setItems`도 `isSupported`와 함께 mock되어 있다.
  - 쓰기 실패 시 `Error("UNKNOWN_ERROR")`를 throw한다. 실기기에서 `setItem` 등은 `undefined`가 아니라 `null`로 resolve된다는 실측 메모가 있다.

## Goals / Non-Goals

**Goals:**
- 이후 변경(CRUD·스케줄러·저장 큐)이 그대로 import해 쓸 타입과 저장소 경계를 고정한다.
- devtools 브라우저와 실기기에서 같은 코드 경로로 저장한다.

**Non-Goals:**
- 디바운스·flush·재시도, 형식 검증·마이그레이션·백업 복구, 기기 시계 역행 처리(`lastOpenedDate` 갱신 규칙 포함). 이번 변경에서 Meta는 생성과 로드만 한다.

## Decisions

1. **브라우저용 localStorage 어댑터를 만들지 않는다.** 기획서 7.8은 devtools 환경용 localStorage 대체 어댑터를 가정했다. 그러나 devtools mock이 이미 SDK `Storage`를 localStorage로 구현한다. 어댑터를 따로 두면 dev와 실기기 경로가 갈라져, dev에서 통과한 동작이 실기기에서 다를 수 있다. 실행 환경에서는 SDK 어댑터 하나만 쓴다.
   - 대안: 환경별 어댑터 선택 → 기각(경로 분기, mock과 중복).
2. **단위 테스트용 메모리 어댑터를 둔다.** Node 테스트 환경에서는 SDK 브리지가 없다. `Map` 기반 어댑터로 어댑터 계약과 Meta 초기화를 검증한다. SDK 어댑터는 `Storage`를 주입받는 형태로 만든다. 그래야 가짜 `Storage` 객체로 `isSupported` 분기(일괄 API 지원·미지원)를 테스트할 수 있다.
3. **일괄 API 미지원 시 단건 API로 대체한다.** `getItems.isSupported()`가 false면 `Promise.all`로 키별 `getItem`을 호출한다. `setItems`도 같다. 브릿지 과도 호출 금지 정책은 Day 2 저장 큐의 디바운스로 다룬다. 이번 변경의 호출 지점은 앱 시작 시 1회뿐이다.
4. **`CardSchedule` 정의는 한 곳에만 둔다.** 기획서는 `model.ts`(7.1)와 `scheduler/types.ts`(6.5)에 같은 타입을 중복 정의했다. `scheduler/types.ts`를 원본으로 두고 `model.ts`는 import해서 쓴다. 스케줄러가 교체 가능한 단위라 일정 타입의 주인이기 때문이다.
5. **Meta 초기화는 저장소 어댑터·오늘 날짜·id 생성기를 인자로 받는 함수로 만든다.** 날짜와 id를 주입할 수 있어야 테스트가 결정적이다. 저장된 Meta가 JSON 파싱에 실패하면 덮어쓰지 않고 오류를 던진다. 기획서 7.5의 "검증 실패 시 자동으로 덮어쓰지 않는다" 원칙을 지키기 위해서다. 복구 UI는 Day 5에서 다룬다.
6. **앱 시작 시 `App`에서 Meta 초기화를 1회 호출한다.** StrictMode의 개발 모드 이중 effect 실행을 고려해 모듈 수준 Promise로 1회만 실행한다. 개발 모드(`import.meta.env.DEV`)에서만 결과를 `console.info`로 남긴다. 화면은 바꾸지 않는다.
7. **테스트 러너는 Vitest를 쓴다(기획서 8.1).** 설정 파일은 따로 만들지 않고 기존 `vite.config.ts`를 공유한다. devtools unplugin이 테스트 환경에 영향을 주면 그때 `vitest.config.ts`로 분리한다.

## Risks / Trade-offs

- [devtools mock이 일괄 API 지원을 true로 보고하면 dev에서는 단건 대체 경로가 실행되지 않는다] → 가짜 `Storage` 단위 테스트로 대체 경로를 검증한다.
- [실기기에서 `crypto.randomUUID` 지원 여부 미확인(기획서 [검증 필요])] → 대체 생성기를 두고, 실기기 확인은 Day 6 체크리스트에 남긴다.
- [Vitest가 devtools unplugin과 충돌할 가능성] → 결정 7의 분리 방안으로 대응한다.
- [실기기에서 Storage 쓰기가 `null`로 resolve됨] → 반환값을 쓰지 않으므로 영향이 없다.

## Open Questions

- 실기기 Storage의 용량 한도와 실패 시 오류 형태(기획서 7.6). Day 6 실기기 검증에서 측정하고 이번 설계는 바꾸지 않는다.
