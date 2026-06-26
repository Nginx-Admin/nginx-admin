// nginx 配置 ↔ 节点模型的双向解析（前端轻量实现）。
//
// 设计取舍：只对 server / location / upstream 三类块做结构化建模，
// 其它顶层指令（http 级别的 gzip、map、include 等）作为 "raw 前导/尾随片段" 原样保留，
// 保证往返不丢失未建模内容。复杂场景请走源码模式。

export type NodeKind = "server" | "location" | "upstream";

export interface ServerData {
  listen: string;
  serverName: string;
  root: string;
  index: string;
  ssl: boolean;
  sslCertificate: string;
  sslCertificateKey: string;
  extraDirectives: string; // 该 server 块内未被建模的指令（原样保留，location 除外）
}

export interface LocationData {
  modifier: string; // "", "=", "~", "~*", "^~"
  path: string;
  proxyPass: string;
  tryFiles: string;
  root: string;
  extraDirectives: string;
}

export interface UpstreamServer {
  address: string;
  weight?: string;
  backup?: boolean;
}

export interface UpstreamData {
  name: string;
  method: string; // "", "least_conn", "ip_hash"
  servers: UpstreamServer[];
}

export interface ParsedConfig {
  servers: {
    id: string;
    data: ServerData;
    locations: { id: string; data: LocationData }[];
  }[];
  upstreams: { id: string; data: UpstreamData }[];
  // 无法建模的顶层内容（解析时落在 server/upstream 块之外的部分），原样保留
  preamble: string;
}

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

// ---- 词法：把配置拆成 token，识别 { } ; ----
interface Token {
  type: "word" | "lbrace" | "rbrace" | "semicolon";
  value: string;
}

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = src.length;
  let word = "";
  const pushWord = () => {
    if (word.length) {
      tokens.push({ type: "word", value: word });
      word = "";
    }
  };
  while (i < n) {
    const c = src[i];
    if (c === "#") {
      // 跳到行尾（注释整行忽略——会丢注释，已在设计文档列为已知限制）
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      word += c;
      i++;
      while (i < n && src[i] !== quote) {
        word += src[i];
        i++;
      }
      if (i < n) {
        word += src[i];
        i++;
      }
      continue;
    }
    if (c === "{") {
      pushWord();
      tokens.push({ type: "lbrace", value: "{" });
      i++;
      continue;
    }
    if (c === "}") {
      pushWord();
      tokens.push({ type: "rbrace", value: "}" });
      i++;
      continue;
    }
    if (c === ";") {
      pushWord();
      tokens.push({ type: "semicolon", value: ";" });
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      pushWord();
      i++;
      continue;
    }
    word += c;
    i++;
  }
  pushWord();
  return tokens;
}

// 解析顶层，返回 server / upstream 块与其余原样片段
export function parseConfig(src: string): ParsedConfig {
  const tokens = tokenize(src);
  const result: ParsedConfig = { servers: [], upstreams: [], preamble: "" };
  const preambleParts: string[] = [];

  let i = 0;
  const readBlockTokens = (): Token[] => {
    // 假定当前 tokens[i] 是 lbrace
    const inner: Token[] = [];
    let depth = 0;
    for (; i < tokens.length; i++) {
      const t = tokens[i];
      if (t.type === "lbrace") {
        depth++;
        if (depth === 1) continue; // 跳过最外层 {
      } else if (t.type === "rbrace") {
        depth--;
        if (depth === 0) {
          i++; // 跳过最外层 }
          break;
        }
      }
      inner.push(t);
    }
    return inner;
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === "word") {
      // 收集一条指令的 words 直到 ; 或 {
      const words: string[] = [];
      let j = i;
      for (; j < tokens.length; j++) {
        if (tokens[j].type === "word") words.push(tokens[j].value);
        else break;
      }
      const head = words[0];
      const next = tokens[j];
      if (head === "server" && next?.type === "lbrace") {
        i = j;
        const inner = readBlockTokens();
        result.servers.push(parseServerBlock(inner));
        continue;
      }
      if (head === "upstream" && next?.type === "lbrace") {
        i = j;
        const name = words[1] || "upstream";
        const inner = readBlockTokens();
        result.upstreams.push({ id: uid("upstream"), data: parseUpstreamBlock(name, inner) });
        continue;
      }
      // 其它顶层指令：原样保留
      if (next?.type === "lbrace") {
        i = j;
        const inner = readBlockTokens();
        preambleParts.push(`${words.join(" ")} {\n${tokensToText(inner)}\n}`);
      } else {
        // 简单指令到 ;
        i = j + (next?.type === "semicolon" ? 1 : 0);
        preambleParts.push(words.join(" ") + ";");
      }
      continue;
    }
    i++;
  }

  result.preamble = preambleParts.join("\n");
  return result;
}

