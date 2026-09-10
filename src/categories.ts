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
