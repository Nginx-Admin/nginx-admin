/** 简单行级 diff（用于保存前对比） */

export type DiffLineType = "same" | "add" | "remove";

export interface DiffLine {
  type: DiffLineType;
  text: string;
  oldNo?: number;
  newNo?: number;
}

export function lineDiff(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split("\n");
  const b = newText.split("\n");
  const n = a.length;
  const m = b.length;
  // LCS 表
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    Array(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldNo = 1;
  let newNo = 1;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: "same", text: a[i], oldNo, newNo });
      i++;
      j++;
      oldNo++;
      newNo++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: "remove", text: a[i], oldNo });
      i++;
      oldNo++;
    } else {
      out.push({ type: "add", text: b[j], newNo });
      j++;
      newNo++;
    }
  }
  while (i < n) {
    out.push({ type: "remove", text: a[i], oldNo });
    i++;
    oldNo++;
  }
  while (j < m) {
    out.push({ type: "add", text: b[j], newNo });
    j++;
    newNo++;
  }
  return out;
}

export function hasDiff(oldText: string, newText: string): boolean {
  return oldText !== newText;
}
