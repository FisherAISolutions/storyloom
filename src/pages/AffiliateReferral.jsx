import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { trackReferral } from '@/services/affiliates';

export default function AffiliateReferral() {
  const { code = '' } = useParams(); const navigate = useNavigate();
  useEffect(() => { let active = true; void trackReferral(code, `/r/${code}`).finally(() => { if (active) navigate('/register', { replace: true }); }); return () => { active = false; }; }, [code, navigate]);
  return <div className="flex justify-center py-24">Preparing your invitation…</div>;
}

