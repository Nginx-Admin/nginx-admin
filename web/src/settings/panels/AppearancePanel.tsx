import { Button, SettingCard, SettingRow } from "../../components/ui";
import { useSettings } from "../SettingsContext";

const fonts = [
  { v: "system", label: "系统默认" },
  { v: "serif", label: "衬线" },
  { v: "mono", label: "等宽" },
] as const;

const themes = [
  { v: "light" as const, label: "浅色" },
  { v: "dark" as const, label: "深色" },
] as const;

export default function AppearancePanel() {
  const { prefs, setPrefs, reset } = useSettings();

  return (
    <div className="space-y-5">
      <SettingCard title="显示" desc="即时生效，仅保存在当前浏览器。">
        <SettingRow label="界面字号缩放" desc="整体放大或缩小界面文字与控件">
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={80}
              max={160}
              step={5}
              value={prefs.uiScale}
              onChange={(e) => setPrefs({ uiScale: Number(e.target.value) })}
              className="w-40 accent-brand-600"
            />
            <span className="w-12 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
              {prefs.uiScale}%
            </span>
          </div>
        </SettingRow>

        <SettingRow label="快捷缩放">
          <div className="flex flex-wrap gap-2">
            {[90, 100, 115, 130].map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setPrefs({ uiScale: v })}
                className={`rounded-md border px-2.5 py-1 text-xs transition ${
                  prefs.uiScale === v
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow label="界面字体">
          <div className="flex flex-wrap gap-2">
            {fonts.map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setPrefs({ fontFamily: o.v })}
                className={`rounded-md border px-3 py-1.5 text-sm transition ${
                  prefs.fontFamily === o.v
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow label="颜色主题">
          <div className="flex gap-2">
            {themes.map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setPrefs({ theme: o.v })}
                className={`rounded-md border px-3 py-1.5 text-sm transition ${
                  prefs.theme === o.v
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </SettingRow>
      </SettingCard>

      <div className="flex justify-end">
        <Button variant="secondary" onClick={reset}>
          恢复默认偏好
        </Button>
      </div>
    </div>
  );
}
