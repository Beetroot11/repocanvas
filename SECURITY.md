# Security and privacy

RepoCanvas does not provide authentication, authorization, or server-side encryption. Production hosts own those responsibilities through their storage adapter.

- Treat whiteboard documents and embedded images as application data subject to the host’s access controls.
- LocalStorage and IndexedDB data are readable by scripts running on the same origin; prevent cross-site scripting and avoid browser-local adapters for highly sensitive material.
- The Fetch adapter should receive short-lived credentials from the host through headers or browser credential policy.
- Resource callbacks may receive file paths, repository links, and issue identifiers. Validate destinations before opening them.
- RepoCanvas sends no telemetry by default.

Report vulnerabilities privately through the repository owner rather than a public issue. Include affected versions, reproduction steps, and impact; do not include real user documents or credentials.
