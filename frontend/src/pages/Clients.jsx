import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { canEdit } from "@/lib/perm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Plus, PencilSimple, Trash, EnvelopeSimple, Phone, Buildings, Cake, CurrencyInr } from "@phosphor-icons/react";
import { toast } from "sonner";

export const CLIENT_TYPES = [
  { value: "staff", label: "Our Staff" },
  { value: "sub_agent_associate", label: "Sub Agent / Associate" },
  { value: "associate_consultant", label: "Associate Consultant" },
  { value: "km_blr_office", label: "KM BLR Office" },
  { value: "km_tcr_office", label: "KM TCR Office" },
  { value: "km_kmly_office", label: "KM KMLY Office" },
];

const OFFICES = [
  { value: "KM_BLR", label: "KM BLR" },
  { value: "KM_TCR", label: "KM TCR" },
  { value: "KM_KMLY", label: "KM KMLY" },
];

export function clientTypeLabel(v) {
  return CLIENT_TYPES.find((t) => t.value === v)?.label || "—";
}

const TYPE_BADGE = {
  staff: "bg-orange-100/60 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400",
  sub_agent_associate: "bg-violet-100/60 dark:bg-violet-500/15 text-violet-700 dark:text-violet-400",
  associate_consultant: "bg-amber-100/60 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400",
  km_blr_office: "bg-emerald-100/60 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  km_tcr_office: "bg-sky-100/60 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400",
  km_kmly_office: "bg-rose-100/60 dark:bg-rose-500/15 text-rose-700 dark:text-rose-400",
};

const empty = {
  name: "", client_type: "sub_agent_associate", email: "", phone: "", company: "",
  office: "", eligible_incentive: "", date_of_birth: "",
};

export default function Clients() {
  const { user } = useAuth();
  const isOfficeAdmin = user?.role === "office_admin";
  const allowEdit = canEdit(user, "clients");
  const [list, setList] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(isOfficeAdmin ? { ...empty, client_type: "staff", office: user?.office || "" } : empty);
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState(isOfficeAdmin ? "staff" : "all");

  const load = async () => { setList((await api.get("/clients")).data); };
  useEffect(() => { load(); }, []);

  // Office-admin only sees staff in their workspace
  const visibleTypes = isOfficeAdmin ? CLIENT_TYPES.filter((t) => t.value === "staff") : CLIENT_TYPES;

  const filtered = useMemo(() => {
    let l = list;
    if (isOfficeAdmin) l = l.filter((c) => c.client_type === "staff");
    if (filter !== "all") l = l.filter((c) => c.client_type === filter);
    return l;
  }, [list, filter, isOfficeAdmin]);

  const openCreate = () => {
    setEditing(null);
    setForm(isOfficeAdmin
      ? { ...empty, client_type: "staff", office: user?.office || "" }
      : empty);
    setOpen(true);
  };
  const openEdit = (c) => {
    setEditing(c);
    setForm({
      name: c.name,
      client_type: c.client_type || (isOfficeAdmin ? "staff" : "sub_agent_associate"),
      email: c.email || "",
      phone: c.phone || "",
      company: c.company || "",
      office: c.office || "",
      eligible_incentive: c.eligible_incentive ?? "",
      date_of_birth: c.date_of_birth || "",
    });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.client_type) { toast.error("Client Type is required"); return; }
    const payload = {
      ...form,
      office: form.office || null,
      eligible_incentive: form.eligible_incentive === "" ? null : Number(form.eligible_incentive),
      date_of_birth: form.date_of_birth || null,
    };
    try {
      if (editing) await api.patch(`/clients/${editing.id}`, payload);
      else await api.post("/clients", payload);
      toast.success(editing ? "Saved" : "Added");
      setOpen(false); load();
    } catch { toast.error("Failed"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this entry?")) return;
    await api.delete(`/clients/${id}`);
    toast.success("Deleted"); load();
  };

  const isStaff = form.client_type === "staff";

  return (
    <div className="space-y-6 animate-fade-in" data-testid="clients-page">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="label-eyebrow">People</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight mt-2">
            {isOfficeAdmin ? "Our Staff" : "Clients"}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isOfficeAdmin && (
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
          )}
          <Dialog open={open} onOpenChange={setOpen}>
            {allowEdit && (
            <DialogTrigger asChild>
              <Button onClick={openCreate} data-testid="add-client-btn" className="h-10 btn-amber border-0">
                <Plus size={16} className="mr-1.5" /> {isOfficeAdmin ? "Add staff" : "Add client"}
              </Button>
            </DialogTrigger>
            )}
            <DialogContent className="bg-card">
              <DialogHeader>
                <DialogTitle className="font-display">{editing ? "Edit" : "Add"} {isStaff ? "staff" : "client"}</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  {isStaff ? "Onboard a staff member with their birthday and incentive eligibility." : "Enrol a routing partner."}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                <div><Label>Name *</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="cli-name" /></div>
                <div>
                  <Label>Type *</Label>
                  <Select value={form.client_type} onValueChange={(v) => setForm({ ...form, client_type: v })} disabled={isOfficeAdmin}>
                    <SelectTrigger data-testid="cli-type"><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>
                      {visibleTypes.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="cli-email" /></div>
                  <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="cli-phone" /></div>
                </div>
                {isStaff ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Office</Label>
                        <Select value={form.office || ""} onValueChange={(v) => setForm({ ...form, office: v })}>
                          <SelectTrigger data-testid="cli-office"><SelectValue placeholder="Pick office" /></SelectTrigger>
                          <SelectContent>
                            {OFFICES.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Date of birth</Label>
                        <Input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} data-testid="cli-dob" />
                      </div>
                    </div>
                    <div>
                      <Label>Eligible incentive (₹ per admission)</Label>
                      <Input type="number" min="0" step="50" value={form.eligible_incentive} onChange={(e) => setForm({ ...form, eligible_incentive: e.target.value })} placeholder="e.g. 500" data-testid="cli-incentive" />
                      <p className="text-[11px] text-muted-foreground mt-1">Paid out once the staff hits 3+ admissions in a month.</p>
                    </div>
                  </>
                ) : (
                  <div><Label>Company</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} data-testid="cli-company" /></div>
                )}
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
          {list.length === 0 ? (isOfficeAdmin ? "No staff yet. Add your first." : "No clients yet.") : "No entries match this filter."}
        </Card>
      ) : isOfficeAdmin ? (
        // Office-admin: flat grid (staff only)
        <ClientGrid clients={filtered} allowEdit={allowEdit} openEdit={openEdit} remove={remove} />
      ) : (
        // Super-admin: group by category, with Staff further sub-grouped by office
        <GroupedClients filter={filter} clients={filtered} allowEdit={allowEdit} openEdit={openEdit} remove={remove} />
      )}
    </div>
  );
}

