import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { App } from "./App";
import { APP_NAME, isConfigured } from "./lib/supabase";

document.title = APP_NAME;

function MissingConfig() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-line bg-surface p-6 text-sm text-ink-muted">
        <h1 className="mb-2 font-serif text-xl text-ink">Supabase isn't configured</h1>
        Set <code>SUPABASE_URL</code> and <code>PUBLIC_KEY</code> in <code>.env</code> (see <code>.env.example</code>) and
        restart the dev server.
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isConfigured ? <App /> : <MissingConfig />}</StrictMode>,
);
