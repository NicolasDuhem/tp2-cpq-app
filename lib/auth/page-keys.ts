export const PAGE_KEYS = {
  bike: 'sales.bike_allocation',
  qpart: 'sales.qpart_allocation',
  salesAllocationAudit: 'sales.allocation_audit',
  cpqConfigure: 'cpq.configure',
  cpqSetup: 'cpq.setup',
  cpqSetupAccounts: 'cpq.setup.accounts',
  cpqSetupRulesets: 'cpq.setup.rulesets',
  cpqSetupPictures: 'cpq.setup.pictures',
  setupUsers: 'setup.users',
} as const;

export type PageKey = (typeof PAGE_KEYS)[keyof typeof PAGE_KEYS];
