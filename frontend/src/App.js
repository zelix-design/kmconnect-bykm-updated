import React from "react";
import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";

import AuthPage from "@/pages/AuthPage";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AppShell from "@/pages/AppShell";
import Dashboard from "@/pages/Dashboard";
import QuickEntry from "@/pages/QuickEntry";
import Transactions from "@/pages/Transactions";
import Accounts from "@/pages/Accounts";
import Invoices from "@/pages/Invoices";
import Clients from "@/pages/Clients";
import Categories from "@/pages/Categories";
import Settings from "@/pages/Settings";
import Students from "@/pages/Students";
import StudentDetail from "@/pages/StudentDetail";
import Agents from "@/pages/Agents";
import AgentDetail from "@/pages/AgentDetail";
import ClientDetail from "@/pages/ClientDetail";
import Users from "@/pages/Users";
import ExpenseRequests from "@/pages/ExpenseRequests";
import PublicApplication from "@/pages/PublicApplication";
import Colleges from "@/pages/Colleges";
import LinkedUserLedger from "@/pages/LinkedUserLedger";
import Messages from "@/pages/Messages";
import PermGate from "@/components/PermGate";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) {
    return (
      <div className="h-screen w-full flex items-center justify-center text-muted-foreground" data-testid="auth-loading">
        <div className="animate-pulse text-sm tracking-widest uppercase">Loading…</div>
      </div>
    );
  }
  if (user === false) return <Navigate to="/login" replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user } = useAuth();
  if (user === null) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

// Module-level constants so the `roles` prop on PermGate doesn't allocate a
// fresh array each render — keeps PermGate / its children stable.
const SUPER_ADMIN_ONLY = Object.freeze(["super_admin"]);
const USER_ONLY = Object.freeze(["user"]);

// Hostnames whose entire surface is just the public admission form. Comma-
// separated env var, e.g. "apply.kmfoundation.online,admissions.example.com".
// When window.location.hostname matches one of these we bypass auth + the
// main router and mount only <PublicApplication /> — regardless of path.
const PUBLIC_APPLY_HOSTS = (process.env.REACT_APP_PUBLIC_APPLY_HOSTS || "")
  .split(",")
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

function isPublicApplyHost() {
  if (typeof window === "undefined") return false;
  const host = (window.location.hostname || "").toLowerCase();
  return PUBLIC_APPLY_HOSTS.includes(host);
}

/** Standalone shell used when the app is being served from a public-apply
 * domain. No auth provider, no sidebar, no other routes — just the form,
 * regardless of pathname. Query strings (e.g. ?ref=…) still pass through.
 * (PublicApplication mounts its own <Toaster> so we don't add one here.) */
function PublicApplyOnly() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="*" element={<PublicApplication />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default function App() {
  if (isPublicApplyHost()) return <PublicApplyOnly />;
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/apply" element={<PublicApplication />} />
          <Route path="/login" element={<PublicOnly><AuthPage mode="login" /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><AuthPage mode="register" /></PublicOnly>} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<Protected><AppShell /></Protected>}>
            <Route path="/" element={<PermGate page="overview"><Dashboard /></PermGate>} />
            <Route path="/quick-entry" element={<PermGate page="quick_entry"><QuickEntry /></PermGate>} />
            <Route path="/transactions" element={<PermGate page="transactions"><Transactions /></PermGate>} />
            <Route path="/accounts" element={<PermGate page="accounts"><Accounts /></PermGate>} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/clients" element={<PermGate page="clients"><Clients /></PermGate>} />
            <Route path="/clients/:id" element={<PermGate page="clients"><ClientDetail /></PermGate>} />
            <Route path="/students" element={<PermGate page="students"><Students /></PermGate>} />
            <Route path="/students/:id" element={<PermGate page="students"><StudentDetail /></PermGate>} />
            <Route path="/colleges" element={<PermGate roles={SUPER_ADMIN_ONLY}><Colleges /></PermGate>} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/agents/detail" element={<AgentDetail />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/settings" element={<PermGate page="settings"><Settings /></PermGate>} />
            <Route path="/users" element={<PermGate roles={SUPER_ADMIN_ONLY}><Users /></PermGate>} />
            <Route path="/my-ledger" element={<PermGate roles={USER_ONLY}><LinkedUserLedger /></PermGate>} />
            <Route path="/messages" element={<Messages />} />
            <Route path="/messages/:id" element={<Messages />} />
            <Route path="/expense-requests" element={<PermGate page="expense_requests"><ExpenseRequests /></PermGate>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </ThemeProvider>
  );
}
