import React, { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import CrmAnalytics from "@/components/office-dashboard/CrmAnalytics";
import CampaignsPanel from "@/components/leads/CampaignsPanel";
import LeadsPipeline from "@/components/leads/LeadsPipeline";
import TodayVisitsPanel from "@/components/leads/TodayVisitsPanel";

export default function Leads() {
  const { user } = useAuth();
  const isStaff = user?.role === "staff";
  const [params] = useSearchParams();
  const [crmTab, setCrmTab] = useState("overview"); // overview | campaigns (admins)

  // Notifications + Today's Visit cards deep-link with `?lead=<id>` — force
  // the "All leads" tab where LeadsPipeline can pick up the query param and
  // pop open the detail dialog.
  useEffect(() => {
    if (params.get("lead") && !isStaff) setCrmTab("all");
  }, [params, isStaff]);

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
          <LeadsPipeline user={user} />
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
              <CrmAnalytics />
            </div>
          ) : crmTab === "campaigns" ? (
            <CampaignsPanel user={user} />
          ) : (
            <div data-testid="crm-all-leads">
              <LeadsPipeline user={user} allLeadsMode />
            </div>
          )}
        </>
      )}
    </div>
  );
}
