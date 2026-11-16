import { Link, Route, Routes } from "react-router";
import { EntryScreen } from "./screens/EntryScreen";
import { JoinScreen } from "./screens/JoinScreen";
import { CompareScreen } from "./screens/CompareScreen";
import { DictionaryScreen } from "./screens/DictionaryScreen";
import { FinishScreen } from "./screens/FinishScreen";
import { QuizScreen } from "./screens/QuizScreen";
import { TeacherLayout, TeacherLockedScreen } from "./screens/TeacherScreens";
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

export function LearnRoutes({ preview }: { preview: boolean }) {
  return (
    <Routes>
      <Route path="/" element={<EntryScreen />} />
      <Route path="/join" element={<JoinScreen />} />
      <Route path="/practice" element={<QuizScreen />} />
      <Route path="/compare" element={<CompareScreen />} />
      <Route path="/finish" element={<FinishScreen />} />
      <Route path="/dictionary" element={<DictionaryScreen />} />
      <Route path="/teach" element={preview ? <TeacherLayout mode="list" /> : <TeacherLockedScreen />} />
      <Route path="/teach/detail" element={preview ? <TeacherLayout mode="detail" /> : <TeacherLockedScreen />} />
      <Route path="*" element={<MissingScreen />} />
    </Routes>
  );
}
