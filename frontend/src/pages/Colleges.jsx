import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  Plus, Buildings, MagnifyingGlass, UploadSimple, Warning, Trash, X, DownloadSimple,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { COLLEGE_PLACES, placeForSelect } from "@/lib/places";

import CollegeCard from "@/components/colleges/CollegeCard";
import CollegeFormDialog from "@/components/colleges/CollegeFormDialog";
import BulkUploadDialog from "@/components/colleges/BulkUploadDialog";

export default function Colleges() {
  const { user } = useAuth();
  const isSuper = user?.role === "super_admin";
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [placeFilter, setPlaceFilter] = useState(""); // "" = all
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);

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

  // Deep-link: ?add=1 (from the mobile bottom-nav "+" Quick Add menu) auto-opens
  // the Add college dialog.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    if (searchParams.get("add") === "1") {
      setEditing(null);
      setOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("add");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const openCreate = () => { setEditing(null); setOpen(true); };
  const openEdit = (c) => { setEditing(c); setOpen(true); };

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

  // ---- Multi-select + bulk actions ----
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const toggleSel = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const clearSel = () => setSelectedIds(new Set());

  const bulkDelete = async () => {
    setBulkBusy(true);
    try {
      await Promise.all([...selectedIds].map((id) => api.delete(`/colleges/${id}`)));
      toast.success(`Deleted ${selectedIds.size} college${selectedIds.size > 1 ? "s" : ""}`);
      clearSel();
      setConfirmBulkDelete(false);
      load();
    } catch {
      toast.error("Some colleges could not be deleted");
      load();
    } finally { setBulkBusy(false); }
  };

  // Download selected colleges as an Excel (.xls) workbook.
  const downloadExcel = (rows) => {
    const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const header = ["Name", "Place", "Deal With", "Courses", "SC Rates"];
    const trs = rows.map((c) => {
      const courses = (c.courses || []).join(", ");
      const sc = c.sc_rates && typeof c.sc_rates === "object"
        ? Object.entries(c.sc_rates).map(([k, v]) => `${k}: ${v}`).join("; ")
        : "";
      return `<tr><td>${esc(c.name)}</td><td>${esc(c.place)}</td><td>${esc(c.deal_with)}</td><td>${esc(courses)}</td><td>${esc(sc)}</td></tr>`;
    }).join("");
    const html = `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table border="1"><tr>${header.map((h) => `<th>${h}</th>`).join("")}</tr>${trs}</table></body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `colleges-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  };

  const filtered = useMemo(() => {
    let pool = list;
    if (placeFilter) {
      if (placeFilter === "_other") {
        pool = pool.filter((c) => placeForSelect(c.place || "") === "Other");
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

  const filteredIds = useMemo(() => filtered.map((c) => c.id), [filtered]);
  const allSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(filteredIds));
  // Drop selections no longer visible after a filter/search change.
  useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(filteredIds);
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filteredIds]);

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
              <CollegeCard
                key={c.id} c={c} onEdit={openEdit} onDelete={remove}
                selectable={isSuper}
                selected={selectedIds.has(c.id)}
                onToggleSelect={toggleSel}
              />
            ))}
          </div>
        </>
      )}

      <CollegeFormDialog
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        editing={editing}
        onSaved={load}
      />

      <BulkUploadDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        onUploaded={load}
      />

      {/* Bulk action bar (portaled so `fixed` pins to the viewport) */}
      {isSuper && selectedIds.size > 0 && createPortal(
        <div
          className="fixed bottom-24 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 sm:gap-3 flex-wrap justify-center bg-card border border-border shadow-xl rounded-full px-3 sm:px-4 py-2 max-w-[95vw]"
          data-testid="colleges-bulk-bar"
        >
          <span className="text-sm font-semibold text-foreground whitespace-nowrap" data-testid="colleges-bulk-count">
            {selectedIds.size} selected
          </span>
          <Button variant="outline" size="sm" className="h-9 rounded-full" onClick={toggleSelectAll} data-testid="colleges-select-all-btn">
            {allSelected ? "Clear all" : `Select all (${filteredIds.length})`}
          </Button>
          <Button variant="outline" size="sm" className="h-9 rounded-full" onClick={() => downloadExcel(filtered.filter((c) => selectedIds.has(c.id)))} data-testid="colleges-bulk-export-btn">
            <DownloadSimple size={15} className="mr-1.5" /> Excel
          </Button>
          <Button variant="destructive" size="sm" className="h-9 rounded-full" onClick={() => setConfirmBulkDelete(true)} disabled={bulkBusy} data-testid="colleges-bulk-delete-btn">
            <Trash size={15} className="mr-1.5" /> Delete
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" onClick={clearSel} disabled={bulkBusy} data-testid="colleges-bulk-clear-btn" aria-label="Clear selection">
            <X size={16} />
          </Button>
        </div>,
        document.body
      )}

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent data-testid="colleges-bulk-delete-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} college{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={bulkDelete} disabled={bulkBusy} className="bg-rose-600 hover:bg-rose-700" data-testid="colleges-bulk-delete-confirm-btn">
              {bulkBusy ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
