import { useState } from "react";
import { api } from "../../api/client";
import { Button, SettingCard } from "../../components/ui";

export default function AccountPanel() {
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
          <span className="font-medium text-slate-700 dark:text-slate-200">
            原密码
          </span>
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">
            新密码
          </span>
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            required
            minLength={6}
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700 dark:text-slate-200">
            确认新密码
          </span>
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
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
