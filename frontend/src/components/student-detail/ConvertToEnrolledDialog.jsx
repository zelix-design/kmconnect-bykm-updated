import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { GraduationCap, CheckCircle } from "@phosphor-icons/react";
import { formatMoney } from "@/lib/format";

/**
 * One-click "Convert to enrolled student" dialog.
 * Opens from the Student Detail header when status === "inquiry".
 *
 * On save → PATCHes the student with status="enrolled", sc_out_fixed, and a
 * full fees_plan. Backend auto-reconciles the schedules from the fees_plan.
 */
export default function ConvertToEnrolledDialog({ open, onOpenChange, student, currency, onSave }) {
  const [sc, setSc] = useState("");
  const [y1, setY1] = useState("");
  const [y2, setY2] = useState("");
  const [y3, setY3] = useState("");
  const [y4, setY4] = useState("");
  const [hasScholarship, setHasScholarship] = useState(false);
  const [scholarship, setScholarship] = useState("");
  const [enrollmentDate, setEnrollmentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const total = ["year_1","year_2","year_3","year_4"].reduce(
    (s, _, i) => s + (parseFloat([y1, y2, y3, y4][i]) || 0), 0,
  ) - (hasScholarship ? (parseFloat(scholarship) || 0) : 0);

  const submit = async () => {
    if (!sc || parseFloat(sc) <= 0) return;
    if (!y1 || parseFloat(y1) <= 0) return;
    setSaving(true);
    try {
      await onSave({
        status: "enrolled",
        sc_out_fixed: parseFloat(sc) || 0,
        enrollment_date: enrollmentDate,
        fees_plan: {
          installment_mode: "yearly",
          package_status: "admission_tuition",
          year_1: parseFloat(y1) || 0,
          year_2: parseFloat(y2) || 0,
          year_3: parseFloat(y3) || 0,
          year_4: parseFloat(y4) || 0,
          has_scholarship: hasScholarship,
          scholarship_amount: hasScholarship ? (parseFloat(scholarship) || 0) : 0,
        },
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card max-w-2xl max-h-[92vh] overflow-y-auto" data-testid="convert-enrolled-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <GraduationCap size={18} weight="duotone" className="text-emerald-700 dark:text-emerald-400" />
            Convert {student?.name?.split(" ")[0] || "this student"} to enrolled
          </DialogTitle>
          <DialogDescription>
            Sets status → <span className="font-medium text-emerald-700 dark:text-emerald-400">Enrolled</span>, records the SC and fees plan, and auto-generates the year-wise schedules.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Service Charge (SC) earned <span className="text-rose-600">*</span></Label>
              <Input
                type="number" step="0.01" required value={sc}
                onChange={(e) => setSc(e.target.value)}
                placeholder="e.g. 75000"
                data-testid="cv-sc"
              />
            </div>
            <div>
              <Label>Enrollment date</Label>
              <Input
                type="date" value={enrollmentDate}
                onChange={(e) => setEnrollmentDate(e.target.value)}
                data-testid="cv-enrollment-date"
              />
            </div>
          </div>

          <Card className="p-4 bg-muted/30 border border-border space-y-3">
            <p className="label-eyebrow">Fees plan</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">1st Year <span className="text-rose-600">*</span></Label>
                <Input type="number" step="0.01" required value={y1} onChange={(e) => setY1(e.target.value)} placeholder="0.00" data-testid="cv-y1" />
              </div>
              <div>
                <Label className="text-xs">2nd Year</Label>
                <Input type="number" step="0.01" value={y2} onChange={(e) => setY2(e.target.value)} placeholder="0.00" data-testid="cv-y2" />
              </div>
              <div>
                <Label className="text-xs">3rd Year</Label>
                <Input type="number" step="0.01" value={y3} onChange={(e) => setY3(e.target.value)} placeholder="0.00" data-testid="cv-y3" />
              </div>
              <div>
                <Label className="text-xs">4th Year</Label>
                <Input type="number" step="0.01" value={y4} onChange={(e) => setY4(e.target.value)} placeholder="0.00" data-testid="cv-y4" />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer pt-1">
              <Checkbox checked={hasScholarship} onCheckedChange={(v) => setHasScholarship(!!v)} data-testid="cv-has-scholarship" />
              <span className="text-sm">Apply scholarship (reduces 1st-year fees + SC Earned)</span>
            </label>
            {hasScholarship && (
              <div className="pl-7">
                <Label className="text-xs">Scholarship amount</Label>
                <Input
                  type="number" step="0.01"
                  value={scholarship}
                  onChange={(e) => setScholarship(e.target.value)}
                  placeholder="0.00"
                  data-testid="cv-scholarship-amount"
                />
              </div>
            )}
          </Card>

          <div className="flex items-center justify-between rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/70 dark:border-emerald-500/30 p-3">
            <span className="text-xs text-emerald-800 dark:text-emerald-300">Total fees after scholarship</span>
            <span className="font-display text-base tabular-nums text-emerald-800 dark:text-emerald-300" data-testid="cv-total-preview">
              {formatMoney(Math.max(0, total), currency)}
            </span>
          </div>

          <p className="text-[11px] text-muted-foreground">
            After conversion the Payments tab and Schedule tab become fully active — schedules are auto-generated and any existing registration payment carries over.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            type="button"
            onClick={submit}
            disabled={saving || !sc || !y1}
            className="bg-emerald-600 hover:bg-emerald-700 text-white border-0"
            data-testid="cv-submit"
          >
            <CheckCircle size={14} className="mr-1.5" />
            {saving ? "Converting…" : "Convert to enrolled"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
