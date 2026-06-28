import { Link } from "react-router-dom";
import { usePageTitle } from "@/hooks/use-page-title";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  api,
  formatStudentPhone,
  type ClassItem,
  type Lecture,
  type Student,
  type StudentPhone,
} from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  buildRanking,
  inMonth,
  lectureDate,
  normalizeStudents,
  pickStudentId,
  topAbsent,
  topPresent,
  type AttendanceRow,
  type StudentRef,
} from "@/lib/dashboard-aggregations";
import {
  CalendarDays,
  Users,
  BookOpen,
  TrendingUp,
  ChevronRight,
  Droplets,
  Cookie,
} from "lucide-react";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function parseMonth(v: string): { year: number; month: number } {
  const [y, m] = v.split("-").map(Number);
  return { year: y, month: (m ?? 1) - 1 };
}
function formatDateBR(d: Date) {
  return d.toLocaleDateString("pt-BR");
}

export function PainelPage() {
  usePageTitle("Painel — CatheceseFlow");
  const today = new Date();
  const [periodMode, setPeriodMode] = useState<"month" | "general">("month");
  const [monthValue, setMonthValue] = useState(monthKey(today));
  const [classFilter, setClassFilter] = useState<string>("all");
  const { year, month } = parseMonth(monthValue);

  const classesQ = useQuery({
    queryKey: ["classes", "my-parish"],
    queryFn: async () => (await api.get<ClassItem[]>("/classes/my-parish")).data,
  });
  const allClasses = classesQ.data ?? [];
  const classes = useMemo(
    () =>
      classFilter === "all"
        ? allClasses
        : allClasses.filter((c) => String(c.id) === classFilter),
    [allClasses, classFilter],
  );

  // Lectures & students per class
  const lecturesQueries = useQueries({
    queries: classes.map((c) => ({
      queryKey: ["lectures", String(c.id)],
      queryFn: async () =>
        (await api.get<Lecture[]>(`/lectures/${c.id}`)).data,
      enabled: classes.length > 0,
    })),
  });
  const studentsQueries = useQueries({
    queries: classes.map((c) => ({
      queryKey: ["students", String(c.id)],
      queryFn: async () =>
        normalizeStudents((await api.get(`/students/${c.id}`)).data),
      enabled: classes.length > 0,
    })),
  });

  // Flat students with className
  const allStudents: StudentRef[] = useMemo(() => {
    const list: StudentRef[] = [];
    classes.forEach((c, i) => {
      const ss = studentsQueries[i]?.data ?? [];
      for (const s of ss) list.push({ ...s, className: `${c.type} · ${c.day}` });
    });
    return list;
  }, [classes, studentsQueries]);

  // Lectures filtered by selected period
  const selectedLectures: Array<Lecture & { className: string }> = useMemo(() => {
    const out: Array<Lecture & { className: string }> = [];
    classes.forEach((c, i) => {
      const ls = lecturesQueries[i]?.data ?? [];
      for (const l of ls) {
        const d = lectureDate(l);
        if (!d) continue;
        if (periodMode === "general" || inMonth(d, year, month)) {
          out.push({ ...l, className: `${c.type} · ${c.day}` });
        }
      }
    });
    return out;
  }, [classes, lecturesQueries, periodMode, year, month]);

  // Attendance + absence per filtered lecture
  const attendQueries = useQueries({
    queries: selectedLectures.map((l) => ({
      queryKey: ["attendances", "lecture", String(l.id)],
      queryFn: async () =>
        (await api.get<AttendanceRow[]>(`/attendances/lecture/${l.id}`)).data,
    })),
  });
  const absenceQueries = useQueries({
    queries: selectedLectures.map((l) => ({
      queryKey: ["absences", "lecture", String(l.id)],
      queryFn: async () =>
        (await api.get<AttendanceRow[]>(`/absences/lecture/${l.id}`)).data,
    })),
  });

  // Sacraments report per visible class
  type SacramentStudent = {
    id: number;
    name: string;
    phones?: StudentPhone[];
    phone?: string;
    phoneSummary?: string;
  };
  type SacramentsReport = {
    baptismPending?: { total: number; students: SacramentStudent[] };
    firstCommunionPending?: { total: number; students: SacramentStudent[] };
  };
  const sacramentsQueries = useQueries({
    queries: classes.map((c) => ({
      queryKey: ["students", "class", String(c.id), "sacraments-report"],
      queryFn: async () =>
        (
          await api.get<SacramentsReport>(
            `/students/class/${c.id}/sacraments-report`,
          )
        ).data,
      enabled: classes.length > 0,
    })),
  });

  type PendingRow = SacramentStudent & { className: string };
  const { baptismPending, communionPending } = useMemo(() => {
    const bMap = new Map<number, PendingRow>();
    const cMap = new Map<number, PendingRow>();
    classes.forEach((c, i) => {
      const rep = sacramentsQueries[i]?.data;
      const className = `${c.type} · ${c.day}`;
      for (const s of rep?.baptismPending?.students ?? []) {
        if (!bMap.has(s.id)) bMap.set(s.id, { ...s, className });
      }
      for (const s of rep?.firstCommunionPending?.students ?? []) {
        if (!cMap.has(s.id)) cMap.set(s.id, { ...s, className });
      }
    });
    return {
      baptismPending: Array.from(bMap.values()),
      communionPending: Array.from(cMap.values()),
    };
  }, [classes, sacramentsQueries]);
  const loadingSacraments = sacramentsQueries.some((q) => q.isLoading);

  const { presentMap, absentMap, totalPresent, totalAbsent } = useMemo(() => {
    const pm = new Map<number, number>();
    const am = new Map<number, number>();
    let tp = 0;
    let ta = 0;
    for (const q of attendQueries) {
      for (const r of q.data ?? []) {
        const sid = pickStudentId(r);
        if (sid != null) {
          pm.set(sid, (pm.get(sid) ?? 0) + 1);
          tp += 1;
        }
      }
    }
    for (const q of absenceQueries) {
      for (const r of q.data ?? []) {
        const sid = pickStudentId(r);
        if (sid != null) {
          am.set(sid, (am.get(sid) ?? 0) + 1);
          ta += 1;
        }
      }
    }
    return { presentMap: pm, absentMap: am, totalPresent: tp, totalAbsent: ta };
  }, [attendQueries, absenceQueries]);

  const ranking = useMemo(
    () => buildRanking(allStudents, presentMap, absentMap),
    [allStudents, presentMap, absentMap],
  );
  const tops = useMemo(() => topPresent(ranking, 5), [ranking]);
  const flops = useMemo(() => topAbsent(ranking, 5), [ranking]);

  const allByPresent = useMemo(
    () =>
      [...ranking].sort(
        (a, b) => b.present - a.present || b.rate - a.rate || a.name.localeCompare(b.name),
      ),
    [ranking],
  );
  const allByAbsent = useMemo(
    () =>
      [...ranking].sort(
        (a, b) => b.absent - a.absent || a.rate - b.rate || a.name.localeCompare(b.name),
      ),
    [ranking],
  );

  // Upcoming lectures (next 5, future from today)
  const upcoming = useMemo(() => {
    const out: Array<Lecture & { className: string; classId: number; d: Date }> = [];
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    classes.forEach((c, i) => {
      const ls = lecturesQueries[i]?.data ?? [];
      for (const l of ls) {
        const d = lectureDate(l);
        if (d && d >= start) {
          out.push({ ...l, className: `${c.type} · ${c.day}`, classId: c.id, d });
        }
      }
    });
    return out.sort((a, b) => a.d.getTime() - b.d.getTime()).slice(0, 5);
  }, [classes, lecturesQueries, today]);

  const overallRate =
    totalPresent + totalAbsent === 0
      ? null
      : Math.round((totalPresent / (totalPresent + totalAbsent)) * 100);
  const periodDescription =
    periodMode === "month"
      ? "Visão geral da paróquia para o mês selecionado."
      : "Visão geral acumulada da paróquia.";
  const lecturesKpiLabel =
    periodMode === "month" ? "Encontros no mês" : "Encontros (geral)";
  const topDescription = periodMode === "month" ? "Top 5 do mês" : "Top 5 geral";
  const noPresentText =
    periodMode === "month"
      ? "Sem presenças registradas no mês."
      : "Sem presenças registradas no geral.";
  const noAbsentText =
    periodMode === "month"
      ? "Sem faltas registradas no mês."
      : "Sem faltas registradas no geral.";

  const loadingBase = classesQ.isLoading;
  const loadingDeep =
    lecturesQueries.some((q) => q.isLoading) ||
    studentsQueries.some((q) => q.isLoading) ||
    attendQueries.some((q) => q.isLoading) ||
    absenceQueries.some((q) => q.isLoading);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel</h1>
          <p className="text-sm text-muted-foreground">{periodDescription}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="period-mode" className="text-xs">
              Período
            </Label>
            <Select value={periodMode} onValueChange={(value) => setPeriodMode(value as "month" | "general")}>
              <SelectTrigger id="period-mode" className="h-10 w-44">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Mês</SelectItem>
                <SelectItem value="general">Geral</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="class-filter" className="text-xs">
              Turma
            </Label>
            <Select value={classFilter} onValueChange={setClassFilter}>
              <SelectTrigger id="class-filter" className="h-10 w-56">
                <SelectValue placeholder="Todas as turmas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as turmas</SelectItem>
                {allClasses.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.type} · {c.day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {periodMode === "month" && (
            <div className="space-y-1">
              <Label htmlFor="month" className="text-xs">
                Mês
              </Label>
              <Input
                id="month"
                type="month"
                className="h-10 w-40"
                value={monthValue}
                onChange={(e) => setMonthValue(e.target.value || monthKey(new Date()))}
              />
            </div>
          )}
        </div>
      </div>

      {loadingBase ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard
            label="Turmas"
            value={classes.length}
            icon={<BookOpen className="h-4 w-4" />}
          />
          <KpiCard
            label="Alunos"
            value={allStudents.length}
            icon={<Users className="h-4 w-4" />}
          />
          <KpiCard
            label={lecturesKpiLabel}
            value={selectedLectures.length}
            icon={<CalendarDays className="h-4 w-4" />}
          />
          <KpiCard
            label="Presença média"
            value={overallRate === null ? "—" : `${overallRate}%`}
            icon={<TrendingUp className="h-4 w-4" />}
          />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Mais presentes</CardTitle>
            <CardDescription>{topDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingDeep && selectedLectures.length > 0 && tops.length === 0 ? (
              <ListSkeleton />
            ) : tops.length === 0 ? (
              <EmptyText>{noPresentText}</EmptyText>
            ) : (
              tops.map((s) => (
                <RankRow
                  key={s.studentId}
                  name={s.name}
                  subtitle={s.className}
                  badge={
                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-200">
                      {s.present} presenças
                    </Badge>
                  }
                />
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Mais faltosos</CardTitle>
            <CardDescription>{topDescription}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {loadingDeep && selectedLectures.length > 0 && flops.length === 0 ? (
              <ListSkeleton />
            ) : flops.length === 0 ? (
              <EmptyText>{noAbsentText}</EmptyText>
            ) : (
              flops.map((s) => (
                <RankRow
                  key={s.studentId}
                  name={s.name}
                  subtitle={s.className}
                  badge={
                    <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 dark:bg-rose-900/40 dark:text-rose-200">
                      {s.absent} faltas
                    </Badge>
                  }
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Próximos encontros</CardTitle>
          <CardDescription>Os 5 mais próximos a partir de hoje</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingBase ? (
            <ListSkeleton />
          ) : upcoming.length === 0 ? (
            <EmptyText>Nenhum encontro futuro agendado.</EmptyText>
          ) : (
            upcoming.map((l) => (
              <Link
                key={l.id}
                to={`/classes/${l.classId}/lectures/${l.id}`}
                className="flex items-center justify-between rounded-md border bg-card p-3 transition-colors hover:bg-accent/50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{l.theme}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {l.className} · {formatDateBR(l.d)} · {l.hour?.slice(0, 5)}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <SacramentCard
          title="Batismo pendente"
          description={
            classFilter === "all"
              ? "Alunos da paróquia ainda não batizados"
              : "Alunos da turma ainda não batizados"
          }
          icon={<Droplets className="h-4 w-4" />}
          loading={loadingSacraments}
          rows={baptismPending}
          emptyText="Todos os alunos já foram batizados."
        />
        {(classFilter === "all" || classes.some((c) => c.type !== "Primeira Comunhão")) && (
          <SacramentCard
            title="1ª Comunhão pendente"
            description={
              classFilter === "all"
                ? "Alunos da paróquia sem 1ª Comunhão"
                : "Alunos da turma sem 1ª Comunhão"
            }
            icon={<Cookie className="h-4 w-4" />}
            loading={loadingSacraments}
            rows={communionPending}
            emptyText="Todos os alunos já fizeram a 1ª Comunhão."
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <RankingTable
          title="Ranking de presenças"
          description="Todos os alunos, ordenados por presenças no período"
          rows={allByPresent}
          highlight="present"
          loading={loadingDeep && allByPresent.length === 0}
        />
        <RankingTable
          title="Ranking de faltas"
          description="Todos os alunos, ordenados por faltas no período"
          rows={allByAbsent}
          highlight="absent"
          loading={loadingDeep && allByAbsent.length === 0}
        />
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {icon}
          <span>{label}</span>
        </div>
        <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

function RankingTable({
  title,
  description,
  rows,
  highlight,
  loading,
}: {
  title: string;
  description: string;
  rows: Array<{
    studentId: number;
    name: string;
    className: string;
    present: number;
    absent: number;
    total: number;
    rate: number;
  }>;
  highlight: "present" | "absent";
  loading: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <ListSkeleton />
        ) : rows.length === 0 ? (
          <EmptyText>Nenhum aluno encontrado.</EmptyText>
        ) : (
          <div className="max-h-[420px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Aluno</TableHead>
                  <TableHead className="text-right">Presenças</TableHead>
                  <TableHead className="text-right">Faltas</TableHead>
                  <TableHead className="text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((s, i) => (
                  <TableRow key={s.studentId}>
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    <TableCell>
                      <div className="font-medium">{s.name}</div>
                      <div className="text-xs text-muted-foreground">{s.className}</div>
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${highlight === "present" ? "font-semibold text-emerald-700 dark:text-emerald-300" : ""}`}
                    >
                      {s.present}
                    </TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${highlight === "absent" ? "font-semibold text-rose-700 dark:text-rose-300" : ""}`}
                    >
                      {s.absent}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {s.total === 0 ? "—" : `${Math.round(s.rate * 100)}%`}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RankRow({
  name,
  subtitle,
  badge,
}: {
  name: string;
  subtitle: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
      <div className="min-w-0">
        <p className="truncate font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {badge}
    </div>
  );
}

function ListSkeleton() {
  return (
    <>
      {[1, 2, 3].map((i) => (
        <Skeleton key={i} className="h-14 w-full" />
      ))}
    </>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-muted-foreground">{children}</p>;
}

function SacramentCard({
  title,
  description,
  icon,
  loading,
  rows,
  emptyText,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  loading: boolean;
  rows: Array<{
    id: number;
    name: string;
    phones?: StudentPhone[];
    phone?: string;
    phoneSummary?: string;
    className: string;
  }>;
  emptyText: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon}
          {title}
          <Badge variant="secondary" className="ml-auto">
            {rows.length}
          </Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading && rows.length === 0 ? (
          <ListSkeleton />
        ) : rows.length === 0 ? (
          <EmptyText>{emptyText}</EmptyText>
        ) : (
          rows.map((s) => (
            <RankRow
              key={s.id}
              name={s.name}
              subtitle={(() => {
                const phoneText =
                  s.phoneSummary ??
                  (s.phones?.length
                    ? s.phones.map(formatStudentPhone).join(" · ")
                    : s.phone);
                return phoneText ? `${s.className} · ${phoneText}` : s.className;
              })()}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}