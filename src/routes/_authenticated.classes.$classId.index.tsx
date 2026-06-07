import { Link, useParams } from "react-router-dom";
import { usePageTitle } from "@/hooks/use-page-title";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { api, formatStudentPhone, type Lecture, type Student } from "@/lib/api";
import { normalizeStudents } from "@/lib/dashboard-aggregations";
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
import { CalendarDays, Clock, MapPin, ChevronLeft, Users, Plus, Loader2, Phone, Check, Trash2 } from "lucide-react";

const SACRAMENT_BADGE_CLASS =
  "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200";

const MAX_STUDENT_PHONES = 5;

const EMPTY_PHONE_ROW = { number: "", label: "" };

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
  const studentsQ = useQuery({
    queryKey: ["students", classId],
    queryFn: async () =>
      normalizeStudents((await api.get(`/students/${classId}`)).data),
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
                </div>
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
    name: "",
    birth_date: "",
    father_name: "",
    mother_name: "",
    phones: [{ ...EMPTY_PHONE_ROW }],
    cpf: "",
    road: "",
    house_number: "",
    code: "",
    city: "",
    neighborhood: "",
    hasBaptism: false,
    hasFirstCommunion: false,
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [k]: e.target.value }));
  const updatePhone = (
    index: number,
    field: "number" | "label",
    value: string,
  ) =>
    setForm((prev) => ({
      ...prev,
      phones: prev.phones.map((phone, i) =>
        i === index ? { ...phone, [field]: value } : phone,
      ),
    }));
  const addPhone = () =>
    setForm((prev) =>
      prev.phones.length >= MAX_STUDENT_PHONES
        ? prev
        : { ...prev, phones: [...prev.phones, { ...EMPTY_PHONE_ROW }] },
    );
  const removePhone = (index: number) =>
    setForm((prev) => ({
      ...prev,
      phones:
        prev.phones.length === 1
          ? [{ ...EMPTY_PHONE_ROW }]
          : prev.phones.filter((_, i) => i !== index),
    }));
  const reset = () =>
    setForm({
      name: "",
      birth_date: "",
      father_name: "",
      mother_name: "",
      phones: [{ ...EMPTY_PHONE_ROW }],
      cpf: "",
      road: "",
      house_number: "",
      code: "",
      city: "",
      neighborhood: "",
      hasBaptism: false,
      hasFirstCommunion: false,
    });

  const mutation = useMutation({
    mutationFn: async () => {
      const { hasBaptism, hasFirstCommunion, house_number } = form;
      const phones = form.phones
        .map((entry) => ({
          number: entry.number.trim(),
          label: entry.label.trim() || null,
        }))
        .filter((entry) => entry.number);

      return api.post("/students/create", {
        name: form.name.trim(),
        phones,
        cpf: form.cpf.trim() || null,
        birth_date: form.birth_date || null,
        father_name: form.father_name.trim() || null,
        mother_name: form.mother_name.trim() || null,
        road: form.road.trim() || null,
        house_number: house_number.trim() ? Number(house_number) : null,
        code: form.code.trim() || null,
        city: form.city.trim() || null,
        neighborhood: form.neighborhood.trim() || null,
        classId: Number(classId),
        has_baptism: hasBaptism,
        has_first_communion: hasFirstCommunion,
      });
    },
    onSuccess: () => {
      toast.success("Aluno adicionado!");
      qc.invalidateQueries({ queryKey: ["students"] });
      setOpen(false);
      reset();
    },
    onError: (err) => toast.error(extractMessage(err) ?? "Não foi possível adicionar o aluno"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Informe o nome do aluno.");
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
            <Label>Nome *</Label>
            <Input className="h-11" value={form.name} onChange={set("name")} required />
          </div>
          <div className="space-y-2">
            <Label>Data de nascimento</Label>
            <Input
              type="date"
              className="h-11"
              value={form.birth_date}
              onChange={set("birth_date")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Nome do pai</Label>
              <Input className="h-11" value={form.father_name} onChange={set("father_name")} />
            </div>
            <div className="space-y-2">
              <Label>Nome da mãe</Label>
              <Input className="h-11" value={form.mother_name} onChange={set("mother_name")} />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Telefones</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addPhone}
                disabled={form.phones.length >= MAX_STUDENT_PHONES}
              >
                <Plus className="h-4 w-4" /> Adicionar telefone
              </Button>
            </div>
            <div className="space-y-2">
              {form.phones.map((phone, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Input
                    className="h-11"
                    placeholder="Número"
                    value={phone.number}
                    onChange={(e) => updatePhone(index, "number", e.target.value)}
                  />
                  <Input
                    className="h-11"
                    placeholder="Mãe, Pai, Aluno..."
                    value={phone.label}
                    onChange={(e) => updatePhone(index, "label", e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-11 shrink-0"
                    onClick={() => removePhone(index)}
                    disabled={form.phones.length === 1}
                    aria-label="Remover telefone"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>CPF</Label>
            <Input className="h-11" value={form.cpf} onChange={set("cpf")} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex cursor-pointer items-center gap-2 rounded-md border p-3 hover:bg-accent">
              <Checkbox
                checked={form.hasBaptism}
                onCheckedChange={(checked) =>
                  setForm((p) => ({ ...p, hasBaptism: !!checked }))
                }
              />
              <span className="text-sm">Tem Batismo</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-md border p-3 hover:bg-accent">
              <Checkbox
                checked={form.hasFirstCommunion}
                onCheckedChange={(checked) =>
                  setForm((p) => ({ ...p, hasFirstCommunion: !!checked }))
                }
              />
              <span className="text-sm">Tem Primeira Comunhão</span>
            </label>
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