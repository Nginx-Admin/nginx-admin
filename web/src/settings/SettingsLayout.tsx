import { NavLink, Outlet, useLocation } from "react-router-dom";

const sections = [
  {
    id: "account",
    to: "/settings/account",
    label: "账号安全",
    desc: "登录密码",
  },
  {
    id: "appearance",
    to: "/settings/appearance",
    label: "界面外观",
    desc: "字号、字体与主题",
  },
  {
    id: "editor",
    to: "/settings/editor",
    label: "源码编辑器",
    desc: "配置编辑显示",
  },
] as const;

export default function SettingsLayout() {
  const { pathname } = useLocation();
  const active = sections.find((s) => pathname.endsWith(s.id)) ?? sections[0];

  return (
    <div className="flex h-full min-h-0 flex-col p-6">
      <header className="mb-6 shrink-0">
        <h1 className="text-xl font-semibold text-slate-800 dark:text-slate-100">
          设置
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          按模块管理账号与界面偏好。
        </p>
      </header>

      <div className="flex min-h-0 flex-1 gap-6">
        <nav
          className="w-52 shrink-0 space-y-1"
          aria-label="设置分类"
        >
          {sections.map((s) => (
            <NavLink
              key={s.id}
              to={s.to}
              className={({ isActive }) =>
                `block rounded-lg border px-3 py-2.5 transition ${
                  isActive
                    ? "border-brand-200 bg-brand-50 dark:border-brand-800 dark:bg-brand-950/40"
                    : "border-transparent text-slate-600 hover:border-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
                }`
              }
            >
              <div
                className={`text-sm font-medium ${
                  pathname.endsWith(s.id)
                    ? "text-brand-700 dark:text-brand-300"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                {s.label}
              </div>
              <div className="mt-0.5 text-xs text-slate-400">{s.desc}</div>
            </NavLink>
          ))}
        </nav>

        <div className="min-w-0 flex-1 overflow-auto">
          <div className="mb-4 border-b border-slate-100 pb-3 dark:border-slate-800">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              {active.label}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {active.desc}
            </p>
          </div>
          <div className="max-w-2xl">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
