import { useState } from "react";
import { api } from "../api/client";
import { useSettings } from "../settings/SettingsContext";
import { Button, SettingCard, SettingRow } from "../components/ui";

export default function Settings() {
  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">设置</h1>
      <p className="mb-6 text-sm text-slate-500">账号、外观与系统偏好。</p>
      <div className="max-w-2xl space-y-5">
        <PasswordSettings />
        <DisplaySettings />
      </div>
    </div>
  );
}

function PasswordSettings() {
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setErr("");
    if (newPwd.length < 6) {
      setErr("新密码至少 6 位");
      return;
    }
    if (newPwd !== confirm) {
      setErr("两次输入的新密码不一致");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(oldPwd, newPwd);
      setMsg("密码已修改");
      setOldPwd("");
      setNewPwd("");
      setConfirm("");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingCard title="修改密码" desc="修改当前登录账号的密码。">
      <form onSubmit={submit} className="space-y-3 px-5 py-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">原密码</span>
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">新密码</span>
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            required
            minLength={6}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">确认新密码</span>
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
        </label>
        {msg && <p className="text-sm text-green-600">{msg}</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <Button type="submit" disabled={busy}>
          {busy ? "保存中…" : "更新密码"}
        </Button>
      </form>
    </SettingCard>
  );
}

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

        <SettingRow label="颜色主题">
          <div className="flex gap-2">
            {(
              [
                { v: "light" as const, label: "浅色" },
                { v: "dark" as const, label: "深色" },
              ] as const
            ).map((o) => (
              <button
                key={o.v}
                onClick={() => setPrefs({ theme: o.v })}
                className={`rounded-md border px-3 py-1.5 text-sm transition ${
                  prefs.theme === o.v
                    ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"
                    : "border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300"
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
      </SettingCard>

      <div className="flex justify-end">
        <Button variant="secondary" onClick={reset}>
          恢复默认外观
        </Button>
      </div>
    </>
  );
}
