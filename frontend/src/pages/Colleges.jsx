import React, { useEffect, useMemo, useRef, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus, PencilSimple, Trash, Buildings, MagnifyingGlass, UploadSimple,
  DownloadSimple, CheckCircle, Warning, FileCsv, User,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { COLLEGE_PLACES, placeForSelect, normalizePlace } from "@/lib/places";

const emptyForm = { name: "", courses: "", place: "", deal_with: "" };

function CollegeCard({ c, onEdit, onDelete }) {
  const COLLAPSED_COUNT = 6;
  const courses = c.courses || [];
  const [showAll, setShowAll] = React.useState(false);
  const visible = showAll ? courses : courses.slice(0, COLLAPSED_COUNT);
  const hidden = Math.max(0, courses.length - visible.length);

  return (
    <Card
      className="p-5 border border-border bg-card rounded-lg shadow-none hover:border-orange-500/40 transition-colors flex flex-col"
      data-testid={`col-card-${c.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 rounded-lg bg-amber-gradient-soft border border-amber-500/30 flex items-center justify-center shrink-0">
            <Buildings size={18} className="text-amber-700 dark:text-amber-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold truncate" data-testid={`col-name-${c.id}`}>
              {c.name}
            </h3>
            <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              {c.place && <span data-testid={`col-place-${c.id}`}>{c.place}</span>}
              {c.deal_with && (
                <>
                  {c.place && <span className="text-muted-foreground/40">·</span>}
                  <span className="flex items-center gap-1" data-testid={`col-dealwith-${c.id}`}>
                    <User size={11} weight="duotone" />
                    {c.deal_with}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => onEdit(c)}
            data-testid={`edit-col-${c.id}`}
            className="text-muted-foreground hover:text-foreground p-1.5"
            title="Edit"
          >
            <PencilSimple size={16} />
          </button>
          <button
            onClick={() => onDelete(c)}
            data-testid={`delete-col-${c.id}`}
            className="text-muted-foreground hover:text-rose-700 dark:text-rose-400 p-1.5"
            title="Delete"
          >
            <Trash size={16} />
          </button>
        </div>
      </div>
      <div className="mt-3">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1.5">
          Courses · {courses.length}
        </p>
        {courses.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">No courses listed</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 items-center">
            {visible.map((course, idx) => (
              <span
                key={`${c.id}-course-${idx}`}
                className="px-2 py-0.5 rounded-full text-[11px] bg-orange-100/60 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/20"
                title={course}
              >
                {course}
              </span>
            ))}
            {hidden > 0 && (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                data-testid={`col-show-more-${c.id}`}
                className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-card border border-border text-muted-foreground hover:border-orange-500/40 hover:text-foreground transition-colors"
              >
                + {hidden} more
              </button>
            )}
            {showAll && courses.length > COLLAPSED_COUNT && (
              <button
                type="button"
                onClick={() => setShowAll(false)}
                data-testid={`col-show-less-${c.id}`}
                className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-card border border-border text-muted-foreground hover:border-orange-500/40 hover:text-foreground transition-colors"
              >
                Show less
              </button>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function Colleges() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [placeFilter, setPlaceFilter] = useState(""); // "" = all
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [placeSelect, setPlaceSelect] = useState("");     // canonical or "Other"
  const [placeOtherText, setPlaceOtherText] = useState(""); // when "Other" is picked
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkResult, setBulkResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get("/colleges");
      setList(r.data || []);
    } catch (err) {
      console.error("[colleges] list failed:", err);
      toast.error("Could not load colleges");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setPlaceSelect("");
    setPlaceOtherText("");
    setOpen(true);
  };
  const openEdit = (c) => {
    setEditing(c);
    const norm = normalizePlace(c.place || "");
    const isCanonical = COLLEGE_PLACES.includes(norm);
    setForm({
      name: c.name || "",
      courses: (c.courses || []).join(", "),
      place: isCanonical ? norm : norm,
      deal_with: c.deal_with || "",
    });
    setPlaceSelect(isCanonical ? norm : (norm ? "Other" : ""));
    setPlaceOtherText(isCanonical ? "" : norm);
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) { toast.error("College name is required"); return; }
    // Resolve final place value from the select + free-text fallback
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
      setOpen(false);
      setForm(emptyForm);
      setEditing(null);
      load();
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Save failed");
    }
  };

  const remove = async (c) => {
    if (!window.confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/colleges/${c.id}`);
      toast.success("Deleted");
      load();
    } catch (err) {
      console.error("[colleges] delete failed:", err);
      toast.error("Delete failed");
    }
  };

  const downloadTemplate = async () => {
    try {
      const r = await api.get("/colleges/template", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([r.data], { type: "text/csv" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "colleges-template.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[colleges] template failed:", err);
      toast.error("Could not download template");
    }
  };

  const handleBulkUpload = async () => {
    if (!bulkFile) { toast.error("Pick a CSV file first"); return; }
    setUploading(true);
    setBulkResult(null);
    try {
      const fd = new FormData();
      fd.append("file", bulkFile);
      const r = await api.post("/colleges/bulk", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setBulkResult(r.data);
      if (r.data.created_count > 0) {
        toast.success(`Added ${r.data.created_count} college(s)`);
        load();
      } else {
        toast.message("Nothing to add", { description: "All rows were duplicates or blank." });
      }
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Bulk upload failed");
    } finally {
      setUploading(false);
    }
  };

  const closeBulk = () => {
    setBulkOpen(false);
    setBulkFile(null);
    setBulkResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const filtered = useMemo(() => {
    let pool = list;
    if (placeFilter) {
      if (placeFilter === "_other") {
        pool = pool.filter((c) => {
          const p = placeForSelect(c.place || "");
          return p === "Other";
        });
      } else {
        pool = pool.filter((c) =>
          (c.place || "").trim().toLowerCase() === placeFilter.toLowerCase()
        );
      }
    }
    if (!q) return pool;
    const term = q.toLowerCase();
    return pool.filter((c) =>
      (c.name || "").toLowerCase().includes(term)
      || (c.place || "").toLowerCase().includes(term)
      || (c.deal_with || "").toLowerCase().includes(term)
      || (c.courses || []).some((co) => co.toLowerCase().includes(term))
    );
  }, [list, q, placeFilter]);

  // Per-place counts for the filter chips (rendered next to each city label).
  const placeCounts = useMemo(() => {
    const counts = { _all: list.length, _other: 0 };
    for (const c of list) {
      const bucket = placeForSelect(c.place || "");
      if (bucket && bucket !== "Other" && COLLEGE_PLACES.includes(bucket)) {
        counts[bucket] = (counts[bucket] || 0) + 1;
      } else if (bucket === "Other") {
        counts._other += 1;
      }
    }
    return counts;
  }, [list]);

  // Office admins read-only — they shouldn't even land here, but defense in depth.
  if (!isSuper) {
    return (
      <div className="space-y-6 animate-fade-in" data-testid="colleges-no-access">
        <Card className="p-12 text-center text-sm text-muted-foreground border border-border bg-card shadow-none">
          <Warning size={32} className="mx-auto text-muted-foreground/50 mb-3" />
          Only super admins can manage the Colleges catalogue.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in" data-testid="colleges-page">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="label-eyebrow">Network</p>
          <h1 className="font-display text-3xl sm:text-4xl tracking-tight mt-2">Colleges</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your partner colleges. The catalogue powers the dropdown on the student admission form.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setBulkOpen(true)}
            className="h-10"
            data-testid="bulk-upload-btn"
          >
            <UploadSimple size={16} className="mr-1.5" /> Bulk upload
          </Button>
          <Button
            type="button"
            onClick={openCreate}
            className="h-10 btn-amber border-0"
            data-testid="add-college-btn"
          >
            <Plus size={16} className="mr-1.5" /> Add college
          </Button>
        </div>
      </header>

      {/* Place filter chips */}
      <div className="flex flex-wrap gap-2" data-testid="place-filter-chips">
        <button
          type="button"
          onClick={() => setPlaceFilter("")}
          data-testid="place-chip-all"
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
            placeFilter === ""
              ? "bg-amber-gradient text-white border-transparent"
              : "bg-card border-border text-muted-foreground hover:border-orange-500/40 hover:text-foreground"
          }`}
        >
          All <span className="opacity-70 ml-1">{placeCounts._all || 0}</span>
        </button>
        {COLLEGE_PLACES.map((city) => (
          <button
            key={city}
            type="button"
            onClick={() => setPlaceFilter(city)}
            data-testid={`place-chip-${city.toLowerCase()}`}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              placeFilter === city
                ? "bg-amber-gradient text-white border-transparent"
                : "bg-card border-border text-muted-foreground hover:border-orange-500/40 hover:text-foreground"
            }`}
          >
            {city} <span className="opacity-70 ml-1">{placeCounts[city] || 0}</span>
          </button>
        ))}
        {placeCounts._other > 0 && (
          <button
            type="button"
            onClick={() => setPlaceFilter("_other")}
            data-testid="place-chip-other"
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors border ${
              placeFilter === "_other"
                ? "bg-amber-gradient text-white border-transparent"
                : "bg-card border-border text-muted-foreground hover:border-orange-500/40 hover:text-foreground"
            }`}
          >
            Other <span className="opacity-70 ml-1">{placeCounts._other}</span>
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/70" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, place, course, or deal-with"
          className="pl-9 bg-card"
          data-testid="college-search"
        />
      </div>

      {loading ? (
        <Card className="p-12 text-center text-sm text-muted-foreground border border-border bg-card shadow-none">
          Loading…
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-sm text-muted-foreground border border-border bg-card shadow-none" data-testid="empty-colleges">
          <Buildings size={32} className="mx-auto text-muted-foreground/50 mb-3" />
          {list.length === 0
            ? "No colleges yet. Add your first or upload a CSV."
            : "No colleges match this search."}
        </Card>
      ) : (
        <>
          <p className="label-eyebrow" data-testid="colleges-count-eyebrow">
            {filtered.length} {filtered.length === 1 ? "college" : "colleges"}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start" data-testid="colleges-grid">
            {filtered.map((c) => (
              <CollegeCard key={c.id} c={c} onEdit={openEdit} onDelete={remove} />
            ))}
          </div>
        </>
      )}

      {/* Add / Edit dialog */}
      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(emptyForm); setEditing(null); } }}>
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
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" className="btn-amber border-0" data-testid="col-save-btn">
                {editing ? "Save changes" : "Add college"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk upload dialog */}
      <Dialog open={bulkOpen} onOpenChange={(v) => v ? setBulkOpen(true) : closeBulk()}>
        <DialogContent className="bg-card max-w-lg" data-testid="bulk-dialog">
          <DialogHeader>
            <DialogTitle className="font-display">Bulk upload colleges</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Upload a CSV with columns <code className="px-1 py-0.5 rounded bg-muted text-foreground">name</code>,{" "}
              <code className="px-1 py-0.5 rounded bg-muted text-foreground">courses</code>,{" "}
              <code className="px-1 py-0.5 rounded bg-muted text-foreground">place</code>. Duplicates are skipped automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-gradient-soft p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-sm">
                <FileCsv size={20} className="text-amber-700 dark:text-amber-400" />
                <span className="text-foreground">Need a template?</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={downloadTemplate}
                data-testid="download-template-btn"
                className="h-8"
              >
                <DownloadSimple size={14} className="mr-1" /> Sample CSV
              </Button>
            </div>

            <div>
              <Label>CSV file</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => { setBulkFile(e.target.files?.[0] || null); setBulkResult(null); }}
                data-testid="bulk-file-input"
                className="block w-full text-sm text-foreground file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-amber-gradient file:text-white file:cursor-pointer mt-1.5"
              />
              {bulkFile && (
                <p className="text-xs text-muted-foreground mt-2" data-testid="bulk-file-name">
                  Selected: <span className="text-foreground">{bulkFile.name}</span>
                  {" "}({(bulkFile.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </div>

            {bulkResult && (
              <div
                className="rounded-lg border border-border bg-muted/40 p-3 space-y-2 text-sm"
                data-testid="bulk-result"
              >
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle size={16} weight="fill" />
                  <span><strong>{bulkResult.created_count}</strong> college(s) added</span>
                </div>
                {bulkResult.duplicates_count > 0 && (
                  <div className="flex items-start gap-2 text-amber-700 dark:text-amber-400">
                    <Warning size={16} weight="fill" className="mt-0.5 shrink-0" />
                    <span>
                      <strong>{bulkResult.duplicates_count}</strong> duplicate(s) skipped
                      {bulkResult.duplicates_sample?.length > 0 && (
                        <span className="text-muted-foreground"> — e.g. {bulkResult.duplicates_sample.slice(0, 3).join(", ")}</span>
                      )}
                    </span>
                  </div>
                )}
                {bulkResult.skipped_blank_rows?.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Skipped {bulkResult.skipped_blank_rows.length} blank row(s).
                  </p>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeBulk}>
              {bulkResult ? "Done" : "Cancel"}
            </Button>
            <Button
              type="button"
              onClick={handleBulkUpload}
              disabled={!bulkFile || uploading}
              className="btn-amber border-0"
              data-testid="bulk-submit-btn"
            >
              <UploadSimple size={14} className="mr-1.5" />
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
