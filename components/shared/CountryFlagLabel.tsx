'use client';

import { useState } from 'react';
import { getCountryFlagUrl } from '@/lib/sales/allocation-territory';

type CountryFlagLabelProps = {
  countryCode: string;
  /** Wrapper class, supplied by the calling page's CSS module. */
  className?: string;
  /** Flag image class, supplied by the calling page's CSS module. */
  flagClassName?: string;
};

/**
 * Compact flag + uppercase country code.
 *
 * The flag is decorative: the country code text next to it already carries the
 * meaning, so `alt` stays empty to avoid screen readers announcing every code
 * twice. If the flag image fails to load it is dropped and the code remains.
 */
export default function CountryFlagLabel({ countryCode, className, flagClassName }: CountryFlagLabelProps) {
  const [flagState, setFlagState] = useState<'pending' | 'loaded' | 'failed'>('pending');
  const normalized = String(countryCode ?? '').trim().toUpperCase();

  return (
    <span className={className}>
      {flagState === 'failed' ? null : (
        // The flag carries no styling (and so no visible empty box) until it has
        // actually loaded, so a slow or blocked CDN never shows a stray
        // placeholder next to the country code.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={getCountryFlagUrl(normalized)}
          alt=""
          aria-hidden="true"
          className={flagState === 'loaded' ? flagClassName : undefined}
          style={flagState === 'loaded' ? undefined : { width: 0, height: 0, border: 0 }}
          loading="lazy"
          onLoad={() => setFlagState('loaded')}
          onError={() => setFlagState('failed')}
        />
      )}
      <span>{normalized}</span>
    </span>
  );
}
