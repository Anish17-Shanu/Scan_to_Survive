import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";

const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const isLowPowerDevice =
  ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 4 ||
  (navigator.hardwareConcurrency ?? 8) <= 4;

if (prefersReducedMotion || isLowPowerDevice) {
  document.documentElement.classList.add("perf-lite");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HashRouter>
        <App />
      </HashRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
