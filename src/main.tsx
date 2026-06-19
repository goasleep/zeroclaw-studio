import React from "react";
import ReactDOM from "react-dom/client";
import { AppQueryProvider } from "@/api/QueryProvider";
import { App } from "@/app/App";
import { TooltipProvider } from "@/ui/tooltip";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppQueryProvider>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </AppQueryProvider>
  </React.StrictMode>,
);
