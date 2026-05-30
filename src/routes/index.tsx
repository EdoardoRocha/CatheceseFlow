import { Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { usePageTitle } from "@/hooks/use-page-title";

export function IndexPage() {
  usePageTitle("CatheceseFlow");
  const { isReady, token } = useAuth();
  if (!isReady) return null;
  return <Navigate to={token ? "/dashboard" : "/login"} replace />;
}
