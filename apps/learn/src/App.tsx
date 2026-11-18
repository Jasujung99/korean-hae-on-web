import type { ReactNode } from "react";
import { Link, Navigate, Route, Routes } from "react-router";
import { PracticeProvider } from "./preview/PracticeContext";
import { useLearner } from "./preview/settings";
import { CanvasFinish } from "./screens/canvas/CanvasFinish";
import { CanvasHome } from "./screens/canvas/CanvasHome";
import { CanvasListen } from "./screens/canvas/CanvasListen";
import { CanvasQuiz } from "./screens/canvas/CanvasQuiz";
import { CanvasWords } from "./screens/canvas/CanvasWords";
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
import { JoinLive, NotConnected } from "./screens/live/JoinLive";
import { QuizLive } from "./screens/live/QuizLive";
import { SettingsScreen } from "./screens/live/SettingsScreen";
import { TeacherGate, TeacherHome, TeacherBar } from "./screens/live/TeacherHome";
import { TeacherDetail } from "./screens/live/TeacherObserve";
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

/** 학습자 화면: 개인 초대로 연결된 기기에서만 연다. */
function Learner({ children }: { children: ReactNode }) {
  const learner = useLearner();
  if (learner.status === "loading") {
    return (
      <section className="panel stack">
        <p className="muted">연습을 여는 중이에요…</p>
      </section>
    );
  }
  if (learner.status === "error") {
    return (
      <section className="panel stack acct-narrow">
        <h2>연습을 열지 못했어요.</h2>
        <p className="muted">인터넷 연결을 확인하고 다시 시도해 주세요.</p>
        <button type="button" onClick={learner.reload}>
          다시 시도
        </button>
      </section>
    );
  }
  if (learner.status !== "connected") return <NotConnected />;
  return <>{children}</>;
}

function TeacherOnly({ children }: { children: ReactNode }) {
  return (
    <div className="tc-page">
      <TeacherGate>
        {(view) => (
          <>
            <TeacherBar name={view.teacher.displayName} />
            {children}
          </>
        )}
      </TeacherGate>
    </div>
  );
}

/**
 * 계정 DB가 연결된 서버: 학습자는 개인 초대로 연결한 기기에서, 교사는 로그인한 뒤에 각자의 화면을 연다.
 * 학습자 화면 모양(시안·캔버스)은 학습자 설정을 따른다.
 */
function LiveRoutes() {
  const { style } = useLearner();
  const canvas = style === "canvas";
  return (
    <PracticeProvider>
      <Routes>
        <Route path="/" element={<Learner>{canvas ? <CanvasHome /> : <Navigate to="/practice" replace />}</Learner>} />
        <Route path="/join" element={<JoinLive />} />
        <Route path="/practice" element={<Learner>{canvas ? <CanvasQuiz /> : <QuizLive />}</Learner>} />
        <Route path="/listen" element={<Learner><CanvasListen /></Learner>} />
        <Route path="/compare" element={<Learner><CompareLive /></Learner>} />
        <Route path="/finish" element={<Learner>{canvas ? <CanvasFinish /> : <FinishLive />}</Learner>} />
        <Route path="/dictionary" element={<Learner>{canvas ? <CanvasWords /> : <WordsLive />}</Learner>} />
        <Route path="/course" element={<Learner><CourseScreen /></Learner>} />
        <Route path="/settings" element={<Learner><SettingsScreen /></Learner>} />
        <Route path="/teach" element={<TeacherHome />} />
        <Route path="/teach/detail" element={<TeacherOnly><TeacherDetail /></TeacherOnly>} />
        <Route path="/teach/voices" element={<TeacherOnly><VoicesScreen /></TeacherOnly>} />
        <Route path="*" element={<MissingScreen />} />
      </Routes>
    </PracticeProvider>
  );
}

export function LearnRoutes({ live }: { live: boolean }) {
  if (live) return <LiveRoutes />;
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
