/**
 * Formats phone number input to (xxx) xxx-xxxx
 */
export function formatPhoneNumber(value: string): string {
  // Remove all non-digits
  const numbers = value.replace(/\D/g, '');
  
  // Apply mask based on length
  if (numbers.length === 0) return '';
  if (numbers.length <= 3) return `(${numbers}`;
  if (numbers.length <= 6) return `(${numbers.slice(0, 3)}) ${numbers.slice(3)}`;
  return `(${numbers.slice(0, 3)}) ${numbers.slice(3, 6)}-${numbers.slice(6, 10)}`;
}

/**
 * Removes phone formatting to get just digits
 */
export function cleanPhoneNumber(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * Formats number with commas (e.g., 10000 -> 10,000)
 */
export function formatNumberWithCommas(value: string): string {
  // Remove all non-digits
  const numbers = value.replace(/\D/g, '');
  
  if (numbers.length === 0) return '';
  
  // Add commas every 3 digits from the right
  return numbers.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Removes commas from formatted number to get numeric string
 */
export function cleanNumber(value: string): string {
  return value.replace(/,/g, '');
}

