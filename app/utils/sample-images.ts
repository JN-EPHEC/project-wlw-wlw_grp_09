// Tiny base64 placeholders used when native pickers are unavailable.
// In production these would be replaced by actual uploads to storage.

const SAMPLE_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAIElEQVR42mP8z8AARAwMjIwgNiMMGv5nBi4aNgYAgUUBA6XgA0EAAAAASUVORK5CYII=';

const toDataUri = () => `data:image/png;base64,${SAMPLE_BASE64}`;

export const getSampleKycImage = (type: 'id-card' | 'student-card' | 'driver-license') => {
  return toDataUri();
};

export const getSampleVehicleImage = () => toDataUri();

export const getSampleSelfieImage = () => toDataUri();

export const getSampleAvatarImage = () => toDataUri();
