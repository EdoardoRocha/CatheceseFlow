import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, type Student } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { normalizeStudent } from "@/lib/dashboard-aggregations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Loader2, Plus, Trash2 } from "lucide-react";

const MAX_STUDENT_PHONES = 5;
const EMPTY_PHONE_ROW = { number: "", label: "" };

type ParishUser = { id: number; name: string; role: string };

type StudentFormState = {
  name: string;
  birth_date: string;
  father_name: string;
  mother_name: string;
  description: string;
  phones: Array<{ number: string; label: string }>;
  cpf: string;
  road: string;
  house_number: string;
  code: string;
  city: string;
  neighborhood: string;
  hasBaptism: boolean;
  hasFirstCommunion: boolean;
  userId: string;
};

function emptyForm(): StudentFormState {
  return {
    name: "",
    birth_date: "",
    father_name: "",
    mother_name: "",
    description: "",
    phones: [{ ...EMPTY_PHONE_ROW }],
    cpf: "",
    road: "",
    house_number: "",
    code: "",
    city: "",
    neighborhood: "",
    hasBaptism: false,
    hasFirstCommunion: false,
    userId: "",
  };
}

function studentToForm(student: Student): StudentFormState {
  return {
    name: student.name,
    birth_date: student.birthDate ?? "",
    father_name: student.fatherName ?? "",
    mother_name: student.motherName ?? "",
    description: student.description ?? "",
    phones:
      student.phones.length > 0
        ? student.phones.map((p) => ({
            number: p.number,
            label: p.label ?? "",
          }))
        : [{ ...EMPTY_PHONE_ROW }],
    cpf: student.cpf ?? "",
    road: student.road ?? student.address?.road ?? "",
    house_number:
      student.house_number != null
        ? String(student.house_number)
        : student.address?.house_number != null
          ? String(student.address.house_number)
          : "",
    code: student.code ?? student.address?.code ?? "",
    city: student.city ?? student.address?.city ?? "",
    neighborhood: student.neighborhood ?? student.address?.neighborhood ?? "",
    hasBaptism: student.hasBaptism,
    hasFirstCommunion: student.hasFirstCommunion,
    userId: student.userId != null ? String(student.userId) : "",
  };
}

function extractMessage(err: unknown): string | undefined {
  return (err as { response?: { data?: { message?: string } } })?.response?.data
    ?.message;
}

function buildPayload(form: StudentFormState, classId: string) {
  const phones = form.phones
    .map((entry) => ({
      number: entry.number.trim(),
      label: entry.label.trim() || null,
    }))
    .filter((entry) => entry.number);

  return {
    name: form.name.trim(),
    phones,
    cpf: form.cpf.trim() || null,
    birth_date: form.birth_date || null,
    father_name: form.father_name.trim() || null,
    mother_name: form.mother_name.trim() || null,
    description: form.description.trim() || null,
    road: form.road.trim() || null,
    house_number: form.house_number.trim() ? Number(form.house_number) : null,
    code: form.code.trim() || null,
    city: form.city.trim() || null,
    neighborhood: form.neighborhood.trim() || null,
    has_baptism: form.hasBaptism,
    has_first_communion: form.hasFirstCommunion,
    classId: Number(classId),
    userId: Number(form.userId),
  };
}

function useParishCatequistas(enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    enabled: enabled && !!user?.ParishId,
    queryKey: ["parish-catequistas", user?.ParishId],
    queryFn: async () => {
      const r = await api.get<ParishUser[]>(`/users/${user?.ParishId}`);
      return r.data;
    },
    select: (list) =>
      (list ?? []).filter(
        (u) => u.role === "Catequista" || u.role === "Coordenador",
      ),
  });
}

type StudentFormFieldsProps = {
  form: StudentFormState;
  setForm: React.Dispatch<React.SetStateAction<StudentFormState>>;
  set: (
    k: keyof StudentFormState,
  ) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  updatePhone: (index: number, field: "number" | "label", value: string) => void;
  addPhone: () => void;
  removePhone: (index: number) => void;
  catequistas: ParishUser[];
  catequistasLoading: boolean;
  catequistasError: boolean;
};

