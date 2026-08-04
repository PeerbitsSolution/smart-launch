# Changelog

All notable changes to this project are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- SMART discovery (`.well-known/smart-configuration` with CapabilityStatement
  `oauth-uris` fallback)
- PKCE (S256) verifier/challenge generation, plus `state`/`nonce` generation
- EHR launch flow: authorization redirect construction and callback handling
- Standalone launch flow: authorization redirect construction and callback
  handling
- Authorization-code-for-token exchange, refresh-before-expiry, and typed
  OAuth2 error surfacing
- Typed launch-context claim parsing (`patient`, `encounter`, `fhirUser`,
  `need_patient_banner`, `smart_style_url`)
- `TokenStorage` interface with an in-memory reference implementation
- Example Express apps for both launch types under `docs/examples`
- Full unit test suite for discovery, PKCE, token exchange/refresh, launch
  context parsing, storage, and both launch flows; a manually-run sandbox
  discovery test tagged separately from the CI suite

<!--
## [1.0.0] - YYYY-MM-DD
### Added
- Initial public release.
-->
