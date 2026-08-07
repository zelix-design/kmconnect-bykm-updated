import React, { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import api from "@/lib/api";
import CrmAnalytics from "@/components/office-dashboard/CrmAnalytics";
import CampaignsPanel from "@/components/leads/CampaignsPanel";
import LeadsPipeline from "@/components/leads/LeadsPipeline";
import TodayVisitsPanel from "@/components/leads/TodayVisitsPanel";
import LeadDetailDialog from "@/components/leads/LeadDetailDialog";
import StaffPerformancePanel from "@/components/leads/StaffPerformancePanel";

export default function Leads() {
  const { user } = useAuth();
  const isStaff = user?.role === "staff";
  const [params, setParams] = useSearchParams();
  const [crmTab, setCrmTab] = useState("overview"); // overview | campaigns (admins)

  // ---- Deep-link `?lead=<id>` (notifications, Today's Visits cards) --------
  // Fetches the lead and pops the detail dialog IN-PLACE on whichever tab the
  // caller is currently viewing — no auto-switch. When the dialog closes we
  // strip the param so the URL stays clean.
  const [deepLead, setDeepLead] = useState(null);
  const [pipelineRefreshKey, setPipelineRefreshKey] = useState(0);
  const leadParam = params.get("lead");

  useEffect(() => {
    if (!leadParam) return;
    let cancelled = false;
    // Try search-by-query first (fast), then fall back to full list scan.
    api.get(`/leads`, { params: { q: leadParam } })
      .then(({ data }) => {
        if (cancelled) return;
        const hit = (data || []).find((l) => l.id === leadParam);
        if (hit) setDeepLead(hit);
        else {
          api.get(`/leads`).then(({ data: all }) => {
            if (cancelled) return;
            const h = (all || []).find((l) => l.id === leadParam);
            if (h) setDeepLead(h);
          }).catch(() => {});
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [leadParam]);

  const closeDeepLink = useCallback(() => {
    setDeepLead(null);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("lead");
      return next;
    }, { replace: true });
  }, [setParams]);

  const bumpPipeline = useCallback(() => setPipelineRefreshKey((k) => k + 1), []);

  return (
    <div className="space-y-6" data-testid="leads-page">
      {/* Header */}
      <div>
        <p className="label-eyebrow">CRM</p>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight">{isStaff ? "My Leads" : "CRM"}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isStaff ? "Your assigned prospects and follow-ups." : "Lead performance at a glance, then dive into a campaign to work its pipeline."}
        </p>
      </div>

      {isStaff ? (
        <>
          <TodayVisitsPanel user={user} />
          <LeadsPipeline user={user} refreshKey={pipelineRefreshKey} />
        </>
      ) : (
        <>
          {/* CRM tabs */}
          <div className="flex items-center gap-1 border-b border-border" data-testid="crm-tabs">
            {[["overview", "Overview"], ["campaigns", "Campaigns"], ["all", "All leads"]].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setCrmTab(k)}
                data-testid={`crm-tab-${k}`}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  crmTab === k ? "border-orange-500 text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {crmTab === "overview" ? (
            <div className="space-y-5" data-testid="crm-overview">
              <TodayVisitsPanel user={user} />
              <StaffPerformancePanel />
              <CrmAnalytics />
            </div>
          ) : crmTab === "campaigns" ? (
            <CampaignsPanel user={user} />
          ) : (
            <div data-testid="crm-all-leads">
              <LeadsPipeline user={user} allLeadsMode refreshKey={pipelineRefreshKey} />
            </div>
          )}
        </>
      )}

      {/* Shared detail dialog for deep-linked leads (notifications + Today's Visits).
          Opens ON TOP of the current tab — no auto-switch. */}
      <LeadDetailDialog
        open={!!deepLead}
        onOpenChange={(v) => { if (!v) closeDeepLink(); }}
        lead={deepLead}
        user={user}
        onChanged={() => { bumpPipeline(); }}
      />
    </div>
  );
}
