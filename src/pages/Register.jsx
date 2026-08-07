import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Mail, Lock, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import GoogleIcon from '@/components/GoogleIcon';
import { safeReturnTo } from '@/lib/authReturnTo';
import { resendSignupConfirmation, signInWithGoogle, signUpWithPassword } from '@/services/auth';

function confirmationRedirect() {
  const callback = new URL('/auth/callback', window.location.origin);
  callback.searchParams.set('returnTo', safeReturnTo());
  return callback.toString();
}

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (password !== confirmPassword) return setError('Passwords do not match.');
    setLoading(true);
    try {
      const result = await signUpWithPassword(email, password, confirmationRedirect());
      // With confirmation disabled Supabase returns a session immediately; the
      // auth listener will redirect this public-only route into the app.
      if (!result.session) setConfirmationSent(true);
    } catch (err) {
      setError(err.message || 'Account creation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setLoading(true);
    try {
      await resendSignupConfirmation(email, confirmationRedirect());
    } catch (err) {
      setError(err.message || 'The confirmation email could not be sent.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await signInWithGoogle(confirmationRedirect());
    } catch (err) {
      setError(err.message || 'Google sign-in could not be started.');
      setLoading(false);
    }
  };

  if (confirmationSent) {
    return (
      <AuthLayout icon={Mail} title="Check your email" subtitle={`We sent a confirmation link to ${email}`}>
        {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
        <p className="text-center text-sm text-muted-foreground">Open the link in that email to finish creating your account.</p>
        <Button variant="outline" className="mt-5 h-12 w-full" onClick={handleResend} disabled={loading}>{loading ? 'Sending…' : 'Resend confirmation email'}</Button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={UserPlus} title="Create your account" subtitle="Sign up to get started" footer={<>Already have an account? <Link to="/login" className="font-medium text-primary hover:underline">Log in</Link></>}>
      <Button variant="outline" className="mb-6 h-12 w-full" onClick={handleGoogle} disabled={loading}><GoogleIcon className="mr-2 h-5 w-5" />Continue with Google</Button>
      <div className="relative mb-6"><div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div><div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-3 text-muted-foreground">or</span></div></div>
      {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" required /></div>
        <div className="space-y-2"><Label htmlFor="password">Password</Label><div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 pl-10" required /></div></div>
        <div className="space-y-2"><Label htmlFor="confirm">Confirm password</Label><Input id="confirm" type="password" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="h-12" required /></div>
        <Button type="submit" className="h-12 w-full" disabled={loading}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating account…</> : 'Create account'}</Button>
      </form>
    </AuthLayout>
  );
}
