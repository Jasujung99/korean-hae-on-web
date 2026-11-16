import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { LearnRoutes } from "./App";
import { useLearnRuntime } from "./runtime";
import { Shell } from "./shell";
import "./styles/tokens-adapter";

function LearnApp() {
  const runtime = useLearnRuntime();

  return (
    <BrowserRouter>
      <Shell runtime={runtime}>
        <LearnRoutes preview={runtime.screenPreview} />
      </Shell>
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
