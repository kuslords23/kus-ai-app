"use client";

import { useCallback, useMemo, useRef } from "react";
import hljs from "highlight.js";
import "highlight.js/styles/github-dark.min.css";

/**
 * SyntaxHighlightedEditor — a code editor with syntax highlighting.
 *
 * Uses a transparent textarea overlaid on a highlighted <pre> block.
 * The textarea captures input; the pre shows highlighted code behind it.
 * Scroll positions are synced between the two layers.
 */
export function SyntaxHighlightedEditor({
  value,
  onChange,
  language = "typescript",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  language?: string;
  className?: string;
}) {
  const preRef = useRef<HTMLPreElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const highlighted = useMemo(() => {
    try {
      const lang = language === "auto" ? "typescript" : language;
      const result = hljs.highlight(value, { language: lang, ignoreIllegals: true });
      return result.value;
    } catch {
      return value;
    }
  }, [value, language]);

  const syncScroll = useCallback(() => {
    if (preRef.current && textareaRef.current) {
      preRef.current.scrollTop = textareaRef.current.scrollTop;
      preRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newVal = value.slice(0, start) + "  " + value.slice(end);
      onChange(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <pre
        ref={preRef}
        className="absolute inset-0 m-0 p-4 font-mono text-xs leading-6 overflow-auto whitespace-pre-wrap break-all pointer-events-none"
        style={{ backgroundColor: "var(--editor-bg)", color: "var(--editor-text)" }}
        aria-hidden="true"
      >
        <code className={`language-${language}`} dangerouslySetInnerHTML={{ __html: highlighted }} />
      </pre>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        className="relative w-full h-full resize-none bg-transparent text-transparent p-4 font-mono text-xs leading-6 outline-none overflow-auto whitespace-pre-wrap break-all"
        style={{ caretColor: "var(--gold)" }}
      />
    </div>
  );
}