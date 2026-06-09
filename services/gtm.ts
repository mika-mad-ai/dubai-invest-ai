declare global {
  interface Window {
    dataLayer: Record<string, unknown>[];
  }
}

export function pushEvent(event: string, params: Record<string, unknown> = {}): void {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event, ...params });
}

// ── Funnel helpers ────────────────────────────────────────────────────────────

export const gtm = {
  funnelStart: () =>
    pushEvent('funnel_start'),

  funnelStepComplete: (stepId: string, stepIndex: number, optionValue: string | number) =>
    pushEvent('funnel_step_complete', {
      step_id: stepId,
      step_index: stepIndex + 1,
      step_total: 5,
      option_value: String(optionValue),
    }),

  funnelComplete: (profile: {
    objective?: string;
    totalBudget?: string;
    investmentHorizon?: string;
    zonePreference?: string;
  }) =>
    pushEvent('funnel_complete', {
      objective:    profile.objective,
      budget:       profile.totalBudget,
      horizon:      profile.investmentHorizon,
      zone:         profile.zonePreference,
    }),

  propertyInterestClick: (property: { title: string; price: number; location: string; yield: number }) =>
    pushEvent('property_interest_click', {
      property_name:     property.title,
      property_price:    property.price,
      property_location: property.location,
      property_yield:    property.yield,
    }),

  leadFormSubmit: (property: { title: string; price: number }) =>
    pushEvent('lead_form_submit', {
      property_name:  property.title,
      property_price: property.price,
    }),

  leadSuccess: (property: { title: string; price: number }) =>
    pushEvent('lead_success', {
      property_name:  property.title,
      property_price: property.price,
    }),
};
