import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { SetupWizardPage } from "./pages/SetupWizardPage";
import "./index.css";

const queryClient = new QueryClient();
const isWizard = new URLSearchParams(window.location.search).get("wizard") === "1";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {isWizard ? (
      <SetupWizardPage />
    ) : (
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    )}
  </StrictMode>,
);
