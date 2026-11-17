import { Link, Navigate, Route, Routes } from "react-router";
import { PracticeProvider } from "./preview/PracticeContext";
import { usePreviewSettings } from "./preview/settings";
import { CanvasFinish } from "./screens/canvas/CanvasFinish";
import { CanvasHome } from "./screens/canvas/CanvasHome";
import { CanvasListen } from "./screens/canvas/CanvasListen";
import { CanvasQuiz } from "./screens/canvas/CanvasQuiz";
import { EntryScreen } from "./screens/EntryScreen";
import { JoinScreen } from "./screens/JoinScreen";
import { CompareScreen } from "./screens/CompareScreen";
import { DictionaryScreen } from "./screens/DictionaryScreen";
import { FinishScreen } from "./screens/FinishScreen";
import { QuizScreen } from "./screens/QuizScreen";
import { TeacherLockedScreen } from "./screens/TeacherScreens";
import { CompareLive } from "./screens/live/CompareLive";
import { CourseScreen } from "./screens/live/CourseScreen";
import { FinishLive } from "./screens/live/FinishLive";
import { QuizLive } from "./screens/live/QuizLive";
import { TeacherLive } from "./screens/live/TeacherLive";
import { VoicesScreen } from "./screens/live/VoicesScreen";
import { WordsLive } from "./screens/live/WordsLive";
import { ScreenTitle } from "./ui";

function MissingScreen() {
  return (
    <section className="panel stack">
      <ScreenTitle title="없는 화면" />
      <h2>이 주소는 준비되지 않았습니다.</h2>
      <p className="muted">처음 화면으로 돌아가 주세요.</p>
      <Link className="button primary" to="/">
        처음 화면으로
      </Link>
    </section>
  );
}

/**
 * 개발 미리보기(LEARN_SCREEN_PREVIEW)에서는 실제로 동작하는 연습·관찰 화면을 연다.
 * 학습자는 고정된 '미리보기 학습자'이며, 초대·기기 세션·교사 인증을 대신하지 않는다.
 * 미리보기가 꺼진 서버에서는 개발 1단계의 껍데기와 인증 전 안내만 보인다.
 */
function PreviewRoutes() {
  const { style, loaded } = usePreviewSettings();
  const canvas = style === "canvas";
  if (!loaded) return null;
  return (
    <PracticeProvider>
      <Routes>
        <Route path="/" element={canvas ? <CanvasHome /> : <Navigate to="/practice" replace />} />
        <Route path="/join" element={<JoinScreen />} />
        <Route path="/practice" element={canvas ? <CanvasQuiz /> : <QuizLive />} />
        <Route path="/listen" element={<CanvasListen />} />
        <Route path="/compare" element={<CompareLive />} />
        <Route path="/finish" element={canvas ? <CanvasFinish /> : <FinishLive />} />
        <Route path="/dictionary" element={<WordsLive />} />
        <Route path="/course" element={<CourseScreen />} />
        <Route path="/voices" element={<VoicesScreen />} />
        <Route path="/teach" element={<TeacherLive mode="list" />} />
        <Route path="/teach/detail" element={<TeacherLive mode="detail" />} />
        <Route path="*" element={<MissingScreen />} />
      </Routes>
    </PracticeProvider>
  );
}

export function LearnRoutes({ preview }: { preview: boolean }) {
  if (preview) return <PreviewRoutes />;
  return (
    <Routes>
      <Route path="/" element={<EntryScreen />} />
      <Route path="/join" element={<JoinScreen />} />
      <Route path="/practice" element={<QuizScreen />} />
      <Route path="/compare" element={<CompareScreen />} />
      <Route path="/finish" element={<FinishScreen />} />
      <Route path="/dictionary" element={<DictionaryScreen />} />
      <Route path="/teach" element={<TeacherLockedScreen />} />
      <Route path="/teach/detail" element={<TeacherLockedScreen />} />
      <Route path="*" element={<MissingScreen />} />
    </Routes>
  );
}
