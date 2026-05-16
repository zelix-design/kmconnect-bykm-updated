import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowDownRight, ArrowUpRight, Plus, Check } from "@phosphor-icons/react";
import { toast } from "sonner";

const KEYPAD = ["1","2","3","4","5","6","7","8","9",".","0","⌫"];

export default function QuickEntry() {
  const { user } = useAuth();
  const nav = useNavigate();
  const currency = user?.currency || "USD";

  const [mode, setMode] = useState("debit"); // debit = expense (money out), credit = income (money in)
  const [amount, setAmount] = useState("");
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [description, setDescription] = useState("");
  const [otherSpec, setOtherSpec] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [a, c] = await Promise.all([api.get("/accounts"), api.get("/categories")]);
      setAccounts(a.data);
      setCategories(c.data);
      if (a.data[0]) setAccountId(a.data[0].id);
    })();
  }, []);

  const txType = mode === "debit" ? "expense" : "income";
  const filteredCats = useMemo(() => categories.filter(c => c.type === txType), [categories, txType]);
  const selectedCat = filteredCats.find(c => c.id === categoryId);
  const isOther = selectedCat?.name?.toLowerCase().startsWith("other");

  // reset category when switching mode
  useEffect(() => { setCategoryId(""); setOtherSpec(""); }, [mode]);

  const tap = (k) => {
    if (k === "⌫") return setAmount((a) => a.slice(0, -1));
    if (k === ".") return setAmount((a) => (a.includes(".") ? a : (a || "0") + "."));
    setAmount((a) => (a === "0" ? k : a + k));
  };

  const save = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { toast.error("Enter an amount"); return; }
    if (!accountId) { toast.error("Pick an account"); return; }
    setSaving(true);
    try {
      const desc = isOther && otherSpec
        ? `${selectedCat.name}: ${otherSpec}${description ? " — " + description : ""}`
        : description;
      await api.post("/transactions", {
        type: txType,
        amount: amt,
        account_id: accountId,
        category_id: categoryId || null,
        date,
        description: desc,
      });
      toast.success(`${mode === "debit" ? "Debit" : "Credit"} entry saved`);
      // reset
      setAmount(""); setCategoryId(""); setOtherSpec(""); setDescription("");
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const tone = mode === "debit"
    ? { bg: "bg-rose-700 hover:bg-rose-800", soft: "bg-rose-100/60 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400", ring: "ring-rose-300" }
    : { bg: "bg-emerald-700 hover:bg-emerald-800", soft: "bg-emerald-100/60 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400", ring: "ring-emerald-300" };

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl" data-testid="quick-entry-page">
      <header>
        <p className="label-eyebrow">Quick entry</p>
        <h1 className="font-display text-3xl sm:text-4xl tracking-tight mt-2">Log debit or credit</h1>
        <p className="text-sm text-muted-foreground mt-1">Fast money-in / money-out logging. Tap the keypad, pick a category, save.</p>
      </header>

      {/* Mode toggle */}
      <div className="grid grid-cols-2 gap-3" data-testid="mode-toggle">
        <button
          onClick={() => setMode("debit")}
          data-testid="mode-debit"
          className={`p-5 rounded-lg border lift text-left ${mode === "debit" ? "border-rose-500 bg-rose-100/50 dark:bg-rose-500/10 ring-2 ring-rose-200 dark:ring-rose-500/30" : "border-border bg-card hover:bg-muted/40"}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-rose-100 dark:bg-rose-500/20 text-rose-700 dark:text-rose-400 flex items-center justify-center">
              <ArrowDownRight size={20} weight="bold" />
            </div>
            <div>
              <p className="font-medium">Debit</p>
              <p className="text-xs text-muted-foreground">Money out · expense</p>
            </div>
          </div>
        </button>
        <button
          onClick={() => setMode("credit")}
          data-testid="mode-credit"
          className={`p-5 rounded-lg border lift text-left ${mode === "credit" ? "border-emerald-500 bg-emerald-100/50 dark:bg-emerald-500/10 ring-2 ring-emerald-200 dark:ring-emerald-500/30" : "border-border bg-card hover:bg-muted/40"}`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <ArrowUpRight size={20} weight="bold" />
            </div>
            <div>
              <p className="font-medium">Credit</p>
              <p className="text-xs text-muted-foreground">Money in · income</p>
            </div>
          </div>
        </button>
      </div>

      <Card className="p-6 border border-border bg-card rounded-lg shadow-none">
        {/* Big amount display */}
        <div className="text-center pb-6 border-b border-border">
          <p className="label-eyebrow">{mode === "debit" ? "Amount to deduct" : "Amount to credit"}</p>
          <div className="mt-3 font-display text-5xl sm:text-6xl tracking-tight tabular-nums" data-testid="amount-display">
            <span className="text-muted-foreground/70 mr-1">{mode === "debit" ? "−" : "+"}</span>
            {formatMoney(parseFloat(amount) || 0, currency)}
          </div>
        </div>

        {/* Keypad + Side controls grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          {/* Keypad */}
          <div className="grid grid-cols-3 gap-2.5" data-testid="keypad">
            {KEYPAD.map((k) => (
              <button
                key={k}
                onClick={() => tap(k)}
                data-testid={`key-${k === "⌫" ? "back" : k === "." ? "dot" : k}`}
                className="h-14 rounded-md bg-muted/40 hover:bg-muted border border-border text-xl font-display lift"
              >
                {k}
              </button>
            ))}
          </div>

          {/* Side controls */}
          <div className="space-y-4">
            <div>
              <Label>Account</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger data-testid="qe-account"><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="qe-date" />
            </div>
            <div>
              <Label>Notes (optional)</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was this for?" data-testid="qe-notes" />
            </div>
          </div>
        </div>

        {/* Category chips */}
        <div className="mt-6">
          <Label>Category</Label>
          <div className="flex flex-wrap gap-2 mt-2" data-testid="category-chips">
            {filteredCats.map((c) => {
              const active = c.id === categoryId;
              return (
                <button
                  key={c.id}
                  onClick={() => setCategoryId(c.id)}
                  data-testid={`chip-${c.name.replace(/[^a-zA-Z0-9]/g, "-").toLowerCase()}`}
                  className={`px-3 h-9 rounded-full text-sm border flex items-center gap-2 lift ${
                    active
                      ? "border-orange-500 bg-amber-gradient text-white"
                      : "border-border bg-card hover:bg-muted/40 text-foreground"
                  }`}
                >
                  <span className="w-2 h-2 rounded-sm" style={{ background: c.color }} />
                  {c.name}
                  {active && <Check size={12} weight="bold" />}
                </button>
              );
            })}
          </div>
          {isOther && (
            <div className="mt-3">
              <Label>Specify "Other"</Label>
              <Input
                value={otherSpec}
                onChange={(e) => setOtherSpec(e.target.value)}
                placeholder="e.g., Parking fee, courier charges"
                data-testid="qe-other-spec"
              />
            </div>
          )}
        </div>

        {/* Save */}
        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          <Button
            onClick={save}
            disabled={saving || !amount || !accountId}
            data-testid="qe-save"
            className={`flex-1 h-12 text-background lift ${tone.bg}`}
          >
            <Plus size={18} className="mr-1.5" />
            {saving ? "Saving…" : `Save ${mode === "debit" ? "debit" : "credit"} entry`}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => nav("/transactions")}
            data-testid="qe-view-all"
            className="h-12"
          >
            View all transactions
          </Button>
        </div>
      </Card>
    </div>
  );
}
