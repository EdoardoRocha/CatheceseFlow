import { Navigate, useNavigate } from "react-router-dom";
import { usePageTitle } from "@/hooks/use-page-title";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

function getErrMsg(err: unknown, fallback: string) {
  return (
    (err as { response?: { data?: { message?: string } }; message?: string })?.response?.data
      ?.message ?? fallback
  );
}

export function LoginPage() {
  usePageTitle("Entrar — CatheceseFlow");
  const { login, token, isReady } = useAuth();
  const navigate = useNavigate();

  if (isReady && token) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">CatheceseFlow</CardTitle>
          <CardDescription>Acesse ou crie sua conta de catequista</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="register">Cadastrar</TabsTrigger>
            </TabsList>
            <TabsContent value="login" className="mt-4">
              <LoginForm
                onSuccess={() => {
                  toast.success("Bem-vindo!");
                  navigate("/dashboard");
                }}
                login={login}
              />
            </TabsContent>
            <TabsContent value="register" className="mt-4">
              <RegisterForm />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function LoginForm({
  onSuccess,
  login,
}: {
  onSuccess: () => void;
  login: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      onSuccess();
    } catch (err) {
      toast.error(getErrMsg(err, "Não foi possível entrar. Verifique suas credenciais."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email">E-mail</Label>
        <Input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="login-password">Senha</Label>
        <Input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-12"
        />
      </div>
      <Button type="submit" className="h-12 w-full" disabled={loading}>
        {loading ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

type Parish = { id: number; name?: string; Name?: string };

function pickParishName(p: Parish) {
  return p.name ?? p.Name ?? `Paróquia #${p.id}`;
}

function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [parishId, setParishId] = useState<string>("");
  const [role, setRole] = useState<"Catequista" | "Coordenador" | "Admin">("Catequista");
  const [parishes, setParishes] = useState<Parish[] | null>(null);
  const [parishError, setParishError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .get("/parishes")
      .then((res) => {
        if (!alive) return;
        const list: Parish[] = Array.isArray(res.data) ? res.data : (res.data?.data ?? []);
        setParishes(list);
      })
      .catch((err) => {
        if (!alive) return;
        setParishError(getErrMsg(err, "Não foi possível carregar as paróquias."));
      });
    return () => {
      alive = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("As senhas não coincidem.");
      return;
    }
    if (!parishId) {
      toast.error("Selecione uma paróquia.");
      return;
    }
    setLoading(true);
    try {
      await api.post("/users/register", {
        name: name.trim(),
        email: email.trim(),
        password,
        confirmPassword,
        role,
        ParishId: Number(parishId),
      });
      toast.success("Cadastro realizado! Faça login para continuar.");
      setName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");
      setParishId("");
      setRole("Catequista");
    } catch (err) {
      toast.error(getErrMsg(err, "Não foi possível concluir o cadastro."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="reg-name">Nome completo</Label>
        <Input
          id="reg-name"
          type="text"
          autoComplete="name"
          required
          minLength={2}
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-12"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-email">E-mail</Label>
        <Input
          id="reg-email"
          type="email"
          autoComplete="email"
          required
          maxLength={255}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-parish">Paróquia</Label>
        <Select value={parishId} onValueChange={setParishId} disabled={!parishes}>
          <SelectTrigger id="reg-parish" className="h-12">
            <SelectValue
              placeholder={
                parishError
                  ? "Erro ao carregar"
                  : parishes
                    ? "Selecione sua paróquia"
                    : "Carregando..."
              }
            />
          </SelectTrigger>
          <SelectContent>
            {parishes?.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {pickParishName(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {parishError && <p className="text-xs text-destructive">{parishError}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-role">Cargo</Label>
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger id="reg-role" className="h-12">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Catequista">Catequista</SelectItem>
            <SelectItem value="Coordenador">Coordenador</SelectItem>
            <SelectItem value="Admin">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-password">Senha</Label>
        <Input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-12"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="reg-confirm">Confirmar senha</Label>
        <Input
          id="reg-confirm"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={128}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="h-12"
        />
      </div>
      <Button type="submit" className="h-12 w-full" disabled={loading}>
        {loading ? "Cadastrando..." : "Criar conta"}
      </Button>
    </form>
  );
}