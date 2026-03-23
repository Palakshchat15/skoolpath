import React from "react";
import MapView, { Marker } from "react-native-maps";
import { type BusLiveLocation } from "@skoolpath/shared";

const defaultRegion = {
  latitude: 28.6139,
  longitude: 77.209,
  latitudeDelta: 0.03,
  longitudeDelta: 0.03
};

export default function MapSurface({ busLocation }: { busLocation: BusLiveLocation }) {
  return (
    <MapView
      style={{ height: 360, borderRadius: 22 }}
      initialRegion={defaultRegion}
      region={{
        latitude: busLocation.latitude,
        longitude: busLocation.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01
      }}
    >
      <Marker
        coordinate={{
          latitude: busLocation.latitude,
          longitude: busLocation.longitude
        }}
        title={busLocation.busLabel}
        description={busLocation.routeName}
      />
    </MapView>
  );
}
