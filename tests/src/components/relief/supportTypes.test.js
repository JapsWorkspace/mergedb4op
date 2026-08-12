import {
  SUPPORT_TYPE_APPLIANCE,
  SUPPORT_TYPE_FOODPACKS,
  SUPPORT_TYPE_LABELS,
  SUPPORT_TYPE_MONETARY,
  SUPPORT_TYPE_OPTIONS,
  deriveLegacyRequestType,
  getSupportTypesFromRequest,
  getSupportTypeLabel,
  normalizeSupportTypes,
} from './supportTypes';

describe('relief support type helpers', () => {
  test('normalizes appliance-inclusive legacy combinations', () => {
    expect(normalizeSupportTypes([], 'foodpacks_appliance')).toEqual([
      SUPPORT_TYPE_FOODPACKS,
      SUPPORT_TYPE_APPLIANCE,
    ]);

    expect(normalizeSupportTypes([], 'all')).toEqual([
      SUPPORT_TYPE_FOODPACKS,
      SUPPORT_TYPE_MONETARY,
      SUPPORT_TYPE_APPLIANCE,
    ]);
  });

  test('derives legacy request type for checkbox combinations', () => {
    expect(
      deriveLegacyRequestType([SUPPORT_TYPE_FOODPACKS, SUPPORT_TYPE_MONETARY])
    ).toBe('both');

    expect(
      deriveLegacyRequestType([SUPPORT_TYPE_MONETARY, SUPPORT_TYPE_APPLIANCE])
    ).toBe('monetary_appliance');
  });

  test('builds readable labels for mixed support requests', () => {
    expect(
      getSupportTypeLabel([
        SUPPORT_TYPE_FOODPACKS,
        SUPPORT_TYPE_MONETARY,
        SUPPORT_TYPE_APPLIANCE,
      ])
    ).toBe('Food Packs + Monetary + Appliance');
  });

  test('exposes shared support type labels and options for form controls', () => {
    expect(SUPPORT_TYPE_LABELS[SUPPORT_TYPE_APPLIANCE]).toBe('Appliance');
    expect(SUPPORT_TYPE_OPTIONS).toEqual([
      { value: SUPPORT_TYPE_FOODPACKS, label: 'Food Packs' },
      { value: SUPPORT_TYPE_MONETARY, label: 'Monetary' },
      { value: SUPPORT_TYPE_APPLIANCE, label: 'Appliance' },
    ]);
  });

  test('infers mixed support types from saved request demand when legacy flags are stale', () => {
    expect(
      getSupportTypesFromRequest({
        requestType: 'foodpacks',
        totals: {
          requestedFoodPacks: 2,
          requestedMonetaryAmount: 231,
          requestedApplianceQuantity: 1,
        },
      })
    ).toEqual([
      SUPPORT_TYPE_FOODPACKS,
      SUPPORT_TYPE_MONETARY,
      SUPPORT_TYPE_APPLIANCE,
    ]);
  });
});
