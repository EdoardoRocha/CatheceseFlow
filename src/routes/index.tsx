import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "CatheceseFlow" },
      { name: "description", content: "Gestão de turmas de catequese da sua paróquia." },
    ],
  }),
  component: Index,
});

function Index() {
  const { isReady, token } = useAuth();
  if (!isReady) return null;
  return <Navigate to={token ? "/dashboard" : "/login"} />;
}
