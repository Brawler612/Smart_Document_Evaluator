import { NavLink, useNavigate } from 'react-router-dom';
import { Home, BookOpen, FileText, BarChart3, Users, Settings, LogOut, ClipboardList, FolderOpen, CheckSquare, UserCheck, GraduationCap } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const TEACHER_NAV = [
  { to: '/dashboard', icon: Home, label: 'Home' },
  { to: '/assignments', icon: ClipboardList, label: 'Manage Assignments' },
  { to: '/review-queue', icon: CheckSquare, label: 'Review Queue' },
  { to: '/documents', icon: FolderOpen, label: 'Documents' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
  { to: '/groups', icon: Users, label: 'Group Management' },
  { to: '/users', icon: UserCheck, label: 'User Management' },
];

const STUDENT_NAV = [
  { to: '/dashboard', icon: Home, label: 'Home' },
  { to: '/assignments', icon: ClipboardList, label: 'Assignments' },
  { to: '/my-submissions', icon: FileText, label: 'My Submissions' },
  { to: '/documents', icon: FolderOpen, label: 'Documents' },
  { to: '/grades', icon: GraduationCap, label: 'Grades' },
  { to: '/my-groups', icon: Users, label: 'My Groups' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isTeacher = user?.role === 'teacher';
  const nav = isTeacher ? TEACHER_NAV : STUDENT_NAV;
  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';

  async function handleSignOut() { await signOut(); navigate('/login'); }

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col h-full bg-[#84001B] text-white">
      <div className="px-5 pt-7 pb-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-[#ffd21a] rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
            <BookOpen className="w-6 h-6 text-[#84001B]" />
          </div>
          <div>
            <div className="font-bold text-white text-[15px] leading-tight">Smart Document</div>
            <div className="font-bold text-white text-[15px] leading-tight">Evaluator</div>
            <div className="text-[9px] tracking-[0.15em] uppercase text-white/40 mt-1">{isTeacher ? 'Teacher Workspace' : 'Student Portal'}</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} onClick={onClose}
            className={({ isActive }) => `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${isActive ? 'bg-[#ffd21a] text-[#84001B] shadow-md' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}>
            {({ isActive }) => (
              <>
                <Icon className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${isActive ? 'text-[#84001B]' : 'text-white/50 group-hover:text-white'}`} />
                <span className="truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="px-3 pb-6 pt-4 border-t border-white/10 space-y-2">
        <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white/10 rounded-xl">
          <div className="w-8 h-8 bg-[#ffd21a] rounded-lg flex items-center justify-center flex-shrink-0 text-[#84001B] text-xs font-bold">{initials}</div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{user?.full_name}</p>
            <p className="text-[10px] text-white/40 truncate">{user?.email}</p>
          </div>
        </div>
        <button onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-4 py-3 bg-white/10 rounded-xl hover:bg-white/20 transition-all duration-200 text-sm font-medium text-white/70 hover:text-white group">
          <LogOut className="w-[18px] h-[18px] text-white/40 group-hover:text-white transition-colors flex-shrink-0" />Logout
        </button>
        <div className="text-center pt-1">
          <p className="text-[9px] text-white/25">Smart Document Evaluator V1.0</p>
          <p className="text-[9px] text-white/25">CIT University</p>
        </div>
      </div>
    </aside>
  );
}
