import { Link, useParams } from "react-router-dom";
import { usePageTitle } from "@/hooks/use-page-title";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, type Lecture, type Student } from "@/lib/api";
import { normalizeStudents } from "@/lib/dashboard-aggregations";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ChevronLeft, Check, X, Loader2, RotateCcw } from "lucide-react";

type LocalStatus = "present" | "absent";
type MarkMap = Record<number, { status: LocalStatus; reason?: string }>;

// Defensive extractor: backend may return studentId / StudentId
function pickStudentId(r: Record<string, unknown>): number | null {
  const v = r.studentId ?? r.StudentId ?? r.student_id;
  return typeof v === "number" ? v : null;
}
function pickReason(r: Record<string, unknown>): string | undefined {
  const v = r.reason ?? r.Reason;
  return typeof v === "string" ? v : undefined;
}
function extractMessage(err: unknown): string | undefined {
  return (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
}

function formatDateBR(iso: string) {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

export function RollCallPage() {
  const { classId, lectureId } = useParams<{ classId: string; lectureId: string }>();
  usePageTitle("Chamada — CatheceseFlow");
  const [absenceFor, setAbsenceFor] = useState<Student | null>(null);
  const [reasonDraft, setReasonDraft] = useState("");
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [marks, setMarks] = useState<MarkMap>({});

  const studentsQ = useQuery({
    queryKey: ["students", classId],
    queryFn: async () =>
      normalizeStudents((await api.get(`/students/${classId}`)).data),
  });

  const lecturesQ = useQuery({
    queryKey: ["lectures", classId],
    queryFn: async () => (await api.get<Lecture[]>(`/lectures/${classId}`)).data,
  });

  const attendancesQ = useQuery({
    queryKey: ["attendances", "lecture", lectureId],
    queryFn: async () =>
      (await api.get<Record<string, unknown>[]>(`/attendances/lecture/${lectureId}`)).data,
  });

  const absencesQ = useQuery({
    queryKey: ["absences", "lecture", lectureId],
    queryFn: async () =>
      (await api.get<Record<string, unknown>[]>(`/absences/lecture/${lectureId}`)).data,
  });

  useEffect(() => {
    if (attendancesQ.data === undefined && absencesQ.data === undefined) return;
    const next: MarkMap = {};
    for (const row of attendancesQ.data ?? []) {
      const sid = pickStudentId(row);
      if (sid != null) next[sid] = { status: "present" };
    }
    for (const row of absencesQ.data ?? []) {
      const sid = pickStudentId(row);
      if (sid != null) next[sid] = { status: "absent", reason: pickReason(row) };
    }
    setMarks(next);
  }, [attendancesQ.data, absencesQ.data]);

  const lecture = useMemo(
    () => lecturesQ.data?.find((l) => String(l.id) === lectureId),
    [lecturesQ.data, lectureId],
  );

  const counts = useMemo(() => {
    const total = studentsQ.data?.length ?? 0;
    const marked = Object.keys(marks).length;
    const present = Object.values(marks).filter((m) => m.status === "present").length;
    const absent = Object.values(marks).filter((m) => m.status === "absent").length;
    return { total, marked, present, absent };
  }, [marks, studentsQ.data]);

  // Treat 409 (already exists) as success — the GET refetch will reconcile.
  const isConflict = (err: unknown) =>
    (err as { response?: { status?: number } })?.response?.status === 409;

  const markPresent = async (student: Student) => {
    const prev = marks[student.id];
    setPendingId(student.id);
    try {
      if (prev?.status === "absent") {
        await api
          .delete(`/absences/${student.id}/${lectureId}`)
          .catch((e) => {
            if (!isConflict(e) && e?.response?.status !== 404) throw e;
          });
      }
      try {
        await api.post(`/attendances/${student.id}`, {
          lectureId: Number(lectureId),
        });
      } catch (e) {
        if (!isConflict(e)) throw e;
      }
      setMarks((p) => ({ ...p, [student.id]: { status: "present" } }));
      toast.success(`${student.name} marcado como presente`);
    } catch (err) {
      toast.error(extractMessage(err) ?? "Não foi possível marcar presença");
    } finally {
      setPendingId(null);
    }
  };

  const openAbsence = (student: Student) => {
    setAbsenceFor(student);
    setReasonDraft(marks[student.id]?.reason ?? "");
  };

  const confirmAbsence = async () => {
    if (!absenceFor) return;
    const reason = reasonDraft.trim();
    if (!reason) {
      toast.error("Informe o motivo da falta.");
      return;
    }
    const student = absenceFor;
    const prev = marks[student.id];
    setPendingId(student.id);
    try {
      if (prev?.status === "present") {
        await api
          .delete(`/attendances/${student.id}/${lectureId}`)
          .catch((e) => {
            if (!isConflict(e) && e?.response?.status !== 404) throw e;
          });
      }
      try {
        await api.post(`/absences/${student.id}`, {
          lectureId: Number(lectureId),
          reason,
        });
      } catch (e) {
        if (!isConflict(e)) throw e;
      }
      setMarks((p) => ({ ...p, [student.id]: { status: "absent", reason } }));
      toast.success(`Falta de ${student.name} registrada`);
      setAbsenceFor(null);
      setReasonDraft("");
    } catch (err) {
      toast.error(extractMessage(err) ?? "Não foi possível registrar a falta");
    } finally {
      setPendingId(null);
    }
  };

  const clearMark = async (student: Student) => {
    const prev = marks[student.id];
    if (!prev) return;
    setPendingId(student.id);
    try {
      const url =
        prev.status === "present"
          ? `/attendances/${student.id}/${lectureId}`
          : `/absences/${student.id}/${lectureId}`;
      await api.delete(url);
      setMarks((p) => {
        const n = { ...p };
        delete n[student.id];
        return n;
      });
      toast.success(`Marcação de ${student.name} removida`);
    } catch (err) {
      toast.error(extractMessage(err) ?? "Não foi possível desfazer a marcação");
    } finally {
      setPendingId(null);
    }
  };

  const hydrating = studentsQ.isLoading;
  const hydrationError = studentsQ.isError;

  return (
    <div className="space-y-4 pb-28">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
          <Link to={`/classes/${classId}`}>
            <ChevronLeft className="h-4 w-4" />
            Encontros
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Chamada</h1>
        {lecture ? (
          <p className="text-sm text-muted-foreground">
            {lecture.theme} · {formatDateBR(lecture.date)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Encontro #{lectureId}</p>
        )}
      </div>

      {hydrating && (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!hydrating && hydrationError && (
        <Card>
          <CardContent className="space-y-3 py-6 text-sm">
            <p className="text-destructive">
              Não foi possível carregar a chamada.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                studentsQ.refetch();
                attendancesQ.refetch();
                absencesQ.refetch();
              }}
            >
              Tentar de novo
            </Button>
          </CardContent>
        </Card>
      )}

      {!hydrating && !hydrationError && studentsQ.data?.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Nenhum aluno matriculado nesta turma.
          </CardContent>
        </Card>
      )}

      {!hydrating && !hydrationError && (
      <ul className="space-y-2">
        {studentsQ.data?.map((s) => {
          const mark = marks[s.id];
          const isPending = pendingId === s.id;
          return (
            <li key={s.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.name}</p>
                    {mark?.status === "absent" && mark.reason && (
                      <p className="truncate text-xs text-muted-foreground">
                        Motivo: {mark.reason}
                      </p>
                    )}
                    {mark && (
                      <Badge
                        variant="secondary"
                        className={
                          mark.status === "present"
                            ? "mt-1 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "mt-1 bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                        }
                      >
                        {mark.status === "present" ? "Presente" : "Faltou"}
                      </Badge>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {mark && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-11 w-11"
                        onClick={() => clearMark(s)}
                        disabled={isPending}
                        aria-label={`Desfazer marcação de ${s.name}`}
                        title="Desfazer marcação"
                      >
                        <RotateCcw className="h-5 w-5" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant={mark?.status === "present" ? "default" : "outline"}
                      className={
                        "h-11 w-11 " +
                        (mark?.status === "present"
                          ? "bg-emerald-600 hover:bg-emerald-700"
                          : "")
                      }
                      onClick={() => markPresent(s)}
                      disabled={isPending}
                      aria-label={`Marcar ${s.name} como presente`}
                    >
                      {isPending ? (
                        <Loader2 className="h-5 w-5 animate-spin" />
                      ) : (
                        <Check className="h-5 w-5" />
                      )}
                    </Button>
                    <Button
                      size="icon"
                      variant={mark?.status === "absent" ? "default" : "outline"}
                      className={
                        "h-11 w-11 " +
                        (mark?.status === "absent"
                          ? "bg-rose-600 hover:bg-rose-700"
                          : "")
                      }
                      onClick={() => openAbsence(s)}
                      disabled={isPending}
                      aria-label={`Registrar falta de ${s.name}`}
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          );
        })}
      </ul>
      )}

      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 text-sm">
          <span>
            Marcados <strong>{counts.marked}</strong> / {counts.total}
          </span>
          <span className="flex gap-3 text-xs text-muted-foreground">
            <span className="text-emerald-700 dark:text-emerald-400">
              Presentes: {counts.present}
            </span>
            <span className="text-rose-700 dark:text-rose-400">
              Faltas: {counts.absent}
            </span>
          </span>
        </div>
      </div>

      <Dialog
        open={absenceFor !== null}
        onOpenChange={(o) => {
          if (!o) {
            setAbsenceFor(null);
            setReasonDraft("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar falta</DialogTitle>
            <DialogDescription>
              Informe o motivo da ausência de {absenceFor?.name}.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reasonDraft}
            onChange={(e) => setReasonDraft(e.target.value)}
            placeholder="Ex: Aluno estava doente, atestado enviado pelos pais."
            rows={4}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setAbsenceFor(null);
                setReasonDraft("");
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmAbsence}
              disabled={absenceFor ? pendingId === absenceFor.id : false}
            >
              {absenceFor && pendingId === absenceFor.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Confirmar falta"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}