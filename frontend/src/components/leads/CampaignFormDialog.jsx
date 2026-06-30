import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

const OFFICES = [["KM_BLR", "KM BLR"], ["KM_TCR", "KM TCR"], ["KM_KMLY", "KM KMLY"]];
const TAG_TYPES = [["none", "No tag"], ["course", "Course"], ["place", "Place"], ["source", "Source"]];

const empty = { name: "", description: "", tag_type: "none", tag_value: "", office: "KM_BLR" };

export default function CampaignFormDialog({ open, onOpenChange, onSaved, user }) {
  const isSuper = user?.role === "super_admin";
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setForm({ ...empty, office: isSuper ? "KM_BLR" : (user?.office || "KM_BLR") }); }, [open, isSuper, user?.office]);

  const handle = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Campaign name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        tag_type: form.tag_type === "none" ? null : form.tag_type,
        tag_value: form.tag_type === "none" ? "" : form.tag_value.trim(),
      };
      if (isSuper) payload.office = form.office;
      const { data } = await api.post("/campaigns", payload);
      toast.success("Campaign created");
      onSaved?.(data);
      onOpenChange(false);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Could not create campaign");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card max-w-md" data-testid="campaign-form-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">Create campaign</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">Group a batch of leads, then distribute them to your team.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="camp-name">Name</Label>
            <Input id="camp-name" data-testid="campaign-name-input" value={form.name} onChange={handle("name")} placeholder="e.g. June Engineering Drive" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="camp-desc">Description</Label>
            <Textarea id="camp-desc" data-testid="campaign-desc-input" value={form.description} onChange={handle("description")} placeholder="Optional notes about this campaign" rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tag type</Label>
              <Select value={form.tag_type} onValueChange={(v) => setForm((f) => ({ ...f, tag_type: v }))}>
                <SelectTrigger data-testid="campaign-tagtype-select" className="bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TAG_TYPES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.tag_type !== "none" && (
              <div className="space-y-1.5">
                <Label htmlFor="camp-tagval">Tag value</Label>
                <Input id="camp-tagval" data-testid="campaign-tagvalue-input" value={form.tag_value} onChange={handle("tag_value")} placeholder="e.g. B.Tech" />
              </div>
            )}
          </div>
          {isSuper ? (
            <div className="space-y-1.5">
              <Label>Target office</Label>
              <Select value={form.office} onValueChange={(v) => setForm((f) => ({ ...f, office: v }))}>
                <SelectTrigger data-testid="campaign-office-select" className="bg-card"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OFFICES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Office: <span className="text-foreground font-medium">{user?.office?.replace("KM_", "KM ")}</span></p>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={saving} data-testid="campaign-save-btn" className="btn-amber border-0">
            {saving ? "Creating…" : "Create campaign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
