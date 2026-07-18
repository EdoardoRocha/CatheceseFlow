import { Link, useParams } from "react-router-dom";
import { usePageTitle } from "@/hooks/use-page-title";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, formatStudentPhone, type Lecture } from "@/lib/api";
import { matchesStudentName, normalizeStudents } from "@/lib/dashboard-aggregations";
import {
  EditStudentDialog,
  NewStudentDialog,
} from "@/components/student-form-dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CalendarDays, Clock, MapPin, ChevronLeft, Users, Plus, Loader2, Phone, Check } from "lucide-react";

const SACRAMENT_BADGE_CLASS =
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";

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

export function ClassDetailPage() {
  const { classId } = useParams<{ classId: string }>();
  usePageTitle("Encontros — CatheceseFlow");

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
  const [search, setSearch] = useState("");
  const [catequistaFilter, setCatequistaFilter] = useState("all");
  const studentsQ = useQuery({
    queryKey: ["students", classId],
    queryFn: async () =>
      normalizeStudents((await api.get(`/students/${classId}`)).data),
  });

  const catequistaOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const s of studentsQ.data ?? []) {
      if (s.userId != null && s.catequista?.name) {
        map.set(s.userId, s.catequista.name);
      } else if (s.userId != null) {
        map.set(s.userId, `Catequista #${s.userId}`);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [studentsQ.data]);

  const filteredStudents = useMemo(
    () =>
      (studentsQ.data ?? []).filter((s) => {
        if (!matchesStudentName(s, search)) return false;
        if (catequistaFilter === "all") return true;
        return String(s.userId) === catequistaFilter;
      }),
    [studentsQ.data, search, catequistaFilter],
  );

  const emptyFilterMessage = (() => {
    if (search.trim() && catequistaFilter !== "all") {
      return `Nenhum aluno encontrado para "${search.trim()}" com o catequista selecionado.`;
    }
    if (search.trim()) {
      return `Nenhum aluno encontrado para "${search.trim()}".`;
    }
    if (catequistaFilter !== "all") {
      return "Nenhum aluno encontrado para o catequista selecionado.";
    }
    return null;
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row">
          <Input
            className="h-11"
            placeholder="Buscar aluno por nome..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={catequistaFilter} onValueChange={setCatequistaFilter}>
            <SelectTrigger className="h-11 sm:w-[220px]">
              <SelectValue placeholder="Catequista" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os catequistas</SelectItem>
              {catequistaOptions.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
      {studentsQ.data &&
        studentsQ.data.length > 0 &&
        filteredStudents.length === 0 &&
        emptyFilterMessage && (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {emptyFilterMessage}
            </CardContent>
          </Card>
        )}
      <ul className="space-y-2">
        {filteredStudents.map((s) => (
          <li key={s.id}>
            <Card>
              <CardContent className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{s.name}</p>
                  {s.catequista?.name && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      Catequista: {s.catequista.name}
                    </p>
                  )}
                  {s.description && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {s.description}
                    </p>
                  )}
                  {s.phones.length > 0 &&
                    s.phones.map((p, index) => (
                      <p
                        key={`${s.id}-phone-${index}`}
                        className="flex items-center gap-1 truncate text-xs text-muted-foreground"
                      >
                        <Phone className="h-3 w-3 shrink-0" /> {formatStudentPhone(p)}
                      </p>
                    ))}
                </div>
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                  {!!s.hasBaptism && (
                    <Badge variant="secondary" className={SACRAMENT_BADGE_CLASS}>
                      <Check className="mr-1 h-3 w-3" /> Batismo
                    </Badge>
                  )}
                  {!!s.hasFirstCommunion && (
                    <Badge variant="secondary" className={SACRAMENT_BADGE_CLASS}>
                      <Check className="mr-1 h-3 w-3" /> 1ª Comunhão
                    </Badge>
                  )}
                  {s.cpf && (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      CPF {s.cpf}
                    </Badge>
                  )}
                  <EditStudentDialog
                    classId={classId}
                    studentId={s.id}
                    studentName={s.name}
                  />
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>
    </div>
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
                <Link to={`/classes/${classId}/lectures/${l.id}`}>
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