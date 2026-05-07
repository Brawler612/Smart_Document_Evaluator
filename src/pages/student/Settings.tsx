import { useState } from 'react';
import { User, Lock, Save, CheckCircle, AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import UserBadge from '../../components/UserBadge';

export default function Settings() {
  const { user } = useAuth();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  async function updateProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    const { error } = await supabase.from('users').update({ full_name: fullName }).eq('id', user!.id);
    setSavingProfile(false);
    setProfileMsg(error ? { type: 'error', text: 'Failed to update profile.' } : { type: 'success', text: 'Profile updated successfully.' });
  }

  async function updatePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(null);
    if (newPw !== confirmPw) { setPwMsg({ type: 'error', text: 'Passwords do not match.' }); return; }
    if (newPw.length < 8) { setPwMsg({ type: 'error', text: 'Password must be at least 8 characters.' }); return; }
    setSavingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setSavingPw(false);
    if (error) {
      setPwMsg({ type: 'error', text: 'Failed to update password.' });
    } else {
      setPwMsg({ type: 'success', text: 'Password updated successfully.' });
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    }
  }

  return (
    <div className="p-6 md:p-8 max-w-2xl mx-auto">
      <div className="flex items-start justify-between sticky top-0 bg-white z-10 pt-6 pb-4 -mx-8 px-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-gray-400 text-sm mt-0.5">Manage your account preferences</p>
        </div>
        <UserBadge />
      </div>

      <div className="space-y-6">
        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 bg-[#84001B]/10 rounded-lg flex items-center justify-center">
              <User className="w-4 h-4 text-[#84001B]" />
            </div>
            <h2 className="font-semibold text-gray-900">Profile Information</h2>
          </div>

          {profileMsg && (
            <div className={`flex items-center gap-2 p-3 rounded-xl mb-4 text-sm ${profileMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {profileMsg.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {profileMsg.text}
            </div>
          )}

          <form onSubmit={updateProfile} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Full Name</label>
              <input value={fullName} onChange={e => setFullName(e.target.value)} required
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input value={user?.email || ''} disabled
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-400 cursor-not-allowed" />
              <p className="text-xs text-gray-400 mt-1">Email cannot be changed</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Role</label>
              <input value={user?.role || ''} disabled
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 text-gray-400 cursor-not-allowed capitalize" />
            </div>
            <button type="submit" disabled={savingProfile}
              className="flex items-center gap-2 bg-[#84001B] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#6b0016] transition-colors disabled:opacity-60">
              <Save className="w-4 h-4" />{savingProfile ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>

        <div className="bg-white border border-gray-100 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-8 h-8 bg-[#84001B]/10 rounded-lg flex items-center justify-center">
              <Lock className="w-4 h-4 text-[#84001B]" />
            </div>
            <h2 className="font-semibold text-gray-900">Change Password</h2>
          </div>

          {pwMsg && (
            <div className={`flex items-center gap-2 p-3 rounded-xl mb-4 text-sm ${pwMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {pwMsg.type === 'success' ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
              {pwMsg.text}
            </div>
          )}

          <form onSubmit={updatePassword} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
              <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} required placeholder="At least 8 characters"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm New Password</label>
              <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required placeholder="Repeat new password"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#84001B]/20 focus:border-[#84001B]" />
            </div>
            <button type="submit" disabled={savingPw}
              className="flex items-center gap-2 bg-[#84001B] text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#6b0016] transition-colors disabled:opacity-60">
              <Lock className="w-4 h-4" />{savingPw ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
