import { useAuth } from '../context/AuthContext';

export default function UserBadge() {
  const { user } = useAuth();
  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';
  return (
    <div className="hidden md:flex items-center gap-2.5 bg-white border border-gray-200 rounded-[9px] px-3 py-1.5 shadow-sm flex-shrink-0">
      <div className="w-7 h-7 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0 text-gray-600 text-[11px] font-bold select-none">
        {initials}
      </div>
      <div className="leading-tight">
        <p className="text-xs font-semibold text-gray-600 truncate max-w-[160px]">{user?.full_name}</p>
        <p className="text-[10px] text-gray-400 truncate max-w-[160px]">{user?.email}</p>
      </div>
    </div>
  );
}
