export type PrintableResourceState =
  | 'available'
  | 'not-required'
  | 'unavailable';

export function classifyPrintableResourceState(
  linkedResourceCount: number,
  availableResourceCount: number,
): PrintableResourceState {
  if (linkedResourceCount === 0) return 'not-required';
  return availableResourceCount === linkedResourceCount
    ? 'available'
    : 'unavailable';
}
