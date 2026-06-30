import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant =
  | "primary"
  | "secondary"
  | "danger"
  | "ghost"
  | "info"
  | "warning"
  | "success";

const styles: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700",
  secondary:
    "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-600 dark:hover:bg-slate-700",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-slate-600 hover:bg-slate-100",
  info: "bg-sky-600 text-white hover:bg-sky-700",
  warning: "bg-amber-500 text-white hover:bg-amber-600",
  success: "bg-emerald-600 text-white hover:bg-emerald-700",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

export function Button({ variant = "primary", className = "", children, ...rest }: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed ${styles[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Badge({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {children}
    </span>
  );
}

export function statusBadge(status: string) {
  switch (status) {
    case "online":
      return <Badge color="bg-green-100 text-green-700">在线</Badge>;
    case "offline":
      return <Badge color="bg-red-100 text-red-700">离线</Badge>;
    default:
      return <Badge color="bg-slate-100 text-slate-600">未知</Badge>;
  }
}

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? "bg-brand-600" : "bg-slate-300"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// CheckBox 自定义勾选框，用于列表多选。
export function CheckBox({
  checked,
  onChange,
  disabled,
  label,
  className = "",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <label
      className={`inline-flex cursor-pointer items-center gap-2 ${disabled ? "cursor-not-allowed opacity-50" : ""} ${className}`}
    >
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border-2 transition ${
          checked
            ? "border-brand-600 bg-brand-600 text-white shadow-sm"
            : "border-slate-300 bg-white hover:border-brand-400 dark:border-slate-600 dark:bg-slate-900"
        }`}
      >
        {checked && (
          <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none" aria-hidden>
            <path
              d="M2.5 6.2 4.8 8.5 9.5 3.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </button>
      {label && (
        <span className="text-sm text-slate-700 dark:text-slate-200">{label}</span>
      )}
    </label>
  );
}

// SettingCard 带标题与说明的分区卡片。
export function SettingCard({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
        {desc && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{desc}</p>}
      </div>
      <div className="divide-y divide-slate-100">{children}</div>
    </section>
  );
}

// SettingRow 一行设置项：左侧 label+说明，右侧控件。
export function SettingRow({
  label,
  desc,
  children,
}: {
  label: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</div>
        {desc && <div className="mt-0.5 text-xs text-slate-400">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
