# SillyTavern base

Astral.AI starts from SillyTavern 1.19.0, release commit **06bde939fb1e9c4c8d8641d810f0a916b5bce127**:
https://github.com/SillyTavern/SillyTavern/tree/06bde939fb1e9c4c8d8641d810f0a916b5bce127

This repository begins Astral's own history. It contains modified SillyTavern source, not a replacement implementation. The original AGPL-3.0 license, source copyright headers, and third-party notices remain. The original project README is preserved as README.upstream.md.

Astral adds an Electron shell and React interface around SillyTavern's character, generation, streaming, prompt, and save functions. The legacy interface remains available at /?legacy. Astral's adapter and server code live under astral/ and src/astral/.

When updating the base, compare against the pinned commit, review each Astral change, and rerun chat, card, memory, image, backup, desktop, and security checks. The histories are independent; do not merge upstream release branches without reviewing the integration.

The app version comes from package.json. It is independent of the pinned SillyTavern version above.
