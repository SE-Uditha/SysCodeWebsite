import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { getAdminSession, isAdminConfigured } from '@/lib/admin/auth';

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<main id="main-content" className="flex min-h-dvh items-center justify-center p-6"><p role="status" className="text-sm font-semibold text-orange-800">Opening admin sign in…</p></main>}>
      <Login />
    </Suspense>
  );
}

async function Login() {
  let session = null;
  let configured = false;
  let unavailable = false;
  try {
    session = await getAdminSession();
    if (!session) configured = await isAdminConfigured();
  } catch {
    unavailable = true;
  }
  if (session) redirect('/admin');
  return <AdminLoginForm configured={configured} unavailable={unavailable} />;
}
