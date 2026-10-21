# Security Policy

## Reporting a Vulnerability

Do not disclose suspected vulnerabilities in a public issue.

Use GitHub's private vulnerability reporting feature for this repository when it is available. Include a clear description, reproduction steps, affected components, potential impact, and any suggested mitigation. Avoid including real credentials, personal data, or production records in the report.

## Sensitive Data

This repository must not contain:

- API keys, access tokens, passwords, or environment files
- Browser profiles, cookies, QR codes, or authenticated sessions
- Candidate records, contact details, private job data, or community membership information
- Private invitation links or proprietary branded assets
- Local databases, exports, backups, or generated operational data

If a credential is committed, revoke or rotate it immediately. Removing it from the latest commit is not sufficient because it may remain in Git history.

## Supported Versions

Security fixes are applied to the latest version on the `main` branch. Older commits and forks are not maintained.
