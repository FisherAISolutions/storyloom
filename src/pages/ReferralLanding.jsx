import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { rememberReferral } from '@/services/referrals';

export default function ReferralLanding() {
  const { code = '' } = useParams(); const navigate = useNavigate();
  useEffect(() => { rememberReferral(code); navigate('/register?referral=friend', { replace: true }); }, [code, navigate]);
  return <div className="flex justify-center py-24">Preparing your invitation…</div>;
}
