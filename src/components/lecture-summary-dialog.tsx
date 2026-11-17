import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { aiApi, type Lecture } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Download, FileText, Loader2, RefreshCw, Sparkles, Upload } from "lucide-react";

type StructuredSummary = {
  title: string;
  objective: string;
  key_points: string[];
  biblical_references: string[];
  practical_application: string;
  full_summary: string;
};

type SummaryDocument = {
  id: string;
  lecture_id: number;
  class_id: number;
  theme: string;
  date: string;
  location: string;
  catequistas: string[];
  source_type: "file" | "manual";
  transcription: string;
  summary: StructuredSummary;
  created_at: string;
  updated_at: string;
};

function extractAiError(err: unknown): string | undefined {
  const data = (err as { response?: { data?: { detail?: string; message?: string } } })?.response
    ?.data;
  return data?.detail ?? data?.message;
}

export function LectureSummaryDialog({ lecture, classId }: { lecture: Lecture; classId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"file" | "manual">("file");
  const [manualText, setManualText] = useState("");
  const [fileText, setFileText] = useState("");
  const [fileName, setFileName] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const summaryQ = useQuery({
    enabled: open,
    retry: false,
    queryKey: ["lecture-summary", String(lecture.id)],
    queryFn: async () => {
      try {
        const res = await aiApi.get<SummaryDocument>(`/summaries/lecture/${lecture.id}`);
        return res.data;
      } catch (err) {
        const status = (err as { response?: { status?: number } })?.response?.status;
        if (status === 404) return null;
        throw err;
      }
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const transcription = (mode === "file" ? fileText : manualText).trim();
      const res = await aiApi.post<SummaryDocument>("/summaries/generate", {
        lecture_id: lecture.id,
        class_id: Number(classId),
        theme: lecture.theme,
        date: lecture.date,
        location: lecture.location,
        catequistas: (lecture.Users ?? []).map((u) => u.name),
        source_type: mode,
        transcription,
      });
      return res.data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["lecture-summary", String(lecture.id)], data);
      setIsEditing(false);
      toast.success("Resumo gerado e salvo com sucesso!");
    },
    onError: (err) => {
      toast.error(extractAiError(err) ?? "Não foi possível gerar o resumo da formação.");
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setFileName("");
      setFileText("");
      return;
    }

    if (!file.name.toLowerCase().endsWith(".txt")) {
      toast.error("Selecione um arquivo de texto (.txt).");
      e.target.value = "";
      return;
    }

    const text = await file.text();
    setFileName(file.name);
    setFileText(text);
  };

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    const content = (mode === "file" ? fileText : manualText).trim();
    if (content.length < 10) {
      toast.error(
        mode === "file"
          ? "Envie um arquivo .txt com pelo menos 10 caracteres de transcrição."
          : "Digite ou cole a transcrição da formação (mínimo 10 caracteres).",
      );
      return;
    }
    generateMutation.mutate();
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const response = await aiApi.get(`/summaries/lecture/${lecture.id}/pdf`, {
        responseType: "blob",
      });
      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `resumo-formacao-${lecture.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Download do PDF iniciado!");
    } catch (err) {
      toast.error(extractAiError(err) ?? "Não foi possível baixar o PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const currentSummary = summaryQ.data;
  const showForm = !summaryQ.isLoading && (!currentSummary || isEditing);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setIsEditing(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" className="h-11 w-full">
          <FileText className="h-4 w-4" />
          Gerar resumo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Resumo da Formação</DialogTitle>
          <DialogDescription>{lecture.theme}</DialogDescription>
        </DialogHeader>

        {summaryQ.isLoading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : showForm ? (
          <form onSubmit={handleGenerate} className="space-y-4">
            <Tabs value={mode} onValueChange={(v) => setMode(v as "file" | "manual")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="file">
                  <Upload className="mr-1.5 h-3.5 w-3.5" />
                  Arquivo de texto (.txt)
                </TabsTrigger>
                <TabsTrigger value="manual">Digitar transcrição</TabsTrigger>
              </TabsList>

              <TabsContent value="file" className="mt-3 space-y-3">
                <div className="space-y-2">
                  <Label htmlFor={`summary-file-${lecture.id}`}>Arquivo .txt da formação</Label>
                  <Input
                    id={`summary-file-${lecture.id}`}
                    type="file"
                    accept=".txt,text/plain"
                    onChange={handleFileChange}
                  />
                  {fileName && (
                    <p className="text-xs text-muted-foreground">
                      Arquivo carregado: <strong>{fileName}</strong> ({fileText.length} caracteres)
                    </p>
                  )}
                </div>
                {fileText && (
                  <Textarea
                    value={fileText}
                    onChange={(e) => setFileText(e.target.value)}
                    rows={7}
                    placeholder="Conteúdo do arquivo carregado..."
                  />
                )}
              </TabsContent>

              <TabsContent value="manual" className="mt-3 space-y-2">
                <Label htmlFor={`summary-manual-${lecture.id}`}>
                  Transcrição ou anotações da formação
                </Label>
                <Textarea
                  id={`summary-manual-${lecture.id}`}
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  rows={8}
                  placeholder="Cole ou digite aqui a transcrição completa da formação ministrada..."
                />
              </TabsContent>
            </Tabs>

            <DialogFooter className="gap-2">
              {currentSummary && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditing(false)}
                  disabled={generateMutation.isPending}
                >
                  Voltar ao resumo
                </Button>
              )}
              <Button type="submit" disabled={generateMutation.isPending}>
                {generateMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Gerando resumo...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Gerar resumo com IA
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        ) : currentSummary ? (
          <div className="space-y-4">
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4 text-sm">
              <h3 className="text-base font-semibold">{currentSummary.summary.title}</h3>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Objetivo
                </p>
                <p className="mt-1">{currentSummary.summary.objective}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Resumo da Formação
                </p>
                <p className="mt-1 whitespace-pre-line">{currentSummary.summary.full_summary}</p>
              </div>
              {currentSummary.summary.key_points.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Pontos-Chave
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {currentSummary.summary.key_points.map((point, idx) => (
                      <li key={idx}>{point}</li>
                    ))}
                  </ul>
                </div>
              )}
              {currentSummary.summary.biblical_references.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Referências Bíblicas e Catequéticas
                  </p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {currentSummary.summary.biblical_references.map((ref, idx) => (
                      <li key={idx}>{ref}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Aplicação Prática
                </p>
                <p className="mt-1">{currentSummary.summary.practical_application}</p>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setManualText(currentSummary.transcription);
                  setMode("manual");
                  setIsEditing(true);
                }}
              >
                <RefreshCw className="h-4 w-4" />
                Gerar novamente
              </Button>
              <Button type="button" onClick={handleDownloadPdf} disabled={downloadingPdf}>
                {downloadingPdf ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Baixando PDF...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" />
                    Baixar PDF
                  </>
                )}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <p className="text-sm text-destructive">
            Não foi possível conectar ao serviço de IA/MongoDB. Verifique se o servidor AI está
            ativo.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
