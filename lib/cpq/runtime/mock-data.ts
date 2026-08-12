import { NormalizedBikeBuilderState } from '@/types/cpq';

export const mockInitState = (ruleset: string): NormalizedBikeBuilderState => ({
  sessionId: 'mock-session-1',
  ruleset,
  pages: [],
  screens: [],
  screenOptions: [],
  productDescription: 'Brompton C Line Urban',
  ipnCode: 'IPN-MOCK-001',
  configuredPrice: 1450,
  totalWeight: 11.2,
  bikeImageUrl: 'https://via.placeholder.com/640x360?text=Bike+Builder+POC',
  selectedOptionIds: ['frame_black', 'handlebar_mid'],
  features: [
    {
      featureId: 'frame_color',
      featureLabel: 'Frame color',
      selectedOptionId: 'frame_black',
      selectedValue: 'Black',
      availableOptions: [
        { optionId: 'frame_black', label: 'Black', isSelectable: true, selected: true },
        { optionId: 'frame_blue', label: 'Blue', isSelectable: true, selected: false },
      ],
    },
    {
      featureId: 'handlebar',
      featureLabel: 'Handlebar',
      selectedOptionId: 'handlebar_mid',
      selectedValue: 'Mid',
      availableOptions: [
        { optionId: 'handlebar_low', label: 'Low', isSelectable: true, selected: false },
        { optionId: 'handlebar_mid', label: 'Mid', isSelectable: true, selected: true },
      ],
    },
  ],
});

export const mockConfigureState = (
  current: NormalizedBikeBuilderState,
  featureId: string,
  optionId: string,
): NormalizedBikeBuilderState => {
  const features = current.features.map((feature) => {
    if (feature.featureId !== featureId) {
      return feature;
    }

    const selected = feature.availableOptions.find((option) => option.optionId === optionId);
    return {
      ...feature,
      selectedOptionId: optionId,
      selectedValue: selected?.label ?? optionId,
      availableOptions: feature.availableOptions.map((option) => ({
        ...option,
        selected: option.optionId === optionId,
      })),
    };
  });

  return {
    ...current,
    features,
    selectedOptionIds: features
      .map((feature) => feature.selectedOptionId)
      .filter((id): id is string => Boolean(id)),
    productDescription: `${current.productDescription ?? 'Bike'} (${featureId}:${optionId})`,
  };
};
