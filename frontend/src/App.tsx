import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";

const LandingPage = lazy(() => import("./pages/LandingPage").then((m) => ({ default: m.LandingPage })));
const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const GamePage = lazy(() => import("./pages/GamePage").then((m) => ({ default: m.GamePage })));
const FinishPage = lazy(() => import("./pages/FinishPage").then((m) => ({ default: m.FinishPage })));
const AdminPage = lazy(() => import("./pages/AdminPage").then((m) => ({ default: m.AdminPage })));
const WinnerDisplayPage = lazy(() => import("./pages/WinnerDisplayPage").then((m) => ({ default: m.WinnerDisplayPage })));
const SpectatorPage = lazy(() => import("./pages/SpectatorPage").then((m) => ({ default: m.SpectatorPage })));

export default function App() {
  return (
    <Suspense fallback={<main className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4 text-sm text-slate-300">Loading control interface...</main>}>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/game"
          element={
            <ProtectedRoute allowedRole="team">
              <GamePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/finish"
          element={
            <ProtectedRoute allowedRole="team">
              <FinishPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRole="admin">
              <AdminPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/display"
          element={<WinnerDisplayPage />}
        />
        <Route path="/spectator" element={<SpectatorPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
