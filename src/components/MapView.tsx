import { useEffect, useState } from "react";
import L from "leaflet";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import { setWorkerUrl, type Map as MaplibreMap } from "maplibre-gl";
import maplibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import { MapContainer, Marker, Polyline, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Alternative, Destination, LatLon, Place, Trip } from "../types";
import { REGION } from "../config/region";
import { formatDuration } from "../lib/geo";
import { schoolSummary } from "../lib/schools";
import "leaflet/dist/leaflet.css";
import "maplibre-gl/dist/maplibre-gl.css";

// Emoji div-icons avoid Leaflet's default image markers, which break under bundlers.
// Size changes go through iconSize/iconAnchor, never a CSS transform: Leaflet
// positions markers with `transform`, so scaling one shifts it off its point.
const emojiIcon = (emoji: string, size: number, className = "") =>
  L.divIcon({
    html: `<span>${emoji}</span>`,
    className: `emoji-marker ${className}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
const ORIGIN_ICON = emojiIcon("🏠", 40, "origin");

// MapLibre finds its worker next to its own module, which bundling breaks; point it
// at a Vite-bundled copy instead.
setWorkerUrl(maplibreWorkerUrl);

const BOUNDS = L.latLngBounds([REGION.south, REGION.west], [REGION.north, REGION.east]);

// OpenFreeMap's Liberty vector style (free, no key): coloured parks, water and
// roads, with the clutter trimmed by `simplifyStyle`. Same style in dark mode;
// the darker styles read as too bare for this.
const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
const ATTRIBUTION =
  '<a href="https://openfreemap.org">OpenFreeMap</a> &copy; <a href="https://www.openmaptiles.org/">OpenMapTiles</a> Data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Calmer map: hides dashed lines (footpaths, park outlines, rail hatching) and
 * 3D building extrusions, which only add noise on a flat, top-down map.
 */
export function simplifyStyle(map: MaplibreMap): void {
  for (const layer of map.getStyle().layers) {
    const dashed = layer.type === "line" && map.getPaintProperty(layer.id, "line-dasharray") !== undefined;
    if (dashed || layer.type === "fill-extrusion") map.setLayoutProperty(layer.id, "visibility", "none");
  }
}

function BaseMap() {
  const map = useMap();
  useEffect(() => {
    const layer = maplibreGL({ style: STYLE_URL, attributionControl: false });
    layer.addTo(map);
    map.attributionControl.addAttribution(ATTRIBUTION);
    const gl = layer.getMaplibreMap();
    const onLoad = () => simplifyStyle(gl);
    gl.on("style.load", onLoad);
    return () => {
      gl.off("style.load", onLoad);
      map.attributionControl.removeAttribution(ATTRIBUTION);
      layer.remove();
    };
  }, [map]);
  return null;
}


/** Re-frames the map when the origin or the set of shown places changes. */
/** Clicks on empty map (markers don't propagate theirs) mean "back to the overview". */
function BackgroundClick({ onClick }: { onClick: () => void }) {
  useMapEvents({ click: onClick });
  return null;
}

interface FitToProps {
  origin: Place | null;
  places: LatLon[];
  route?: Trip | null;
  /** Bump to re-frame even when the places haven't changed (e.g. after zooming into a route). */
  resetCount: number;
}

function FitTo({ origin, places, route, resetCount }: FitToProps) {
  const map = useMap();
  const placesKey = places.map((p) => `${p.lat},${p.lon}`).join(";");
  useEffect(() => {
    if (!origin) return;
    const pts: [number, number][] = [[origin.lat, origin.lon], ...places.map((p): [number, number] => [p.lat, p.lon])];
    if (pts.length === 1) map.setView(pts[0], 15);
    else map.fitBounds(pts, { padding: [40, 40], maxZoom: 16 });
    // Keyed on coordinates, not object identity, so progressive updates don't refit.
  }, [map, origin?.lat, origin?.lon, placesKey, resetCount]);
  useEffect(() => {
    const pts = route?.path?.flatMap((s) => s.points);
    if (pts?.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 17 });
  }, [map, route]);
  return null;
}

interface Props {
  origin: Place | null;
  rows: Destination[];
  selectedKey: string | null;
  expandedKey: string | null;
  route: Trip | null;
  onSelectRow: (key: string) => void;
  /** Called on a click on empty map, after which the map re-frames the overview. */
  onClearSelection: () => void;
  onChoose: (key: string, alt: Alternative) => void;
}

const isCurrent = (row: Destination, a: LatLon) => row.place?.lat === a.lat && row.place?.lon === a.lon;

/** Option marker: the category emoji plus its number in the expanded list. */
const optionIcon = (emoji: string, n: number) =>
  L.divIcon({
    html: `<span>${emoji}</span><b class="rank">${n}</b>`,
    className: "emoji-marker option",
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });

export function MapView({ origin, rows, selectedKey, expandedKey, route, onSelectRow, onChoose, onClearSelection }: Props) {
  const [resetCount, setResetCount] = useState(0);
  const found = rows.filter((r) => r.place);
  // The expanded category takes focus: its options are shown and everything else fades.
  const focus = rows.find((r) => r.key === expandedKey && r.place && r.alternatives);
  const options = (focus?.alternatives ?? []).map((a, i) => ({ ...a, rank: i + 1 })).filter((a) => !isCurrent(focus!, a));
  const framed = focus ? [focus.place!, ...options] : found.map((r) => r.place!);

  return (
    <MapContainer
      className="map"
      center={[REGION.center.lat, REGION.center.lon]}
      zoom={REGION.zoom}
      minZoom={9}
      maxZoom={19}
      maxBounds={BOUNDS.pad(0.1)}
      maxBoundsViscosity={0.8}
    >
      <BaseMap />
      <BackgroundClick
        onClick={() => {
          onClearSelection();
          setResetCount((n) => n + 1);
        }}
      />
      <FitTo origin={origin} places={framed} route={route} resetCount={resetCount} />
      {origin && (
        <Marker position={[origin.lat, origin.lon]} icon={ORIGIN_ICON} zIndexOffset={1000}>
          <Tooltip direction="top" offset={[0, -16]}>
            {origin.name}
          </Tooltip>
        </Marker>
      )}
      {found.map((r) => {
        const isFocus = focus ? r.key === focus.key : r.key === selectedKey;
        const dimmed = !!focus && !isFocus;
        return (
          <Marker
            key={r.key}
            position={[r.place!.lat, r.place!.lon]}
            icon={emojiIcon(r.icon, isFocus ? 40 : 32, isFocus ? "selected" : dimmed ? "dimmed" : "")}
            zIndexOffset={isFocus ? 900 : dimmed ? -100 : 0}
            eventHandlers={{ click: () => onSelectRow(r.key) }}
          >
            <Tooltip direction="top" offset={[0, -14]}>
              {r.label}: {r.place!.name}
              {r.place!.school && (
                <>
                  <br />
                  {schoolSummary(r.place!.school)}
                </>
              )}
            </Tooltip>
          </Marker>
        );
      })}
      {focus &&
        options.map((a) => (
          <Marker
            key={`opt:${a.lat},${a.lon}`}
            position={[a.lat, a.lon]}
            icon={optionIcon(focus.icon, a.rank)}
            zIndexOffset={800}
            eventHandlers={{ click: () => onChoose(focus.key, a) }}
          >
            <Tooltip direction="top" offset={[0, -12]}>
              {a.rank}. {a.name}
              {a.walk?.status === "ok" && ` · 🚶 ${formatDuration(a.walk.trip.seconds)}`}
              {a.school && (
                <>
                  <br />
                  {schoolSummary(a.school)}
                </>
              )}
              <br />
              <em>Click to use this one</em>
            </Tooltip>
          </Marker>
        ))}
      {route?.path?.map((seg, i) => (
        <Polyline
          key={i}
          positions={seg.points}
          // Clicking the route shouldn't count as a click on empty map (which resets the view).
          bubblingMouseEvents={false}
          pathOptions={{ color: seg.color ?? "#2563eb", weight: 5, opacity: 0.85, dashArray: seg.dashed ? "6 8" : undefined }}
        />
      ))}
    </MapContainer>
  );
}
