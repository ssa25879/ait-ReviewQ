import { useEffect, useRef } from "react";
import { useContent } from "./app/contentContext";
import { useRoute } from "./app/routeContext";
import { type Route, routeTargetExists } from "./app/router";
import { SaveErrorNotice } from "./components/SaveErrorNotice";
import { CardBulk } from "./screens/CardBulk/CardBulk";
import { CardEditor } from "./screens/CardEditor/CardEditor";
import { DeckDetail } from "./screens/DeckDetail/DeckDetail";
import { Guide } from "./screens/Guide/Guide";
import { Home } from "./screens/Home/Home";
import { LoadFailed, Recovery } from "./screens/Recovery/Recovery";
import { Settings } from "./screens/Settings/Settings";
import { Stats } from "./screens/Stats/Stats";
import { StudySession } from "./screens/Study/StudySession";
import { SubjectList } from "./screens/SubjectList/SubjectList";
import s from "./screens/screen.module.css";

function App() {
  const { status, state, guideSeen } = useContent();
  const { route, replace, navigate } = useRoute();

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // 경로가 바뀌거나 로드가 끝났을 때만 확인한다(상태는 ref로 읽는다). 편집 화면에서 카드를 지운 직후
  // (뒤로가기 처리 전)에는 대상이 잠깐 없어지는데, 이때 홈으로 바꾸면 히스토리가 꼬인다
  useEffect(() => {
    if (status === "ready" && !routeTargetExists(stateRef.current, route)) replace({ name: "home" });
  }, [status, route, replace]);

  // 최초 실행 가이드는 앱 시작 후 첫 ready 때 한 번만 판단한다. 가이드에서 뒤로가기로 홈에 오거나
  // 전체 삭제 뒤 다시 불러와도 같은 실행 중에는 다시 열지 않는다
  const guideCheckedRef = useRef(false);
  useEffect(() => {
    if (status !== "ready" || guideCheckedRef.current) return;
    guideCheckedRef.current = true;
    const hasCards = Object.values(stateRef.current.cards).some((cards) => cards.length > 0);
    // 홈 위에 쌓아야 가이드를 끝내거나 뒤로가기를 했을 때 홈으로 돌아온다(replace면 앱을 벗어난다)
    if (!guideSeen && !hasCards && route.name === "home") navigate({ name: "guide" });
  }, [status, guideSeen, route, navigate]);

  if (status === "loading") return <p className={s.notice}>불러오는 중이에요</p>;
  // 손상 데이터를 덮어쓰지 않도록 편집 화면 대신 복구·다시 시도 화면을 연다
  if (status === "corrupt") return <Recovery />;
  if (status === "readFailed") return <LoadFailed />;

  return (
    <>
      <SaveErrorNotice />
      <Screen route={route} />
    </>
  );
}

// 경로에 맞는 화면
function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case "home":
      return <Home />;
    case "subjects":
      return <SubjectList />;
    case "deck":
      return <DeckDetail deckId={route.deckId} />;
    case "cardNew":
      return <CardEditor deckId={route.deckId} />;
    case "cardEdit":
      return <CardEditor deckId={route.deckId} cardId={route.cardId} />;
    case "cardBulk":
      return <CardBulk deckId={route.deckId} />;
    case "study":
      return <StudySession key={route.deckId} deckId={route.deckId} />;
    case "studyAll":
      return <StudySession key="all" />;
    case "stats":
      return <Stats />;
    case "settings":
      return <Settings />;
    case "guide":
      return <Guide />;
  }
}

export default App;
