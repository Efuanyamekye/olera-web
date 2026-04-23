/**
 * PII Redaction Utilities
 *
 * Used to protect family contact information from unverified providers.
 */

/**
 * Formats a full name to show only first name and last initial.
 *
 * Examples:
 * - "Jane Doe" → "Jane D."
 * - "Jane Marie Doe" → "Jane D."
 * - "Jane" → "Jane"
 * - "" → ""
 *
 * @param fullName The full name to redact
 * @returns Redacted name in "FirstName L." format
 */
export function formatRedactedName(fullName: string): string {
  if (!fullName) return "";

  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return fullName;

  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0];

  return `${firstName} ${lastInitial.toUpperCase()}.`;
}

/**
 * Gets initials from a name, handling redacted format.
 *
 * Examples:
 * - "Jane Doe" → "JD"
 * - "Jane D." → "JD"
 * - "Jane" → "JA"
 *
 * @param name The name (full or redacted)
 * @returns Two-letter initials
 */
export function getInitialsFromName(name: string): string {
  if (!name) return "?";

  const parts = name.trim().split(/\s+/);

  if (parts.length >= 2) {
    // Handle "Jane D." format - strip the period
    const lastPart = parts[parts.length - 1].replace(".", "");
    return (parts[0][0] + lastPart[0]).toUpperCase();
  }

  // Single name - return first two chars
  return name.slice(0, 2).toUpperCase();
}
