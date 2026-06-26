import { useSettings } from "../settings/SettingsContext";
import { Button } from "../components/ui";

export default function Settings() {
  const { prefs, setPrefs, reset } = useSettings();

  return (
    <div className="p-6 max-w-2xl">
      <h1 className="text-xl font-semibold text-slate-800 mb-1">显示设置</h1>
      <p className="text-sm text-slate-500 mb-6">
        调整界面字号、字体。设置即时生效并保存在本浏览器。
      </p>

      <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-6">
        {/* 全局字号 */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">
              界面字号缩放
            </label>
            <span className="text-sm text-slate-500">{prefs.uiScale}%</span>
          </div>
          <input
            type="range"
            min={80}
            max={160}
            step={5}
            value={prefs.uiScale}
            onChange={(e) => setPrefs({ uiScale: Number(e.target.value) })}
            className="mt-2 w-full"
          />
          <div className="mt-1 flex justify-between text-xs text-slate-400">
            <span>小 80%</span>
            <span>默认 100%</span>
            <span>大 160%</span>
          </div>
          <div className="mt-2 flex gap-2">
            {[90, 100, 115, 130].map((v) => (
              <button
                key={v}
                onClick={() => setPrefs({ uiScale: v })}
                className={`rounded border px-2 py-1 text-xs ${
                  prefs.uiScale === v
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>

        {/* 字体 */}
        <div>
          <label className="text-sm font-medium text-slate-700">界面字体</label>
          <div className="mt-2 flex gap-2">
            {(
              [
                { v: "system", label: "系统默认" },
                { v: "serif", label: "衬线" },
                { v: "mono", label: "等宽" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                onClick={() => setPrefs({ fontFamily: o.v })}
                className={`rounded border px-3 py-1.5 text-sm ${
                  prefs.fontFamily === o.v
                    ? "border-brand-500 bg-brand-50 text-brand-700"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* 源码编辑器字号 */}
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">
              源码编辑器字号
            </label>
            <span className="text-sm text-slate-500">
              {prefs.editorFontSize}px
            </span>
          </div>
          <input
            type="range"
            min={11}
            max={22}
            step={1}
            value={prefs.editorFontSize}
            onChange={(e) =>
              setPrefs({ editorFontSize: Number(e.target.value) })
            }
            className="mt-2 w-full"
          />
          <pre className="code mt-2 rounded-md border border-slate-200 bg-slate-50 p-3 text-slate-700">
{`server {
    listen 80;
    server_name example.com;
    location / {
        proxy_pass http://backend;
    }
}`}
          </pre>
        </div>

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={reset}>
            恢复默认
          </Button>
        </div>
      </div>
    </div>
  );
}
