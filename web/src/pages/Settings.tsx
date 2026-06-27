import { useSettings } from "../settings/SettingsContext";
import { Button, SettingCard, SettingRow } from "../components/ui";

export default function Settings() {
  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">设置</h1>
      <p className="mb-6 text-sm text-slate-500">调整界面外观偏好。</p>
      <div className="max-w-2xl space-y-5">
        <DisplaySettings />
      </div>
    </div>
  );
}

/* ---------------- 显示设置 ---------------- */
function DisplaySettings() {
  const { prefs, setPrefs, reset } = useSettings();
  const fonts = [
    { v: "system", label: "系统默认" },
    { v: "serif", label: "衬线" },
    { v: "mono", label: "等宽" },
  ] as const;

  return (
    <>
      <SettingCard title="界面外观" desc="即时生效，仅保存在当前浏览器。">
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
            <span className="w-12 text-right text-sm tabular-nums text-slate-600">
              {prefs.uiScale}%
            </span>
          </div>
        </SettingRow>

        <SettingRow label="快捷缩放">
          <div className="flex gap-2">
            {[90, 100, 115, 130].map((v) => (
              <button
                key={v}
                onClick={() => setPrefs({ uiScale: v })}
                className={`rounded-md border px-2.5 py-1 text-xs transition ${
                  prefs.uiScale === v
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow label="界面字体">
          <div className="flex gap-2">
            {fonts.map((o) => (
              <button
                key={o.v}
                onClick={() => setPrefs({ fontFamily: o.v })}
                className={`rounded-md border px-3 py-1.5 text-sm transition ${
                  prefs.fontFamily === o.v
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </SettingRow>
      </SettingCard>

      <SettingCard title="源码编辑器" desc="配置文件源码模式的显示效果。">
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
            <span className="w-12 text-right text-sm tabular-nums text-slate-600">
              {prefs.editorFontSize}px
            </span>
          </div>
        </SettingRow>
        <div className="px-5 py-4">
          <div className="mb-1.5 text-xs text-slate-400">实时预览</div>
          <pre
            className="code overflow-x-auto rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700"
            style={{ fontSize: prefs.editorFontSize }}
          >
{`server {
    listen 80;
    server_name example.com;
    location / {
        proxy_pass http://backend;
    }
}`}
          </pre>
        </div>
      </SettingCard>

      <div className="flex justify-end">
        <Button variant="secondary" onClick={reset}>
          恢复默认
        </Button>
      </div>
    </>
  );
}
