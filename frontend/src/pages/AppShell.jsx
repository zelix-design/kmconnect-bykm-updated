import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import {
  House, Receipt, Wallet, FileText, UsersThree, Tag, Gear, SignOut, PlusCircle,
  Student, Notebook, Sun, Moon, List as ListIcon, MagnifyingGlass, Bell,
} from "@phosphor-icons/react";

const navItems = [
  { to: "/", label: "Overview", icon: House, end: true, tid: "nav-overview" },
  { to: "/quick-entry", label: "Quick entry", icon: PlusCircle, tid: "nav-quick-entry" },
  { to: "/transactions", label: "Transactions", icon: Receipt, tid: "nav-transactions" },
  { to: "/accounts", label: "Accounts", icon: Wallet, tid: "nav-accounts" },
  { to: "/invoices", label: "Invoices", icon: FileText, tid: "nav-invoices" },
  { to: "/clients", label: "Clients", icon: UsersThree, tid: "nav-clients" },
  { to: "/students", label: "Students", icon: Student, tid: "nav-students" },
  { to: "/agents", label: "Ledger", icon: Notebook, tid: "nav-ledger" },
  { to: "/categories", label: "Categories", icon: Tag, tid: "nav-categories" },
  { to: "/settings", label: "Settings", icon: Gear, tid: "nav-settings" },
];

const PAGE_TITLES = {
  "/": "Overview",
  "/quick-entry": "Quick entry",
  "/transactions": "Transactions",
  "/accounts": "Accounts",
  "/invoices": "Invoices",
  "/clients": "Clients",
  "/students": "Students",
  "/agents": "Sub-agent Ledger",
  "/categories": "Categories",
  "/settings": "Settings",
};

function initialsOf(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
}

function SidebarContent({ onItemClick }) {
  return (
    <>
      {/* Brand */}
      <div className="px-6 py-5 flex items-center gap-3 border-b border-[hsl(var(--sidebar-border))]">
        <div className="w-11 h-11 rounded-xl bg-card border border-border flex items-center justify-center overflow-hidden shrink-0 shadow-sm">
          <img src="/km-mark.png" alt="KM Foundation" className="w-9 h-9 object-contain" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-display text-base font-semibold tracking-tight text-[hsl(var(--sidebar-fg))] truncate">FinFlow</span>
          <span className="text-[10px] uppercase tracking-[0.16em] text-[hsl(var(--sidebar-muted))] truncate">by KM Foundation</span>
        </div>
      </div>

      {/* Nav */}
      <nav className="px-3 py-6 flex-1 space-y-0.5 overflow-y-auto">
        <p className="px-3 mb-2 text-[10px] uppercase tracking-[0.18em] text-[hsl(var(--sidebar-muted))] font-semibold">Workspace</p>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            data-testid={item.tid}
            onClick={onItemClick}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? "bg-amber-gradient text-white font-medium shadow-md shadow-orange-500/25"
                  : "text-[hsl(var(--sidebar-fg))] hover:bg-orange-500/10 hover:text-orange-600 dark:hover:text-orange-400"
              }`
            }
          >
            <item.icon size={18} weight="regular" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  );
}

function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      data-testid="theme-toggle"
      title={theme === "dark" ? "Switch to light" : "Switch to dark"}
      className="relative w-10 h-10 rounded-full bg-muted/60 hover:bg-muted text-foreground flex items-center justify-center transition-colors"
    >
      {theme === "dark" ? <Sun size={18} weight="fill" className="text-amber-400" /> : <Moon size={18} weight="fill" className="text-orange-600" />}
    </button>
  );
}

export default function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const pageTitle = PAGE_TITLES[location.pathname]
    || (location.pathname.startsWith("/students/") ? "Student" : "")
    || (location.pathname.startsWith("/agents/") ? "Agent detail" : "")
    || "FinFlow by KM Foundation";

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    nav("/login");
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex">
      {/* Desktop Sidebar */}
      <aside
        className="hidden md:flex w-64 shrink-0 flex-col border-r bg-[hsl(var(--sidebar-bg))] border-[hsl(var(--sidebar-border))] sticky top-0 h-screen"
        data-testid="desktop-sidebar"
      >
        <SidebarContent user={user} onLogout={handleLogout} />
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            data-testid="mobile-drawer-overlay"
          />
          <aside className="md:hidden fixed top-0 left-0 z-50 w-72 h-full bg-[hsl(var(--sidebar-bg))] border-r border-[hsl(var(--sidebar-border))] flex flex-col animate-fade-in" data-testid="mobile-drawer">
            <SidebarContent user={user} onItemClick={() => setMobileOpen(false)} onLogout={handleLogout} />
          </aside>
        </>
      )}

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <header
          className="sticky top-0 z-30 h-16 bg-background/85 backdrop-blur-xl border-b border-border px-4 md:px-8 flex items-center justify-between gap-3"
          data-testid="topbar"
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              data-testid="mobile-menu-btn"
              className="md:hidden w-10 h-10 rounded-lg bg-muted text-foreground flex items-center justify-center hover:bg-muted/80"
            >
              <ListIcon size={20} />
            </button>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Workspace</p>
              <h2 className="font-display text-base md:text-lg font-semibold tracking-tight truncate" data-testid="topbar-page-title">{pageTitle}</h2>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <div className="hidden md:flex relative w-64 lg:w-80">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search…"
                className="w-full h-10 pl-10 pr-3 rounded-full bg-muted/60 border border-transparent focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm transition-all"
                data-testid="topbar-search"
              />
            </div>
            <button
              type="button"
              data-testid="topbar-bell"
              className="relative w-10 h-10 rounded-full bg-muted/60 hover:bg-muted text-foreground flex items-center justify-center transition-colors"
              title="Notifications"
            >
              <Bell size={18} />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-orange-500 ring-2 ring-background" />
            </button>
            <ThemeToggle />
            <div className="flex items-center gap-2.5 pl-3 ml-1 border-l border-border h-8">
              <div className="w-8 h-8 rounded-full bg-amber-gradient text-white text-xs font-semibold flex items-center justify-center shrink-0" data-testid="topbar-avatar">
                {initialsOf(user?.name).toUpperCase()}
              </div>
              <div className="hidden md:block min-w-0">
                <p className="text-xs font-medium leading-tight truncate max-w-[140px]" data-testid="topbar-user-name">{user?.name}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{user?.business_name || user?.currency || "USD"}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                data-testid="logout-btn"
                title="Sign out"
                className="ml-1 w-9 h-9 rounded-full bg-muted/60 hover:bg-rose-500/15 text-foreground hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center transition-colors"
              >
                <SignOut size={16} />
              </button>
            </div>
          </div>
        </header>

        <div className="px-5 sm:px-8 lg:px-10 py-8 max-w-[1500px] w-full mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
