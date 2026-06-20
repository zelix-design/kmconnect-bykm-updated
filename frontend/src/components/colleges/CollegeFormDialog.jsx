import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { COLLEGE_PLACES, normalizePlace } from "@/lib/places";

const emptyForm = { name: "", courses: "", place: "", deal_with: "" };

/** Add / Edit college dialog. Owns its form state. Pass `editing=null` to add,
 * or `editing=<college>` to edit. `onSaved()` is called after a successful save
 * so the parent can refresh its list.
 */
export default function CollegeFormDialog({ open, onOpenChange, editing, onSaved }) {
  const [form, setForm] = useState(emptyForm);
  const [placeSelect, setPlaceSelect] = useState("");
  const [placeOtherText, setPlaceOtherText] = useState("");

  // Re-seed the form whenever the dialog opens (with or without an existing college).
  useEffect(() => {
    if (!open) return;
    if (editing) {
      const norm = normalizePlace(editing.place || "");
      const isCanonical = COLLEGE_PLACES.includes(norm);
      setForm({
        name: editing.name || "",
        courses: (editing.courses || []).join(", "),
        place: isCanonical ? norm : norm,
        deal_with: editing.deal_with || "",
      });
      setPlaceSelect(isCanonical ? norm : (norm ? "Other" : ""));
      setPlaceOtherText(isCanonical ? "" : norm);
    } else {
      setForm(emptyForm);
      setPlaceSelect("");
      setPlaceOtherText("");
    }
  }, [open, editing]);

  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) { toast.error("College name is required"); return; }
    const finalPlace = placeSelect === "Other"
      ? placeOtherText.trim()
      : (placeSelect || "");
    const payload = {
      name,
      courses: form.courses.split(",").map((s) => s.trim()).filter(Boolean),
      place: finalPlace,
      deal_with: form.deal_with.trim(),
    };
    try {
      if (editing) {
        await api.patch(`/colleges/${editing.id}`, payload);
        toast.success("College updated");
      } else {
        await api.post("/colleges", payload);
        toast.success("College added");
      }
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Save failed");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card max-w-lg" data-testid="college-dialog">
        <DialogHeader>
          <DialogTitle className="font-display">
            {editing ? "Edit college" : "Add college"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Add multiple courses by separating them with a comma.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>College Name *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="ABC College of Engineering"
              data-testid="col-name-input"
            />
          </div>
          <div>
            <Label>Course (comma-separated)</Label>
            <Textarea
              rows={3}
              value={form.courses}
              onChange={(e) => setForm({ ...form, courses: e.target.value })}
              placeholder="B.Tech CSE, B.Tech ECE, MBA"
              data-testid="col-courses-input"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Tip: each course separated by a comma — these show up in the student admission form.
            </p>
          </div>
          <div>
            <Label>Place</Label>
            <Select
              value={placeSelect || "_none"}
              onValueChange={(v) => {
                if (v === "_none") { setPlaceSelect(""); setPlaceOtherText(""); }
                else setPlaceSelect(v);
              }}
            >
              <SelectTrigger data-testid="col-place-select"><SelectValue placeholder="Pick a city" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">— None —</SelectItem>
                {COLLEGE_PLACES.map((city) => (
                  <SelectItem key={city} value={city}>{city}</SelectItem>
                ))}
                <SelectItem value="Other">Other…</SelectItem>
              </SelectContent>
            </Select>
            {placeSelect === "Other" && (
              <Input
                value={placeOtherText}
                onChange={(e) => setPlaceOtherText(e.target.value)}
                placeholder="Type the place name"
                className="mt-2"
                data-testid="col-place-other"
              />
            )}
          </div>
          <div>
            <Label>Deal with</Label>
            <Input
              value={form.deal_with}
              onChange={(e) => setForm({ ...form, deal_with: e.target.value })}
              placeholder='e.g. "Mr. Ravi" or "John from Krupanidhi"'
              data-testid="col-dealwith-input"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              Optional — the contact you usually liaise with at this college.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="btn-amber border-0" data-testid="col-save-btn">
              {editing ? "Save changes" : "Add college"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
