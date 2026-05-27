import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  House,
  Student,
  UsersThree,
  Receipt,
  Plus,
  X,
  Wallet,
  Buildings,
  ClipboardText,
} from "@phosphor-icons/react";

const NAV = [
  { to: "/", label: "Home", icon: House, end: true, tid: "bottom-nav-home" },
  { to: "/students", label: "Students", icon: Student, tid: "bottom-nav-students" },
  // Center slot is the + button — rendered inline
  { to: "/clients", label: "Clients", icon: UsersThree, tid: "bottom-nav-clients" },
  { to: "/invoices", label: "Invoices", icon: Receipt, tid: "bottom-nav-invoices" },
];

const QUICK_ACTIONS = [
  {
    label: "Add transaction",
    sub: "Log a credit or debit",
    icon: Wallet,
    color: "from-emerald-500 to-emerald-600",
    href: "/quick-entry",
    tid: "qa-add-transaction",
  },
  {
    label: "Add student",
    sub: "New enrollment",
    icon: Student,
    color: "from-orange-500 to-amber-600",
    href: "/students?new=1",
    tid: "qa-add-student",
  },
  {
    label: "Paste application",
    sub: "Parse raw inquiry text",
    icon: ClipboardText,
    color: "from-violet-500 to-fuchsia-600",
    href: "/students?paste=1",
    tid: "qa-paste-application",
  },
  {
    label: "Add college",
    sub: "Master catalogue entry",
    icon: Buildings,
    color: "from-sky-500 to-blue-600",
    href: "/colleges?add=1",
    tid: "qa-add-college",
  },
];

function NavItem({ item, active }) {
  const nav = useNavigate();
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => nav(item.to)}
      data-testid={item.tid}
      className={`flex flex-col items-center justify-center gap-1 py-2 transition-all ${
        active
          ? "text-orange-600 dark:text-orange-400"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon size={22} weight={active ? "fill" : "regular"} />
      <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
    </button>
  );
}

export default function BottomNav() {
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  const isActive = (item) => {
    if (item.end) return loc.pathname === item.to;
    return loc.pathname === item.to || loc.pathname.startsWith(`${item.to}/`);
  };

  const go = (href) => {
    setOpen(false);
    nav(href);
  };

  return (
    <>
      {/* Action sheet */}
      {open && (
        <>
          <div
            className="md:hidden fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={() => setOpen(false)}
            data-testid="quick-actions-overlay"
          />
          <div
            className="md:hidden fixed inset-x-0 bottom-0 z-[61] bg-card rounded-t-3xl border-t border-border shadow-2xl animate-fade-in"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 1.25rem)" }}
            data-testid="quick-actions-sheet"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <div>
                <p className="label-eyebrow">Quick add</p>
                <h3 className="font-display text-lg mt-0.5">What are we logging?</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                data-testid="quick-actions-close"
                className="w-9 h-9 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center"
              >
                <X size={16} />
              </button>
            </div>
            <div className="px-3 pt-3 pb-2 grid grid-cols-2 gap-2">
              {QUICK_ACTIONS.map((a) => {
                const Icon = a.icon;
                return (
                  <button
                    key={a.label}
                    type="button"
                    onClick={() => go(a.href)}
                    data-testid={a.tid}
                    className="text-left p-3.5 rounded-2xl border border-border bg-background hover:bg-muted/50 transition-all active:scale-[0.98]"
                  >
                    <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${a.color} text-white flex items-center justify-center mb-2.5 shadow-md`}>
                      <Icon size={20} weight="bold" />
                    </div>
                    <p className="text-sm font-medium text-foreground leading-tight">{a.label}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{a.sub}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Bottom navigation bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-background/95 backdrop-blur-xl border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        data-testid="bottom-nav"
      >
        <div className="grid grid-cols-5 items-center h-16 max-w-md mx-auto relative">
          <NavItem item={NAV[0]} active={isActive(NAV[0])} />
          <NavItem item={NAV[1]} active={isActive(NAV[1])} />
          {/* Center FAB */}
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={() => setOpen(true)}
              data-testid="bottom-nav-add"
              aria-label="Quick add"
              className="absolute -top-5 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full bg-amber-gradient text-white shadow-lg shadow-orange-500/40 flex items-center justify-center active:scale-95 transition-transform ring-4 ring-background"
            >
              <Plus size={26} weight="bold" />
            </button>
          </div>
          <NavItem item={NAV[2]} active={isActive(NAV[2])} />
          <NavItem item={NAV[3]} active={isActive(NAV[3])} />
        </div>
      </nav>
    </>
  );
}
