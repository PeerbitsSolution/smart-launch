# Contributing to smart-launch

Thanks for considering a contribution. This repo is part of the PeerbitsSolution
HealthTech Open Source initiative — small, focused, spec-grounded tools, not
full products. Contributions that keep that scope are the easiest to accept.

## Before you start

- Check open issues first — especially ones tagged `good first issue` or
  `help wanted`.
- For anything non-trivial (new feature, API change), open an issue to
  discuss the approach before writing code. Saves everyone a rewrite.
- This repo intentionally does **not** accept contributions that reintroduce
  product-specific logic, client-specific behavior, or scope creep toward a
  full platform. If in doubt, ask in the issue first.

## Development setup

```bash
git clone https://github.com/PeerbitsSolution/smart-launch.git
cd smart-launch
npm install
npm test
```

## Making a change

1. Fork the repo and create a branch off `main`:
   `git checkout -b feature/short-description` or `fix/short-description`.
2. Write the code and the tests together — a PR that adds behavior without
   a test covering it will be asked to add one before merge.
3. Run the full check locally before opening a PR:
   ```bash
   npm run lint
   npm run typecheck
   npm test
   ```
4. Keep commits small and messages descriptive. Conventional Commits style
   is preferred (`fix:`, `feat:`, `docs:`, `chore:`) but not strictly enforced.
5. Open a PR against `main` using the PR template. Link the issue it
   addresses.

## Coding conventions

- TypeScript, strict mode. No `any` without a comment explaining why it's
  unavoidable.
- Framework-agnostic core (no hard dependency on Express/React/etc. in
  `/src` — those belong in `/docs/examples` only).
- Public API surface stays typed and exported from `src/index.ts`; internal
  modules are not part of the stability contract.
- No hardcoded credentials, tokens, or realistic-looking example secrets —
  see `SECURITY.md`.

## What we will not merge

- Anything containing real patient data, real credentials, or client-
  identifying content (see `SECURITY.md`).
- Features that turn this into a full platform/product rather than a
  focused, reusable component.
- Breaking API changes without a version bump discussion (see
  `CHANGELOG.md` and semver policy).

## Code of conduct

Be direct, be kind, assume good faith. Disagreements about approach are
fine and expected; personal attacks or dismissiveness aren't.

## Questions

Open an issue with the `question` label, or start a discussion if the repo
has GitHub Discussions enabled.
