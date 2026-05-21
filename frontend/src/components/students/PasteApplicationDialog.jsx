import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ClipboardText, MagicWand, ArrowLeft, CheckCircle, User, Books,
  Phone, GraduationCap, Sparkle,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { parseStudentText, buildApplicationPayload } from "@/lib/parseStudentText";
import CollegeSelect from "@/components/CollegeSelect";

const GENDERS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const SAMPLE = `Name of the student : Anupama V V
Student contact no : 9656592598
Course : Bse Nursing
College : Little flower
10th/12th register Number : 25213163
Sex (Male/Female) : Female
Student Email id : anuzzz393@gmail.com
Father Name: Jayan
Father Mobile number : 9497373478
Mother Name : Shiji
Mother Mobile Number : 9645705972
Address : variyath valappil
Date of birth : 25/08/2008
Aadhaar Number : 528422556658
Nationality : India
Religion : Hindu
Name of the caste : Thiyya
Hostel or Bus : Hostel
10th school name and place : SNDP school udayanperoor (tripunithura)
10th Mark : 80%
+2 Register Number : 25213163
+2 School name : GMRHSS THRITHALA
+2 Mark : 78%`;

function Field({ label, children, required, wide }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label} {required && <span className="text-rose-500">*</span>}
      </Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function SectionHead({ icon: Icon, title, eyebrow }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="w-8 h-8 rounded-md bg-amber-gradient-soft border border-amber-500/30 flex items-center justify-center">
        <Icon size={15} className="text-amber-700 dark:text-amber-400" />
      </span>
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">{eyebrow}</p>
        <h3 className="font-display text-base font-semibold leading-tight">{title}</h3>
      </div>
    </div>
  );
}

