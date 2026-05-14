import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChartLineUp, Wallet, ArrowRight } from "@phosphor-icons/react";

const HERO_IMG = "https://static.prod-images.emergentagent.com/jobs/08a8ca6a-72d5-407c-95c8-80ace9a8e29f/images/42f48dae72e83944fbde022ce495af6a2ba0db6d6dce9c77703c493691506d87.png";

export default function AuthPage({ mode }) {
  const isLogin = mode === "login";
  const { login, register, error, setError } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", name: "", business_name: "" });
  const [submitting, setSubmitting] = useState(false);

  const handle = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const ok = isLogin
      ? await login(form.email, form.password)
      : await register({ email: form.email, password: form.password, name: form.name, business_name: form.business_name });
    setSubmitting(false);
    if (ok) nav("/");
  };

  return (
    <div className="min-h-screen w-full grid grid-cols-1 lg:grid-cols-2 bg-stone-50">
      {/* Hero */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 bg-stone-900 text-stone-50 overflow-hidden">
        <img src={HERO_IMG} alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-gradient-to-tr from-stone-950/80 via-stone-900/40 to-transparent" />
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-9 h-9 rounded-md bg-emerald-500/90 flex items-center justify-center">
            <ChartLineUp size={20} weight="bold" className="text-stone-900" />
          </div>
          <span className="font-display text-xl tracking-tight">FinFlow</span>
        </div>
        <div className="relative z-10 max-w-md space-y-5">
          <p className="label-eyebrow text-stone-300">Small business · ledger</p>
          <h1 className="font-display text-5xl font-light leading-tight">
            Money,<br />
            <span className="text-emerald-300">organized.</span>
          </h1>
          <p className="text-stone-300 text-base leading-relaxed">
            Track every invoice, expense, and dollar across accounts. Built for founders who'd rather build than bookkeep.
          </p>
          <div className="flex items-center gap-2 text-stone-400 text-sm pt-4">
            <Wallet size={18} /> Multi-currency · USD & INR
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md space-y-8 animate-fade-in">
          <div className="space-y-2">
            <p className="label-eyebrow">{isLogin ? "Welcome back" : "Get started"}</p>
            <h2 className="font-display text-3xl sm:text-4xl text-stone-900">
              {isLogin ? "Sign in to your ledger" : "Create your workspace"}
            </h2>
            <p className="text-stone-600 text-sm">
              {isLogin ? "Pick up where you left off." : "Free during preview. No card required."}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-5" data-testid="auth-form">
            {!isLogin && (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Your name</Label>
                  <Input id="name" data-testid="register-name-input" value={form.name} onChange={handle("name")} required placeholder="Jane Doe" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="business_name">Business name (optional)</Label>
                  <Input id="business_name" data-testid="register-business-input" value={form.business_name} onChange={handle("business_name")} placeholder="Acme Co." />
                </div>
              </>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" data-testid="auth-email-input" value={form.email} onChange={handle("email")} required placeholder="you@company.com" autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" data-testid="auth-password-input" value={form.password} onChange={handle("password")} required placeholder="••••••••" autoComplete={isLogin ? "current-password" : "new-password"} />
            </div>

            {error && (
              <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-md px-3 py-2" data-testid="auth-error">
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={submitting}
              data-testid="auth-submit-btn"
              className="w-full h-11 bg-stone-900 hover:bg-stone-800 text-stone-50 lift"
            >
              {submitting ? "Please wait…" : (isLogin ? "Sign in" : "Create account")}
              <ArrowRight size={16} className="ml-2" />
            </Button>
          </form>

          <div className="text-sm text-stone-600">
            {isLogin ? (
              <>New here?{" "}<Link to="/register" data-testid="link-register" className="text-stone-900 underline underline-offset-4 hover:text-emerald-700">Create an account</Link></>
            ) : (
              <>Already have an account?{" "}<Link to="/login" data-testid="link-login" className="text-stone-900 underline underline-offset-4 hover:text-emerald-700">Sign in</Link></>
            )}
          </div>

          {isLogin && (
            <div className="text-xs text-stone-500 border-t border-stone-200 pt-4">
              Demo: <span className="font-mono text-stone-700">admin@finflow.com</span> · <span className="font-mono text-stone-700">Admin@123</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
