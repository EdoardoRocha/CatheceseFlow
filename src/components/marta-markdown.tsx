import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const markdownComponents: Components = {
  p: ({ children }) => <p className="leading-relaxed break-words">{children}</p>,
  h1: ({ children }) => (
    <h1 className="mt-2 mb-1 text-base font-semibold tracking-tight">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-2 mb-1 text-sm font-semibold tracking-tight">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-2 mb-1 text-sm font-semibold tracking-tight">{children}</h3>
  ),
  ul: ({ children }) => <ul className="list-disc space-y-1 pl-4">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal space-y-1 pl-4">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="break-all text-primary underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-background/70 px-1 py-0.5 font-mono text-xs break-all">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md border bg-background/80 p-2 font-mono text-xs [&_code]:bg-transparent [&_code]:p-0 [&_code]:break-normal">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2 border-border" />,
  table: ({ children }) => (
    <div className="my-2 w-full overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-background/60">{children}</thead>,
  th: ({ children }) => (
    <th className="border-b px-2 py-1 text-left font-semibold whitespace-nowrap">{children}</th>
  ),
  td: ({ children }) => <td className="border-b px-2 py-1 align-top">{children}</td>,
};

/** Renderiza respostas da martaAI em Markdown GFM de forma segura e memoizada. */
export const MartaMarkdown = memo(function MartaMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  );
});
