import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    "rounded-md px-2 py-1 text-muted-foreground hover:bg-accent hover:text-foreground",
    isActive && "bg-accent text-foreground",
  );

export function AuthenticatedLayout() {
  const { isReady, token, user, logout } = useAuth();
  const navigate = useNavigate();

  if (!isReady) return null;
  if (!token) return <Navigate to="/login" replace />;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <NavLink to="/dashboard" className="font-semibold tracking-tight">
              CatheceseFlow
            </NavLink>
            <nav className="flex items-center gap-1 text-sm">
              <NavLink to="/painel" end className={navLinkClass}>
                Painel
              </NavLink>
              <NavLink to="/dashboard" end className={navLinkClass}>
                Turmas
              </NavLink>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {user?.name}
            </span>
            <Button variant="ghost" size="sm" onClick={handleLogout} aria-label="Sair">
              <LogOut className="h-4 w-4" />
              <span className="ml-1 hidden sm:inline">Sair</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