function parseServerBlock(inner: Token[]): ParsedConfig["servers"][number] {
  const data: ServerData = {
    listen: "",
    serverName: "",
    root: "",
    index: "",
    ssl: false,
    sslCertificate: "",
    sslCertificateKey: "",
    extraDirectives: "",
  };
  const locations: { id: string; data: LocationData }[] = [];
  const extra: string[] = [];

  let i = 0;
  while (i < inner.length) {
    const t = inner[i];
    if (t.type !== "word") {
      i++;
      continue;
    }
    const words: string[] = [];
    let j = i;
    for (; j < inner.length; j++) {
      if (inner[j].type === "word") words.push(inner[j].value);
      else break;
    }
    const head = words[0];
    const next = inner[j];

    if (head === "location" && next?.type === "lbrace") {
      i = j;
      const block = readInnerBlock(inner, () => i, (v) => (i = v));
      locations.push({ id: uid("location"), data: parseLocation(words.slice(1), block) });
      continue;
    }

    if (next?.type === "semicolon") {
      const value = words.slice(1).join(" ");
      switch (head) {
        case "listen":
          data.listen = data.listen ? data.listen + ", " + value : value;
          if (/\bssl\b/.test(value)) data.ssl = true;
          break;
        case "server_name":
          data.serverName = value;
          break;
        case "root":
          data.root = value;
          break;
        case "index":
          data.index = value;
          break;
        case "ssl_certificate":
          data.sslCertificate = value;
          data.ssl = true;
          break;
        case "ssl_certificate_key":
          data.sslCertificateKey = value;
          break;
        default:
          extra.push(words.join(" ") + ";");
      }
      i = j + 1;
      continue;
    }
    // 块指令（非 location），原样保留
    if (next?.type === "lbrace") {
      i = j;
      const block = readInnerBlock(inner, () => i, (v) => (i = v));
      extra.push(`${words.join(" ")} {\n${tokensToText(block)}\n}`);
      continue;
    }
    i = j;
  }

  data.extraDirectives = extra.join("\n");
  return { id: uid("server"), data, locations };
}

function parseLocation(headWords: string[], inner: Token[]): LocationData {
  let modifier = "";
  let path = "";
  if (headWords.length >= 2 && ["=", "~", "~*", "^~"].includes(headWords[0])) {
    modifier = headWords[0];
    path = headWords[1];
  } else {
    path = headWords[0] || "/";
  }
  const data: LocationData = {
    modifier,
    path,
    proxyPass: "",
    tryFiles: "",
    root: "",
    extraDirectives: "",
  };
  const extra: string[] = [];
  let i = 0;
  while (i < inner.length) {
    const t = inner[i];
    if (t.type !== "word") {
      i++;
      continue;
    }
    const words: string[] = [];
    let j = i;
    for (; j < inner.length; j++) {
      if (inner[j].type === "word") words.push(inner[j].value);
      else break;
    }
    const head = words[0];
    const value = words.slice(1).join(" ");
    if (inner[j]?.type === "semicolon") {
      switch (head) {
        case "proxy_pass":
          data.proxyPass = value;
          break;
        case "try_files":
          data.tryFiles = value;
          break;
        case "root":
          data.root = value;
          break;
        default:
          extra.push(words.join(" ") + ";");
      }
      i = j + 1;
    } else {
      i = j;
    }
  }
  data.extraDirectives = extra.join("\n");
  return data;
}

