import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wallet, ArrowRight, Sun, Moon, Sparkle, ShieldCheck, ChartBar, ClockClockwise } from "@phosphor-icons/react";

const OFFICES = [
  { value: "KM_BLR", label: "KM Bengaluru (BLR)" },
  { value: "KM_TCR", label: "KM Thrissur (TCR)" },
  { value: "KM_KMLY", label: "KM Kumily (KMLY)" },
];

export default function AuthPage({ mode }) {
  const isLogin = mode === "login";
  const { login, register, error, setError } = useAuth();
  const { theme, toggle } = useTheme();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", name: "", office: "" });
  const [submitting, setSubmitting] = useState(false);
  const [pendingMsg, setPendingMsg] = useState("");

  const handle = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    if (isLogin) {
      const ok = await login(form.email, form.password);
      setSubmitting(false);
      if (ok) nav("/");
    } else {
      if (!form.office) {
        setError("Please select your office.");
        setSubmitting(false);
        return;
      }
      const res = await register({ email: form.email, password: form.password, name: form.name, office: form.office });
      setSubmitting(false);
      if (res.ok && res.pending) {
        setPendingMsg(res.message || "Your account is awaiting super-admin approval.");
      }
    }
  };

  return (
    <div
      className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-5 bg-background text-foreground"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Hero — amber gradient side */}
      <div className="relative hidden lg:flex lg:col-span-2 flex-col justify-between p-12 overflow-hidden bg-amber-gradient text-white">
        {/* Decorative blobs */}
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-20 w-[28rem] h-[28rem] rounded-full bg-orange-700/30 blur-3xl" />
        <div className="absolute inset-0 grain-overlay opacity-30" />

        <div className="relative z-10 flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30 overflow-hidden">
            <img src="/km-mark.png" alt="KM Foundation" className="w-9 h-9 object-contain" />
          </div>
          <div className="flex flex-col">
            <span className="font-display text-xl tracking-tight font-semibold leading-tight">FinFlow</span>
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/80">by KM Foundation</span>
          </div>
        </div>

        <div className="relative z-10 max-w-md space-y-6">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 backdrop-blur-sm text-xs uppercase tracking-[0.18em] font-semibold">
            <Sparkle size={12} weight="fill" /> Edu CRM · ledger
          </span>
          <h1 className="font-display text-5xl xl:text-6xl font-bold leading-[1.05]">
            Money,<br />
            <span className="text-white/90 font-light italic">organized.</span>
          </h1>
          <p className="text-white/85 text-base leading-relaxed">
            Track every invoice, expense, and rupee across accounts. Built for founders, consultants & education agents who'd rather build than bookkeep.
          </p>
          <ul className="pt-2 space-y-3 text-sm text-white/90">
            <li className="flex items-center gap-3"><Wallet size={18} weight="duotone" /> Multi-currency · USD &amp; INR</li>
            <li className="flex items-center gap-3"><ShieldCheck size={18} weight="duotone" /> Encrypted, JWT-based access</li>
            <li className="flex items-center gap-3"><ChartBar size={18} weight="duotone" /> Realtime dashboards &amp; PDF invoices</li>
          </ul>
        </div>

        <div className="relative z-10 text-xs text-white/70">© FinFlow by KM Foundation · 2026</div>
      </div>

      {/* Form */}
      <div className="lg:col-span-3 flex items-center justify-center p-6 lg:p-12 relative">
        {/* Theme toggle floating top-right */}
        <button
          type="button"
          onClick={toggle}
          data-testid="auth-theme-toggle"
          className="absolute top-6 right-6 w-10 h-10 rounded-full bg-muted/60 hover:bg-muted text-foreground flex items-center justify-center transition-colors"
          title={theme === "dark" ? "Switch to light" : "Switch to dark"}
        >
          {theme === "dark" ? <Sun size={18} weight="fill" className="text-amber-400" /> : <Moon size={18} weight="fill" className="text-orange-600" />}
        </button>

        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="space-y-3">
            {/* Mobile brand */}
            <div className="lg:hidden flex items-center gap-2.5 mb-6">
              <div className="w-10 h-10 rounded-xl bg-card border border-border flex items-center justify-center overflow-hidden">
                <img src="/km-mark.png" alt="KM Foundation" className="w-8 h-8 object-contain" />
              </div>
              <div className="flex flex-col">
                <span className="font-display text-base font-semibold leading-tight">FinFlow</span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">by KM Foundation</span>
              </div>
            </div>
            <p className="label-eyebrow">{isLogin ? "Welcome back" : (pendingMsg ? "Almost there" : "Get started")}</p>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold text-foreground tracking-tight">
              {isLogin ? "Sign in to your ledger" : (pendingMsg ? "Awaiting approval" : "Request office access")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {isLogin ? "Pick up where you left off." : (pendingMsg ? "A super admin will review your request shortly." : "Register your office and a super admin will activate your access.")}
            </p>
          </div>

          {pendingMsg ? (
            <div className="space-y-4" data-testid="auth-pending-screen">
              <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 dark:bg-orange-500/10 p-5 flex gap-4">
                <ClockClockwise size={28} weight="duotone" className="text-orange-600 dark:text-orange-400 shrink-0" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">Account created successfully</p>
                  <p className="text-sm text-muted-foreground">{pendingMsg}</p>
                  <p className="text-xs text-muted-foreground">We'll email you once approved. You can close this page.</p>
                </div>
              </div>
              <Link to="/login" data-testid="back-to-login" className="inline-flex items-center gap-1.5 text-sm text-orange-600 dark:text-orange-400 font-medium hover:text-orange-700">
                <ArrowRight size={14} className="rotate-180" /> Back to sign in
              </Link>
            </div>
          ) : (
          <form onSubmit={submit} className="space-y-4" data-testid="auth-form">
            {!isLogin && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Your name</Label>
                  <Input id="name" data-testid="register-name-input" value={form.name} onChange={handle("name")} required placeholder="Jane Doe" className="h-11" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="office">Office</Label>
                  <Select value={form.office} onValueChange={(v) => setForm({ ...form, office: v })}>
                    <SelectTrigger id="office" data-testid="register-office-select" className="h-11 bg-card">
                      <SelectValue placeholder="Pick the office you manage" />
                    </SelectTrigger>
                    <SelectContent>
                      {OFFICES.map((o) => (
                        <SelectItem key={o.value} value={o.value} data-testid={`office-opt-${o.value}`}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" data-testid="auth-email-input" value={form.email} onChange={handle("email")} required placeholder="you@company.com" autoComplete="email" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" data-testid="auth-password-input" value={form.password} onChange={handle("password")} required placeholder="••••••••" autoComplete={isLogin ? "current-password" : "new-password"} className="h-11" />
            </div>

            {isLogin && (
              <div className="flex justify-end -mt-1">
                <Link to="/forgot-password" data-testid="link-forgot-password" className="text-sm text-orange-600 dark:text-orange-400 font-medium hover:text-orange-700">
                  Forgot password?
                </Link>
              </div>
            )}

            {error && (
              <div className="text-sm text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2.5" data-testid="auth-error">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              data-testid="auth-submit-btn"
              className="w-full h-12 btn-amber border-0 font-medium text-base"
            >
              {submitting ? "Please wait…" : (isLogin ? "Sign in" : "Request access")}
              <ArrowRight size={16} className="ml-2" />
            </Button>
          </form>
          )}

          {!pendingMsg && (
          <div className="text-sm text-muted-foreground">
            {isLogin ? (
              <>New here?{" "}<Link to="/register" data-testid="link-register" className="text-orange-600 dark:text-orange-400 font-medium underline underline-offset-4 hover:text-orange-700">Create an account</Link></>
            ) : (
              <>Already have an account?{" "}<Link to="/login" data-testid="link-login" className="text-orange-600 dark:text-orange-400 font-medium underline underline-offset-4 hover:text-orange-700">Sign in</Link></>
            )}
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
