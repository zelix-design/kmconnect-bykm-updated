import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, PencilSimple, Trash, EnvelopeSimple, Phone, Buildings } from "@phosphor-icons/react";
import { toast } from "sonner";

export const CLIENT_TYPES = [
  { value: "sub_agent_associate", label: "Sub Agent / Associate" },
  { value: "associate_consultant", label: "Associate Consultant" },
  { value: "km_blr_office", label: "KM BLR Office" },
  { value: "km_tcr_office", label: "KM TCR Office" },
  { value: "km_kmly_office", label: "KM KMLY Office" },
];

export function clientTypeLabel(v) {
  return CLIENT_TYPES.find((t) => t.value === v)?.label || "—";
}

const TYPE_BADGE = {
  sub_agent_associate: "bg-violet-100/60 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400",
  associate_consultant: "bg-amber-100/60 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400",
  km_blr_office: "bg-emerald-100/60 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  km_tcr_office: "bg-sky-100/60 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400",
  km_kmly_office: "bg-rose-100/60 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

const empty = { name: "", client_type: "sub_agent_associate", email: "", phone: "", company: "" };

export default function Clients() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");

  const load = async () => { setList((await api.get("/clients")).data); };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return list;
    return list.filter((c) => c.client_type === filter);
  }, [list, filter]);

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      name: c.name,
      client_type: c.client_type || "sub_agent_associate",
      email: c.email || "",
      phone: c.phone || "",
      company: c.company || "",
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.client_type) { toast.error("Client Type is required"); return; }
    try {
      if (editing) await api.patch(`/clients/${editing.id}`, form);
      else await api.post("/clients", form);
      toast.success(editing ? "Client updated" : "Client added");
      setOpen(false); load();
    } catch { toast.error("Failed"); }
  };

  const remove = async (id) => {
    if (!confirm("Delete client?")) return;
    await api.delete(`/clients/${id}`);
    toast.success("Deleted"); load();
  };

  return (
    <div className="space-y-6 animate-fade-in" data-testid="clients-page">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="label-eyebrow">People</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight mt-2">Clients</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="h-10 w-56" data-testid="cli-filter-type">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {CLIENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openCreate} data-testid="add-client-btn" className="h-10 btn-amber border-0">
                <Plus size={16} className="mr-1.5" /> Add client
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-card">
              <DialogHeader>
                <DialogTitle className="font-display">{editing ? "Edit" : "Add"} client</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">Enrol a routing partner (sub-agent / associate / KM office).</DialogDescription>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="cli-name" /></div>
                <div>
                  <Label>Client Type *</Label>
                  <Select value={form.client_type} onValueChange={(v) => setForm({ ...form, client_type: v })}>
                    <SelectTrigger data-testid="cli-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {CLIENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="cli-email" /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="cli-phone" /></div>
                </div>
                <div><Label>Company</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} data-testid="cli-company" /></div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button type="submit" className="btn-amber border-0" data-testid="cli-save">{editing ? "Save" : "Add"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground border border-border shadow-none" data-testid="empty-clients">
          {list.length === 0 ? "No clients yet." : "No clients match this filter."}
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <Card key={c.id} className="p-6 border border-border bg-card rounded-lg shadow-none" data-testid={`client-card-${c.id}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-md bg-muted text-foreground flex items-center justify-center font-medium">
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{c.name}</p>
                    {c.company && <p className="text-xs text-muted-foreground flex items-center gap-1"><Buildings size={12} /> {c.company}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(c)} data-testid={`edit-cli-${c.id}`} className="text-muted-foreground hover:text-foreground p-1.5"><PencilSimple size={16} /></button>
                  <button onClick={() => remove(c.id)} data-testid={`delete-cli-${c.id}`} className="text-muted-foreground hover:text-rose-700 dark:text-rose-400 p-1.5"><Trash size={16} /></button>
                </div>
              </div>
              <div className="mt-3">
                <span className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${TYPE_BADGE[c.client_type] || "bg-muted text-foreground"}`}>
                  {clientTypeLabel(c.client_type)}
                </span>
              </div>
              <div className="mt-4 space-y-1.5 text-sm text-muted-foreground">
                {c.email && <p className="flex items-center gap-2"><EnvelopeSimple size={14} /> {c.email}</p>}
                {c.phone && <p className="flex items-center gap-2"><Phone size={14} /> {c.phone}</p>}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
