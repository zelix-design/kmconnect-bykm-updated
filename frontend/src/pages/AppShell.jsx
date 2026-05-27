import React, { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { canView } from "@/lib/perm";
import NotificationsBell from "@/components/NotificationsBell";
import BottomNav from "@/components/BottomNav";
import {
  House, Receipt, Wallet, FileText, UsersThree, Tag, Gear, SignOut, PlusCircle,
  Student, Notebook, Sun, Moon, List as ListIcon, MagnifyingGlass,
  ShieldCheck, ReceiptX, Buildings,
} from "@phosphor-icons/react";

// Sidebar nav with role gating.
//   roles: array of roles that can see this item. Omitting `roles` means all.
//   perm: page-permission key — when present, item is hidden if canView(user, perm) is false.
const ALL_NAV = [
  { to: "/", label: "Overview", icon: House, end: true, tid: "nav-overview", perm: "overview" },
  { to: "/quick-entry", label: "Quick entry", icon: PlusCircle, tid: "nav-quick-entry", perm: "quick_entry" },
  { to: "/transactions", label: "Transactions", icon: Receipt, tid: "nav-transactions", perm: "transactions" },
  { to: "/accounts", label: "Accounts", icon: Wallet, tid: "nav-accounts", perm: "accounts" },
  { to: "/invoices", label: "Invoices", icon: FileText, tid: "nav-invoices", roles: ["super_admin"] },
  { to: "/clients", label: "Clients", icon: UsersThree, tid: "nav-clients", perm: "clients" },
  { to: "/students", label: "Students", icon: Student, tid: "nav-students", perm: "students" },
  { to: "/colleges", label: "Colleges", icon: Buildings, tid: "nav-colleges", roles: ["super_admin"] },
  { to: "/agents", label: "Ledger", icon: Notebook, tid: "nav-ledger", roles: ["super_admin"] },
  { to: "/expense-requests", label: "Approvals", icon: ReceiptX, tid: "nav-approvals", roles: ["super_admin"] },
  { to: "/expense-requests", label: "Office expenses", icon: ReceiptX, tid: "nav-office-expenses", roles: ["office_admin"], perm: "expense_requests" },
  { to: "/users", label: "Team", icon: ShieldCheck, tid: "nav-users", roles: ["super_admin"] },
  { to: "/categories", label: "Categories", icon: Tag, tid: "nav-categories", roles: ["super_admin"] },
  { to: "/settings", label: "Settings", icon: Gear, tid: "nav-settings", perm: "settings" },
];

const PAGE_TITLES = {
  "/": "Overview",
  "/quick-entry": "Quick entry",
  "/transactions": "Transactions",
  "/accounts": "Accounts",
  "/invoices": "Invoices",
  "/clients": "Clients",
  "/students": "Students",
  "/colleges": "Colleges",
  "/agents": "Sub-agent Ledger",
  "/categories": "Categories",
  "/settings": "Settings",
  "/users": "Team & approvals",
  "/expense-requests": "Expense requests",
};

function initialsOf(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
}

function SidebarContent({ onItemClick, user, onLogout }) {
  const role = user?.role;
  const navItems = ALL_NAV.filter((i) => {
    if (i.roles && !i.roles.includes(role)) return false;
    if (i.perm && !canView(user, i.perm)) return false;
    return true;
  });
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

      {/* Footer: user info + sign out (mobile drawer only — hidden on desktop where topbar handles it) */}
      {onLogout && (
        <div className="md:hidden border-t border-[hsl(var(--sidebar-border))] p-3 space-y-2 shrink-0">
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="w-9 h-9 rounded-full bg-amber-gradient text-white text-xs font-semibold flex items-center justify-center shrink-0">
              {initialsOf(user?.name).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[hsl(var(--sidebar-fg))] truncate" data-testid="drawer-user-name">{user?.name}</p>
              <p className="text-[10px] uppercase tracking-wider text-[hsl(var(--sidebar-muted))] truncate">{user?.role?.replace("_", " ")}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            data-testid="drawer-logout-btn"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-sm font-medium transition-colors"
          >
            <SignOut size={16} weight="bold" />
            Sign out
          </button>
        </div>
      )}
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
        <SidebarContent user={user} />
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            data-testid="mobile-drawer-overlay"
          />
          <aside
            className="md:hidden fixed top-0 left-0 z-50 w-72 h-full bg-[hsl(var(--sidebar-bg))] border-r border-[hsl(var(--sidebar-border))] flex flex-col animate-fade-in"
            style={{
              paddingTop: "env(safe-area-inset-top)",
              paddingBottom: "env(safe-area-inset-bottom)",
            }}
            data-testid="mobile-drawer"
          >
            <SidebarContent user={user} onItemClick={() => setMobileOpen(false)} onLogout={handleLogout} />
          </aside>
        </>
      )}

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <header
          className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
          data-testid="topbar"
        >
          <div className="h-16 px-4 md:px-8 flex items-center justify-between gap-3">
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

          <div className="flex items-center gap-1.5 sm:gap-2 md:gap-3">
            <div className="hidden lg:flex relative w-64 xl:w-80">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search…"
                className="w-full h-10 pl-10 pr-3 rounded-full bg-muted/60 border border-transparent focus:border-primary focus:bg-card focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm transition-all"
                data-testid="topbar-search"
              />
            </div>
            <NotificationsBell />
            <ThemeToggle />
            <div className="flex items-center gap-2 sm:gap-2.5 pl-2 sm:pl-3 ml-0.5 sm:ml-1 border-l border-border h-8">
              <div className="w-8 h-8 rounded-full bg-amber-gradient text-white text-xs font-semibold flex items-center justify-center shrink-0" data-testid="topbar-avatar">
                {initialsOf(user?.name).toUpperCase()}
              </div>
              <div className="hidden lg:block min-w-0">
                <p className="text-xs font-medium leading-tight truncate max-w-[140px]" data-testid="topbar-user-name">{user?.name}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{user?.business_name || user?.currency || "USD"}</p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                data-testid="logout-btn"
                title="Sign out"
                className="ml-0.5 sm:ml-1 w-9 h-9 rounded-full bg-muted/60 hover:bg-rose-500/15 text-foreground hover:text-rose-600 dark:hover:text-rose-400 flex items-center justify-center transition-colors"
              >
                <SignOut size={16} />
              </button>
            </div>
          </div>
          </div>
        </header>

        <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 pb-28 md:pb-12 max-w-[1500px] w-full mx-auto">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
