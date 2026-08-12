export const QPART_CHANNEL_OPTIONS = ['Ecom', 'Dealer', 'Junction', 'Subscription'] as const;

export type QPartChannel = (typeof QPART_CHANNEL_OPTIONS)[number];

export const QPART_CHANNEL_SET = new Set<string>(QPART_CHANNEL_OPTIONS);
