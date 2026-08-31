"use client";

import { useCallback, useMemo, useRef } from "react";

/**
 * Lightweight inline syntax highlighter — no external dependencies or CSS.
 * Handles TypeScript, JavaScript, JSX, TSX, HTML, CSS, JSON, Python, Rust, Go, Shell.
 */

const TOKEN_COLORS: Record<string, string> = {
  keyword: "#c678dd",
  string: "#98c379",
  number: "#d19a66",
  comment: "#5c6370",
  function: "#61afef",
  class: "#e5c07b",
  tag: "#e06c75",
  attr: "#d19a66",
  punctuation: "#abb2bf",
  builtin: "#56b6c2",
  literal: "#56b6c2",
  operator: "#56b6c2",
  property: "#e06c75",
  selector: "#e5c07b",
  constant: "#d19a66",
};

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightLine(line: string, lang: string): string {
  let result = escapeHtml(line);

  // Comments (single-line)
  if (lang === "shell" || lang === "bash") {
    if (/^\s*#/.test(result)) {
      return `<span style="color:${TOKEN_COLORS.comment}">${result}</span>`;
    }
  }
  result = result.replace(/(\/\/.*)$/g, `<span style="color:${TOKEN_COLORS.comment}">$1</span>`);

  // Strings (double and single quoted, backticks)
  result = result.replace(/(`[^`]*`)/g, `<span style="color:${TOKEN_COLORS.string}">$1</span>`);
  result = result.replace(/"[^"]*"/g, `<span style="color:${TOKEN_COLORS.string}">$&</span>`);
  result = result.replace(/'[^']*'/g, `<span style="color:${TOKEN_COLORS.string}">$&</span>`);

  // Numbers
  result = result.replace(/\b(\d+\.?\d*)\b/g, `<span style="color:${TOKEN_COLORS.number}">$1</span>`);

  // Keywords
  const keywords = lang === "python"
    ? /\b(def|class|import|from|return|if|elif|else|for|while|try|except|finally|with|as|pass|break|continue|and|or|not|in|is|lambda|yield|async|await|raise|self|True|False|None)\b/g
    : lang === "rust"
      ? /\b(fn|let|mut|const|pub|struct|enum|impl|trait|use|mod|return|if|else|for|while|loop|match|move|async|await|ref|self|super|crate|type|where|true|false|Some|None|Ok|Err)\b/g
      : /\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|delete|typeof|instanceof|class|extends|import|export|default|from|async|await|yield|try|catch|finally|throw|this|super|true|false|null|undefined|void|typeof|in|of|interface|type|enum|module|namespace|declare|abstract|private|protected|public|static|readonly|as|any|boolean|string|number|symbol|never|unknown)\b/g;
  result = result.replace(keywords, `<span style="color:${TOKEN_COLORS.keyword}">$1</span>`);

  // Function calls
  result = result.replace(/\b([a-zA-Z_$][\w$]*)\(/g, (match, name) => {
    if (name === "if" || name === "for" || name === "while" || name === "switch") return match;
    return `<span style="color:${TOKEN_COLORS.function}">${name}</span>(`;
  });

  // JSX/HTML tags
  if (lang === "tsx" || lang === "jsx" || lang === "html" || lang === "typescript" || lang === "javascript") {
    result = result.replace(/(&lt;\/?)([\w-]+)/g, (_, bracket, tag) => {
      return `${bracket}<span style="color:${TOKEN_COLORS.tag}">${tag}</span>`;
    });
    result = result.replace(/([\w-]+)(=)(&quot;|")/g, (_, attr, eq, quote) => {
      return `<span style="color:${TOKEN_COLORS.attr}">${attr}</span>${eq}${quote}`;
    });
  }

  // CSS
  if (lang === "css") {
    result = result.replace(/([\w-]+)(?=\s*:)/g, `<span style="color:${TOKEN_COLORS.property}">$1</span>`);
    result = result.replace(/(\.?[\w-]+)(?=\s*\{)/g, `<span style="color:${TOKEN_COLORS.selector}">$1</span>`);
  }

  return result;
}

function highlight(code: string, language: string): string {
  const lang = language === "auto" ? "typescript" : language;
  const lines = code.split("\n");
  return lines.map((line) => highlightLine(line, lang)).join("\n");
}

/**
 * SyntaxHighlightedEditor — a code editor with syntax highlighting.
 * Uses a transparent textarea overlaid on a highlighted <pre> block.
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

  const highlighted = useMemo(() => highlight(value, language), [value, language]);

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
        <code dangerouslySetInnerHTML={{ __html: highlighted }} />
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