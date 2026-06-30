import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface Prefs {
  uiScale: number;
  editorFontSize: number;
  fontFamily: "system" | "serif" | "mono";
  theme: "light" | "dark";
}

const DEFAULT_PREFS: Prefs = {
  uiScale: 100,
  editorFontSize: 14,
  fontFamily: "system",
  theme: "light",
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

  useEffect(() => {
    const root = document.documentElement;
    root.style.fontSize = `${(prefs.uiScale / 100) * 16}px`;
    root.style.setProperty("--editor-font-size", `${prefs.editorFontSize}px`);
    root.style.setProperty("--app-font-family", FONT_STACKS[prefs.fontFamily]);
    root.classList.toggle("dark", prefs.theme === "dark");
    root.style.colorScheme = prefs.theme;
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
