declare global {
  interface Window {
    google?: any;
    __campusRideGoogleMapsLoader?: Record<string, Promise<any>>;
  }
}

export type GoogleMapsApi = typeof google;

const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? 'AIzaSyCU9joaWe-_aSq4RMbqbLsrVi0pkC5iu8c';

type LoadGoogleMapsApiOptions = {
  libraries?: string[];
};

const buildLoaderKey = (libraries?: string[]) => {
  if (!libraries || libraries.length === 0) {
    return 'base';
  }
  return `libs:${[...libraries].sort().join(',')}`;
};

export const loadGoogleMapsApi = ({
  libraries = [],
}: LoadGoogleMapsApiOptions = {}): Promise<GoogleMapsApi> => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('window unavailable'));
  }
  const needsPlaces = libraries.includes('places');
  const hasPlaces = Boolean(window.google?.maps?.places);
  if (window.google && window.google.maps && (!needsPlaces || hasPlaces)) {
    return Promise.resolve(window.google);
  }

  const loaderKey = buildLoaderKey(libraries);
  if (!window.__campusRideGoogleMapsLoader) {
    window.__campusRideGoogleMapsLoader = {};
  }
  const cached = window.__campusRideGoogleMapsLoader[loaderKey];
  if (cached) {
    return cached;
  }

  const libsParam = libraries.length ? `&libraries=${libraries.join(',')}` : '';
  const promise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}${libsParam}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google!);
    script.onerror = () => reject(new Error('Google Maps JS failed to load.'));
    document.head.appendChild(script);
  });
  window.__campusRideGoogleMapsLoader[loaderKey] = promise;
  promise.catch(() => {
    delete window.__campusRideGoogleMapsLoader![loaderKey];
  });
  return promise;
};

export {};
