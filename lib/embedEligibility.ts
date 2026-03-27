/** Minimum plan members, employees, or population for embed forms */
export const MIN_ELIGIBLE_COUNT = 500;

export const MIN_ELIGIBLE_COUNT_MESSAGE =
  'Unfortunately we are unable to work with companies with less than 500 people at this time.';

/** Parse numeric form fields that may include comma separators */
export function parseFormCount(value: string | undefined | null): number {
  const s = String(value ?? '').replace(/,/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Impact / full-oia: use plan member count when provided, otherwise employee count
 * (matches API routing logic before dependents multiplier).
 */
export function impactSubmittedPrimaryCount(form: { employees: string; planMembers: string }): number {
  const planMembersInput = parseFormCount(form.planMembers);
  if (planMembersInput > 0) return planMembersInput;
  return parseFormCount(form.employees);
}