function parseUpstreamBlock(name: string, inner: Token[]): UpstreamData {
  const data: UpstreamData = { name, method: "", servers: [] };
  let i = 0;
  while (i < inner.length) {
    if (inner[i].type !== "word") {
      i++;
      continue;
    }
    const words: string[] = [];
    let j = i;
    for (; j < inner.length; j++) {
      if (inner[j].type === "word") words.push(inner[j].value);
      else break;
    }
    const head = words[0];
    if (head === "server") {
      const s: UpstreamServer = { address: words[1] || "" };
      for (const w of words.slice(2)) {
        if (w.startsWith("weight=")) s.weight = w.slice("weight=".length);
        if (w === "backup") s.backup = true;
      }
      data.servers.push(s);
    } else if (head === "least_conn" || head === "ip_hash") {
      data.method = head;
    }
    i = j + (inner[j]?.type === "semicolon" ? 1 : 0);
  }
  return data;
}

// 读取一个内嵌块（当前 index 指向 lbrace），返回内部 token 并推进 index 到块尾后
function readInnerBlock(
  tokens: Token[],
  getI: () => number,
  setI: (v: number) => void
): Token[] {
  let i = getI();
  const inner: Token[] = [];
  let depth = 0;
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "lbrace") {
      depth++;
      if (depth === 1) continue;
    } else if (t.type === "rbrace") {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
    inner.push(t);
  }
  setI(i);
  return inner;
}

function tokensToText(tokens: Token[]): string {
  // 简单还原：词之间空格，; 后换行，{ } 独立
  let out = "";
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.type === "word") {
      out += (out.endsWith("\n") || out === "" ? "    " : " ") + t.value;
    } else if (t.type === "semicolon") {
      out += ";\n";
    } else if (t.type === "lbrace") {
      out += " {\n";
    } else if (t.type === "rbrace") {
      out += "}\n";
    }
  }
  return out.trim();
}

// ---- 回写：节点模型 → nginx 配置文本 ----
export function buildConfig(parsed: ParsedConfig): string {
  const parts: string[] = [];
  if (parsed.preamble.trim()) parts.push(parsed.preamble.trim());

  for (const u of parsed.upstreams) {
    parts.push(buildUpstream(u.data));
  }
  for (const s of parsed.servers) {
    parts.push(buildServer(s));
  }
  return parts.join("\n\n") + "\n";
}

function buildUpstream(u: UpstreamData): string {
  const lines = [`upstream ${u.name} {`];
  if (u.method) lines.push(`    ${u.method};`);
  for (const s of u.servers) {
    let line = `    server ${s.address}`;
    if (s.weight) line += ` weight=${s.weight}`;
    if (s.backup) line += ` backup`;
    lines.push(line + ";");
  }
  lines.push("}");
  return lines.join("\n");
}

function buildServer(s: ParsedConfig["servers"][number]): string {
  const d = s.data;
  const lines = ["server {"];
  if (d.listen)
    d.listen.split(",").forEach((l) => lines.push(`    listen ${l.trim()};`));
  if (d.serverName) lines.push(`    server_name ${d.serverName};`);
  if (d.root) lines.push(`    root ${d.root};`);
  if (d.index) lines.push(`    index ${d.index};`);
  if (d.ssl && d.sslCertificate)
    lines.push(`    ssl_certificate ${d.sslCertificate};`);
  if (d.ssl && d.sslCertificateKey)
    lines.push(`    ssl_certificate_key ${d.sslCertificateKey};`);
  if (d.extraDirectives.trim())
    d.extraDirectives
      .trim()
      .split("\n")
      .forEach((l) => lines.push(`    ${l.trim()}`));

  for (const loc of s.locations) {
    lines.push("");
    lines.push(indentBlock(buildLocation(loc.data)));
  }
  lines.push("}");
  return lines.join("\n");
}

function buildLocation(l: LocationData): string {
  const head = l.modifier ? `location ${l.modifier} ${l.path}` : `location ${l.path}`;
  const lines = [`${head} {`];
  if (l.proxyPass) lines.push(`    proxy_pass ${l.proxyPass};`);
  if (l.tryFiles) lines.push(`    try_files ${l.tryFiles};`);
  if (l.root) lines.push(`    root ${l.root};`);
  if (l.extraDirectives.trim())
    l.extraDirectives
      .trim()
      .split("\n")
      .forEach((x) => lines.push(`    ${x.trim()}`));
  lines.push("}");
  return lines.join("\n");
}

function indentBlock(text: string): string {
  return text
    .split("\n")
    .map((l) => (l ? "    " + l : l))
    .join("\n");
}
