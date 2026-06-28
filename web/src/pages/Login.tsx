import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await login(username, password);
      nav("/");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm border border-slate-200"
      >
        <h1 className="text-xl font-semibold text-slate-800">Nginx Admin</h1>
        <p className="mt-1 text-sm text-slate-500">Nginx 可视化管理控制台</p>

        <label className="mt-6 block text-sm font-medium text-slate-700">
          用户名
          <input
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </label>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          密码
          <input
            type="password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <Button type="submit" disabled={busy} className="mt-6 w-full">
          {busy ? "登录中..." : "登录"}
        </Button>
      </form>
    </div>
  );
}
