import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatMoney, todayISO } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, PencilSimple, Trash, Funnel } from "@phosphor-icons/react";
import { toast } from "sonner";

const empty = { type: "expense", amount: "", account_id: "", category_id: "", date: todayISO(), description: "" };

export default function Transactions() {
  const { user } = useAuth();
  const currency = user?.currency || "USD";
  const [list, setList] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [filterType, setFilterType] = useState("all");

  const load = async () => {
    const params = filterType !== "all" ? { type: filterType } : {};
    const [t, a, c] = await Promise.all([
      api.get("/transactions", { params }),
      api.get("/accounts"),
      api.get("/categories"),
    ]);
    setList(t.data); setAccounts(a.data); setCategories(c.data);
  };
  useEffect(() => { load(); }, [filterType]);

  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]));
  const categoryMap = Object.fromEntries(categories.map(c => [c.id, c]));

  const openCreate = () => {
    setEditing(null);
    setForm({ ...empty, account_id: accounts[0]?.id || "" });
    setOpen(true);
  };
  const openEdit = (t) => {
    setEditing(t);
    setForm({ ...t, category_id: t.category_id || "" });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      amount: parseFloat(form.amount) || 0,
      category_id: form.category_id || null,
    };
    try {
      if (editing) {
        await api.patch(`/transactions/${editing.id}`, payload);
        toast.success("Transaction updated");
      } else {
        await api.post("/transactions", payload);
        toast.success("Transaction added");
      }
      setOpen(false); load();
    } catch (e) {
      toast.error(e.response?.data?.detail || "Failed");
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete this transaction?")) return;
    await api.delete(`/transactions/${id}`);
    toast.success("Deleted");
    load();
  };

  const filteredCategories = categories.filter(c => c.type === form.type);

  return (
    <div className="space-y-6 animate-fade-in" data-testid="transactions-page">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="label-eyebrow">Ledger</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight mt-2">Transactions</h1>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white border border-stone-300 rounded-md px-3 h-10">
            <Funnel size={16} className="text-stone-500" />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              data-testid="filter-type"
              className="bg-transparent text-sm focus:outline-none"
            >
              <option value="all">All</option>
              <option value="income">Income</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} data-testid="add-transaction-btn" className="h-10 bg-stone-900 hover:bg-stone-800 text-stone-50 lift">
                <Plus size={16} className="mr-1.5" /> Add transaction
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-white" data-testid="transaction-dialog">
              <DialogHeader><DialogTitle className="font-display">{editing ? "Edit" : "Add"} transaction</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v, category_id: "" })}>
                      <SelectTrigger data-testid="tx-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income">Income</SelectItem>
                        <SelectItem value="expense">Expense</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Amount</Label>
                    <Input type="number" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} data-testid="tx-amount" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Account</Label>
                    <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                      <SelectTrigger data-testid="tx-account"><SelectValue placeholder="Select account" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Category</Label>
                    <Select value={form.category_id || "_none"} onValueChange={(v) => setForm({ ...form, category_id: v === "_none" ? "" : v })}>
                      <SelectTrigger data-testid="tx-category"><SelectValue placeholder="None" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">None</SelectItem>
                        {filteredCategories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Date</Label>
                  <Input type="date" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} data-testid="tx-date" />
                </div>
                <div>
                  <Label>Description</Label>
                  <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What was this for?" data-testid="tx-description" />
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)} data-testid="tx-cancel">Cancel</Button>
                  <Button type="submit" className="bg-stone-900 hover:bg-stone-800" data-testid="tx-save">{editing ? "Save" : "Add"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <Card className="border border-stone-200 bg-white rounded-lg shadow-none overflow-hidden">
        {list.length === 0 ? (
          <div className="p-12 text-center text-sm text-stone-500" data-testid="empty-state">No transactions yet. Click "Add transaction" to get started.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left bg-stone-50 border-b border-stone-200">
                  <th className="px-6 py-3 label-eyebrow">Date</th>
                  <th className="px-6 py-3 label-eyebrow">Description</th>
                  <th className="px-6 py-3 label-eyebrow">Account</th>
                  <th className="px-6 py-3 label-eyebrow">Category</th>
                  <th className="px-6 py-3 label-eyebrow text-right">Amount</th>
                  <th className="px-6 py-3 label-eyebrow"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200">
                {list.map(t => (
                  <tr key={t.id} className="hover:bg-stone-50" data-testid={`tx-row-${t.id}`}>
                    <td className="px-6 py-3.5 tabular-nums text-stone-600">{t.date}</td>
                    <td className="px-6 py-3.5">{t.description || "—"}</td>
                    <td className="px-6 py-3.5 text-stone-600">{accountMap[t.account_id]?.name || "—"}</td>
                    <td className="px-6 py-3.5">
                      {categoryMap[t.category_id] ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="w-2 h-2 rounded-sm" style={{ background: categoryMap[t.category_id].color }} />
                          {categoryMap[t.category_id].name}
                        </span>
                      ) : <span className="text-stone-400">—</span>}
                    </td>
                    <td className={`px-6 py-3.5 text-right tabular-nums font-medium ${t.type === 'income' ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {t.type === 'income' ? '+' : '−'}{formatMoney(t.amount, currency)}
                    </td>
                    <td className="px-6 py-3.5 text-right whitespace-nowrap">
                      <button onClick={() => openEdit(t)} data-testid={`edit-${t.id}`} className="text-stone-500 hover:text-stone-900 p-1.5"><PencilSimple size={16} /></button>
                      <button onClick={() => remove(t.id)} data-testid={`delete-${t.id}`} className="text-stone-500 hover:text-rose-700 p-1.5"><Trash size={16} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
