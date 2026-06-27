import { useEffect, useState } from "react";
import { useSettings } from "../settings/SettingsContext";
import { Button } from "../components/ui";
import { api, type Server } from "../api/client";
import { useAuth } from "../auth/AuthContext";

type Tab = "display" | "backup" | "editor";

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("display");

  const tabs: { key: Tab; label: string; adminOnly?: boolean }[] = [
    { key: "display", label: "显示设置" },
    { key: "backup", label: "备份设置", adminOnly: true },
    { key: "editor", label: "编辑开关", adminOnly: true },
  ];

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold text-slate-800">设置</h1>
      <div className="flex gap-6">
        {/* 左侧子导航 */}
        <nav className="w-40 shrink-0 space-y-1">
          {tabs
            .filter((t) => !t.adminOnly || isAdmin)
            .map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
                  tab === t.key
                    ? "bg-brand-50 font-medium text-brand-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {t.label}
              </button>
            ))}
        </nav>

        {/* 右侧内容 */}
        <div className="max-w-2xl flex-1">
          {tab === "display" && <DisplaySettings />}
          {tab === "backup" && isAdmin && <BackupSettings />}
          {tab === "editor" && isAdmin && <EditorToggle />}
        </div>
      </div>
    </div>
  );
}

/* ---------------- 显示设置（外观偏好，存浏览器） ---------------- */
function DisplaySettings() {
  const { prefs, setPrefs, reset } = useSettings();
  return (
    <section>
      <p className="mb-4 text-sm text-slate-500">
        调整界面字号、字体。设置即时生效并保存在本浏览器。
      </p>
      <div className="space-y-6 rounded-lg border border-slate-200 bg-white p-6">
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
        </div>

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <Button variant="secondary" onClick={reset}>
            恢复默认
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 备份设置（中心全局，存数据库） ---------------- */
function BackupSettings() {
  const [retain, setRetain] = useState<number>(5);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .getSettings()
      .then((r) => setRetain(r.retain_per_file))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const r = await api.updateSettings(retain);
      setRetain(r.retain_per_file);
      setMsg("已保存");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-slate-400">加载中...</p>;

  return (
    <section>
      <p className="mb-4 text-sm text-slate-500">
        中心侧备份策略。写入配置时，中心会保留每个配置文件的最近 N 份内容副本（容灾）。
      </p>
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <label className="block text-sm font-medium text-slate-700">
          中心每文件保留份数
          <input
            type="number"
            min={1}
            max={100}
            className="mt-1 w-32 rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={retain}
            onChange={(e) => setRetain(Number(e.target.value))}
          />
        </label>
        {msg && <p className="text-sm text-green-600">{msg}</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end border-t border-slate-100 pt-4">
          <Button onClick={save} disabled={saving}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- 编辑开关（按服务器的 Agent 设置） ---------------- */
function EditorToggle() {
  const [servers, setServers] = useState<Server[]>([]);
  const [serverId, setServerId] = useState("");
  const [retain, setRetain] = useState(50);
  const [allowMain, setAllowMain] = useState(false);
  const [remoteAllowed, setRemoteAllowed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .listServers()
      .then((r) => {
        setServers(r.servers || []);
        if (r.servers?.[0]) setServerId(r.servers[0].id);
      })
      .catch((e) => setErr((e as Error).message));
  }, []);

  // 选中服务器后拉取其 Agent 设置
  useEffect(() => {
    if (!serverId) return;
    setLoading(true);
    setMsg("");
    setErr("");
    api
      .getAgentSettings(serverId)
      .then((r) => {
        setRetain(r.backup_retain);
        setAllowMain(r.allow_main_config);
        setRemoteAllowed(r.allow_main_config_remote);
      })
      .catch((e) => setErr("无法读取该 Agent 设置：" + (e as Error).message))
      .finally(() => setLoading(false));
  }, [serverId]);

  const save = async () => {
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const r = await api.updateAgentSettings(serverId, retain, allowMain);
      setRetain(r.backup_retain);
      setAllowMain(r.allow_main_config);
      setRemoteAllowed(r.allow_main_config_remote);
      setMsg("已下发到 Agent 并持久化");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <p className="mb-4 text-sm text-slate-500">
        每台 Agent 的本地策略：快照保留份数、是否允许编辑主配置。修改会实时下发到对应 Agent 并持久化。
      </p>
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-6">
        <label className="block text-sm font-medium text-slate-700">
          选择服务器
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
          >
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}（{s.address}）
              </option>
            ))}
          </select>
        </label>

        {loading ? (
          <p className="text-slate-400">读取 Agent 设置中...</p>
        ) : (
          <>
            <label className="block text-sm font-medium text-slate-700">
              Agent 本地快照保留份数
              <input
                type="number"
                min={1}
                max={500}
                className="mt-1 w-32 rounded-md border border-slate-300 px-3 py-2 text-sm"
                value={retain}
                onChange={(e) => setRetain(Number(e.target.value))}
              />
            </label>

            <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-amber-800">
                <input
                  type="checkbox"
                  checked={allowMain}
                  disabled={!remoteAllowed}
                  onChange={(e) => setAllowMain(e.target.checked)}
                />
                允许编辑主配置 nginx.conf（高危）
              </label>
              {!remoteAllowed && (
                <p className="mt-1 text-xs text-amber-700">
                  该 Agent 未开启远程总闸（config.yaml 的{" "}
                  <code>allow_main_config_remote: true</code>），
                  出于安全无法在此远程开启。如确需开启，请在该机器本地修改后重启 Agent。
                </p>
              )}
            </div>
          </>
        )}

        {msg && <p className="text-sm text-green-600">{msg}</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end border-t border-slate-100 pt-4">
          <Button onClick={save} disabled={saving || loading || !serverId}>
            {saving ? "下发中..." : "保存并下发"}
          </Button>
        </div>
      </div>
    </section>
  );
}
