import { useEffect, useState } from "react";
import AppTitleBar from "./components/AppTitleBar";
import { TitleBarProvider } from "./context/TitleBarContext";
import {
  HashRouter,
  Routes,
  Route,
  Navigate
} from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Employees from "./pages/Employees";
import Attendance from "./pages/Attendance";
import Users from "./pages/Users";
import Cameras from "./pages/Cameras";
import AuditLogs from "./pages/AuditLogs";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import SetupWizard from "./pages/setup/SetupWizard";
import ChangePassword from "./pages/ChangePassword";
import { ToastProvider } from "./components/Toast";
import { getSetupStatus } from "./api/setup";
import LoadingSpinner from "./components/LoadingSpinner";

function ProtectedRoute({
  children
}: {
  children: React.ReactNode;
}) {
  const token = localStorage.getItem("token");
  const mustChange = localStorage.getItem("must_change_password") === "true";

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  if (mustChange) {
    return <Navigate to="/change-password" replace />;
  }

  return children;
}

function ChangePasswordRoute({
  children
}: {
  children: React.ReactNode;
}) {
  const token = localStorage.getItem("token");
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

// Guard: redirect /setup → /login if setup already completed
function SetupGuard({ children }: { children: React.ReactNode }) {
  const [checking, setChecking] = useState(true);
  const [setupDone, setSetupDone] = useState(false);

  useEffect(() => {
    getSetupStatus()
      .then((res) => setSetupDone(res.setup_completed))
      .catch(() => setSetupDone(false))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="min-h-full flex items-center justify-center bg-zinc-950">
        <LoadingSpinner />
      </div>
    );
  }

  return setupDone ? <Navigate to="/login" replace /> : <>{children}</>;
}

// Root redirect: check setup status and route accordingly
function RootRedirect() {
  const [checking, setChecking] = useState(true);
  const [setupDone, setSetupDone] = useState(true);

  useEffect(() => {
    getSetupStatus()
      .then((res) => setSetupDone(res.setup_completed))
      .catch(() => setSetupDone(true)) // on error, assume setup done
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return (
      <div className="min-h-full flex items-center justify-center bg-zinc-950">
        <LoadingSpinner />
      </div>
    );
  }

  return setupDone
    ? <Navigate to="/dashboard" replace />
    : <Navigate to="/setup" replace />;
}

export default function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") || "dark";
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, []);

  return (
    <ToastProvider>
      <HashRouter>
        <TitleBarProvider>
          <div className="flex flex-col h-screen overflow-hidden">
            <AppTitleBar />
            <div className="flex-1 min-h-0 relative overflow-hidden bg-zinc-950">
              <Routes>
          {/* Setup Wizard — only accessible before setup is complete */}
          <Route
            path="/setup"
            element={
              <SetupGuard>
                <SetupWizard />
              </SetupGuard>
            }
          />

          <Route
            path="/login"
            element={<Login />}
          />

          <Route
            path="/change-password"
            element={
              <ChangePasswordRoute>
                <ChangePassword />
              </ChangePasswordRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/employees"
            element={
              <ProtectedRoute>
                <Employees />
              </ProtectedRoute>
            }
          />

          <Route
            path="/attendance"
            element={
              <ProtectedRoute>
                <Attendance />
              </ProtectedRoute>
            }
          />

          <Route
            path="/users"
            element={
              <ProtectedRoute>
                <Users />
              </ProtectedRoute>
            }
          />

          <Route
            path="/cameras"
            element={
              <ProtectedRoute>
                <Cameras />
              </ProtectedRoute>
            }
          />

          <Route
            path="/audit-logs"
            element={
              <ProtectedRoute>
                <AuditLogs />
              </ProtectedRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />

          {/* Root: check setup status to decide where to go */}
          <Route
            path="/"
            element={<RootRedirect />}
          />

          <Route
            path="*"
            element={<NotFound />}
          />
              </Routes>
            </div>
          </div>
        </TitleBarProvider>
      </HashRouter>
    </ToastProvider>
  );
}