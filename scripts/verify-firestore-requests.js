const admin = require('firebase-admin');

const parseArgs = () => {
  const argv = process.argv.slice(2);
  const options = {};
  argv.forEach((item) => {
    if (!item.startsWith('--')) return;
    const [key, value] = item.slice(2).split('=');
    options[key] = value;
  });
  return options;
};

const requiredEnv = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
const env = process.env;
const missingEnv = requiredEnv.filter((key) => !env[key]);
if (missingEnv.length) {
  console.error('Missing Firebase service account variables:', missingEnv.join(', '));
  process.exit(1);
}

const options = parseArgs();
const tripId = options.tripId || options.trip;
const passengerUid = options.passengerUid;

if (!tripId) {
  console.error('Usage: node scripts/verify-firestore-requests.js --tripId=<trajetId> [--passengerUid=<uid>]');
  process.exit(1);
}

const privateKey = env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
const credentials = {
  projectId: env.FIREBASE_PROJECT_ID,
  clientEmail: env.FIREBASE_CLIENT_EMAIL,
  privateKey,
};

admin.initializeApp({ credential: admin.credential.cert(credentials) });
const db = admin.firestore();

const requiredFields = [
  'ownerUid',
  'driverName',
  'driverEmail',
  'depart',
  'destination',
  'departureAt',
  'totalSeats',
  'availableSeats',
  'price',
  'status',
  'search',
  'createdAt',
  'updatedAt',
];

const inspectTrip = async () => {
  const trajetRef = db.collection('trajets').doc(tripId);
  const snapshot = await trajetRef.get();
  if (!snapshot.exists) {
    console.error(`Document trajets/${tripId} does not exist.`);
    process.exit(1);
  }
  const data = snapshot.data();
  const missing = requiredFields.filter((field) => data[field] === undefined || data[field] === null);
  if (missing.length) {
    console.error(`Missing fields on trajets/${tripId}: ${missing.join(', ')}`);
    return { ok: false };
  }
  console.log(`trajets/${tripId} contains all required fields.`);
  return { ok: true, ref: trajetRef };
};

const inspectRequests = async (trajetRef) => {
  const requestsSnapshot = await trajetRef.collection('requests').get();
  if (requestsSnapshot.empty) {
    console.warn('No requests found under the trip.');
    return { ok: false };
  }
  requestsSnapshot.forEach((doc) => {
    const payload = doc.data();
    console.log(
      `request ${doc.id}: status=${payload.status} passengerUid=${payload.passengerUid} driverUid=${payload.driverUid}`
    );
    ['passengerUid', 'driverUid', 'driverEmail'].forEach((field) => {
      if (payload[field] === undefined) {
        console.warn(`  ⚠️ Field ${field} missing on request ${doc.id}`);
      }
    });
  });
  if (passengerUid) {
    const passengerEntries = requestsSnapshot.docs.filter(
      (doc) => doc.data().passengerUid === passengerUid
    );
    console.log(
      `Requests for UID ${passengerUid}: ${passengerEntries.length} (${passengerEntries
        .map((doc) => doc.id)
        .join(', ')})`
    );
  }
  return { ok: true };
};

const inspectHistory = async (trajetRef) => {
  const historySnapshot = await trajetRef.collection('history').orderBy('createdAt', 'desc').limit(5).get();
  if (historySnapshot.empty) {
    console.warn('No history entries found.');
    return { ok: false };
  }
  console.log('History events:');
  historySnapshot.forEach((doc) => {
    const data = doc.data();
    console.log(`  - ${data.type} by ${data.actorUid} at ${data.createdAt.toDate?.() ?? data.createdAt}`);
  });
  return { ok: true };
};

const run = async () => {
  const tripCheck = await inspectTrip();
  const requestsCheck = tripCheck.ok ? await inspectRequests(tripCheck.ref) : { ok: false };
  const historyCheck = tripCheck.ok ? await inspectHistory(tripCheck.ref) : { ok: false };
  if (!tripCheck.ok || !requestsCheck.ok || !historyCheck.ok) {
    process.exit(1);
  }
  console.log('Firestore verification passed ✅');
};

run().catch((error) => {
  console.error('Verification failed', error);
  process.exit(1);
});
