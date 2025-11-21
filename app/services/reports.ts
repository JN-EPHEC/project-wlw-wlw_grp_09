// app/services/reports.ts
// Gestion simple des signalements pour la modération (in-memory).

export type ReportReason =
  | 'inappropriate-behaviour'
  | 'late-cancellation'
  | 'no-show'
  | 'unsafe-driving'
  | 'other';

export type Report = {
  id: string;
  reporterEmail: string;
  targetEmail: string;
  rideId?: string | null;
  reason: ReportReason;
  comment?: string | null;
  createdAt: number;
  metadata?: Record<string, unknown>;
};

type Listener = (reports: Report[]) => void;

let reports: Report[] = [];
const listeners: Listener[] = [];

const randomId = () => Math.random().toString(36).slice(2, 11);

const clone = (items: Report[]) => items.map((item) => ({ ...item }));

const notify = () => {
  const snapshot = clone(reports);
  listeners.forEach((listener) => listener(snapshot));
};

export const createReport = (payload: Omit<Report, 'id' | 'createdAt'>) => {
  const report: Report = {
    ...payload,
    id: randomId(),
    createdAt: Date.now(),
  };
  reports = [report, ...reports];
  notify();
  return report;
};

export const getReports = () => clone(reports);

export const subscribeReports = (listener: Listener) => {
  listeners.push(listener);
  listener(clone(reports));
  return () => {
    const index = listeners.indexOf(listener);
    if (index >= 0) listeners.splice(index, 1);
  };
};

export const clearReports = () => {
  reports = [];
  notify();
};
