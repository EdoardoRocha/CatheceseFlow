import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation, useParams } from "react-router-dom";
import {
  Bot,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MartaMarkdown } from "@/components/marta-markdown";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth-context";
import { downloadMartaPdf, sendMartaMessage, type MartaPageContextPayload } from "@/lib/marta-api";
import {
  clearMartaChatStorage,
  getMartaHistoryForApi,
  loadMartaMessages,
  saveMartaMessages,
  type MartaAttachment,
  type MartaStoredMessage,
} from "@/lib/marta-storage";
import { cn } from "@/lib/utils";

const TOOL_LABELS: Record<string, string> = {
  get_classes_overview: "Consultando turmas...",
  get_student_attendance: "Consultando alunos e frequência...",
  get_students_age: "Consultando idades dos alunos...",
  search_lecture_summaries: "Buscando resumos de formações...",
  search_formation_knowledge: "Pesquisando PDFs de formações anteriores...",
  generate_formation_pdf: "Montando e gerando o PDF da formação...",
  get_platform_faq: "Consultando guia da plataforma...",
};

const QUICK_PROMPTS = [
  "Quais turmas estão cadastradas?",
  "Quais alunos têm mais faltas?",
  "Como gerar o PDF de uma formação?",
];

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function toNumericId(value: string | undefined): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function MartaChatWidget() {
  const { user } = useAuth();
  const location = useLocation();
  const params = useParams<{ classId?: string; lectureId?: string }>();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<MartaStoredMessage[]>(() => loadMartaMessages());
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [lastFailedPrompt, setLastFailedPrompt] = useState<string | null>(null);
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pageContext = useMemo<MartaPageContextPayload>(
    () => ({
      current_path: location.pathname,
      class_id: toNumericId(params.classId),
      lecture_id: toNumericId(params.lectureId),
      user_name: user?.name ?? null,
      user_role: user?.role ?? null,
      parish_id: user?.ParishId ?? null,
    }),
    [location.pathname, params.classId, params.lectureId, user],
  );

  useEffect(() => {
    saveMartaMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open, activeTool]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleClear = () => {
    abortRef.current?.abort();
    clearMartaChatStorage();
    setMessages([]);
    setLastFailedPrompt(null);
    setActiveTool(null);
    setIsSending(false);
  };

  const dispatchQuestion = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || isSending) return;

    const historySnapshot = getMartaHistoryForApi(messages, 10);
    const userMsg: MartaStoredMessage = {
      id: createId(),
      role: "user",
      content: text,
      createdAt: new Date().toISOString(),
    };
    const assistantId = createId();
    const placeholderMsg: MartaStoredMessage = {
      id: assistantId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg, placeholderMsg]);
    setInput("");
    setLastFailedPrompt(null);
    setActiveTool(null);
    setIsSending(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await sendMartaMessage({
        message: text,
        history: historySnapshot,
        context: pageContext,
        signal: controller.signal,
        onTool: (toolName) => {
          setActiveTool(TOOL_LABELS[toolName] ?? `Executando ${toolName}...`);
        },
        onAttachment: (attachment) => {
          setMessages((prev) =>
            prev.map((m) => {
              if (m.id !== assistantId) return m;
              const current = m.attachments ?? [];
              if (current.some((item) => item.id === attachment.id)) return m;
              return { ...m, attachments: [...current, attachment] };
            }),
          );
        },
        onToken: (chunk) => {
          setActiveTool(null);
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: `${m.content}${chunk}` } : m)),
          );
        },
      });

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content: result.reply,
                toolsUsed: result.toolsUsed,
                attachments:
                  result.attachments.length > 0 ? result.attachments : (m.attachments ?? []),
                error: false,
              }
            : m,
        ),
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "Não foi possível obter resposta da martaAI no momento.";
      setLastFailedPrompt(text);
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantId ? { ...m, content: msg, error: true } : m)),
      );
    } finally {
      setActiveTool(null);
      setIsSending(false);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void dispatchQuestion(input);
  };

  const handleDownloadPdf = async (attachment: MartaAttachment) => {
    if (downloadingPdfId) return;
    setDownloadingPdfId(attachment.id);
    try {
      await downloadMartaPdf(attachment);
    } catch {
      toast.error("Não foi possível baixar o PDF da formação.");
    } finally {
      setDownloadingPdfId(null);
    }
  };

  const contextLabel = pageContext.class_id
    ? `Turma #${pageContext.class_id} aberta`
    : "Visão Geral";

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start gap-2">
      {open && (
        <section
          aria-label="Chat martaAI"
          className="flex h-[520px] max-h-[calc(100vh-5rem)] w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-xl sm:w-[380px]"
        >
          <header className="flex items-center justify-between border-b bg-muted/40 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold">martaAI</span>
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                    {contextLabel}
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">Memória temporária desta aba</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleClear}
                title="Limpar conversa"
                aria-label="Limpar conversa"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setOpen(false)}
                title="Fechar martaAI"
                aria-label="Fechar martaAI"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <ScrollArea className="flex-1 px-3 py-3">
            {messages.length === 0 ? (
              <div className="space-y-3 py-4 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-muted">
                  <Bot className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium">Olá, {user?.name ?? "catequista"}!</p>
                  <p className="text-xs text-muted-foreground">
                    Pergunte sobre turmas, catequizandos, faltas, resumos ou como usar a plataforma.
                  </p>
                </div>
                <div className="flex flex-col gap-1.5 pt-2">
                  {QUICK_PROMPTS.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => void dispatchQuestion(suggestion)}
                      className="rounded-lg border bg-muted/30 px-3 py-2 text-left text-xs transition hover:bg-accent"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex flex-col gap-1",
                      msg.role === "user" ? "items-end" : "items-start",
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] min-w-0 break-words rounded-lg px-3 py-2 text-sm",
                        msg.role === "user"
                          ? "whitespace-pre-wrap bg-primary text-primary-foreground"
                          : msg.error
                            ? "whitespace-pre-wrap border border-destructive/40 bg-destructive/10 text-destructive"
                            : "bg-muted text-foreground",
                      )}
                    >
                      {msg.role === "assistant" && !msg.error && msg.content ? (
                        <MartaMarkdown content={msg.content} />
                      ) : (
                        msg.content || (isSending ? "..." : "")
                      )}
                    </div>
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex max-w-[85%] flex-col gap-1.5 pt-0.5">
                        {msg.attachments.map((att) => (
                          <div
                            key={att.id}
                            className="flex items-center justify-between gap-2 rounded-lg border bg-background px-2.5 py-2 text-xs shadow-xs"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <FileText className="h-4 w-4 shrink-0 text-primary" />
                              <span className="truncate font-medium" title={att.title}>
                                {att.title}
                              </span>
                            </div>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-7 shrink-0 px-2 text-xs"
                              disabled={downloadingPdfId === att.id}
                              onClick={() => void handleDownloadPdf(att)}
                            >
                              {downloadingPdfId === att.id ? (
                                <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="mr-1 h-3.5 w-3.5" />
                              )}
                              Baixar PDF
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {activeTool && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>{activeTool}</span>
                  </div>
                )}

                {lastFailedPrompt && !isSending && (
                  <div className="flex justify-start">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void dispatchQuestion(lastFailedPrompt)}
                    >
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      Tentar novamente
                    </Button>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}
          </ScrollArea>

          <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t p-2.5">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Pergunte para a martaAI..."
              disabled={isSending}
              className="h-9 text-sm"
            />
            <Button
              type="submit"
              size="icon"
              className="h-9 w-9 shrink-0"
              disabled={isSending || !input.trim()}
              aria-label="Enviar mensagem"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>
        </section>
      )}

      <Button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="h-11 rounded-full px-4 shadow-lg"
        aria-label={open ? "Minimizar martaAI" : "Abrir martaAI"}
      >
        <Sparkles className="mr-2 h-4 w-4" />
        <span>martaAI</span>
      </Button>
    </div>
  );
}
