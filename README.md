# Jhye Job Tracker

GitHub Pages hosts the static sign-in interface. A separate Vercel API authenticates the single owner and stores encrypted application data in a dedicated Neon PostgreSQL database. The public repository and Pages deployment contain no application records, passwords, activation capabilities, database credentials or encryption keys.

## Owner activation

On the owner's Mac, open `private/Activate Job Tracker.command` within this project folder. The private link expires 48 hours after provisioning and stops working as soon as the account is activated. Choose a username and unique password/passphrase of at least 16 characters, enrol an authenticator app, enter its six-digit code, then save the ten single-use recovery codes in a password manager. There is no public signup.

Sign in with the password plus an authenticator code or an unused recovery code. All changes save to the hosted database and can be read from another signed-in device. Sessions remain only in the tab's memory; reloading requires another sign-in. They expire after 30 minutes without API activity or 12 hours at most. Signing out revokes the current server session.

The old local tracker remains an independent backup. It does not automatically sync with this hosted tracker. Make new changes in the hosted version to keep one current cloud record.

## Security controls

- Scrypt password hashing: N=131072, r=8, p=1, random 32-byte salts and timing-safe comparison.
- Mandatory TOTP MFA, replay prevention, hashed single-use recovery codes.
- 256-bit random session capabilities, stored as hashes on the server. No auth token is put in localStorage, sessionStorage, cookies, query parameters or the source repository.
- Database-backed account/IP and per-session rate limits. Account throttling is ten login attempts per 15 minutes; it counts successful attempts too.
- Server-side authentication on every data request; strict browser origin checks, explicit CORS origin, JSON requests and bounded request sizes.
- AES-256-GCM authenticated encryption of tracker records, backup snapshots and the TOTP secret, using a separate Vercel environment secret. Passwords and recovery codes are hashed, not encrypted.
- Dedicated least-privilege runtime database role. TLS certificate verification for database connections.
- Optimistic version checks and row locks prevent overwriting concurrent edits. Each mutation stores the previous encrypted snapshot in the database.
- No third-party browser scripts or analytics. Rendered record values are escaped; non-web and credential-bearing job links are rejected. CSV formula escaping protects exports.
- HTTPS, no-store API responses, API security headers, frontend CSP/referrer/robots meta policies, and a frame guard on the frontend.

## Practical limits and maintenance

No system is guaranteed immune to compromise. GitHub Pages controls its response headers, so the frontend cannot supply a custom HTTP CSP or HSTS policy; it supplies a supported meta CSP and blocks framed use in JavaScript. The API supplies HTTP security headers. The repository's GitHub account, Vercel account, database administration account, dependency supply chain and owner's devices remain part of the trust boundary. Use MFA on the hosting accounts, keep dependencies current, and retain local exports.

Encrypted database backups share the same database and encryption key. They are not an independent disaster recovery copy. Download periodic JSON exports and keep the local original safe. Loss of the encryption key makes the encrypted records unreadable. Keep `private/keys.json` and the `.env*` files private and outside Git. The account does not offer email password resets; recovery codes replace a lost authenticator, not a forgotten password. Administrator recovery must use the private maintenance script from this Mac, revoke all sessions and generate a fresh one-time activation capability.

## Development and checks

- `npm run build`: prepare the static frontend.
- `npm test`: 14 security/integration checks in a temporary isolated schema, using the administrative connection from ignored `.env.production.local`. No test changes the real owner or real application records.
- `npm run audit`: check production dependencies for known advisories.
- `npm start`: local preview using ignored `.env.runtime.local`.

Deployment uses a Pages workflow that uploads only `public/`. The Vercel upload excludes all `.env*` files, private activation material, tests, scripts and frontend assets. The private database is provisioned separately; credentials are stored in production environment variables.
