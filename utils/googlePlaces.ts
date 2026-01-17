import type { LatLng } from '@/app/services/location';
import { loadGoogleMapsApi } from '@/app/services/google-maps-loader';

const placeCache = new Map<string, LatLng>();

export const getPlaceLatLng = async (placeId: string): Promise<LatLng | null> => {
  if (placeCache.has(placeId)) {
    return placeCache.get(placeId) ?? null;
  }
  const google = await loadGoogleMapsApi({ libraries: ['places'] });
  if (!google?.maps?.places) {
    return null;
  }
  const service = new google.maps.places.PlacesService(document.createElement('div'));
  const details = await new Promise<google.maps.places.PlaceResult | null>((resolve) => {
    service.getDetails({ placeId, fields: ['geometry'] }, (result, status) => {
      resolve(status === 'OK' ? result : null);
    });
  });
  const location = details?.geometry?.location;
  if (!location) {
    return null;
  }
  const latLng = { lat: location.lat(), lng: location.lng() };
  placeCache.set(placeId, latLng);
  return latLng;
};
