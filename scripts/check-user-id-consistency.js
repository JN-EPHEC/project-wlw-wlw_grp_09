const { execSync } = require('node:child_process');

const checks = [
  {
    name: 'users documents',
    hint: "doc(db, 'users', ...uid) or userDocRef('users', ...)",
    pattern:
      "doc\\(db,\\s*['\"]users['\"]\\s*,\\s*(?:auth\\.uid|user\\.uid|session\\.uid|uid)|userDocRef\\(\\s*['\"]users['\"]",
  },
  {
    name: 'wallets documents',
    hint: "doc(db, 'wallets', ...uid) or userDocRef('wallets', ...)",
    pattern:
      "doc\\(db,\\s*['\"]wallets['\"]\\s*,\\s*(?:auth\\.uid|ownerUid|uid)|userDocRef\\(\\s*['\"]wallets['\"]",
  },
  {
    name: 'trajets user journal',
    hint: "doc(collection(db,'trajets'), uid) or doc(db, 'trajets', uid)",
    pattern: "doc\\(collection\\(db,\\s*'trajets'\\),\\s*(?:auth\\.uid|uid|ownerUid)\\)",
  },
];

const runCheck = ({ name, pattern, hint }) => {
  try {
    execSync(`rg -l "${pattern}" -g"*.ts" -g"*.tsx" -g"*.js"`, {
      stdio: 'ignore',
    });
    return { name, ok: true };
  } catch {
    return { name, ok: false, hint };
  }
};

const results = checks.map(runCheck);
const failed = results.filter((result) => !result.ok);

if (failed.length) {
  console.error('User ID consistency check failed:');
  failed.forEach((result) => {
    console.error(`- ${result.name} (hint: ${result.hint})`);
  });
  process.exit(1);
}

console.log('User ID consistency check passed ✅');
