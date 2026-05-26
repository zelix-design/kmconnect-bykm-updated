import React from "react";
import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";
import { SpeedInsights } from "@vercel/speed-insights/react";

import AuthPage from "@/pages/AuthPage";
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

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          <Route path="/apply" element={<PublicApplication />} />
          <Route path="/login" element={<PublicOnly><AuthPage mode="login" /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><AuthPage mode="register" /></PublicOnly>} />
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
            <Route path="/colleges" element={<PermGate roles={["super_admin"]}><Colleges /></PermGate>} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/agents/detail" element={<AgentDetail />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/settings" element={<PermGate page="settings"><Settings /></PermGate>} />
            <Route path="/users" element={<PermGate roles={["super_admin"]}><Users /></PermGate>} />
            <Route path="/expense-requests" element={<PermGate page="expense_requests"><ExpenseRequests /></PermGate>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
        <SpeedInsights />
      </AuthProvider>
    </ThemeProvider>
  );
}
