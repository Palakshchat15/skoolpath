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
      html, body, #map { height: 100%; margin: 0; }
      body { overflow: hidden; background: #dbeafe; }
      .leaflet-container { font-family: Arial, sans-serif; }
    </style>
  </head>
  <body>
    <div id="map" aria-label="${title}"></div>
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    <script>
      const map = L.map('map', { zoomControl: false }).setView([28.6139, 77.209], 13);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap'
      }).addTo(map);

      const marker = L.circleMarker([28.6139, 77.209], {
        radius: 10,
        color: '${accent}',
        weight: 3,
        fillColor: '${accent}',
        fillOpacity: 0.9
      }).addTo(map);

      const routeLine = L.polyline([], {
        color: '${accent}',
        weight: 4,
        opacity: 0.72
      }).addTo(map);

      let currentLatLng = [28.6139, 77.209];
      let animationFrame = null;

      function animateTo(targetLat, targetLng) {
        const start = [...currentLatLng];
        const end = [targetLat, targetLng];
        const startedAt = performance.now();
        const duration = 1400;

        if (animationFrame) {
          cancelAnimationFrame(animationFrame);
        }

        const step = (now) => {
          const progress = Math.min((now - startedAt) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 3);
          const lat = start[0] + (end[0] - start[0]) * eased;
          const lng = start[1] + (end[1] - start[1]) * eased;
          currentLatLng = [lat, lng];
          marker.setLatLng(currentLatLng);
          map.panTo(currentLatLng, { animate: false });

          if (progress < 1) {
            animationFrame = requestAnimationFrame(step);
          }
        };

        animationFrame = requestAnimationFrame(step);
      }

      window.addEventListener('message', (event) => {
        if (!event.data || event.data.type !== 'skoolpath-map-update') {
          return;
        }

        const { latitude, longitude, label, routeName, routeStops } = event.data;
        if (typeof latitude === 'number' && typeof longitude === 'number') {
          animateTo(latitude, longitude);
          marker.bindPopup('<strong>' + (label || 'Bus') + '</strong><br/>' + (routeName || '')).openPopup();
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
