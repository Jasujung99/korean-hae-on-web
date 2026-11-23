import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { CourseView } from "../../../server/preview/contract.ts";
import { previewApi } from "../../preview/api";
import { LearnerFrame, Pill, ScreenTitle } from "../../ui";

export function CourseScreen() {
  const [course, setCourse] = useState<CourseView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    previewApi
      .course()
      .then(setCourse)
      .catch(() => setFailed(true));
  }, []);

  return (
    <LearnerFrame preview>
      <ScreenTitle title="학습 순서" />
      <section className="panel stack" aria-labelledby="course-title">
        <div>
          <h2 id="course-title">학습 순서</h2>
          <p className="muted">다섯 묶음을 이 순서로 만나요. 지금은 첫 묶음만 연습할 수 있어요.</p>
        </div>
        {failed ? <p className="notice">순서를 불러오지 못했어요.</p> : null}
        {!course && !failed ? <p className="muted">불러오고 있어요…</p> : null}
        {course ? (
          <ol className="course-list">
            {course.groups.map((group) => (
              <li key={group.id} className={group.status === "practice" ? "is-now" : undefined}>
                <div className="course-head">
                  <span className="course-num">{String(group.order).padStart(2, "0")}</span>
                  <div>
                    <h3>{group.label}</h3>
                    <p className="small">{group.category}</p>
                  </div>
                  {group.status === "practice" ? (
                    <Link className="button primary course-go" to="/practice">
                      연습하기
                    </Link>
                  ) : (
                    <Pill tone="future">준비 중</Pill>
                  )}
                </div>
                <p className="course-pseudo">
                  <span className="small">소리 익히기</span> {group.pseudowords.join(" · ")}
                </p>
                <details>
                  <summary>단계별 낱말 보기</summary>
                  <ul className="course-stages">
                    {group.stages.map((stage) => (
                      <li key={stage.stage}>
                        <strong>{stage.stage.replace(/^Stage\s*/, "")}단계</strong>
                        <span>{stage.title}</span>
                        <small>
                          {stage.count}개 · {stage.samples.join(", ")}
                        </small>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ol>
        ) : null}
      </section>
    </LearnerFrame>
  );
}
