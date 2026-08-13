'use client';

import PageAccessGate from '@/components/auth/page-access-gate';
import CpqReplayValidationPage from '@/components/admin/cpq-replay-validation-page';
import { PAGE_KEYS } from '@/lib/auth/page-keys';

export default function CpqReplayValidationAccessClient() {
  return (
    <PageAccessGate pageKey={PAGE_KEYS.adminCpqReplayValidation}>
      {(access) => <CpqReplayValidationPage permissionLevel={access.permissionLevel} />}
    </PageAccessGate>
  );
}
