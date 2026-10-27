# Contributing to Astral.AI

Bug reports, clear reproduction steps, documentation fixes, and focused pull requests help. Open an issue before starting a large feature so we can agree on what it needs to do.

## Development

Use Node.js 22.23.2 or newer. Run npm ci, then npm run astral:build. Browser development uses npm run astral:dev; desktop development also needs npm run astral:prepare-runner -- --backend cpu. The preparation script defaults to CPU. Use --backend cuda, vulkan, or all only when testing those backends.

Keep chat data and model files outside Git. Use ASTRAL_DATA_ROOT for isolated test data and ASTRAL_TEST_USER_DATA for Electron tests. Never submit logs containing messages, profiles, images, local credentials, or model-server keys.

## Before a pull request

- Run npm run astral:typecheck and npm run astral:test.
- Run npm run astral:build and npm run astral:test:e2e. The browser tests use installed Edge by default; ASTRAL_BROWSER_CHANNEL can choose another installed Playwright channel. Model replies in these tests come from local fixtures.
- Run npm run astral:lint for changed server/shared/desktop code.
- For interface changes, check light/dark themes, 75–150% interface size, a short laptop window, keyboard navigation, and reduced motion. Test actual control bounds as well as screenshots.

Describe the problem, what changed, and what you tested. Say which tests used real hardware and which used fixtures or simulated viewports. AI-assisted contributions are welcome; explain their use when it matters and check the resulting code. Do not claim testing or human review that did not happen.

## Upstream and license

Preserve the SillyTavern adapter and compatible data formats. Keep character prompts and user data unchanged unless the issue requires a deliberate migration. See UPSTREAM.md before changing upstream code. Contributions use this project's AGPL-3.0 license; retain third-party notices.
