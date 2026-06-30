import { useMemo, useRef } from "react";

const KEYWORDS =
  /\b(server|location|upstream|listen|server_name|root|index|proxy_pass|try_files|include|return|rewrite|ssl_certificate|ssl_certificate_key|gzip|map|events|http|limit_req|access_log|error_log|if|set|add_header|fastcgi_pass|uwsgi_pass|grpc_pass)\b/g;
const STRINGS = /("([^"\\]|\\.)*"|'([^'\\]|\\.)*')/g;
const COMMENTS = /(#.*$)/gm;
const NUMBERS = /\b\d+\b/g;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** 占位符：不可含裸数字，否则会被 NUMBERS 正则误匹配 */
function placeholderKey(i: number): string {
  return `\x01HL_${i}_\x01`;
}

/** 轻量 nginx 语法高亮（无第三方依赖） */
export function highlightNginx(code: string): string {
  const placeholders: { key: string; html: string }[] = [];
  let i = 0;
  const ph = (html: string) => {
    const key = placeholderKey(i++);
    placeholders.push({ key, html });
    return key;
  };

  let text = escapeHtml(code);
  text = text.replace(COMMENTS, (m) => ph(`<span class="tok-comment">${m}</span>`));
  text = text.replace(STRINGS, (m) => ph(`<span class="tok-string">${m}</span>`));
  text = text.replace(KEYWORDS, (m) => ph(`<span class="tok-keyword">${m}</span>`));
  text = text.replace(NUMBERS, (m) => ph(`<span class="tok-number">${m}</span>`));

  for (const p of placeholders) {
    text = text.split(p.key).join(p.html);
  }
  return text;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  readOnly?: boolean;
}

export default function SourceEditor({ value, onChange, readOnly }: Props) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const preRef = useRef<HTMLPreElement>(null);

  const html = useMemo(() => highlightNginx(value) + "\n", [value]);
  const lines = value.split("\n").length || 1;

  const syncScroll = () => {
    if (taRef.current && preRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop;
      preRef.current.scrollLeft = taRef.current.scrollLeft;
    }
  };

  return (
    <div className="source-editor relative h-full w-full overflow-hidden bg-[var(--editor-bg)]">
      <div className="absolute left-0 top-0 bottom-0 w-10 select-none border-r border-slate-200 bg-slate-50 py-4 text-right text-xs leading-[1.5] text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500">
        {Array.from({ length: lines }, (_, n) => (
          <div key={n} style={{ height: "calc(var(--editor-font-size) * 1.5)" }}>
            {n + 1}
          </div>
        ))}
      </div>
      <pre
        ref={preRef}
        aria-hidden
        className="code pointer-events-none absolute left-10 right-0 top-0 m-0 overflow-hidden whitespace-pre py-4 pl-3 pr-4 text-slate-800 dark:text-slate-100"
        style={{ fontSize: "var(--editor-font-size)" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <textarea
        ref={taRef}
        className="source-editor-input code absolute left-10 right-0 top-0 m-0 h-full w-[calc(100%-2.5rem)] resize-none overflow-auto border-0 bg-transparent py-4 pl-3 pr-4 text-transparent caret-slate-900 focus:outline-none dark:caret-slate-100"
        style={{ fontSize: "var(--editor-font-size)", lineHeight: 1.5 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onScroll={syncScroll}
        readOnly={readOnly}
        spellCheck={false}
      />
    </div>
  );
}
