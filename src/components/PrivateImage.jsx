import React, { useEffect, useState } from 'react';
import { Image } from '@/components/ui/image';
import { getSignedUrl } from '@/services/storage';

export default function PrivateImage({ bucket, path, fallback = null, onError = undefined, ...props }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let refreshTimer;
    setUrl('');
    setFailed(false);
    if (!path) return () => { active = false; };
    const refresh = () => getSignedUrl(bucket, path)
      .then((signedUrl) => {
        if (!active) return;
        setUrl(signedUrl);
        refreshTimer = setTimeout(refresh, 275_000);
      })
      .catch(() => { if (active) setFailed(true); });
    refresh();
    return () => { active = false; clearTimeout(refreshTimer); };
  }, [bucket, path]);

  if (!path || failed || !url) return fallback;
  return <Image {...props} src={url} onError={(event) => { setFailed(true); onError?.(event); }} />;
}
