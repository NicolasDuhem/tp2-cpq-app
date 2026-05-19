import PageAccessGate from '@/components/auth/page-access-gate';
import UserManagementPage from '@/components/setup/user-management-page';
import { PAGE_KEYS } from '@/lib/auth/page-access';

export default function SetupUsersPage(){
  return <PageAccessGate pageKey={PAGE_KEYS.setupUsers}>{(access)=><UserManagementPage canEdit={access.canEdit} permissionLevel={access.permissionLevel} />}</PageAccessGate>;
}
