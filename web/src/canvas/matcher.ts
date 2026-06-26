import type { ParsedConfig } from "./nginxParser";

// 流量模拟：给定请求路径，按 nginx 优先级匹配 location，返回命中的 locationId。
// 优先级：精确(=) > 前缀优先(^~) > 正则(~ / ~*，按定义顺序) > 普通前缀(最长匹配)。
export function matchLocation(
  parsed: ParsedConfig,
  reqPath: string
): { serverId: string; locationId: string } | null {
  for (const s of parsed.servers) {
    // 1. 精确匹配
    for (const l of s.locations) {
      if (l.data.modifier === "=" && l.data.path === reqPath) {
        return { serverId: s.id, locationId: l.id };
      }
    }
    // 2. 普通前缀里找最长匹配，并记录是否有 ^~
    let bestPrefix: { id: string; len: number; stop: boolean } | null = null;
    for (const l of s.locations) {
      if (l.data.modifier === "" || l.data.modifier === "^~") {
        if (reqPath.startsWith(l.data.path)) {
          const len = l.data.path.length;
          if (!bestPrefix || len > bestPrefix.len) {
            bestPrefix = {
              id: l.id,
              len,
              stop: l.data.modifier === "^~",
            };
          }
        }
      }
    }
    // 若最长前缀是 ^~，直接命中，不再测正则
    if (bestPrefix?.stop) {
      return { serverId: s.id, locationId: bestPrefix.id };
    }
    // 3. 正则（按定义顺序）
    for (const l of s.locations) {
      if (l.data.modifier === "~" || l.data.modifier === "~*") {
        try {
          const re = new RegExp(
            l.data.path,
            l.data.modifier === "~*" ? "i" : ""
          );
          if (re.test(reqPath)) {
            return { serverId: s.id, locationId: l.id };
          }
        } catch {
          // 非法正则忽略
        }
      }
    }
    // 4. 回退到普通前缀最长匹配
    if (bestPrefix) {
      return { serverId: s.id, locationId: bestPrefix.id };
    }
  }
  return null;
}
