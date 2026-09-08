/**
 * Escapes the five XML predefined entities - shared by gpx.ts/tcx.ts, both
 * of which hand-build XML via template strings rather than pulling in an
 * XML-builder dependency for two small, fixed schemas.
 */
export function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}
