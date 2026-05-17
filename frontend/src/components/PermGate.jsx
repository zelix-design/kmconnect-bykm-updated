import React, { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { canView } from "@/lib/perm";
import { toast } from "sonner";

/**
 * Wrap a protected route's element with <PermGate page="students">.
 * When the current user has `none` access on that page, redirects to /
 * with a friendly toast. Super admins always pass.
 */
export default function PermGate({ page, children }) {
  const { user } = useAuth();
  const location = useLocation();
  const allowed = !user || user === false || canView(user, page);

  useEffect(() => {
    if (user && user !== false && !allowed) {
      toast.error(`You don't have access to this page anymore.`);
    }
  }, [user, allowed]);

  if (user && user !== false && !allowed) {
    return <Navigate to="/" replace state={{ from: location.pathname }} />;
  }
  return children;
}