export default function PasteApplicationDialog({ open, onOpenChange, onCreated }) {
  const nav = useNavigate();
  const [step, setStep] = useState("paste"); // 'paste' | 'review'
  const [rawText, setRawText] = useState("");
  const [parsed, setParsed] = useState(null);
  const [unmatched, setUnmatched] = useState([]);
  const [saving, setSaving] = useState(false);

  const reset = () => { setStep("paste"); setRawText(""); setParsed(null); setUnmatched([]); };
  const close = () => { reset(); onOpenChange?.(false); };

  const doParse = () => {
    const text = rawText.trim();
    if (!text) { toast.error("Paste the student details first"); return; }
    const out = parseStudentText(text);
    if (!out.basic_info.student_full_name) {
      toast.error("Could not detect a student name — please check the format");
      return;
    }
    setUnmatched(out._meta?.unmatched || []);
    setParsed(out);
    setStep("review");
  };

  const setBI = (k, v) => setParsed((p) => ({ ...p, basic_info: { ...p.basic_info, [k]: v } }));
  const setCO = (k, v) => setParsed((p) => ({ ...p, course: { ...p.course, [k]: v } }));
  const setCM = (k, v) => setParsed((p) => ({ ...p, communication: { ...p.communication, [k]: v } }));
  const setAC = (block, k, v) => setParsed((p) => ({
    ...p, academic: { ...p.academic, [block]: { ...p.academic[block], [k]: v } },
  }));

  const validate = () => {
    const errors = [];
    if (!parsed.basic_info.student_full_name?.trim()) errors.push("Student name is required");
    if (!parsed.basic_info.mobile_number?.trim()) errors.push("Student mobile is required");
    if (!parsed.basic_info.email?.trim()) errors.push("Email is required");
    if (!parsed.basic_info.date_of_birth?.trim()) errors.push("Date of birth is required");
    if (!parsed.course.interested_course?.trim()) errors.push("Course is required");
    if (!parsed.communication.father_name?.trim()) errors.push("Father's name is required");
    if (!parsed.communication.father_mobile?.trim()) errors.push("Father's mobile is required");
    if (!parsed.communication.address_line_1?.trim()) errors.push("Address is required");
    if (!parsed.communication.city?.trim()) errors.push("City is required");
    if (!parsed.communication.pincode?.trim()) errors.push("Pincode is required");
    return errors;
  };

  const save = async () => {
    const errors = validate();
    if (errors.length) { errors.forEach((e) => toast.error(e)); return; }
    setSaving(true);
    try {
      const payload = buildApplicationPayload(parsed);
      const { data } = await api.post("/applications/admin", payload);
      toast.success("Student enrolled as Inquiry");
      onCreated?.(data);
      close();
      if (data?.id) nav(`/students/${data.id}`);
    } catch (err) {
      const detail = err?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Save failed");
      console.error("[paste-app] save:", err);
    } finally {
      setSaving(false);
    }
  };

  const fieldCount = useMemo(() => {
    if (!parsed) return 0;
    const bi = parsed.basic_info;
    const co = parsed.course;
    const cm = parsed.communication;
    const ac = parsed.academic;
    return [
      bi.student_full_name, bi.mobile_number, bi.email, bi.date_of_birth, bi.gender,
      bi.aadhaar_number, bi.nationality, bi.religion, bi.caste,
      co.interested_course, co.preferred_college,
      cm.father_name, cm.father_mobile, cm.mother_name, cm.mother_mobile,
      cm.address_line_1, cm.city, cm.pincode,
      ac.tenth.register_number, ac.tenth.school_name, ac.tenth.percentage,
      ac.twelfth.register_number, ac.twelfth.school_name, ac.twelfth.percentage,
    ].filter((v) => String(v || "").trim().length > 0).length;
  }, [parsed]);

  return (
    <Dialog open={open} onOpenChange={(v) => v ? onOpenChange?.(true) : close()}>
      <DialogContent
        className="bg-card max-w-3xl max-h-[92vh] overflow-y-auto"
        data-testid="paste-app-dialog"
      >
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <ClipboardText size={20} className="text-amber-600 dark:text-amber-400" />
            {step === "paste" ? "Paste student application" : "Review & confirm"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {step === "paste"
              ? "Paste the application text you received — we'll auto-detect every field."
              : `${fieldCount} fields auto-detected · adjust anything that needs a fix, then save as an Inquiry.`}
          </DialogDescription>
        </DialogHeader>

        {step === "paste" ? (
          <div className="space-y-4">
            <div>
              <Label>Application text</Label>
              <Textarea
                rows={14}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder={SAMPLE}
                data-testid="paste-textarea"
                className="font-mono text-xs mt-1.5"
              />
              <div className="flex items-center justify-between mt-2">
                <p className="text-[11px] text-muted-foreground">
                  Tip: format is <code className="px-1 rounded bg-muted">Key : Value</code> per line — most spellings are accepted.
                </p>
                <button
                  type="button"
                  onClick={() => setRawText(SAMPLE)}
                  data-testid="paste-load-sample"
                  className="text-[11px] text-amber-700 dark:text-amber-400 hover:underline"
                >
                  Load sample
                </button>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <Button
                type="button"
                onClick={doParse}
                disabled={!rawText.trim()}
                className="btn-amber border-0"
                data-testid="paste-parse-btn"
              >
                <MagicWand size={15} className="mr-1.5" /> Parse details
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="rounded-lg border border-amber-500/30 bg-amber-gradient-soft p-3 flex items-start gap-2.5">
              <Sparkle size={16} weight="fill" className="text-amber-700 dark:text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs text-foreground">
                <strong>{fieldCount} fields auto-detected.</strong> Review each section, edit anything that looks off, then click <strong>Save as Inquiry</strong>.
                The student will land in the Students page with full application data — you can convert to Enrolled later.
              </div>
            </div>

            {/* Section A — Basic info */}
            <div>
              <SectionHead icon={User} eyebrow="Section A" title="Candidate" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Student name" required wide>
                  <Input value={parsed.basic_info.student_full_name} onChange={(e) => setBI("student_full_name", e.target.value)} data-testid="pa-name" />
                </Field>
                <Field label="Mobile" required>
                  <Input value={parsed.basic_info.mobile_number} onChange={(e) => setBI("mobile_number", e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit" data-testid="pa-mobile" />
                </Field>
                <Field label="Email" required>
                  <Input type="email" value={parsed.basic_info.email} onChange={(e) => setBI("email", e.target.value)} data-testid="pa-email" />
                </Field>
                <Field label="Date of birth" required>
                  <Input type="date" value={parsed.basic_info.date_of_birth} onChange={(e) => setBI("date_of_birth", e.target.value)} data-testid="pa-dob" />
                </Field>
                <Field label="Gender">
                  <Select value={parsed.basic_info.gender || "male"} onValueChange={(v) => setBI("gender", v)}>
                    <SelectTrigger data-testid="pa-gender"><SelectValue /></SelectTrigger>
                    <SelectContent>{GENDERS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Aadhaar number">
                  <Input value={parsed.basic_info.aadhaar_number} onChange={(e) => setBI("aadhaar_number", e.target.value)} data-testid="pa-aadhaar" />
                </Field>
                <Field label="Nationality">
                  <Input value={parsed.basic_info.nationality} onChange={(e) => setBI("nationality", e.target.value)} data-testid="pa-nationality" />
                </Field>
                <Field label="Religion">
                  <Input value={parsed.basic_info.religion} onChange={(e) => setBI("religion", e.target.value)} data-testid="pa-religion" />
                </Field>
                <Field label="Caste">
                  <Input value={parsed.basic_info.caste} onChange={(e) => setBI("caste", e.target.value)} data-testid="pa-caste" />
                </Field>
              </div>
            </div>

            {/* Section B — Course */}
            <div>
              <SectionHead icon={Books} eyebrow="Section B" title="Course" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Interested course" required>
                  <Input value={parsed.course.interested_course} onChange={(e) => setCO("interested_course", e.target.value)} data-testid="pa-course" />
                </Field>
                <Field label="Preferred college">
                  <CollegeSelect
                    value={parsed.course.preferred_college}
                    onChange={(name) => setCO("preferred_college", name)}
                    testid="pa-college"
                    placeholder="Pick a college"
                  />
                </Field>
                <Field label="Academic year">
                  <Input value={parsed.course.academic_year} onChange={(e) => setCO("academic_year", e.target.value)} placeholder="e.g. 2026-2027" data-testid="pa-year" />
                </Field>
                <Field label="Admission type">
                  <Select value={parsed.course.admission_type || "management"} onValueChange={(v) => setCO("admission_type", v)}>
                    <SelectTrigger data-testid="pa-admtype"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="management">Management</SelectItem>
                      <SelectItem value="government">Government</SelectItem>
                      <SelectItem value="merit">Merit</SelectItem>
                      <SelectItem value="lateral_entry">Lateral Entry</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>

            {/* Section C — Parents & Address */}
            <div>
              <SectionHead icon={Phone} eyebrow="Section C" title="Parents & Address" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Father's name" required>
                  <Input value={parsed.communication.father_name} onChange={(e) => setCM("father_name", e.target.value)} data-testid="pa-fname" />
                </Field>
                <Field label="Father's mobile" required>
                  <Input value={parsed.communication.father_mobile} onChange={(e) => setCM("father_mobile", e.target.value.replace(/\D/g, "").slice(0, 10))} data-testid="pa-fmob" />
                </Field>
                <Field label="Mother's name">
                  <Input value={parsed.communication.mother_name} onChange={(e) => setCM("mother_name", e.target.value)} data-testid="pa-mname" />
                </Field>
                <Field label="Mother's mobile">
                  <Input value={parsed.communication.mother_mobile} onChange={(e) => setCM("mother_mobile", e.target.value.replace(/\D/g, "").slice(0, 10))} data-testid="pa-mmob" />
                </Field>
                <Field label="Address line 1" required wide>
                  <Input value={parsed.communication.address_line_1} onChange={(e) => setCM("address_line_1", e.target.value)} data-testid="pa-addr1" />
                </Field>
                <Field label="Address line 2" wide>
                  <Input value={parsed.communication.address_line_2} onChange={(e) => setCM("address_line_2", e.target.value)} data-testid="pa-addr2" />
                </Field>
                <Field label="City" required>
                  <Input value={parsed.communication.city} onChange={(e) => setCM("city", e.target.value)} data-testid="pa-city" />
                </Field>
                <Field label="State">
                  <Input value={parsed.communication.state} onChange={(e) => setCM("state", e.target.value)} data-testid="pa-state" />
                </Field>
                <Field label="Pincode" required>
                  <Input value={parsed.communication.pincode} onChange={(e) => setCM("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))} data-testid="pa-pincode" />
                </Field>
              </div>
            </div>

            {/* Section D — Academic */}
            <div>
              <SectionHead icon={GraduationCap} eyebrow="Section D" title="Academic" />
              <div className="space-y-3">
                <div className="rounded-md border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">10th Standard</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Register no.">
                      <Input value={parsed.academic.tenth.register_number} onChange={(e) => setAC("tenth", "register_number", e.target.value)} data-testid="pa-10-reg" />
                    </Field>
                    <Field label="School name" wide>
                      <Input value={parsed.academic.tenth.school_name} onChange={(e) => setAC("tenth", "school_name", e.target.value)} data-testid="pa-10-school" />
                    </Field>
                    <Field label="Percentage">
                      <Input value={parsed.academic.tenth.percentage} onChange={(e) => setAC("tenth", "percentage", e.target.value)} placeholder="e.g. 80" data-testid="pa-10-mark" />
                    </Field>
                    <Field label="Board">
                      <Input value={parsed.academic.tenth.board} onChange={(e) => setAC("tenth", "board", e.target.value)} data-testid="pa-10-board" />
                    </Field>
                    <Field label="Year of passing">
                      <Input value={parsed.academic.tenth.year_of_passing} onChange={(e) => setAC("tenth", "year_of_passing", e.target.value)} data-testid="pa-10-year" />
                    </Field>
                  </div>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">+2 / 12th Standard</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Field label="Register no.">
                      <Input value={parsed.academic.twelfth.register_number} onChange={(e) => setAC("twelfth", "register_number", e.target.value)} data-testid="pa-12-reg" />
                    </Field>
                    <Field label="School name" wide>
                      <Input value={parsed.academic.twelfth.school_name} onChange={(e) => setAC("twelfth", "school_name", e.target.value)} data-testid="pa-12-school" />
                    </Field>
                    <Field label="Percentage">
                      <Input value={parsed.academic.twelfth.percentage} onChange={(e) => setAC("twelfth", "percentage", e.target.value)} data-testid="pa-12-mark" />
                    </Field>
                    <Field label="Board">
                      <Input value={parsed.academic.twelfth.board} onChange={(e) => setAC("twelfth", "board", e.target.value)} data-testid="pa-12-board" />
                    </Field>
                    <Field label="Year of passing">
                      <Input value={parsed.academic.twelfth.year_of_passing} onChange={(e) => setAC("twelfth", "year_of_passing", e.target.value)} data-testid="pa-12-year" />
                    </Field>
                  </div>
                </div>
              </div>
            </div>

            {unmatched.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/10 p-3 text-xs" data-testid="paste-unmatched">
                <p className="font-semibold text-amber-800 dark:text-amber-300 mb-1.5">Could not auto-map these lines:</p>
                <ul className="space-y-0.5 text-foreground/80">
                  {unmatched.slice(0, 6).map((u, i) => <li key={`um-${i}`}>• {u}</li>)}
                  {unmatched.length > 6 && <li className="text-muted-foreground">…and {unmatched.length - 6} more</li>}
                </ul>
              </div>
            )}

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("paste")}
                data-testid="paste-back-btn"
              >
                <ArrowLeft size={14} className="mr-1.5" /> Back to paste
              </Button>
              <div className="flex-1" />
              <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              <Button
                type="button"
                onClick={save}
                disabled={saving}
                className="btn-amber border-0"
                data-testid="paste-save-btn"
              >
                <CheckCircle size={14} className="mr-1.5" /> {saving ? "Saving…" : "Save as Inquiry"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
