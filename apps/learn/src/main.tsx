import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { LearnRoutes } from "./App";
import { PreviewSettingsProvider } from "./preview/settings";
import { useLearnRuntime } from "./runtime";
import { Shell } from "./shell";
import "./styles/tokens-adapter";

function LearnApp() {
  const runtime = useLearnRuntime();

  return (
    <BrowserRouter>
      <PreviewSettingsProvider enabled={runtime.ready && runtime.screenPreview}>
      <Shell runtime={runtime}>
        {runtime.ready ? (
          <LearnRoutes preview={runtime.screenPreview} />
        ) : (
          <section className="panel stack">
            <p className="muted">화면을 준비하고 있어요…</p>
          </section>
        )}
      </Shell>
      </PreviewSettingsProvider>
    </BrowserRouter>
  );
}

const root = document.querySelector("#root");
if (!root) throw new Error("missing #root");

createRoot(root).render(
  <StrictMode>
    <LearnApp />
  </StrictMode>,
);