// ---- Helpers ----

const OFFICE_OPTIONS = [
  { value: "KM_BLR", label: "KM BLR" },
  { value: "KM_TCR", label: "KM TCR" },
  { value: "KM_KMLY", label: "KM KMLY" },
  { value: "_none", label: "No office set" },
];

function ClientCard({ c, allowEdit, openEdit, remove }) {
  return (
    <Card key={c.id} className="p-6 border border-border bg-card rounded-lg shadow-none" data-testid={`client-card-${c.id}`}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-md bg-muted text-foreground flex items-center justify-center font-medium">
            {c.name.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-medium">{c.name}</p>
            {c.company && <p className="text-xs text-muted-foreground flex items-center gap-1"><Buildings size={12} /> {c.company}</p>}
            {c.client_type === "staff" && c.office && <p className="text-xs text-muted-foreground flex items-center gap-1"><Buildings size={12} /> {c.office.replace("KM_", "KM ")}</p>}
          </div>
        </div>
        <div className="flex gap-1">
          {allowEdit && <button onClick={() => openEdit(c)} data-testid={`edit-cli-${c.id}`} className="text-muted-foreground hover:text-foreground p-1.5"><PencilSimple size={16} /></button>}
          {allowEdit && <button onClick={() => remove(c.id)} data-testid={`delete-cli-${c.id}`} className="text-muted-foreground hover:text-rose-700 dark:text-rose-400 p-1.5"><Trash size={16} /></button>}
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
        {c.client_type === "staff" && c.date_of_birth && (
          <p className="flex items-center gap-2"><Cake size={14} /> {new Date(c.date_of_birth).toLocaleDateString()}</p>
        )}
        {c.client_type === "staff" && c.eligible_incentive != null && (
          <p className="flex items-center gap-2"><CurrencyInr size={14} /> ₹{c.eligible_incentive}/admission</p>
        )}
      </div>
    </Card>
  );
}

function ClientGrid({ clients, allowEdit, openEdit, remove }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {clients.map((c) => (
        <ClientCard key={c.id} c={c} allowEdit={allowEdit} openEdit={openEdit} remove={remove} />
      ))}
    </div>
  );
}

function CategoryHeader({ label, count }) {
  return (
    <div className="flex items-center gap-3 mt-2" data-testid={`cat-header-${label.replace(/\W+/g, "_").toLowerCase()}`}>
      <h2 className="font-display text-lg font-semibold tracking-tight text-foreground">{label}</h2>
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-foreground text-[11px] font-medium">{count}</span>
      <span className="flex-1 h-px bg-border" />
    </div>
  );
}

function GroupedClients({ filter, clients, allowEdit, openEdit, remove }) {
  // When a specific type filter is selected, just show that category (with Staff sub-grouping)
  const groups = CLIENT_TYPES.map((t) => ({
    ...t,
    items: clients.filter((c) => c.client_type === t.value),
  })).filter((g) => (filter === "all" ? g.items.length > 0 : g.value === filter));

  return (
    <div className="space-y-8">
      {groups.map((g) => (
        <section key={g.value} className="space-y-4" data-testid={`cat-section-${g.value}`}>
          <CategoryHeader label={g.label} count={g.items.length} />
          {g.value === "staff" ? (
            // Sub-group staff by office
            <div className="space-y-6">
              {OFFICE_OPTIONS.map((o) => {
                const sub = g.items.filter((c) =>
                  (o.value === "_none" ? !c.office : c.office === o.value)
                );
                if (sub.length === 0) return null;
                return (
                  <div key={o.value} className="space-y-3" data-testid={`office-section-${o.value}`}>
                    <div className="flex items-center gap-2 pl-1">
                      <Buildings size={14} className="text-orange-600 dark:text-orange-400" />
                      <span className="text-xs uppercase tracking-[0.16em] font-semibold text-muted-foreground">{o.label}</span>
                      <span className="text-[10px] text-muted-foreground/70">· {sub.length}</span>
                    </div>
                    <ClientGrid clients={sub} allowEdit={allowEdit} openEdit={openEdit} remove={remove} />
                  </div>
                );
              })}
            </div>
          ) : (
            <ClientGrid clients={g.items} allowEdit={allowEdit} openEdit={openEdit} remove={remove} />
          )}
        </section>
      ))}
    </div>
  );
}
