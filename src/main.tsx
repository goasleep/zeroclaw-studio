import React from "react";
import ReactDOM from "react-dom/client";
import { AppQueryProvider } from "@/api/QueryProvider";
import { App } from "@/app/App";
import { AppI18nProvider } from "@/i18n/i18n";
import { TooltipProvider } from "@/ui/tooltip";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppI18nProvider>
      <AppQueryProvider>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </AppQueryProvider>
    </AppI18nProvider>
  </React.StrictMode>,
);
