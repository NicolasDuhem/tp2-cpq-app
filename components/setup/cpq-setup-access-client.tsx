'use client';

import PageAccessGate from '@/components/auth/page-access-gate';
import CpqSetupPage from '@/components/setup/cpq-setup-page';

type TabKey = 'accounts' | 'rulesets' | 'pictures';

type CpqSetupAccessClientProps = {
  pageKey: string;
  initialTab: TabKey;
  initialOnlyMissingPicture: boolean;
  initialFeature: string;
};

export default function CpqSetupAccessClient({
  pageKey,
  initialTab,
  initialOnlyMissingPicture,
  initialFeature,
}: CpqSetupAccessClientProps) {
  return (
    <PageAccessGate pageKey={pageKey}>
      {(access) => (
        <CpqSetupPage
          initialTab={initialTab}
          initialOnlyMissingPicture={initialOnlyMissingPicture}
          initialFeature={initialFeature}
          canEdit={access.canEdit}
          permissionLevel={access.permissionLevel}
        />
      )}
    </PageAccessGate>
  );
}
