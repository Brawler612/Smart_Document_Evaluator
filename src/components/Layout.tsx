import { Component, useState, type ErrorInfo, type ReactNode } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import StudentRateUsButton from './student/StudentRateUsButton';
import StudentOnboardingTour from './student/StudentOnboardingTour';
import InvitedStudentEmailNotifier from './student/InvitedStudentEmailNotifier';
import UserAvatar from './UserAvatar';
import { useAuth } from '../context/AuthContext';
import { useTeacherGoogleSheetsAutoSync } from '../hooks/useTeacherGoogleSheetsAutoSync';
import SupabaseConnectionBadge from './teacher/SupabaseConnectionBadge';

class OutletErrorBoundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state: { err: Error | null } = { err: null };

  static getDerivedStateFromError(e: Error) {
    return { err: e };
  }

  componentDidCatch(e: Error, info: ErrorInfo) {
    console.error('[outlet]', e.message, info.componentStack);
  }

  render() {
    if (this.state.err) {
      return (
        <div className="p-8 max-w-2xl mx-auto">
          <p className="text-xs font-semibold uppercase text-red-700">Page error</p>
          <h1 className="text-xl font-bold text-gray-900 mt-1">This view failed to load</h1>
          <p className="text-sm text-gray-500 mt-2">
            Check the browser console for details. You can copy the message below if you need support.
          </p>
          <pre className="text-xs mt-4 p-4 bg-gray-100 rounded-xl overflow-auto whitespace-pre-wrap border border-gray-200">
            {this.state.err.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  /** Student portal only — teachers and admins never see the floating Rate Us pill. */
  const isStudent = !!user && user.role !== 'teacher' && user.role !== 'admin';
  const isTeacherOrAdmin = !!user && (user.role === 'teacher' || user.role === 'admin');
  useTeacherGoogleSheetsAutoSync(isTeacherOrAdmin);

  return (
    <>
    <div className="fixed top-4 right-5 z-40 hidden md:flex items-center gap-2.5 bg-white border border-gray-200 rounded-[9px] px-3 py-1.5 shadow-sm">
      <UserAvatar
        src={user?.avatar_url}
        name={user?.full_name}
        email={user?.email}
        size={28}
        fallbackBg="bg-gray-300"
        fallbackFg="text-gray-600"
      />
      <div className="leading-tight">
        <p className="text-xs font-semibold text-gray-600 truncate max-w-[140px]">{user?.full_name}</p>
        <p className="text-[10px] text-gray-400 truncate max-w-[140px]">{user?.email}</p>
      </div>
    </div>

    <div className="flex w-full flex-1 min-h-dvh min-h-0 overflow-hidden bg-white">
      <div className="hidden md:flex shrink-0 self-stretch">
        <Sidebar />
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative"><Sidebar onClose={() => setMobileOpen(false)} /></div>
        </div>
      )}

      <div className="flex min-h-dvh flex-1 min-h-0 flex-col overflow-hidden self-stretch">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#84001B] flex-shrink-0">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 text-white hover:bg-white/10 rounded-lg transition-colors"><Menu className="w-5 h-5" /></button>
          <span className="font-bold text-white text-sm">Smart Docs Validator</span>
        </div>
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white">
          <div className="page-enter flex min-h-dvh flex-1 min-h-full flex-col min-h-0 bg-white">
            <OutletErrorBoundary>
              <div className="flex min-h-full min-h-dvh flex-1 flex-col min-h-0 w-full">
                {isTeacherOrAdmin ? (
                  <div className="shrink-0 px-4 md:px-6 pt-3 max-w-7xl w-full mx-auto">
                    <SupabaseConnectionBadge />
                  </div>
                ) : null}
                <Outlet />
              </div>
            </OutletErrorBoundary>
          </div>
        </main>
      </div>
    </div>
    {isStudent && <StudentRateUsButton />}
    {isStudent && user?.id ? <StudentOnboardingTour key={user.id} userId={user.id} /> : null}
    {isStudent && user?.id ? (
      <InvitedStudentEmailNotifier
        key={`invite-${user.id}`}
        userId={user.id}
        email={user.email}
        fullName={user.full_name}
      />
    ) : null}
    </>
  );
}
