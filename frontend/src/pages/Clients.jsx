import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, PencilSimple, Trash, EnvelopeSimple, Phone, Buildings } from "@phosphor-icons/react";
import { toast } from "sonner";

const empty = { name: "", email: "", phone: "", company: "", address: "" };

export default function Clients() {
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);

  const load = async () => { setList((await api.get("/clients")).data); };
  useEffect(() => { load(); }, []);

  const openCreate = () => { setEditing(null); setForm(empty); setOpen(true); };
  const openEdit = (c) => { setEditing(c); setForm({ name: c.name, email: c.email || "", phone: c.phone || "", company: c.company || "", address: c.address || "" }); setOpen(true); };

  const submit = async (e) => {
    e.preventDefault();
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
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} data-testid="add-client-btn" className="h-10 bg-stone-900 hover:bg-stone-800 text-stone-50 lift">
              <Plus size={16} className="mr-1.5" /> Add client
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-white">
            <DialogHeader><DialogTitle className="font-display">{editing ? "Edit" : "Add"} client</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="cli-name" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="cli-email" /></div>
                <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="cli-phone" /></div>
              </div>
              <div><Label>Company</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} data-testid="cli-company" /></div>
              <div><Label>Address</Label><Textarea rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} data-testid="cli-address" /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" className="bg-stone-900 hover:bg-stone-800" data-testid="cli-save">{editing ? "Save" : "Add"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      {list.length === 0 ? (
        <Card className="p-12 text-center text-sm text-stone-500 border border-stone-200 shadow-none">No clients yet.</Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map(c => (
            <Card key={c.id} className="p-6 border border-stone-200 bg-white rounded-lg shadow-none" data-testid={`client-card-${c.id}`}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-md bg-stone-100 text-stone-700 flex items-center justify-center font-medium">
                    {c.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium">{c.name}</p>
                    {c.company && <p className="text-xs text-stone-500 flex items-center gap-1"><Buildings size={12} /> {c.company}</p>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(c)} data-testid={`edit-cli-${c.id}`} className="text-stone-500 hover:text-stone-900 p-1.5"><PencilSimple size={16} /></button>
                  <button onClick={() => remove(c.id)} data-testid={`delete-cli-${c.id}`} className="text-stone-500 hover:text-rose-700 p-1.5"><Trash size={16} /></button>
                </div>
              </div>
              <div className="mt-4 space-y-1.5 text-sm text-stone-600">
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
