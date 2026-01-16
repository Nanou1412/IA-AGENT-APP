/**
 * Admin Table Components
 * 
 * Reusable table components for admin pages.
 */

import Link from "next/link";

// Table Container
interface TableContainerProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function TableContainer({
  children,
  title,
  subtitle,
  action,
}: TableContainerProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {(title || action) && (
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            {title && <h3 className="font-semibold text-gray-900">{title}</h3>}
            {subtitle && (
              <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
            )}
          </div>
          {action}
        </div>
      )}
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

// Status Badge
interface StatusBadgeProps {
  status: string;
  variant?: "auto" | "success" | "warning" | "danger" | "info" | "neutral";
}

export function StatusBadge({ status, variant = "auto" }: StatusBadgeProps) {
  const getAutoVariant = (s: string) => {
    const successWords = ["active", "paid", "confirmed", "completed", "success", "enabled", "true"];
    const warningWords = ["pending", "incomplete", "draft", "warning", "processing"];
    const dangerWords = ["error", "failed", "canceled", "cancelled", "expired", "blocked", "disabled", "past_due"];
    const infoWords = ["info", "sandbox", "ready"];

    const lower = s.toLowerCase();
    if (successWords.some((w) => lower.includes(w))) return "success";
    if (warningWords.some((w) => lower.includes(w))) return "warning";
    if (dangerWords.some((w) => lower.includes(w))) return "danger";
    if (infoWords.some((w) => lower.includes(w))) return "info";
    return "neutral";
  };

  const v = variant === "auto" ? getAutoVariant(status) : variant;

  const styles = {
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-red-50 text-red-700 border-red-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
    neutral: "bg-gray-50 text-gray-600 border-gray-200",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles[v]}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

// Table Action Button
interface TableActionProps {
  href?: string;
  onClick?: () => void;
  icon?: string;
  label: string;
  variant?: "default" | "primary" | "danger";
}

export function TableAction({
  href,
  onClick,
  icon,
  label,
  variant = "default",
}: TableActionProps) {
  const styles = {
    default: "text-gray-600 hover:text-gray-900 hover:bg-gray-100",
    primary: "text-blue-600 hover:text-blue-700 hover:bg-blue-50",
    danger: "text-red-600 hover:text-red-700 hover:bg-red-50",
  };

  const content = (
    <>
      {icon && <span>{icon}</span>}
      <span>{label}</span>
    </>
  );

  const className = `inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${styles[variant]}`;

  if (href) {
    return (
      <Link href={href} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={className}>
      {content}
    </button>
  );
}

// Filter Bar
interface FilterOption {
  label: string;
  value: string;
}

interface FilterBarProps {
  children: React.ReactNode;
  onSubmit?: (e: React.FormEvent) => void;
  resetHref?: string;
}

export function FilterBar({ children, onSubmit, resetHref }: FilterBarProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-4"
    >
      {children}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Apply Filter
        </button>
        {resetHref && (
          <Link
            href={resetHref}
            className="px-4 py-2 text-gray-600 text-sm font-medium hover:text-gray-900"
          >
            Reset
          </Link>
        )}
      </div>
    </form>
  );
}

// Filter Select
interface FilterSelectProps {
  label: string;
  name: string;
  options: FilterOption[];
  defaultValue?: string;
  placeholder?: string;
}

export function FilterSelect({
  label,
  name,
  options,
  defaultValue,
  placeholder = "All",
}: FilterSelectProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}
      </label>
      <select
        name={name}
        defaultValue={defaultValue}
        className="block w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="">{placeholder}</option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Filter Input
interface FilterInputProps {
  label: string;
  name: string;
  placeholder?: string;
  defaultValue?: string;
  type?: "text" | "number" | "date";
}

export function FilterInput({
  label,
  name,
  placeholder,
  defaultValue,
  type = "text",
}: FilterInputProps) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}
      </label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
  );
}

// Pagination
interface PaginationProps {
  currentPage: number;
  totalPages: number;
  baseHref: string;
}

export function Pagination({
  currentPage,
  totalPages,
  baseHref,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const separator = baseHref.includes("?") ? "&" : "?";

  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      {currentPage > 1 && (
        <Link
          href={`${baseHref}${separator}page=${currentPage - 1}`}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          ← Previous
        </Link>
      )}
      <span className="px-4 py-2 text-sm text-gray-500">
        Page {currentPage} of {totalPages}
      </span>
      {currentPage < totalPages && (
        <Link
          href={`${baseHref}${separator}page=${currentPage + 1}`}
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Next →
        </Link>
      )}
    </div>
  );
}
