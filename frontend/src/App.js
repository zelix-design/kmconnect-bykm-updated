import React from "react";
import "@/index.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";

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
import Users from "@/pages/Users";
import ExpenseRequests from "@/pages/ExpenseRequests";

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
          <Route path="/login" element={<PublicOnly><AuthPage mode="login" /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><AuthPage mode="register" /></PublicOnly>} />
          <Route element={<Protected><AppShell /></Protected>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/quick-entry" element={<QuickEntry />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/invoices" element={<Invoices />} />
            <Route path="/clients" element={<Clients />} />
            <Route path="/students" element={<Students />} />
            <Route path="/students/:id" element={<StudentDetail />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/agents/detail" element={<AgentDetail />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/users" element={<Users />} />
            <Route path="/expense-requests" element={<ExpenseRequests />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </ThemeProvider>
  );
}
