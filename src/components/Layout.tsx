import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user } = useAuth();
  const initials = user?.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'U';

  return (
    <>
    <div className="fixed top-4 right-5 z-40 hidden md:flex items-center gap-2.5 bg-white border border-gray-200 rounded-[9px] px-3 py-1.5 shadow-sm">
      <div className="w-7 h-7 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0 text-gray-600 text-[11px] font-bold select-none">
        {initials}
      </div>
      <div className="leading-tight">
        <p className="text-xs font-semibold text-gray-600 truncate max-w-[140px]">{user?.full_name}</p>
        <p className="text-[10px] text-gray-400 truncate max-w-[140px]">{user?.email}</p>
      </div>
    </div>

    <div className="flex h-screen overflow-hidden bg-white">
      <div className="hidden md:flex"><Sidebar /></div>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative"><Sidebar onClose={() => setMobileOpen(false)} /></div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#84001B] flex-shrink-0">
          <button onClick={() => setMobileOpen(true)} className="p-1.5 text-white hover:bg-white/10 rounded-lg transition-colors"><Menu className="w-5 h-5" /></button>
          <span className="font-bold text-white text-sm">Smart Document Evaluator</span>
        </div>
        <main className="flex-1 overflow-y-auto bg-white">
          <div className="page-enter"><Outlet /></div>
        </main>
      </div>
    </div>
    </>
  );
}
