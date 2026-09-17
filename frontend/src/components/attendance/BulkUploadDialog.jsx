import React, { useRef, useState } from "react";
import api, { formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UploadSimple, DownloadSimple, FileCsv } from "@phosphor-icons/react";

const TEMPLATES = {
  attendance: {
    header: "email,date,status,check_in,check_out",
    sample: "staff@example.com,2026-06-01,present,10:05,19:00\nstaff@example.com,2026-06-02,leave,,",
    hint: "Columns: email (or user_id), date (YYYY-MM-DD), status (present/late/half_day/absent/leave/weekoff), check_in, check_out (HH:MM, optional).",
  },
  salaries: {
    header: "email,monthly_salary",
    sample: "staff@example.com,28000",
    hint: "Columns: email (or user_id), monthly_salary.",
  },
};

function downloadTemplate(kind) {
  const t = TEMPLATES[kind];
  const blob = new Blob([`${t.header}\n${t.sample}\n`], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${kind}-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BulkUploadDialog({ open, onOpenChange, onDone }) {
  const [kind, setKind] = useState("attendance");
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCsv(await f.text());
    toast.success(`Loaded ${f.name}`);
  };

  const submit = async () => {
    if (!csv.trim()) return toast.error("Paste or choose a CSV first");
    setBusy(true);
    setResult(null);
    try {
      const { data } = await api.post("/attendance/bulk", { kind, csv });
      setResult(data);
      toast.success(`${data.created} added · ${data.updated} updated${data.error_count ? ` · ${data.error_count} errors` : ""}`);
      onDone?.();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setBusy(false);
    }
  };

  const t = TEMPLATES[kind];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="bulk-upload-dialog" className="max-w-lg">
        <DialogHeader><DialogTitle>Bulk upload</DialogTitle></DialogHeader>
        <div className="space-y-4 py-1">
          <div className="flex gap-2">
            {["attendance", "salaries"].map((k) => (
              <button
                key={k}
                onClick={() => { setKind(k); setResult(null); }}
                data-testid={`bulk-kind-${k}`}
                className={`flex-1 h-10 rounded-md border text-sm font-medium capitalize ${kind === k ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
              >
                {k}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button onClick={() => downloadTemplate(kind)} data-testid="bulk-template" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
              <DownloadSimple size={15} /> Download {kind} template
            </button>
            <button onClick={() => fileRef.current?.click()} data-testid="bulk-file-btn" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <FileCsv size={15} /> Choose CSV file
            </button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} className="hidden" data-testid="bulk-file-input" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">CSV content</label>
            <Textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={7}
              placeholder={`${t.header}\n${t.sample}`}
              data-testid="bulk-csv"
              className="mt-1 font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground mt-1.5">{t.hint} Existing rows for the same staff + date are overwritten.</p>
          </div>
          {result && (
            <div className="rounded-lg border border-border p-3 text-sm" data-testid="bulk-result">
              <p className="text-foreground font-medium">{result.created} added · {result.updated} updated · {result.error_count} errors</p>
              {result.errors?.length > 0 && (
                <ul className="mt-1.5 text-xs text-rose-600 dark:text-rose-400 space-y-0.5 max-h-28 overflow-auto">
                  {result.errors.map((er, i) => <li key={i}>{er}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button className="btn-amber" onClick={submit} disabled={busy} data-testid="bulk-submit">
            <UploadSimple size={16} className="mr-1.5" /> Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
