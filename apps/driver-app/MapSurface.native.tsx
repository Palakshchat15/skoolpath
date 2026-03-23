import React from "react";
import MapView, { Marker } from "react-native-maps";
import { type BusLiveLocation } from "@skoolpath/shared";

const defaultRegion = {
  latitude: 28.6139,
  longitude: 77.209,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01
};

export default function MapSurface({ currentLocation }: { currentLocation: BusLiveLocation }) {
  return (
    <MapView
      style={{ height: 340, borderRadius: 20 }}
      initialRegion={defaultRegion}
      region={{
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01
      }}
    >
      <Marker
        coordinate={{
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude
        }}
        title={currentLocation.busLabel}
        description={currentLocation.routeName}
      />
    </MapView>
  );
}
