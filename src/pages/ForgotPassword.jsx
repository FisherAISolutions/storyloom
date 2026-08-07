import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Mail, ArrowLeft, Loader2 } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';
import { requestPasswordReset } from '@/services/auth';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(email, new URL('/reset-password', window.location.origin).toString());
      setSent(true);
    } catch (err) {
      setError(err.message || 'The reset request could not be sent.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout icon={Mail} title="Reset password" subtitle="We'll send you a secure reset link" footer={<Link to="/login" className="font-medium text-primary hover:underline"><ArrowLeft className="mr-1 inline h-3 w-3" />Back to login</Link>}>
      {error && <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {sent ? <p className="text-center text-sm">If an account exists with that email, a password reset link will arrive shortly.</p> : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2"><Label htmlFor="email">Email address</Label><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-12" required /></div>
          <Button type="submit" className="h-12 w-full" disabled={loading}>{loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending…</> : 'Send reset link'}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
