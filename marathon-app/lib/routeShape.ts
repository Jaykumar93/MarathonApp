import type { RoutePoint } from "./gpsStats";

export interface ProjectedPoint {
  x: number;
  y: number;
}

/**
 * Projects a run's GPS lat/lng points onto a flat width x height box for a
 * lightweight SVG line-art rendering of the route's shape - no
 * streets/satellite imagery, just the path's own silhouette. Kept
 * dependency-free (no react-native-svg import) so the projection math is
 * unit-testable directly, same reasoning as gpsStats.ts.
 *
 * Longitude is scaled by cos(latitude) (a simple equirectangular-style
 * local projection) so the shape isn't horizontally stretched or squashed
 * away from the equator - accurate enough over a single run's short
 * distance; a true map projection would be overkill for a shape-only
 * preview like this.
 */
export function projectRoute(points: RoutePoint[], width: number, height: number, padding = 12): ProjectedPoint[] {
  if (points.length === 0) return [];

  const latRad = (points[0].lat * Math.PI) / 180;
  const lngScale = Math.cos(latRad);
  const projected = points.map((p) => ({ x: p.lng * lngScale, y: p.lat }));

  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;

  const availableW = Math.max(1, width - padding * 2);
  const availableH = Math.max(1, height - padding * 2);

  // A perfectly straight out-and-back (zero span on one axis) or a single
  // GPS-noise-only point (zero on both) shouldn't divide by zero - only
  // an axis that actually has some spread contributes a scale candidate,
  // and a route with no spread at all just centers as a point.
  const scaleCandidates = [spanX > 0 ? availableW / spanX : null, spanY > 0 ? availableH / spanY : null].filter(
    (n): n is number => n != null
  );
  const scale = scaleCandidates.length > 0 ? Math.min(...scaleCandidates) : 1;

  const offsetX = (width - spanX * scale) / 2;
  const offsetY = (height - spanY * scale) / 2;

  return projected.map((p) => ({
    x: (p.x - minX) * scale + offsetX,
    // Flip vertically - latitude increases northward but SVG y grows
    // downward, so without this the route renders upside down.
    y: height - ((p.y - minY) * scale + offsetY),
  }));
}
