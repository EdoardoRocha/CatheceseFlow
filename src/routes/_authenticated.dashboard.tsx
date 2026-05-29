import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api, type ClassItem } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Clock, MapPin, ChevronRight, Plus, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Minhas turmas — CatheceseFlow" }] }),
  component: Dashboard,
});

function formatTime(t: string) {
  return t?.slice(0, 5) ?? t;
}

function extractMessage(err: unknown): string | undefined {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
}

const CLASS_TYPES = ["Primeira Comunhão", "Perseverança", "Crisma"] as const;
const DAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sabado"] as const;

function NewClassDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<(typeof CLASS_TYPES)[number] | "">("");
  const [day, setDay] = useState<(typeof DAYS)[number] | "">("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const reset = () => {
    setType(""); setDay(""); setLocation(""); setStart(""); setEnd("");
  };

  const mutation = useMutation({
    mutationFn: async () => {
      return api.post("/classes/create", {
        type, day, location,
        start: start.length === 5 ? `${start}:00` : start,
        end: end.length === 5 ? `${end}:00` : end,
      });
    },
    onSuccess: () => {
      toast.success("Turma criada!");
      qc.invalidateQueries({ queryKey: ["classes", "my-parish"] });
      setOpen(false);
      reset();
    },
    onError: (err) => toast.error(extractMessage(err) ?? "Não foi possível criar a turma"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!type || !day || !location || !start || !end) {
      toast.error("Preencha todos os campos.");
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="h-4 w-4" /> Nova turma</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova turma</DialogTitle>
          <DialogDescription>Cadastre uma turma da sua paróquia.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-2">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {CLASS_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Dia da semana</Label>
            <Select value={day} onValueChange={(v) => setDay(v as typeof day)}>
              <SelectTrigger className="h-11"><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {DAYS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cls-loc">Local</Label>
            <Input id="cls-loc" className="h-11" value={location} onChange={(e) => setLocation(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="cls-start">Início</Label>
              <Input id="cls-start" type="time" className="h-11" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cls-end">Fim</Label>
              <Input id="cls-end" type="time" className="h-11" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar turma"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Dashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["classes", "my-parish"],
    queryFn: async () => {
      const res = await api.get<ClassItem[]>("/classes/my-parish");
      return res.data;
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Minhas turmas</h1>
          <p className="text-sm text-muted-foreground">Selecione uma turma para começar.</p>
        </div>
        <NewClassDialog />
      </div>

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            Não foi possível carregar as turmas.
          </CardContent>
        </Card>
      )}

      {data && data.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            Nenhuma turma cadastrada para sua paróquia.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {data?.map((c) => (
          <Link
            key={c.id}
            to="/classes/$classId"
            params={{ classId: String(c.id) }}
            className="block"
          >
            <Card className="transition-colors hover:bg-accent/50">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-lg">{c.type}</CardTitle>
                    <CardDescription className="mt-1">
                      <Badge variant="secondary">{c.day}</Badge>
                    </CardDescription>
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-1 pt-0 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span>
                    {formatTime(c.start)} — {formatTime(c.end)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4" />
                  <span>{c.location}</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}