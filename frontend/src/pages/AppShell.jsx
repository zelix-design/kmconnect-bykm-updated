import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  ChartLineUp, House, Receipt, Wallet, FileText, UsersThree, Tag, Gear, SignOut,
} from "@phosphor-icons/react";

const navItems = [
  { to: "/", label: "Overview", icon: House, end: true, tid: "nav-overview" },
  { to: "/transactions", label: "Transactions", icon: Receipt, tid: "nav-transactions" },
  { to: "/accounts", label: "Accounts", icon: Wallet, tid: "nav-accounts" },
  { to: "/invoices", label: "Invoices", icon: FileText, tid: "nav-invoices" },
  { to: "/clients", label: "Clients", icon: UsersThree, tid: "nav-clients" },
  { to: "/categories", label: "Categories", icon: Tag, tid: "nav-categories" },
  { to: "/settings", label: "Settings", icon: Gear, tid: "nav-settings" },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  const handleLogout = async () => {
    await logout();
    nav("/login");
  };

  return (
    <div className="min-h-screen w-full bg-stone-50 text-stone-900 flex">
      {/* Sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-stone-200 bg-white">
        <div className="px-6 py-6 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-stone-900 flex items-center justify-center">
            <ChartLineUp size={18} weight="bold" className="text-emerald-400" />
          </div>
          <span className="font-display text-lg tracking-tight">FinFlow</span>
        </div>

        <nav className="px-3 flex-1 space-y-0.5">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={item.tid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm lift ${
                  isActive
                    ? "bg-stone-900 text-stone-50"
                    : "text-stone-700 hover:bg-stone-100 hover:text-stone-900"
                }`
              }
            >
              <item.icon size={18} weight="regular" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-stone-200 p-3">
          <div className="px-3 py-2">
            <p className="text-xs text-stone-500 truncate">{user?.business_name || "Workspace"}</p>
            <p className="text-sm font-medium truncate" data-testid="user-name">{user?.name}</p>
            <p className="text-xs text-stone-500 truncate" data-testid="user-email">{user?.email}</p>
          </div>
          <button
            onClick={handleLogout}
            data-testid="logout-btn"
            className="w-full mt-1 flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-stone-700 hover:bg-stone-100 lift"
          >
            <SignOut size={18} /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile topbar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-white border-b border-stone-200 px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-stone-900 flex items-center justify-center">
            <ChartLineUp size={16} weight="bold" className="text-emerald-400" />
          </div>
          <span className="font-display text-base">FinFlow</span>
        </div>
        <button onClick={handleLogout} data-testid="logout-btn-mobile" className="text-sm text-stone-600">Sign out</button>
      </div>

      {/* Main */}
      <main className="flex-1 min-w-0 pt-14 md:pt-0">
        <div className="px-5 sm:px-8 lg:px-12 py-8 max-w-[1400px] mx-auto">
          <Outlet />
        </div>
        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-stone-200 grid grid-cols-5">
          {navItems.slice(0, 5).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={`${item.tid}-mobile`}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center py-2 text-[10px] ${isActive ? "text-stone-900" : "text-stone-500"}`
              }
            >
              <item.icon size={20} weight="regular" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </main>
    </div>
  );
}
