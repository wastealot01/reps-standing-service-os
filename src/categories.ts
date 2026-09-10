export interface Category {
  id: string;
  name: string;
  statute: string;
}

// Grounded in IRC Section 469(c)(7)(C): development, redevelopment, construction,
// reconstruction, acquisition, conversion, rental, operation, management, leasing,
// or brokerage trade or business. This table maps everyday investor activities to
// those statutory categories. Requires CPA / tax counsel sign-off before treating
// as final — see project handoff notes.
export const CATEGORIES: Category[] = [
  { id: 'inspection', name: 'Property inspection / site visit', statute: 'Operation, management' },
  { id: 'financials', name: 'Financial statement / P&L review', statute: 'Operation, management' },
  { id: 'leasing', name: 'Leasing activity', statute: 'Leasing' },
  { id: 'vendor', name: 'Vendor / contractor coordination', statute: 'Operation, construction' },
  { id: 'acquisition', name: 'Acquisition due diligence / underwriting', statute: 'Acquisition' },
  { id: 'construction', name: 'Construction / capital improvement oversight', statute: 'Construction, redevelopment' },
  { id: 'financing', name: 'Financing / lender calls, loan review', statute: 'Acquisition, operation' },
  { id: 'investor', name: 'Property-specific investor / partner meetings', statute: 'Operation, management' },
  { id: 'staff', name: 'Staff / property manager supervision', statute: 'Operation, management' },
];

export function findCategory(id: string): Category | undefined {
  return CATEGORIES.find(c => c.id === id);
}

// Keyword hints for auto-suggesting categories from a calendar event's
// subject line. Deliberately loose (simple substring matching, not NLP) —
// this only ever produces a *suggestion* the user still has to confirm,
// never an auto-logged entry, so a false positive costs a click, not a
// compliance problem.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  inspection: ['inspect', 'walkthrough', 'walk-through', 'walk through', 'site visit', 'property tour', 'unit visit'],
  financials: ['p&l', 'financial statement', 'financials', 'budget review', 'statement review'],
  leasing: ['lease', 'leasing', 'showing', 'tenant', 'move-in', 'move in', 'move-out', 'move out', 'renewal'],
  vendor: ['vendor', 'contractor', 'repair', 'maintenance', 'quote', 'bid walk'],
  acquisition: ['underwriting', 'due diligence', 'acquisition', 'closing', 'purchase agreement'],
  construction: ['construction', 'renovation', 'capital improvement', 'capex', 'contractor walk'],
  financing: ['lender', 'loan', 'refinance', 'financing', 'mortgage'],
  investor: ['investor call', 'partner meeting', 'owner meeting', 'asset management', 'investor update'],
  staff: ['property manager', 'pm call', 'staff meeting', 'supervision', 'onsite team'],
};

export function suggestCategoriesForText(text: string): string[] {
  const lower = (text || '').toLowerCase();
  const matches: string[] = [];
  for (const category of CATEGORIES) {
    const keywords = CATEGORY_KEYWORDS[category.id] || [];
    if (keywords.some(k => lower.includes(k))) matches.push(category.id);
  }
  return matches;
}
