import React, { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import MapView, { Marker, Polyline, type MapStyleElement } from "react-native-maps";
import Svg, { Circle, Path } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import type { RoutePoint } from "../lib/gpsStats";
import { palette } from "../lib/theme";

interface RunMapProps {
  /** Recorded so far (live tracking) or the full saved route (a finished run). */
  points: RoutePoint[];
  /** True while a run is actively being tracked - the camera follows the device's live location instead of fitting a fixed route, and no start/end pins are drawn since the route is still growing. */
  live?: boolean;
  /** How far above the map's own bottom edge to float the recenter button - the default suits Active Run, where the map sits in its own boxed area above a separate controls row. Track's map is full-bleed behind an absolutely-positioned "Start run" button instead, so it needs a much larger offset to clear it. */
  recenterBottomOffset?: number;
}

// Middle-of-nowhere/zoomed-out - only shown for the instant before either a
// live GPS fix or a saved route's own coordinates replace it.
const FALLBACK_REGION = { latitude: 20, longitude: 0, latitudeDelta: 60, longitudeDelta: 60 };

/**
 * Track and Active Run (the only two screens RunMap renders on) are both
 * permanently dark regardless of the app's own light/dark setting - Google's
 * default bright basemap would clash badly sitting inside either. POI/
 * business/transit icons and labels are hidden entirely: a run map's only
 * job is showing the route and streets clearly, not restaurant pins.
 */
const MAP_DARK_STYLE: MapStyleElement[] = [
  { elementType: "geometry", stylers: [{ color: "#1a1d22" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#7a7d82" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1d22" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#3a3d42" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#1f2b24" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#2a2d33" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#1a1d22" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#383b42" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ color: "#2f3238" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#0f1720" }] },
];

/** A small accent-colored puck with a directional nose - replaces Google's default blue dot so it matches the app's own palette, and actually shows which way the runner is facing rather than just where they are. */
function HeadingPuck({ headingDegrees }: { headingDegrees: number | null | undefined }) {
  return (
    <View style={{ transform: [{ rotate: `${headingDegrees ?? 0}deg` }] }}>
      <Svg width={26} height={26} viewBox="0 0 26 26">
        <Path d="M13 2 L18.5 12 L13 9 L7.5 12 Z" fill="#fff" />
        <Circle cx={13} cy={15} r={6} fill={palette.accent} stroke="#fff" strokeWidth={2} />
      </Svg>
    </View>
  );
}

// Street-level - close enough to actually see your own position and the
// road you're on, not just a dot on a wide, zoomed-out world view. Only
// applied once, the first time a real fix arrives (see hasZoomedInRef) -
// after that, panning to follow a moving position shouldn't also keep
// resetting whatever zoom level you've manually chosen since.
const INITIAL_ZOOM_LEVEL = 17;

export function RunMap({ points, live = false, recenterBottomOffset = 12 }: RunMapProps) {
  const mapRef = useRef<MapView>(null);
  const coordinates = points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
  const lastPoint = points[points.length - 1];
  const lastCoordinate = coordinates[coordinates.length - 1];
  const hasZoomedInRef = useRef(false);

  // Live mode still auto-centers on your position by default, but a manual
  // drag (see onPanDrag below) pauses that so it doesn't fight your finger
  // by snapping back mid-gesture - tapping the recenter button is what
  // resumes it, same "follow me" pattern most running/maps apps use.
  const [following, setFollowing] = useState(true);
  // The very first animateCamera call - the one that's supposed to zoom in,
  // not just pan - has to wait for the native map to actually finish
  // initializing, or Android silently drops it. Gating on onMapReady
  // (rather than firing as soon as a coordinate exists) avoids a race where
  // that first call gets dropped but hasZoomedInRef still flips to true,
  // permanently skipping the zoom-in for the rest of this screen's life.
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (live && following && mapReady && lastCoordinate) {
      const zoom = hasZoomedInRef.current ? undefined : INITIAL_ZOOM_LEVEL;
      mapRef.current?.animateCamera({ center: lastCoordinate, zoom }, { duration: 500 });
      hasZoomedInRef.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, following, mapReady, lastCoordinate?.latitude, lastCoordinate?.longitude]);

  useEffect(() => {
    if (!live && mapReady && coordinates.length >= 2) {
      mapRef.current?.fitToCoordinates(coordinates, {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, mapReady, coordinates.length]);

  // Always resets back to street-level zoom, not just wherever you'd
  // pinched to - "take me back to my location" reads as a full reset, not
  // just a re-pan at whatever zoom happened to be left over.
  function recenter() {
    setFollowing(true);
    if (lastCoordinate) {
      mapRef.current?.animateCamera({ center: lastCoordinate, zoom: INITIAL_ZOOM_LEVEL }, { duration: 300 });
    }
  }

  return (
    <View style={styles.fill}>
      <MapView
        ref={mapRef}
        style={styles.fill}
        customMapStyle={MAP_DARK_STYLE}
        scrollEnabled
        zoomEnabled
        rotateEnabled={false}
        pitchEnabled={false}
        initialRegion={FALLBACK_REGION}
        onMapReady={() => setMapReady(true)}
        onPanDrag={() => live && setFollowing(false)}
      >
        {coordinates.length >= 2 && <Polyline coordinates={coordinates} strokeColor={palette.accent} strokeWidth={4} />}
        {live && lastCoordinate && (
          <Marker coordinate={lastCoordinate} anchor={{ x: 0.5, y: 0.5 }} flat>
            <HeadingPuck headingDegrees={lastPoint?.heading} />
          </Marker>
        )}
        {!live && coordinates.length > 0 && (
          <>
            <Marker coordinate={coordinates[0]} pinColor={palette.success} title="Start" />
            <Marker coordinate={lastCoordinate} pinColor={palette.danger} title="Finish" />
          </>
        )}
      </MapView>
      {live && (
        <Pressable
          style={[styles.recenterButton, { bottom: recenterBottomOffset }]}
          onPress={recenter}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Recenter on my location"
        >
          <Ionicons name="locate" size={20} color={following ? palette.accent : "#fff"} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // No borderRadius/overflow here - clipping a native surface-backed view
  // like MapView inside a rounded, overflow:"hidden" container is a known
  // Android rendering issue (it silently fails to composite the native
  // view at all, rather than just squaring off the corners).
  fill: { flex: 1 },
  recenterButton: {
    position: "absolute",
    right: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(20,22,26,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
});
