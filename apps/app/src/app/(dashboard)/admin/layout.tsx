/**
 * Admin Layout
 * 
 * Wraps all admin pages with the AdminHeader component.
 */

import { AdminHeaderWrapper } from "@/components/admin-header-wrapper";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminHeaderWrapper />
      {children}
    </>
  );
}
