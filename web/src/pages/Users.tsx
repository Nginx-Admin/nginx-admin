import { useEffect, useState } from "react";
import { api, type User } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/ui";

const ROLES: User["role"][] = ["admin", "editor", "viewer"];

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);

  const load = () => {
    setLoading(true);
    api
      .listUsers()
      .then((r) => setUsers(r.users || []))
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (me?.role !== "admin") {
    return (
      <div className="p-6 text-slate-500">需要管理员权限。</div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">用户管理</h1>
        <Button onClick={() => setShowCreate(true)}>+ 新增用户</Button>
      </div>
      {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
      {loading ? (
        <p className="text-slate-400">加载中...</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">用户名</th>
                <th className="px-4 py-2 font-medium">角色</th>
                <th className="px-4 py-2 font-medium">状态</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-800">
                    {u.username}
                    {u.id === me?.id && (
                      <span className="ml-2 text-xs text-slate-400">（当前）</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-600">{u.role}</td>
                  <td className="px-4 py-2">
                    {u.disabled ? (
                      <span className="text-red-600">已禁用</span>
                    ) : (
                      <span className="text-green-600">正常</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Button variant="secondary" onClick={() => setEditing(u)}>
                      编辑
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(showCreate || editing) && (
        <UserModal
          user={editing}
          onClose={() => {
            setShowCreate(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowCreate(false);
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function UserModal({
  user,
  onClose,
  onSaved,
}: {
  user: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!user;
  const [username, setUsername] = useState(user?.username ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<User["role"]>(user?.role ?? "viewer");
  const [disabled, setDisabled] = useState(user?.disabled ?? false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      if (isEdit && user) {
        await api.updateUser(user.id, {
          role,
          disabled,
          ...(password ? { password } : {}),
        });
      } else {
        if (password.length < 6) {
          setErr("密码至少 6 位");
          setBusy(false);
          return;
        }
        await api.createUser(username.trim(), password, role);
      }
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const doDelete = async () => {
    if (!user) return;
    if (!confirm(`确定删除用户 ${user.username}？`)) return;
    setBusy(true);
    try {
      await api.deleteUser(user.id);
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/30 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
      >
        <h2 className="text-lg font-semibold text-slate-800">
          {isEdit ? "编辑用户" : "新增用户"}
        </h2>
        {!isEdit && (
          <label className="mt-4 block text-sm font-medium text-slate-700">
            用户名
            <input
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </label>
        )}
        <label className="mt-3 block text-sm font-medium text-slate-700">
          {isEdit ? "新密码（留空则不修改）" : "密码"}
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!isEdit}
            minLength={isEdit ? undefined : 6}
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          角色
          <select
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            value={role}
            onChange={(e) => setRole(e.target.value as User["role"])}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        {isEdit && (
          <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={disabled}
              onChange={(e) => setDisabled(e.target.checked)}
            />
            禁用账号
          </label>
        )}
        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
        <div className="mt-5 flex items-center gap-2">
          {isEdit && (
            <Button type="button" variant="danger" onClick={doDelete} disabled={busy}>
              删除
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              取消
            </button>
            <Button type="submit" disabled={busy}>
              {busy ? "保存中…" : "保存"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
