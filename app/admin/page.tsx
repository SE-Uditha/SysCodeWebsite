import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AdminDashboard } from '@/components/admin/AdminDashboard';
import { getAdminSession } from '@/lib/admin/auth';
import { countPendingChanges, getAdminContent, getAdminProfile, getContentRevisions, inquiryRevision, listChangeRequests, listInquiries, listStaff } from '@/lib/admin/store';

export default function AdminPage() {
  return (
    <Suspense fallback={<main id="main-content" className="flex min-h-dvh items-center justify-center p-6"><p role="status" className="text-sm font-semibold text-orange-800">Opening your workspace…</p></main>}>
      <AuthenticatedDashboard />
    </Suspense>
  );
}

async function AuthenticatedDashboard() {
  const session = await getAdminSession();
  if (!session) redirect('/admin/login');
  const [inquiries, content, approvals, staff, pendingCount, profile] = await Promise.all([
    listInquiries(), getAdminContent(), listChangeRequests(session), session.role === 'admin' ? listStaff(session) : Promise.resolve([]), countPendingChanges(session), session.role === 'admin' ? getAdminProfile() : Promise.resolve(null),
  ]);
  return <AdminDashboard
    actor={{ id: session.id, role: session.role, email: session.email, name: session.name }}
    initialInquiries={inquiries}
    initialContent={content}
    initialContentRevisions={getContentRevisions(content)}
    initialInquiryRevisions={Object.fromEntries(inquiries.map((inquiry) => [inquiry.id, inquiryRevision(inquiry)]))}
    initialApprovals={approvals}
    initialStaff={staff}
    initialPendingCount={pendingCount}
    initialProfile={profile}
  />;
}
