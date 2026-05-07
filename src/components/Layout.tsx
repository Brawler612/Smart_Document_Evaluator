import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import Sidebar from './Sidebar';

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen bg-white overflow-hidden">
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
  );
}
