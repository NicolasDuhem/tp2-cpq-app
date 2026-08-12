'use client';

import PageAccessGate from '@/components/auth/page-access-gate';
import UserManagementPage from '@/components/setup/user-management-page';
import { PAGE_KEYS } from '@/lib/auth/page-keys';

export default function UsersAccessClient() {
  return (
    <PageAccessGate pageKey={PAGE_KEYS.setupUsers}>
      {(access) => (
        <UserManagementPage
          canEdit={access.canEdit}
          permissionLevel={access.permissionLevel}
        />
      )}
    </PageAccessGate>
  );
}
