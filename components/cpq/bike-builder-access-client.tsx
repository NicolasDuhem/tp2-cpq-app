'use client';

import PageAccessGate from '@/components/auth/page-access-gate';
import BikeBuilderPage, { type BikeBuilderPagePrefill } from '@/components/cpq/bike-builder-page';
import { PAGE_KEYS } from '@/lib/auth/page-access';

type BikeBuilderAccessClientProps = {
  prefill: BikeBuilderPagePrefill;
};

export default function BikeBuilderAccessClient({ prefill }: BikeBuilderAccessClientProps) {
  return (
    <PageAccessGate pageKey={PAGE_KEYS.cpqConfigure}>
      {(access) => (
        <BikeBuilderPage
          prefill={prefill}
          permissionLevel={access.permissionLevel}
          canEdit={access.canEdit}
        />
      )}
    </PageAccessGate>
  );
}
