/**
 * Admin Card Components
 * 
 * Reusable card components for admin dashboard.
 * 
 * Brand Colors:
 * - Bleu ciel:  #87CEEB (primary-300)
 * - Bleu nuit:  #0B1220 (primary-900)
 * - Blanc:      #FFFFFF
 * - Gris clair: #F1F5F9 (brand-light)
 * - Vert:       #16A34A (success-600)
 */

import Link from "next/link";

// Stat Card - for displaying KPIs
interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  href?: string;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "purple";
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  href,
  variant = "default",
}: StatCardProps) {
  const variantStyles = {
    default: "bg-white border-gray-200",
    success: "bg-gradient-to-br from-success-50 to-success-100 border-success-200",
    warning: "bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200",
    danger: "bg-gradient-to-br from-red-50 to-rose-50 border-red-200",
    info: "bg-gradient-to-br from-primary-50 to-primary-100 border-primary-200",
    purple: "bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200",
  };

  const valueColors = {
    default: "text-primary-900",
    success: "text-success-600",
    warning: "text-amber-600",
    danger: "text-red-600",
    info: "text-primary-600",
    purple: "text-purple-600",
  };

  const content = (
    <div
      className={`rounded-xl border p-5 transition-all hover:shadow-md ${variantStyles[variant]} ${
        href ? "cursor-pointer hover:scale-[1.02]" : ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className={`text-3xl font-bold mt-1 ${valueColors[variant]}`}>
            {typeof value === "number" ? value.toLocaleString() : value}
          </p>
          {subtitle && (
            <p className="text-xs text-slate-400 mt-1">{subtitle}</p>
          )}
          {trend && (
            <p
              className={`text-xs mt-2 flex items-center gap-1 ${
                trend.isPositive ? "text-success-600" : "text-red-600"
              }`}
            >
              <span>{trend.isPositive ? "↑" : "↓"}</span>
              <span>{Math.abs(trend.value)}%</span>
              <span className="text-slate-400">vs last period</span>
            </p>
          )}
        </div>
        {icon && (
          <span className="text-3xl opacity-60">{icon}</span>
        )}
      </div>
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

// Action Card - for navigation items
interface ActionCardProps {
  title: string;
  description: string;
  icon: string;
  href: string;
  variant?: "default" | "primary" | "success" | "warning" | "purple" | "orange";
  badge?: string;
}

export function ActionCard({
  title,
  description,
  icon,
  href,
  variant = "default",
  badge,
}: ActionCardProps) {
  const variantStyles = {
    default: "bg-white border-gray-200 hover:border-gray-300",
    primary: "bg-gradient-to-br from-primary-50 to-primary-100 border-primary-200 hover:border-primary-300",
    success: "bg-gradient-to-br from-success-50 to-success-100 border-success-200 hover:border-success-300",
    warning: "bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200 hover:border-amber-300",
    purple: "bg-gradient-to-br from-purple-50 to-violet-50 border-purple-200 hover:border-purple-300",
    orange: "bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200 hover:border-orange-300",
  };

  const buttonStyles = {
    default: "bg-brand-light text-primary-900 hover:bg-gray-200",
    primary: "bg-primary-300 text-primary-900 hover:bg-primary-400",
    success: "bg-success-600 text-white hover:bg-success-700",
    warning: "bg-amber-500 text-white hover:bg-amber-600",
    purple: "bg-purple-600 text-white hover:bg-purple-700",
    orange: "bg-orange-500 text-white hover:bg-orange-600",
  };

  return (
    <Link href={href}>
      <div
        className={`rounded-xl border p-5 transition-all hover:shadow-lg hover:scale-[1.02] ${variantStyles[variant]}`}
      >
        <div className="flex items-start gap-4">
          <span className="text-3xl">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-primary-900">{title}</h3>
              {badge && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                  {badge}
                </span>
              )}
            </div>
            <p className="text-sm text-slate-500 mt-1">{description}</p>
          </div>
        </div>
        <div className="mt-4">
          <span
            className={`inline-flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${buttonStyles[variant]}`}
          >
            View
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}

// Section Header
interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    href: string;
  };
}

export function SectionHeader({ title, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-lg font-semibold text-primary-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>
      {action && (
        <Link
          href={action.href}
          className="text-sm text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1"
        >
          {action.label}
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </Link>
      )}
    </div>
  );
}

// Page Header
interface PageHeaderProps {
  title: string;
  subtitle?: string;
  backHref?: string;
  backLabel?: string;
  actions?: React.ReactNode;
  badge?: {
    label: string;
    variant: "success" | "warning" | "danger" | "info";
  };
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Back",
  actions,
  badge,
}: PageHeaderProps) {
  const badgeStyles = {
    success: "bg-success-100 text-success-800",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-red-100 text-red-800",
    info: "bg-primary-100 text-primary-800",
  };

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
      <div className="flex items-center gap-4">
        {backHref && (
          <Link
            href={backHref}
            className="flex items-center gap-1 text-slate-500 hover:text-slate-700 text-sm font-medium"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {backLabel}
          </Link>
        )}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-primary-900">{title}</h1>
            {badge && (
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${badgeStyles[badge.variant]}`}
              >
                {badge.label}
              </span>
            )}
          </div>
          {subtitle && (
            <p className="text-slate-500 mt-1">{subtitle}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

// Empty State
interface EmptyStateProps {
  icon: string;
  title: string;
  description: string;
  action?: {
    label: string;
    href: string;
  };
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-4">
      <span className="text-6xl mb-4 block">{icon}</span>
      <h3 className="text-lg font-medium text-primary-900 mb-2">{title}</h3>
      <p className="text-slate-500 mb-4 max-w-md mx-auto">{description}</p>
      {action && (
        <Link
          href={action.href}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-300 text-primary-900 rounded-lg hover:bg-primary-400 transition-colors font-medium"
        >
          {action.label}
        </Link>
      )}
    </div>
  );
}
