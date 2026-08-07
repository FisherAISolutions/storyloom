import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, Loader2, AlertTriangle } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { useAuth } from '@/lib/AuthContext';
import { updatePassword } from '@/services/auth';
import { getSupabaseClient } from '@/lib/supabase';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoadingAuth, authChecked, isPasswordRecovery } = useAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await updatePassword(newPassword);
      await getSupabaseClient().auth.signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.message || 'Your password could not be updated.');
    } finally {
      setLoading(false);
    }
  };

  if (isLoadingAuth || !authChecked) return <div className="fixed inset-0 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!isAuthenticated || !isPasswordRecovery) {
    return <AuthLayout icon={AlertTriangle} title="Invalid or expired reset link" subtitle="Request a new password reset email"><Link to="/forgot-password" className="block text-center font-medium text-primary hover:underline">Request a new link</Link></AuthLayout>;
  }

  return (
    <AuthLayout icon={Lock} title="Choose a new password" subtitle="Your recovery link is verified">
      {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="password">New password</Label><Input id="password" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="h-12" required /></div>
        <div className="space-y-2"><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-12" required /></div>
        <Button type="submit" className="h-12 w-full" disabled={loading}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating…</> : 'Update password'}</Button>
      </form>
    </AuthLayout>
  );
}
