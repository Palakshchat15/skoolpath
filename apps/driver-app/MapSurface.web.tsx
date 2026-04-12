import React, { useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { type BusLiveLocation } from "@skoolpath/shared";

export default function MapSurface({ currentLocation }: { currentLocation: BusLiveLocation }) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  const mapDocument = useMemo(
    () => createLiveMapDocument("Driver bus map", "#2563eb"),
    []
  );

  useEffect(() => {
    frameRef.current?.contentWindow?.postMessage(
      {
        type: "skoolpath-map-update",
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        label: currentLocation.busLabel,
        routeName: currentLocation.routeName,
        routeStops: currentLocation.routeStops
      },
      "*"
    );
  }, [currentLocation]);

  return (
    <View style={styles.wrapper}>
      <iframe ref={frameRef} srcDoc={mapDocument} style={styles.frame as never} title="Driver bus map" />
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          {currentLocation.busLabel} at {currentLocation.latitude.toFixed(5)}, {currentLocation.longitude.toFixed(5)}
        </Text>
      </View>
    </View>
  );
}

function createLiveMapDocument(title: string, accent: string) {
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
      html, body, #map { height: 100%; margin: 0; background: #0f172a; }
      #map { 
        filter: invert(100%) hue-rotate(180deg) brightness(95%) contrast(90%) grayscale(0.2);
        background: #0f172a;
      }
      .leaflet-container { font-family: 'Inter', system-ui, sans-serif; }
      .leaflet-popup-content-wrapper { background: #1e293b; color: #f8fafc; border-radius: 12px; }
      .leaflet-popup-tip { background: #1e293b; }
    </style>
  </head>
  <body>
    <div id="map" aria-label="${title}"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([28.6139, 77.209], 13);
      
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 20
      }).addTo(map);

      const marker = L.circleMarker([28.6139, 77.209], {
        radius: 12,
        color: '#ffffff',
        weight: 3,
        fillColor: '${accent}',
        fillOpacity: 1,
        className: 'pulse-marker'
      }).addTo(map);

      const routeLine = L.polyline([], {
        color: '${accent}',
        weight: 6,
        opacity: 0.4,
        lineCap: 'round'
      }).addTo(map);

      let currentLatLng = [28.6139, 77.209];
      let animationFrame = null;

      function animateTo(targetLat, targetLng) {
        const start = [...currentLatLng];
        const end = [targetLat, targetLng];
        const startedAt = performance.now();
        const duration = 1200;

        if (animationFrame) { cancelAnimationFrame(animationFrame); }

        const step = (now) => {
          const progress = Math.min((now - startedAt) / duration, 1);
          const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
          const lat = start[0] + (end[0] - start[0]) * eased;
          const lng = start[1] + (end[1] - start[1]) * eased;
          currentLatLng = [lat, lng];
          marker.setLatLng(currentLatLng);
          map.panTo(currentLatLng, { animate: false });
          if (progress < 1) { animationFrame = requestAnimationFrame(step); }
        };
        animationFrame = requestAnimationFrame(step);
      }

      window.addEventListener('message', (event) => {
        if (!event.data || event.data.type !== 'skoolpath-map-update') return;
        const { latitude, longitude, label, routeName, routeStops } = event.data;
        if (typeof latitude === 'number' && typeof longitude === 'number') {
          animateTo(latitude, longitude);
          marker.bindPopup('<div style="text-align:center"><strong>' + (label || 'Bus') + '</strong><br/><small>' + (routeName || 'Active Route') + '</small></div>').openPopup();
        }
        if (Array.isArray(routeStops) && routeStops.length) {
          routeLine.setLatLngs(routeStops.map((stop) => [stop.latitude, stop.longitude]));
        }
      });
    </script>
  </body>
</html>`;
}

const styles = StyleSheet.create({
  wrapper: {
    height: 340,
    borderRadius: 20,
    overflow: "hidden",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#cbd5e1"
  },
  frame: {
    width: "100%",
    height: "100%",
    borderWidth: 0
  },
  footer: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: "rgba(15,23,42,0.9)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  footerText: {
    color: "#ffffff",
    fontSize: 13
  }
});
