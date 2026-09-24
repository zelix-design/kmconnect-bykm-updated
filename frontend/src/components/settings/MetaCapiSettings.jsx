import React, { useEffect, useState, useCallback } from "react";
import api, { formatApiError } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { MetaLogo, CheckCircle, Warning, PaperPlaneTilt } from "@phosphor-icons/react";

const emptyForm = {
  pixel_id: "",
  access_token: "",
  test_event_code: "",
  graph_version: "v21.0",
  default_country_code: "+91",
  enabled: true,
};

export default function MetaCapiSettings() {
  const [status, setStatus] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/integrations/meta/settings");
      setStatus(data);
      setForm({
        pixel_id: data.pixel_id || "",
        access_token: "", // never returned — leave blank to keep existing
        test_event_code: data.test_event_code || "",
        graph_version: data.graph_version || "v21.0",
        default_country_code: data.default_country_code || "+91",
        enabled: data.enabled !== false,
      });
    } catch {
      setStatus({ configured: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data } = await api.put("/integrations/meta/settings", form);
      setStatus(data);
      setForm((f) => ({ ...f, access_token: "" }));
      toast.success("Meta integration saved");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Could not save");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    setTesting(true);
    try {
      const { data } = await api.post("/integrations/meta/test", {});
      toast.success(data.detail || "Test event sent — check Meta Events Manager → Test events");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Test failed");
    } finally {
      setTesting(false);
    }
  };

  if (loading) return null;

  return (
    <Card className="p-6 border border-border bg-card rounded-lg shadow-none" data-testid="meta-capi-settings">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
          <MetaLogo size={22} weight="bold" className="text-[#0866FF]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-lg font-semibold tracking-tight">Meta Conversions API</h2>
            {status?.configured ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600" data-testid="meta-configured-badge">
                <CheckCircle size={16} weight="fill" /> Configured
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-amber-600" data-testid="meta-unconfigured-badge">
                <Warning size={14} /> Not set up
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">
            Send a server-side <span className="font-medium text-foreground">Lead</span> event to Meta automatically when a lead
            converts. Email &amp; phone are SHA-256 hashed before sending.
          </p>

          <form onSubmit={save} className="mt-4 space-y-4">
            <div>
              <Label>Pixel / Dataset ID</Label>
              <Input value={form.pixel_id} onChange={set("pixel_id")} placeholder="e.g. 123456789012345"
                data-testid="meta-pixel-id" />
            </div>
            <div>
              <Label>Access Token</Label>
              <Input type="password" value={form.access_token} onChange={set("access_token")}
                placeholder={status?.has_token ? "•••••••• saved — leave blank to keep" : "Paste your Conversions API token"}
                data-testid="meta-access-token" />
              <p className="text-xs text-muted-foreground mt-1">
                From Events Manager → your dataset → Settings → Conversions API → Generate access token.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Test Event Code <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input value={form.test_event_code} onChange={set("test_event_code")} placeholder="TESTxxxxx"
                  data-testid="meta-test-event-code" />
              </div>
              <div>
                <Label>Default country code</Label>
                <Input value={form.default_country_code} onChange={set("default_country_code")} placeholder="+91"
                  data-testid="meta-country-code" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Send events automatically</p>
                <p className="text-xs text-muted-foreground">Fires once when a lead reaches “Converted”.</p>
              </div>
              <Switch checked={form.enabled} onCheckedChange={(v) => setForm({ ...form, enabled: v })}
                data-testid="meta-enabled-switch" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving} className="btn-amber border-0" data-testid="meta-save-btn">
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button type="button" variant="outline" size="default" onClick={sendTest}
                disabled={testing || !status?.configured || !form.test_event_code}
                data-testid="meta-send-test-btn">
                <PaperPlaneTilt size={15} className="mr-1.5" /> {testing ? "Sending…" : "Send test event"}
              </Button>
            </div>
            {!form.test_event_code && (
              <p className="text-xs text-muted-foreground">Add a Test Event Code above to send a test to Meta.</p>
            )}
          </form>
        </div>
      </div>
    </Card>
  );
}
