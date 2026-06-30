import React, { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  Plus, Megaphone, ArrowLeft, UploadSimple, ShareNetwork, Trash, Target, UserCheck, UsersThree, CheckCircle,
} from "@phosphor-icons/react";
import { LEAD_STATUS_META } from "./constants";
import CampaignFormDialog from "./CampaignFormDialog";
import CampaignAddLeadsDialog from "./CampaignAddLeadsDialog";
import CampaignDistributeDialog from "./CampaignDistributeDialog";
import LeadsBulkUploadDialog from "./LeadsBulkUploadDialog";

const OFFICE_LABEL = { KM_BLR: "KM BLR", KM_TCR: "KM TCR", KM_KMLY: "KM KMLY" };

function MiniStat({ icon: Icon, label, value, tone, testid }) {
  const tones = {
    amber: "bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300",
    sky: "bg-sky-50 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300",
    slate: "bg-slate-100 dark:bg-slate-500/15 text-slate-700 dark:text-slate-300",
    emerald: "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  };
  return (
    <Card className="p-3 flex items-center gap-2.5" data-testid={testid}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${tones[tone]}`}><Icon size={18} weight="duotone" /></div>
      <div><p className="text-xl font-display font-semibold leading-none">{value}</p><p className="text-[11px] text-muted-foreground mt-0.5">{label}</p></div>
    </Card>
  );
}

export default function CampaignsPanel({ user }) {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [leads, setLeads] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [distOpen, setDistOpen] = useState(false);

  const loadList = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get("/campaigns"); setList(data); }
    catch { toast.error("Could not load campaigns"); }
    finally { setLoading(false); }
  }, []);

  const loadDetail = useCallback(async (id) => {
    try {
      const [{ data: d }, { data: ls }] = await Promise.all([
        api.get(`/campaigns/${id}`),
        api.get("/leads", { params: { campaign_id: id } }),
      ]);
      setDetail(d); setLeads(ls);
    } catch { toast.error("Could not load campaign"); }
  }, []);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId, loadDetail]);

  const open = (id) => setSelectedId(id);
  const back = () => { setSelectedId(null); setDetail(null); setLeads([]); loadList(); };
  const refreshDetail = () => loadDetail(selectedId);

  const removeCampaign = async () => {
    if (!window.confirm("Delete this campaign? Its leads stay in the pipeline (untagged).")) return;
    try { await api.delete(`/campaigns/${selectedId}`); toast.success("Campaign deleted"); back(); }
    catch { toast.error("Could not delete campaign"); }
  };

  // ---- Detail view ----
  if (selectedId && detail) {
    const c = detail.campaign;
    const s = detail.stats;
    return (
      <div className="space-y-5 animate-fade-in" data-testid="campaign-detail">
        <button type="button" onClick={back} data-testid="campaign-back-btn" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={15} /> All campaigns
        </button>

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-xl sm:text-2xl font-semibold tracking-tight" data-testid="campaign-detail-name">{c.name}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{OFFICE_LABEL[c.office] || c.office}</span>
              {c.tag_type && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">{c.tag_type}: {c.tag_value}</span>}
            </div>
            {c.description && <p className="text-sm text-muted-foreground mt-1">{c.description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)} data-testid="campaign-add-leads-btn"><Plus size={15} className="mr-1" /> Add leads</Button>
            <Button variant="outline" size="sm" onClick={() => setUploadOpen(true)} data-testid="campaign-upload-btn"><UploadSimple size={15} className="mr-1" /> Upload CSV</Button>
            <Button size="sm" onClick={() => setDistOpen(true)} data-testid="campaign-distribute-btn" className="btn-amber border-0"><ShareNetwork size={15} className="mr-1" /> Distribute</Button>
            <button type="button" onClick={removeCampaign} data-testid="campaign-delete-btn" className="w-9 h-9 rounded-md flex items-center justify-center text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10 transition-colors"><Trash size={16} /></button>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniStat icon={Target} label="Total leads" value={s.total} tone="amber" testid="campaign-stat-total" />
          <MiniStat icon={UserCheck} label="Assigned" value={s.assigned} tone="sky" testid="campaign-stat-assigned" />
          <MiniStat icon={UsersThree} label="Unassigned" value={s.unassigned} tone="slate" testid="campaign-stat-unassigned" />
          <MiniStat icon={CheckCircle} label="Converted" value={s.converted} tone="emerald" testid="campaign-stat-converted" />
        </div>

        {detail.distribution?.length > 0 && (
          <div data-testid="campaign-distribution">
            <p className="text-xs font-medium text-muted-foreground mb-2">Distribution</p>
            <div className="flex flex-wrap gap-1.5">
              {detail.distribution.map((d) => (
                <span key={d.id} className="text-xs px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">{d.name}: {d.count}</span>
              ))}
            </div>
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">Leads ({leads.length})</p>
          {leads.length === 0 ? (
            <Card className="py-10 text-center text-sm text-muted-foreground" data-testid="campaign-leads-empty">No leads yet — add or upload some, then distribute.</Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5" data-testid="campaign-leads-grid">
              {leads.map((l) => {
                const meta = LEAD_STATUS_META[l.status] || LEAD_STATUS_META.new;
                return (
                  <div key={l.id} className="rounded-xl border border-border bg-card p-3" data-testid={`campaign-lead-${l.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-foreground truncate text-sm">{l.name}</p>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${meta.cls}`}>{meta.label}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                      {l.course && <span className="text-muted-foreground">{l.course}</span>}
                      {l.assigned_to_name
                        ? <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">{l.assigned_to_name}</span>
                        : <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Unassigned</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <CampaignAddLeadsDialog open={addOpen} onOpenChange={setAddOpen} campaignId={selectedId} onAdded={refreshDetail} />
        <LeadsBulkUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} onUploaded={refreshDetail} user={user} campaignId={selectedId} />
        <CampaignDistributeDialog open={distOpen} onOpenChange={setDistOpen} campaignId={selectedId} employees={detail.employees} stats={s} onDistributed={refreshDetail} />
      </div>
    );
  }

  // ---- List view ----
  return (
    <div className="space-y-5 animate-fade-in" data-testid="campaigns-panel">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Group leads into campaigns and distribute them to your team.</p>
        <Button onClick={() => setCreateOpen(true)} data-testid="campaign-create-btn" className="btn-amber border-0"><Plus size={16} className="mr-1.5" /> Create campaign</Button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground text-sm">Loading campaigns…</div>
      ) : list.length === 0 ? (
        <Card className="py-16 text-center" data-testid="campaigns-empty">
          <Megaphone size={40} className="mx-auto text-muted-foreground mb-3" weight="duotone" />
          <p className="text-foreground font-medium">No campaigns yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create a campaign to batch-import and distribute leads.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3" data-testid="campaigns-grid">
          {list.map((c) => (
            <button key={c.id} type="button" onClick={() => open(c.id)} data-testid={`campaign-card-${c.id}`}
              className="text-left rounded-xl border border-border bg-card p-4 hover:border-orange-500/40 hover:shadow-md transition-all">
              <div className="flex items-start justify-between gap-2">
                <p className="font-medium text-foreground truncate">{c.name}</p>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">{OFFICE_LABEL[c.office] || c.office}</span>
              </div>
              {c.tag_type && <span className="inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-300">{c.tag_type}: {c.tag_value}</span>}
              {c.description && <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{c.description}</p>}
              <div className="mt-3 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span><strong className="text-foreground">{c.stats.total}</strong> leads</span>
                <span><strong className="text-foreground">{c.stats.assigned}</strong> assigned</span>
                <span><strong className="text-foreground">{c.stats.unassigned}</strong> unassigned</span>
              </div>
            </button>
          ))}
        </div>
      )}

      <CampaignFormDialog open={createOpen} onOpenChange={setCreateOpen} user={user} onSaved={(c) => { loadList(); open(c.id); }} />
    </div>
  );
}