function StudentFormFields({
  form,
  setForm,
  set,
  updatePhone,
  addPhone,
  removePhone,
  catequistas,
  catequistasLoading,
  catequistasError,
}: StudentFormFieldsProps) {
  return (
    <>
      <div className="space-y-2">
        <Label>Nome *</Label>
        <Input className="h-11" value={form.name} onChange={set("name")} required />
      </div>
      <div className="space-y-2">
        <Label>Catequista responsável *</Label>
        <Select
          value={form.userId || undefined}
          onValueChange={(v) => setForm((p) => ({ ...p, userId: v }))}
          disabled={catequistasLoading || catequistasError}
        >
          <SelectTrigger className="h-11">
            <SelectValue
              placeholder={
                catequistasLoading
                  ? "Carregando..."
                  : "Selecione o catequista"
              }
            />
          </SelectTrigger>
          <SelectContent>
            {catequistas.map((u) => (
              <SelectItem key={u.id} value={String(u.id)}>
                {u.name} ({u.role})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {catequistasError && (
          <p className="text-xs text-destructive">
            Não foi possível carregar os catequistas.
          </p>
        )}
        {!catequistasLoading && !catequistasError && catequistas.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhum catequista encontrado nesta paróquia.
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Descrição</Label>
        <Textarea
          value={form.description}
          onChange={set("description")}
          placeholder="Observações importantes sobre o aluno..."
          rows={3}
        />
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
    </>
  );
}

function useStudentFormState(initial?: StudentFormState) {
  const [form, setForm] = useState(initial ?? emptyForm());

  const set =
    (k: keyof StudentFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
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

  const reset = () => setForm(emptyForm());

  return { form, setForm, set, updatePhone, addPhone, removePhone, reset };
}

function validateStudentForm(form: StudentFormState): string | null {
  if (!form.name.trim()) return "Informe o nome do aluno.";
  if (!form.userId) return "Selecione o catequista responsável.";
  return null;
}

export function NewStudentDialog({ classId }: { classId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { form, setForm, set, updatePhone, addPhone, removePhone, reset } =
    useStudentFormState();
  const catequistasQ = useParishCatequistas(open);

  const mutation = useMutation({
    mutationFn: async () => api.post("/students/create", buildPayload(form, classId)),
    onSuccess: () => {
      toast.success("Aluno adicionado!");
      qc.invalidateQueries({ queryKey: ["students"] });
      setOpen(false);
      reset();
    },
    onError: (err) =>
      toast.error(extractMessage(err) ?? "Não foi possível adicionar o aluno"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateStudentForm(form);
    if (error) {
      toast.error(error);
      return;
    }
    mutation.mutate();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Adicionar aluno
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo aluno</DialogTitle>
          <DialogDescription>Dados pessoais e endereço.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <StudentFormFields
            form={form}
            setForm={setForm}
            set={set}
            updatePhone={updatePhone}
            addPhone={addPhone}
            removePhone={removePhone}
            catequistas={catequistasQ.data ?? []}
            catequistasLoading={catequistasQ.isLoading}
            catequistasError={catequistasQ.isError}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Adicionar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditStudentDialog({
  classId,
  studentId,
  studentName,
}: {
  classId: string;
  studentId: number;
  studentName: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { form, setForm, set, updatePhone, addPhone, removePhone, reset } =
    useStudentFormState();
  const catequistasQ = useParishCatequistas(open);

  const studentQ = useQuery({
    enabled: open,
    queryKey: ["students", "detail", String(studentId)],
    queryFn: async () =>
      normalizeStudent(
        (await api.get(`/students/student/${studentId}`)).data as Record<
          string,
          unknown
        >,
      ),
  });

  useEffect(() => {
    if (studentQ.data) {
      setForm(studentToForm(studentQ.data));
    }
  }, [studentQ.data, setForm]);

  const mutation = useMutation({
    mutationFn: async () => {
      const { classId: _classId, ...body } = buildPayload(form, classId);
      return api.put(`/students/student/${studentId}`, body);
    },
    onSuccess: () => {
      toast.success("Aluno atualizado!");
      qc.invalidateQueries({ queryKey: ["students"] });
      setOpen(false);
      reset();
    },
    onError: (err) =>
      toast.error(extractMessage(err) ?? "Não foi possível atualizar o aluno"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const error = validateStudentForm(form);
    if (error) {
      toast.error(error);
      return;
    }
    mutation.mutate();
  };

  const loading = studentQ.isLoading || studentQ.isFetching;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Editar ${studentName}`}>
          Editar
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar aluno</DialogTitle>
          <DialogDescription>Atualize os dados de {studentName}.</DialogDescription>
        </DialogHeader>
        {studentQ.isError && (
          <p className="text-sm text-destructive">
            Não foi possível carregar os dados do aluno.
          </p>
        )}
        <form onSubmit={submit} className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <StudentFormFields
              form={form}
              setForm={setForm}
              set={set}
              updatePhone={updatePhone}
              addPhone={addPhone}
              removePhone={removePhone}
              catequistas={catequistasQ.data ?? []}
              catequistasLoading={catequistasQ.isLoading}
              catequistasError={catequistasQ.isError}
            />
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending || loading || studentQ.isError}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Salvar"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
