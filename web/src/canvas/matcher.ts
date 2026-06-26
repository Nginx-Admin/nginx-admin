import type { Directive, NodePath } from "./directives";

// 流量模拟：在指令树里按 nginx 优先级匹配请求路径，
// 返回命中 location 所属的顶层 server 块路径（用于画布高亮）。
//
// 优先级：精确(=) > 前缀优先(^~) > 正则(~ / ~*，按定义顺序) > 普通前缀(最长匹配)。
export function matchLocation(
  dirs: Directive[],
  reqPath: string
): NodePath | null {
  for (let i = 0; i < dirs.length; i++) {
    const d = dirs[i];
    if (d.directive !== "server" || !d.block) continue;
    if (serverMatches(d.block, reqPath)) {
      return [i];
    }
  }
  return null;
}

interface Loc {
  modifier: string;
  path: string;
}

function collectLocations(block: Directive[]): Loc[] {
  const out: Loc[] = [];
  for (const d of block) {
    if (d.directive === "location") {
      // location 的 args：可能是 [path] 或 [modifier, path]
      if (d.args.length >= 2 && ["=", "~", "~*", "^~"].includes(d.args[0])) {
        out.push({ modifier: d.args[0], path: d.args[1] });
      } else if (d.args.length >= 1) {
        out.push({ modifier: "", path: d.args[0] });
      }
    }
  }
  return out;
}

function serverMatches(block: Directive[], reqPath: string): boolean {
  const locs = collectLocations(block);
  // 1. 精确
  if (locs.some((l) => l.modifier === "=" && l.path === reqPath)) return true;

  // 2. 普通前缀 / ^~ 最长匹配
  let best: { len: number; stop: boolean } | null = null;
  for (const l of locs) {
    if ((l.modifier === "" || l.modifier === "^~") && reqPath.startsWith(l.path)) {
      const len = l.path.length;
      if (!best || len > best.len) best = { len, stop: l.modifier === "^~" };
    }
  }
  if (best?.stop) return true;

  // 3. 正则
  for (const l of locs) {
    if (l.modifier === "~" || l.modifier === "~*") {
      try {
        const re = new RegExp(l.path, l.modifier === "~*" ? "i" : "");
        if (re.test(reqPath)) return true;
      } catch {
        /* 非法正则忽略 */
      }
    }
  }

  // 4. 回退到普通前缀
  return best != null;
}
