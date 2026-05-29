import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, type Lecture, type Student } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CalendarDays, Clock, MapPin, ChevronLeft, Users, Plus, Loader2, Phone } from "lucide-react";

export const Route = createFileRoute("/_authenticated/classes/$classId/")({
  head: () => ({ meta: [{ title: "Encontros — CatheceseFlow" }] }),
  component: ClassDetail,
});

function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateBR(iso: string) {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

function formatTime(t: string) {
  return t?.slice(0, 5) ?? t;
}

function extractMessage(err: unknown): string | undefined {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
}

function ClassDetail() {
  const { classId } = Route.useParams();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["lectures", classId],
    queryFn: async () => {
      const res = await api.get<Lecture[]>(`/lectures/${classId}`);
      return res.data;
    },
  });

  const groups = useMemo(() => {
    const today = todayIso();
    const todayList: Lecture[] = [];
    const upcoming: Lecture[] = [];
    const past: Lecture[] = [];
    (data ?? []).forEach((l) => {
      const d = l.date.split("T")[0];
      if (d === today) todayList.push(l);
      else if (d > today) upcoming.push(l);
      else past.push(l);
    });
    upcoming.sort((a, b) => a.date.localeCompare(b.date));
    past.sort((a, b) => b.date.localeCompare(a.date));
    return { todayList, upcoming, past };
  }, [data]);

  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to="/dashboard">
            <ChevronLeft className="h-4 w-4" />
            Turmas
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Turma #{classId}</h1>
        <p className="text-sm text-muted-foreground">Gerencie encontros e alunos.</p>
      </div>

      <Tabs defaultValue="lectures">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="lectures">Encontros</TabsTrigger>
          <TabsTrigger value="students">Alunos</TabsTrigger>
        </TabsList>

        <TabsContent value="lectures" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <NewLectureDialog classId={classId} />
          </div>

          {isLoading && (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}
      {isError && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Não foi possível carregar os encontros.
          </CardContent>
        </Card>
      )}

      <Section title="Hoje" items={groups.todayList} classId={classId} highlight />
      <Section title="Próximos" items={groups.upcoming} classId={classId} />
      <Section title="Anteriores" items={groups.past} classId={classId} />

      {data && data.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Nenhum encontro agendado para esta turma.
          </CardContent>
        </Card>
      )}
        </TabsContent>

        <TabsContent value="students" className="mt-4">
          <StudentsTab classId={classId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NewLectureDialog({ classId }: { classId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState("");
  const [location, setLocation] = useState("");
  const [date, setDate] = useState("");
  const [hour, setHour] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);

  type ParishUser = { id: number; name: string; role: string; ParishId?: number };
  const usersQ = useQuery({
    enabled: open && !!user,
    queryKey: ["parish-catequistas", user?.ParishId],
    queryFn: async () => {
      const r = await api.get<ParishUser[]>(`/users/${user?.ParishId}`);
      return r.data;
    },
    select: (list) =>
      (list ?? []).filter(
        (u) =>
          u.role === "Catequista" || u.role === "Coordenador",
      ),
  });

  // Pre-select current user once dialog opens.
  useMemo(() => {
    if (open && user && selectedUserIds.length === 0) {
      setSelectedUserIds([user.id]);
    }
  }, [open, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const reset = () => {
    setTheme(""); setLocation(""); setDate(""); setHour("");
    setSelectedUserIds(user ? [user.id] : []);
  };

  const mutation = useMutation({
    mutationFn: async () => {
      return api.post("/lectures/create", {
        location, theme, date,
        hour: hour.length === 5 ? `${hour}:00` : hour,
        classId: Number(classId),
        userIds: selectedUserIds.length > 0 ? selectedUserIds : user ? [user.id] : [],
      });
    },
    onSuccess: () => {
      toast.success("Encontro criado!");
      qc.invalidateQueries({ queryKey: ["lectures", classId] });
      setOpen(false);
      reset();
    },
    onError: (err) => toast.error(extractMessage(err) ?? "Não foi possível criar o encontro"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!theme || !location || !date || !hour) {
      toast.error("Preencha todos os campos.");
      return;
    }
    if (selectedUserIds.length === 0) {
      toast.error("Selecione ao menos um catequista.");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" /> Novo encontro</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo encontro</DialogTitle>
          <DialogDescription>Agende uma aula para esta turma.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="lec-theme">Tema</Label>
            <Input id="lec-theme" className="h-11" value={theme} onChange={(e) => setTheme(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lec-loc">Local</Label>
            <Input id="lec-loc" className="h-11" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="lec-date">Data</Label>
              <Input id="lec-date" type="date" className="h-11" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lec-hour">Hora</Label>
              <Input id="lec-hour" type="time" className="h-11" value={hour} onChange={(e) => setHour(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Catequistas</Label>
            <p className="text-xs text-muted-foreground">
              Selecione os catequistas responsáveis por este encontro.
            </p>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
              {usersQ.isLoading && (
                <p className="px-1 py-2 text-xs text-muted-foreground">Carregando…</p>
              )}
              {usersQ.isError && (
                <p className="px-1 py-2 text-xs text-destructive">
                  Não foi possível carregar os catequistas. Você será incluído por padrão.
                </p>
              )}
              {usersQ.data?.length === 0 && (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  Nenhum catequista encontrado nesta paróquia.
                </p>
              )}
              {usersQ.data?.map((u) => {
                const checked = selectedUserIds.includes(u.id);
                return (
                  <label
                    key={u.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-2 hover:bg-accent"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        setSelectedUserIds((prev) =>
                          v ? [...new Set([...prev, u.id])] : prev.filter((id) => id !== u.id),
                        );
                      }}
                    />
                    <span className="flex-1 text-sm">{u.name}</span>
                    <Badge variant="outline" className="text-[10px]">{u.role}</Badge>
                  </label>
                );
              })}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar encontro"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StudentsTab({ classId }: { classId: string }) {
  const studentsQ = useQuery({
    queryKey: ["students", classId],
    queryFn: async () => (await api.get<Student[]>(`/students/${classId}`)).data,
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <NewStudentDialog classId={classId} />
      </div>
      {studentsQ.isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
        </div>
      )}
      {studentsQ.isError && (
        <Card><CardContent className="py-6 text-sm text-destructive">Não foi possível carregar os alunos.</CardContent></Card>
      )}
      {studentsQ.data && studentsQ.data.length === 0 && (
        <Card><CardContent className="py-6 text-sm text-muted-foreground">Nenhum aluno matriculado nesta turma.</CardContent></Card>
      )}
      <ul className="space-y-2">
        {studentsQ.data?.map((s) => (
          <li key={s.id}>
            <Card>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.name}</p>
                  <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                    <Phone className="h-3 w-3" /> {s.phone}
                  </p>
                </div>
                <Badge variant="outline" className="font-mono text-[10px]">CPF {s.cpf}</Badge>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewStudentDialog({ classId }: { classId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", phone: "", cpf: "",
    road: "", house_number: "", code: "", city: "", neighborhood: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));
  const reset = () => setForm({ name: "", phone: "", cpf: "", road: "", house_number: "", code: "", city: "", neighborhood: "" });

  const mutation = useMutation({
    mutationFn: async () => {
      return api.post("/students/create", {
        ...form,
        house_number: Number(form.house_number),
        classId: Number(classId),
      });
    },
    onSuccess: () => {
      toast.success("Aluno adicionado!");
      qc.invalidateQueries({ queryKey: ["students", classId] });
      setOpen(false);
      reset();
    },
    onError: (err) => toast.error(extractMessage(err) ?? "Não foi possível adicionar o aluno"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.values(form).some((v) => !v)) {
      toast.error("Preencha todos os campos.");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" /> Adicionar aluno</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo aluno</DialogTitle>
          <DialogDescription>Dados pessoais e endereço.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-2">
            <Label>Nome</Label>
            <Input className="h-11" value={form.name} onChange={set("name")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Telefone</Label>
              <Input className="h-11" value={form.phone} onChange={set("phone")} />
            </div>
            <div className="space-y-2">
              <Label>CPF</Label>
              <Input className="h-11" value={form.cpf} onChange={set("cpf")} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Rua</Label>
            <Input className="h-11" value={form.road} onChange={set("road")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Número</Label>
              <Input type="number" className="h-11" value={form.house_number} onChange={set("house_number")} />
            </div>
            <div className="space-y-2">
              <Label>CEP</Label>
              <Input className="h-11" value={form.code} onChange={set("code")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Bairro</Label>
              <Input className="h-11" value={form.neighborhood} onChange={set("neighborhood")} />
            </div>
            <div className="space-y-2">
              <Label>Cidade</Label>
              <Input className="h-11" value={form.city} onChange={set("city")} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  items,
  classId,
  highlight,
}: {
  title: string;
  items: Lecture[];
  classId: string;
  highlight?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-3">
        {items.map((l) => (
          <Card key={l.id} className={highlight ? "border-primary" : undefined}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{l.theme}</CardTitle>
              <CardDescription className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3.5 w-3.5" /> {formatDateBR(l.date)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {formatTime(l.hour)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" /> {l.location}
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {l.Users && l.Users.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  {l.Users.map((u) => (
                    <Badge key={u.id} variant="outline" className="font-normal">
                      {u.name}
                    </Badge>
                  ))}
                </div>
              )}
              <Button asChild className="h-11 w-full">
                <Link
                  to="/classes/$classId/lectures/$lectureId"
                  params={{ classId, lectureId: String(l.id) }}
                >
                  Fazer chamada
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}