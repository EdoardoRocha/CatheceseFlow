import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { BookOpen, FileText, Loader2, Search, Sparkles, Trash2, Upload } from "lucide-react";
import { usePageTitle } from "@/hooks/use-page-title";
import { aiApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type KnowledgeDocument = {
  id: string;
  title: string;
  filename: string;
  category: string;
  description: string;
  parish_id: number;
  total_pages: number;
  total_chunks: number;
  uploaded_by: string;
  created_at: string;
};

type KnowledgeMatch = {
  document_id: string;
  document_title: string;
  category: string;
  page_number: number;
  chunk_index: number;
  score: number;
  content: string;
};

type KnowledgeSearchResult = {
  query: string;
  search_mode: "vector_search" | "cosine_fallback";
  matches: KnowledgeMatch[];
};

const CATEGORIES = ["Geral", "Primeira Comunhão", "Perseverança", "Crisma"] as const;

function extractAiError(err: unknown): string | undefined {
  const data = (err as { response?: { data?: { detail?: string; message?: string } } })?.response
    ?.data;
  return data?.detail ?? data?.message;
}

export function KnowledgeBasePage() {
  usePageTitle("Base de Conhecimento IA · CatheceseFlow");
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("Geral");
  const [description, setDescription] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchCategory, setSearchCategory] = useState<string>("ALL");

  const parishId = user?.ParishId ?? null;
  const canDelete = user?.role === "Admin" || user?.role === "Coordenador";

  const docsQuery = useQuery({
    enabled: parishId != null,
    queryKey: ["knowledge-documents", parishId],
    queryFn: async () => {
      const res = await aiApi.get<KnowledgeDocument[]>("/knowledge/documents", {
        params: { parish_id: parishId },
      });
      return res.data;
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file || parishId == null) {
        throw new Error("Selecione um arquivo PDF válido.");
      }
      const formData = new FormData();
      formData.append("file", file);
      formData.append("parish_id", String(parishId));
      formData.append("title", title.trim());
      formData.append("category", category);
      formData.append("description", description.trim());
      formData.append("uploaded_by", user?.name ?? "");

      const res = await aiApi.post<KnowledgeDocument>("/knowledge/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return res.data;
    },
    onSuccess: (created) => {
      toast.success(`"${created.title}" indexado com ${created.total_chunks} trechos!`);
      setFile(null);
      setTitle("");
      setCategory("Geral");
      setDescription("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      void qc.invalidateQueries({ queryKey: ["knowledge-documents", parishId] });
    },
    onError: (err) => {
      toast.error(extractAiError(err) ?? "Não foi possível indexar o PDF.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (docId: string) => {
      if (parishId == null || !user?.role) return;
      await aiApi.delete(`/knowledge/documents/${docId}`, {
        params: { parish_id: parishId },
        headers: { "X-User-Role": user.role },
      });
    },
    onSuccess: () => {
      toast.success("Documento removido da base de conhecimento.");
      void qc.invalidateQueries({ queryKey: ["knowledge-documents", parishId] });
    },
    onError: (err) => {
      toast.error(extractAiError(err) ?? "Erro ao excluir documento.");
    },
  });

  const searchMutation = useMutation({
    mutationFn: async () => {
      if (parishId == null) throw new Error("Paróquia não identificada.");
      const res = await aiApi.post<KnowledgeSearchResult>("/knowledge/search", {
        query: searchQuery.trim(),
        parish_id: parishId,
        category: searchCategory === "ALL" ? null : searchCategory,
        top_k: 5,
      });
      return res.data;
    },
    onError: (err) => {
      toast.error(extractAiError(err) ?? "Erro ao buscar na base RAG.");
    },
  });

  const handleUploadSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!file) {
      toast.error("Escolha um arquivo .pdf para enviar.");
      return;
    }
    uploadMutation.mutate();
  };

  const handleSearchSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim().length < 2) {
      toast.error("Digite ao menos 2 caracteres para pesquisar.");
      return;
    }
    searchMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">Base de Conhecimento IA (RAG)</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Envie PDFs de formações anteriores da sua paróquia. A Marta indexa o conteúdo para
          consultar e estruturar novas formações no chat.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" />
            Enviar PDF de Formação
          </CardTitle>
          <CardDescription>
            Arquivos .pdf com texto selecionável (máximo 15 MB), isolados para sua paróquia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUploadSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="rag-pdf-file">Arquivo PDF *</Label>
                <Input
                  id="rag-pdf-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="rag-category">Categoria / Etapa</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="rag-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rag-title">Título da formação (opcional)</Label>
              <Input
                id="rag-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Formação Eucaristia e Partilha — Crisma 2025"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rag-desc">Observações / contexto (opcional)</Label>
              <Textarea
                id="rag-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex.: Material usado no encontro preparatório com pais e jovens..."
                rows={2}
              />
            </div>

            <Button type="submit" disabled={uploadMutation.isPending || !file}>
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Indexando PDF...
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Enviar e Indexar PDF
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4" />
            Testar Busca Semântica (RAG)
          </CardTitle>
          <CardDescription>
            Teste o que a Marta recupera da base indexada ao pesquisar um tema.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={handleSearchSubmit} className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ex.: dinâmicas para falar sobre o Espírito Santo..."
              className="flex-1"
            />
            <Select value={searchCategory} onValueChange={setSearchCategory}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas categorias</SelectItem>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={searchMutation.isPending}>
              {searchMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Pesquisar"
              )}
            </Button>
          </form>

          {searchMutation.data && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{searchMutation.data.matches.length} trecho(s) encontrado(s)</span>
                <Badge variant="outline">
                  {searchMutation.data.search_mode === "vector_search"
                    ? "Atlas Vector Search"
                    : "Similaridade Cosseno"}
                </Badge>
              </div>
              {searchMutation.data.matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum trecho correspondente encontrado nos PDFs desta paróquia.
                </p>
              ) : (
                searchMutation.data.matches.map((match) => (
                  <div
                    key={`${match.document_id}-${match.chunk_index}`}
                    className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{match.document_title}</span>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Badge variant="secondary">{match.category}</Badge>
                        <span>Pág. {match.page_number}</span>
                        <span>Score {match.score.toFixed(2)}</span>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-muted-foreground">{match.content}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4" />
            PDFs Indexados ({docsQuery.data?.length ?? 0})
          </CardTitle>
          <CardDescription>
            Documentos disponíveis para a Marta nesta paróquia.
            {!canDelete && " Apenas Coordenadores e Administradores podem excluir arquivos."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {docsQuery.isLoading ? (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando documentos...
            </div>
          ) : docsQuery.data && docsQuery.data.length > 0 ? (
            <div className="space-y-2.5">
              {docsQuery.data.map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{doc.title}</span>
                      <Badge variant="secondary">{doc.category}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {doc.filename} · {doc.total_pages} página(s) · {doc.total_chunks} trecho(s)
                      {doc.uploaded_by ? ` · Enviado por ${doc.uploaded_by}` : ""}
                    </p>
                    {doc.description && (
                      <p className="text-xs text-muted-foreground">{doc.description}</p>
                    )}
                  </div>

                  {canDelete && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-destructive hover:text-destructive"
                          disabled={deleteMutation.isPending}
                          aria-label={`Excluir ${doc.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir documento da Base IA?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Isso removerá permanentemente &ldquo;{doc.title}&rdquo; e todos os seus{" "}
                            {doc.total_chunks} trechos indexados da base de conhecimento da
                            paróquia.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => deleteMutation.mutate(doc.id)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-sm text-muted-foreground">
              Nenhum PDF indexado ainda para esta paróquia. Envie o primeiro acima para alimentar a
              memória da Marta.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
