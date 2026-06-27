import { useEffect, useState } from "react";
import { useSettings } from "../settings/SettingsContext";
import { Button, SettingCard, SettingRow, Toggle } from "../components/ui";
import { api, type Server } from "../api/client";
import { useAuth } from "../auth/AuthContext";

type Tab = "display" | "editor";

const TABS: {
  key: Tab;
  label: string;
  desc: string;
  icon: string;
  adminOnly?: boolean;
}[] = [
  { key: "display", label: "显示设置", desc: "界面字号与字体", icon: "🎨" },
  {
    key: "editor",
    label: "编辑开关",
    desc: "各节点 Agent 策略",
    icon: "🛡️",
    adminOnly: true,
  },
];

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [tab, setTab] = useState<Tab>("display");
  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold text-slate-800">设置</h1>
      <p className="mb-6 text-sm text-slate-500">
        管理界面外观与各节点的 Agent 编辑权限。
      </p>

      <div className="flex gap-6">
        {/* 左侧子导航：图标 + 标题 + 描述 */}
        <nav className="w-52 shrink-0 space-y-1">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                  active
                    ? "border-brand-200 bg-brand-50"
                    : "border-transparent hover:bg-slate-100"
                }`}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                <span className="min-w-0">
                  <span
                    className={`block text-sm font-medium ${
                      active ? "text-brand-700" : "text-slate-700"
                    }`}
                  >
                    {t.label}
                  </span>
                  <span className="block text-xs text-slate-400">{t.desc}</span>
                </span>
              </button>
            );
          })}
        </nav>

        {/* 右侧内容 */}
        <div className="max-w-2xl flex-1 space-y-5">
          {tab === "display" && <DisplaySettings />}
          {tab === "editor" && isAdmin && <EditorToggle />}
        </div>
      </div>
    </div>
  );
}

/* ---------- 小工具：保存反馈条 ---------- */
function Feedback({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return (
    <div
      className={`rounded-md px-3 py-2 text-sm ${
        err
          ? "bg-red-50 text-red-700"
          : "bg-green-50 text-green-700"
      }`}
    >
      {err || msg}
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
      <SettingCard
        title="界面外观"
        desc="即时生效，仅保存在当前浏览器。"
      >
        <SettingRow
          label="界面字号缩放"
          desc="整体放大或缩小界面文字与控件"
        >
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

/* ---------------- 编辑开关（按服务器的 Agent 设置） ---------------- */
function EditorToggle() {
  const [servers, setServers] = useState<Server[]>([]);
  const [serverId, setServerId] = useState("");
  const [retain, setRetain] = useState(50);
  const [allowMain, setAllowMain] = useState(false);
  const [remoteAllowed, setRemoteAllowed] = useState(false);
  const [snapshot, setSnapshot] = useState({ retain: 50, allowMain: false });
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
        setSnapshot({ retain: r.backup_retain, allowMain: r.allow_main_config });
      })
      .catch((e) => setErr("无法读取该 Agent 设置：" + (e as Error).message))
      .finally(() => setLoading(false));
  }, [serverId]);

  const dirty = retain !== snapshot.retain || allowMain !== snapshot.allowMain;

  const save = async () => {
    setSaving(true);
    setMsg("");
    setErr("");
    try {
      const r = await api.updateAgentSettings(serverId, retain, allowMain);
      setRetain(r.backup_retain);
      setAllowMain(r.allow_main_config);
      setRemoteAllowed(r.allow_main_config_remote);
      setSnapshot({ retain: r.backup_retain, allowMain: r.allow_main_config });
      setMsg("已下发到 Agent 并持久化");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingCard
        title="目标节点"
        desc="选择要配置的服务器，设置将实时下发到对应 Agent。"
      >
        <SettingRow label="服务器">
          <select
            className="w-72 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
            value={serverId}
            onChange={(e) => setServerId(e.target.value)}
          >
            {servers.length === 0 && <option value="">（暂无服务器）</option>}
            {servers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}（{s.address}）
              </option>
            ))}
          </select>
        </SettingRow>
      </SettingCard>

      {loading ? (
        <p className="text-slate-400">读取 Agent 设置中...</p>
      ) : serverId ? (
        <>
          <SettingCard title="Agent 本地策略">
            <SettingRow
              label="本地快照保留份数"
              desc="该节点本地保留的配置快照数量"
            >
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={500}
                  className="w-24 rounded-md border border-slate-300 px-3 py-1.5 text-sm"
                  value={retain}
                  onChange={(e) => setRetain(Number(e.target.value))}
                />
                <span className="text-sm text-slate-400">份</span>
              </div>
            </SettingRow>

            <SettingRow
              label="允许编辑主配置 nginx.conf"
              desc={
                remoteAllowed
                  ? "高危：开启后可在画布/源码中改写主配置"
                  : "该节点未开启远程总闸，无法在此远程开启"
              }
            >
              <Toggle
                checked={allowMain}
                disabled={!remoteAllowed}
                onChange={setAllowMain}
              />
            </SettingRow>
          </SettingCard>

          {/* 高危提示卡 */}
          {!remoteAllowed && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <div className="font-medium">主配置编辑开关被本地总闸锁定</div>
              <p className="mt-1 leading-relaxed">
                出于安全，远程修改主配置编辑权限默认禁用。如确需开启，请在该机器
                的 <code className="rounded bg-amber-100 px-1">config.yaml</code> 中设置{" "}
                <code className="rounded bg-amber-100 px-1">
                  nginx.allow_main_config_remote: true
                </code>{" "}
                后重启 Agent。
              </p>
            </div>
          )}

          <Feedback msg={msg} err={err} />
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving || !dirty}>
              {saving ? "下发中..." : "保存并下发"}
            </Button>
          </div>
        </>
      ) : (
        <p className="text-slate-400">请先在「服务列表」中添加服务器。</p>
      )}
    </>
  );
}
