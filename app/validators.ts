// app/validators.ts

export const sanitizeEmail = (email: string) => email.trim().toLowerCase();

export const sanitizeName = (raw: string) => raw.trim().replace(/\s+/g, ' ');

const emailFormatOK = (email: string) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email);

const EPHEC_PATTERN = /^he\d{6}@students\.ephec\.be$/i;

export const isStudentEmail = (raw: string) => {
  const email = sanitizeEmail(raw);
  return EPHEC_PATTERN.test(email);
};

export const isStrongPassword = (pwd: string) =>
  /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(pwd);

export const sanitizeAddress = (raw: string) => raw.trim().replace(/\s+/g, ' ');

export const isValidAddress = (raw: string) => {
  const address = sanitizeAddress(raw);
  if (address.length < 10) return false;
  if (!/\d+/.test(address)) return false;
  if (!/[A-Za-z]{2,}/.test(address)) return false;
  if (!/[\s,]/.test(address)) return false;
  return true;
};
