# Runtime harness

This harness is for Tessl cloud setup checks and local validation of the public `guypod/goof-factory` demo copy.

It starts only disposable local services:

- MongoDB 4.0.28 in Docker, bound to `127.0.0.1` only.
- The Node app on `127.0.0.1` using `runtime/loopback-listen.js` as a preload.

Coverage is intentionally narrow:

- Covered: core todo create, edit and delete over loopback MongoDB.
- Not covered: optional MySQL-backed users subsystem, login/admin/account paths, import/upload paths, chat paths, public deployment, external exploit targets or real user data.

Do not use the repository's original `docker-compose.yml` for factory validation: it publishes services broadly and runs dependency update behavior that is not part of deterministic setup.
