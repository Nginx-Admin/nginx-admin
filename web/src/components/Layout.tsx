import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "./ui";

const nav = [
  { to: "/", label: "服务列表", end: true },
  { to: "/audit", label: "操作审计", end: false },
  { to: "/settings", label: "显示设置", end: false },
];

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="flex h-full">
      <aside className="flex w-56 flex-col border-r border-slate-200 bg-white">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="text-lg font-semibold text-slate-800">nginx-admin</div>
          <div className="text-xs text-slate-400">控制台</div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 px-4 py-3">
          <div className="text-sm font-medium text-slate-700">
            {user?.username}
          </div>
          <div className="text-xs text-slate-400 mb-2">角色：{user?.role}</div>
          <Button variant="secondary" className="w-full" onClick={logout}>
            退出登录
          </Button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
