import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// 界面偏好：全局字号缩放、源码编辑器字号、字体。
// 通过 CSS 变量作用到全局，选择持久化到 localStorage。

export interface Prefs {
  uiScale: number; // 全局缩放百分比：100 = 默认
  editorFontSize: number; // 源码编辑器字号 px
  fontFamily: "system" | "serif" | "mono";
}

const DEFAULT_PREFS: Prefs = {
  uiScale: 100,
  editorFontSize: 14,
  fontFamily: "system",
};

const STORAGE_KEY = "nginx_admin_prefs";

const FONT_STACKS: Record<Prefs["fontFamily"], string> = {
  system:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
  serif: 'Georgia, "Times New Roman", "Songti SC", "SimSun", serif',
  mono: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, "Courier New", monospace',
};

function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return DEFAULT_PREFS;
}

interface SettingsCtx {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  reset: () => void;
}

const Ctx = createContext<SettingsCtx>({
  prefs: DEFAULT_PREFS,
  setPrefs: () => {},
  reset: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);

  // 应用到根元素的 CSS 变量 / 字号
  useEffect(() => {
    const root = document.documentElement;
    // 用根字号承载全局缩放：rem 基准 = 16px * scale
    root.style.fontSize = `${(prefs.uiScale / 100) * 16}px`;
    root.style.setProperty("--editor-font-size", `${prefs.editorFontSize}px`);
    root.style.setProperty("--app-font-family", FONT_STACKS[prefs.fontFamily]);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
  }, [prefs]);

  const setPrefs = (patch: Partial<Prefs>) =>
    setPrefsState((p) => ({ ...p, ...patch }));
  const reset = () => setPrefsState(DEFAULT_PREFS);

  return (
    <Ctx.Provider value={{ prefs, setPrefs, reset }}>{children}</Ctx.Provider>
  );
}

export function useSettings() {
  return useContext(Ctx);
}
