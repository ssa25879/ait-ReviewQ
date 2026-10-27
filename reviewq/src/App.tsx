import { useEffect, useRef } from "react";
import { useContent } from "./app/contentContext";
import { useRoute } from "./app/routeContext";
import { routeTargetExists } from "./app/router";
import { CardEditor } from "./screens/CardEditor/CardEditor";
import { DeckDetail } from "./screens/DeckDetail/DeckDetail";
import { Home } from "./screens/Home/Home";
import { StudySession } from "./screens/Study/StudySession";
import { SubjectList } from "./screens/SubjectList/SubjectList";
import s from "./screens/screen.module.css";

function App() {
  const { status, state } = useContent();
  const { route, replace } = useRoute();

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  // 경로가 바뀌거나 로드가 끝났을 때만 확인한다(상태는 ref로 읽는다). 편집 화면에서 카드를 지운 직후
  // (뒤로가기 처리 전)에는 대상이 잠깐 없어지는데, 이때 홈으로 바꾸면 히스토리가 꼬인다
  useEffect(() => {
    if (status === "ready" && !routeTargetExists(stateRef.current, route)) replace({ name: "home" });
  }, [status, route, replace]);

  if (status === "loading") return <p className={s.notice}>불러오는 중이에요</p>;
  if (status === "error") {
    // 손상 데이터를 덮어쓰지 않도록 편집 화면을 열지 않는다(복구는 Day 5)
    return (
      <p className={s.notice} role="alert">
        저장된 데이터를 불러오지 못했어요.
        <br />
        앱을 다시 열어도 같으면 문의해 주세요.
      </p>
    );
  }

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
    case "study":
      return <StudySession key={route.deckId} deckId={route.deckId} />;
    case "studyAll":
      return <StudySession key="all" />;
  }
}

export default App;
