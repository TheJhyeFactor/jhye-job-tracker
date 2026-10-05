# Deployment and security verification — 5 October 2026

The frontend is live at https://thejhyefactor.github.io/jhye-job-tracker/ and its private data API is deployed to https://jhye-job-tracker-api.vercel.app. The Pages deployment completed successfully and the Vercel deployment is Ready, with the function running in syd1. Owner credential/MFA activation remains pending. No owner password was chosen by the agent.

14 automated checks passed against an isolated temporary PostgreSQL schema: authenticated encryption and tamper detection, salted password validation, anonymous and forged session rejection, foreign-origin denial, private activation capability, password/MFA setup requirements, setup revocation, protected reads/no-store/CORS, OTP and recovery-code replay rejection, durable encrypted edits/backups/stale-version conflict, invalid field rejection, logout revocation, idle/absolute expiry, and account throttling. The temporary schema was removed.

Live verification passed API health, anonymous-read denial (401), foreign-origin denial (403), invalid-activation denial (403), authenticated reading of all 99 imported applications, origin denial for authenticated mutations, durable create/edit/read of a synthetic record, stale-write rejection (409), encrypted backup creation, and session revocation after logout. The latest Johns Lyng and Microsoft updates were checked in the authenticated response.

The live API check used a short-lived, random operator test session inserted by the database administrator. It did not activate the real owner or set real credentials. The test session was revoked and deleted, the synthetic record and synthetic-containing backup removed, and the final dataset contains 99 real records with zero test sessions.

The runtime role was checked directly: tracker data SELECT is permitted, owner INSERT is denied, and public schema CREATE is denied. Private file paths on the frontend and API are unavailable. Before publishing, staged files were checked for the generated activation, encryption and database-password values and the private interview invitation; none were present. The API upload excludes the frontend and all local private files.

The live frontend displayed only the username/password/authenticator sign-in form, with no records rendered before authentication. Browser error logs were empty. npm audit reported zero known production-dependency vulnerabilities at verification time; this does not prove absence of unknown vulnerabilities.

The full owner sign-in from the production webpage remains unverified until the owner completes password/MFA setup. The authentication flow was verified by integration tests, and the production data API was verified with the temporary operator session. See README.md for operational limits, trust boundaries, account recovery and backups.
