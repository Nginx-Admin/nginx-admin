import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { Button } from "./ui";

const STORAGE_KEY = "nginx_admin_sidebar";

type NavIcon = "servers" | "audit" | "users" | "settings";

const nav: {
  to: string;
  label: string;
  end: boolean;
  adminOnly?: boolean;
  icon: NavIcon;
}[] = [
  { to: "/", label: "服务列表", end: true, icon: "servers" },
  { to: "/audit", label: "操作审计", end: false, icon: "audit" },
  {
    to: "/users",
    label: "用户管理",
    end: false,
    adminOnly: true,
    icon: "users",
  },
  { to: "/settings", label: "设置", end: false, icon: "settings" },
];

function loadCollapsed(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { collapsed?: boolean };
      return !!p.collapsed;
    }
  } catch {
    // ignore
  }
  return false;
}

function saveCollapsed(collapsed: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ collapsed }));
  } catch {
    // ignore
  }
}

function NavIconSvg({ icon }: { icon: NavIcon }) {
  const cls = "h-[18px] w-[18px] shrink-0";
  switch (icon) {
    case "servers":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect
            x="3"
            y="4"
            width="18"
            height="6"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <rect
            x="3"
            y="14"
            width="18"
            height="6"
            rx="1.5"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <circle cx="7" cy="7" r="1" fill="currentColor" />
          <circle cx="7" cy="17" r="1" fill="currentColor" />
        </svg>
      );
    case "audit":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M8 4h8l2 4v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinejoin="round"
          />
          <path
            d="M9 12h6M9 16h4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case "users":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <circle cx="9" cy="8" r="3" stroke="currentColor" strokeWidth="1.75" />
          <path
            d="M3 19c0-2.2 2.7-4 6-4s6 1.8 6 4"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
          <path
            d="M16 8.5a2.5 2.5 0 1 1 0 5M14.5 19c.3-1.8 2.2-3 4.5-3"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
    case "settings":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
          <path
            d="M12 8.5A3.5 3.5 0 1 0 12 15.5 3.5 3.5 0 0 0 12 8.5Z"
            stroke="currentColor"
            strokeWidth="1.75"
          />
          <path
            d="M12 3v1.2M12 19.8V21M4.2 12H3M21 12h-1.2M6.3 6.3l-.85-.85M18.55 18.55l-.85-.85M17.7 6.3l.85-.85M5.45 18.55l.85-.85"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </svg>
      );
  }
}

function SidebarPanelIcon({ collapsed }: { collapsed: boolean }) {
  const cls = "h-5 w-5 shrink-0";
  return (
    <svg className={cls} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M9 4v16"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
      <path
        d={collapsed ? "M11.5 12l2.5 2.5-2.5 2.5" : "M14.5 12l-2.5-2.5 2.5-2.5"}
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SidebarToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
      aria-expanded={!collapsed}
      title={collapsed ? "展开侧边栏" : "收起侧边栏"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-100"
    >
      <SidebarPanelIcon collapsed={collapsed} />
    </button>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(loadCollapsed);

  useEffect(() => {
    saveCollapsed(collapsed);
  }, [collapsed]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => !c);
  }, []);

  const items = nav.filter((n) => !n.adminOnly || user?.role === "admin");

  return (
    <div className="flex h-full">
      <aside
        className={`flex shrink-0 flex-col border-r border-slate-200 bg-white transition-[width] duration-200 ease-out dark:border-slate-800 dark:bg-slate-900 ${
          collapsed ? "w-16" : "w-56"
        }`}
      >
        <div
          className={`flex items-center border-b border-slate-100 dark:border-slate-800 ${
            collapsed
              ? "flex-col gap-2 px-2 py-3"
              : "justify-between gap-2 px-4 py-4"
          }`}
        >
          {collapsed ? (
            <span
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white"
              title="Nginx Admin"
            >
              N
            </span>
          ) : (
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-semibold text-slate-800 dark:text-slate-100">
                Nginx Admin
              </div>
              <div className="text-xs text-slate-400">控制台</div>
            </div>
          )}
          <SidebarToggle collapsed={collapsed} onToggle={toggleCollapsed} />
        </div>

        <nav
          className={`flex-1 space-y-1 py-3 ${collapsed ? "px-2" : "px-3"}`}
          aria-label="主导航"
        >
          {items.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              title={n.label}
              className={({ isActive }) =>
                `flex items-center rounded-md text-sm font-medium transition ${
                  collapsed ? "justify-center px-2 py-2.5" : "gap-2.5 px-3 py-2"
                } ${
                  isActive
                    ? "bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-300"
                    : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                }`
              }
            >
              <NavIconSvg icon={n.icon} />
              {!collapsed && <span className="truncate">{n.label}</span>}
              {collapsed && <span className="sr-only">{n.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div
          className={`border-t border-slate-100 dark:border-slate-800 ${
            collapsed ? "px-2 py-3" : "px-4 py-3"
          }`}
        >
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                title={`${user?.username}（${user?.role}）`}
              >
                {(user?.username?.[0] || "?").toUpperCase()}
              </span>
              <button
                type="button"
                onClick={logout}
                title="退出登录"
                aria-label="退出登录"
                className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path
                    d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"
                    stroke="currentColor"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <div className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                {user?.username}
              </div>
              <div className="mb-2 text-xs text-slate-400">角色：{user?.role}</div>
              <Button variant="secondary" className="w-full" onClick={logout}>
                退出登录
              </Button>
            </>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
