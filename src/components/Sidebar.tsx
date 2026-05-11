import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  FileText,
  Settings,
  LogOut,
  ClipboardList,
  CheckSquare,
  Inbox,
  Users,
  UsersRound,
  Upload,
  ListChecks,
  Calendar,
  Folder,
  Table2,
  BarChart3,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import SmartDocsLogo from './SmartDocsLogo';

interface NavItem {
  to: string;
  icon: LucideIcon;
  label: string;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const TEACHER_SECTIONS: NavSection[] = [
  {
    items: [
      { to: '/dashboard', icon: Home, label: 'Dashboard' },
      { to: '/inbox', icon: Inbox, label: 'Inbox' },
      { to: '/class-list', icon: Users, label: 'Class list' },
      { to: '/student-submissions', icon: FileText, label: 'Student Submissions' },
      { to: '/grading', icon: ClipboardList, label: 'Grading System' },
      { to: '/team-14', icon: UsersRound, label: 'Team 14' },
      { to: '/reports', icon: CheckSquare, label: 'Reports' },
      { to: '/teacher-settings', icon: Settings, label: 'Settings' },
    ],
  },
];

const STUDENT_SECTIONS: NavSection[] = [
  {
    label: 'Workspace',
    items: [
      { to: '/dashboard', icon: Home, label: 'Dashboard' },
      { to: '/tasks', icon: ListChecks, label: 'Tasks' },
      { to: '/boards', icon: ClipboardList, label: 'Boards' },
      { to: '/calendar', icon: Calendar, label: 'Calendar' },
      { to: '/drive', icon: Folder, label: 'Drive' },
      { to: '/sheets', icon: Table2, label: 'Sheets' },
      { to: '/analytics', icon: BarChart3, label: 'Analytics' },
    ],
  },
  {
    label: 'Submit',
    items: [
      { to: '/assignments', icon: Upload, label: 'Submit work' },
      { to: '/my-submissions', icon: FileText, label: 'Submission status' },
    ],
  },
  {
    label: 'Account',
    items: [
      { to: '/team-14', icon: UsersRound, label: 'Team 14' },
      { to: '/settings', icon: Settings, label: 'Settings' },
    ],
  },
];

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isTeacher = user?.role === 'teacher' || user?.role === 'admin';
  const sections = isTeacher ? TEACHER_SECTIONS : STUDENT_SECTIONS;

  async function handleSignOut() {
    await signOut();
    navigate('/login', { replace: true });
  }

  return (
    <aside className="w-64 flex-shrink-0 flex flex-col h-full bg-[#84001B] text-white">
      <div className="px-5 pt-7 pb-5 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 bg-[#ffd21a] rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg">
            <SmartDocsLogo size={24} color="#84001B" />
          </div>
          <div>
            <div className="font-bold text-white text-[15px] leading-tight">Smart Docs</div>
            <div className="font-bold text-white text-[15px] leading-tight opacity-80">Validator</div>
            <div className="text-[9px] tracking-[0.15em] uppercase text-white/40 mt-1">
              {isTeacher ? 'Teacher Workspace' : 'Student Portal'}
            </div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {sections.map((section, idx) => (
          <div key={section.label ?? `section-${idx}`} className={idx > 0 ? 'mt-3 pt-3 border-t border-white/10' : ''}>
            {section.label && (
              <p className="px-3 mb-1.5 text-[9px] font-bold uppercase tracking-[0.18em] text-white/35">
                {section.label}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map(({ to, icon: Icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                      isActive
                        ? 'bg-[#ffd21a] text-[#84001B] shadow-md'
                        : 'text-white/70 hover:bg-[#ffd21a]/25 hover:text-white'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon
                        className={`w-[18px] h-[18px] flex-shrink-0 transition-colors ${
                          isActive ? 'text-[#84001B]' : 'text-white/50 group-hover:text-[#ffd21a]'
                        }`}
                      />
                      <span className="truncate">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="px-3 pb-6 pt-4 border-t border-white/10 space-y-2">
        <button
          type="button"
          onClick={() => void handleSignOut()}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white/10 rounded-xl hover:bg-[#ffd21a]/25 transition-all duration-200 text-sm font-medium text-white/70 hover:text-white group"
        >
          <LogOut className="w-[18px] h-[18px] text-white/40 group-hover:text-[#ffd21a] transition-colors flex-shrink-0" />
          Logout
        </button>
        <div className="text-center pt-1">
          <p className="text-[9px] text-white/25">Smart Docs Validator V1.0</p>
          <p className="text-[9px] text-white/25">CIT University</p>
        </div>
      </div>
    </aside>
  );
}
