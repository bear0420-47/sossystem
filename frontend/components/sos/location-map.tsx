"use client";

import { useEffect, useState } from "react";
import { MapPin } from "lucide-react";

interface LocationMapProps {
  lat: number;
  lng: number;
  className?: string;
  showMarker?: boolean;
  zoom?: number;
}

// Dynamic import for Leaflet to avoid SSR issues
export function LocationMap({
  lat,
  lng,
  className = "",
  showMarker = true,
  zoom = 15,
}: LocationMapProps) {
  const [MapComponent, setMapComponent] = useState<React.ComponentType<{
    lat: number;
    lng: number;
    zoom: number;
    showMarker: boolean;
  }> | null>(null);

  useEffect(() => {
    // Dynamically import Leaflet components only on client
    import("./leaflet-map").then((mod) => {
      setMapComponent(() => mod.LeafletMap);
    });
  }, []);

  if (!MapComponent) {
    // Loading placeholder
    return (
      <div
        className={`bg-muted rounded-lg flex items-center justify-center ${className}`}
      >
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <MapPin className="h-8 w-8 animate-pulse" />
          <span className="text-sm">Loading map...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg overflow-hidden ${className}`}>
      <MapComponent lat={lat} lng={lng} zoom={zoom} showMarker={showMarker} />
    </div>
  );
}
