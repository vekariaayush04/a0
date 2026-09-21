// Assistant markdown, rendered as a monochrome document.
//
// GFM via remark-gfm (tables, strikethrough, task lists). react-markdown's
// default pipeline is used as-is: no rehype-raw, so raw HTML in a message is
// escaped, never executed.
//
// The type scale and rhythm live in the `.prose-mono` block in styles.css;
// only the fenced-code chrome is a component (it needs a copy button). No
// syntax highlighting: code stays one hue, per the house monochrome rule.

import { memo, useState } from "react";
import type { Element } from "hast";
import { Check, Copy } from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

/** Flatten a hast element to its text, so a code block renders verbatim. */
function hastText(node: Element): string {
  let out = "";
  for (const child of node.children) {
    if (child.type === "text") out += child.value;
    else if (child.type === "element") out += hastText(child);
  }
  return out;
}

/** Find the `code` child of a `pre` and its `language-*` class. */
function readFence(node: Element | undefined): {
  language: string;
  text: string;
} | null {
  const code = node?.children.find(
    (child): child is Element =>
      child.type === "element" && child.tagName === "code",
  );
  if (!code) return null;
  const classes = code.properties?.className ?? [];
  const language = classes
    .map((name) => /^language-(.+)$/.exec(name)?.[1] ?? "")
    .find(Boolean);
  return {
    language: language ?? "",
    text: hastText(code).replace(/\n$/, ""),
  };
}

function CodeBlock({ language, text }: { language: string; text: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    if (await copyText(text)) {
      setCopied(true);
      toast("Code copied");
      setTimeout(() => setCopied(false), 1400);
    } else {
      toast("Could not copy the code");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-muted">
      <div className="flex items-center justify-end gap-1.5 border-b border-border/70 px-2 py-1">
        {language ? (
          <span className="font-mono text-10 uppercase tracking-[0.1em] text-muted-foreground">
            {language}
          </span>
        ) : null}
        <button
          type="button"
          aria-label="Copy code"
          title="Copy code"
          onClick={onCopy}
          className="flex h-4.5 w-4.5 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-12 leading-[1.6] text-foreground">
        <code>{text}</code>
      </pre>
    </div>
  );
}

const components: Components = {
  pre({ node, children }) {
    const fence = readFence(node);
    if (!fence) return <pre>{children}</pre>;
    return <CodeBlock language={fence.language} text={fence.text} />;
  },
  a({ node: _node, href, children, ...rest }) {
    return (
      <a {...rest} href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    );
  },
};

export type MarkdownProps = {
  /** Raw markdown produced by the assistant. Rendered without truncation. */
  text: string;
  className?: string;
};

export const Markdown = memo(function Markdown({
  text,
  className,
}: MarkdownProps) {
  if (!text.trim()) return null;
  return (
    <div className={cn("prose-mono", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
