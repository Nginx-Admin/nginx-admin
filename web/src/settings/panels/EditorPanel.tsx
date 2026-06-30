import { SettingCard, SettingRow } from "../../components/ui";
import { useSettings } from "../SettingsContext";

export default function EditorPanel() {
  const { prefs, setPrefs } = useSettings();

  return (
    <SettingCard title="源码模式" desc="配置文件源码编辑器的显示效果。">
      <SettingRow label="编辑器字号">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={11}
            max={22}
            step={1}
            value={prefs.editorFontSize}
            onChange={(e) =>
              setPrefs({ editorFontSize: Number(e.target.value) })
            }
            className="w-40 accent-brand-600"
          />
          <span className="w-12 text-right text-sm tabular-nums text-slate-600 dark:text-slate-300">
            {prefs.editorFontSize}px
          </span>
        </div>
      </SettingRow>

      <SettingRow label="快捷字号">
        <div className="flex flex-wrap gap-2">
          {[12, 14, 16, 18].map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setPrefs({ editorFontSize: v })}
              className={`rounded-md border px-2.5 py-1 text-xs transition ${
                prefs.editorFontSize === v
                  ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                  : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {v}px
            </button>
          ))}
        </div>
      </SettingRow>
    </SettingCard>
  );
}
