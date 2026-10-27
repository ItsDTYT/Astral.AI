# Validation record

## 0.3.2 publication checks — 27 October 2026

Local checks pass: 36 Node tests, TypeScript, server/shared/desktop ESLint, production UI build and desktop lifecycle tests. The two new browser checks cover keyboard file selection, aligned field bounds, switch track/thumb geometry, summary persistence and reachable actions in short enlarged windows. Existing chat, image, card, backup, profile, memory and drafting scenarios remain part of CI.

The visual sweep checks 168 screen/size/scale combinations: seven utility screens at 2229×1264, 1515×727, 1366×768, 960×540, 640×480 and 390×844, each at 75%, 100%, 125% and 150% interface size, with light/dark themes and both densities represented. Editor Save controls are checked at each combination. These are logical viewport simulations, not physical mixed-DPI transitions. Native CPU/GPU qualification and clean Windows VM availability are reported separately in the release notes.

The release workflow builds from the tagged checkout, checks packaged startup with Node/Python removed from PATH, verifies the ASAR, and uploads an unsigned draft for final verification. GitHub CI and release results provide the final publication record.


## 0.3.1 checks — 26 October 2026

- 36 Node checks pass, including a 288-combination contrast/exact-background matrix, appearance v1→v2 migration, complete token coverage, and selective/lazy artwork upgrades. Edited definitions, custom portraits, deleted starters, profiles, memories, and layout/color choices are retained.
- All ten browser regressions pass. They cover chat/memory/save points, profile isolation and sharing, streaming, PNG V2/V3 metadata, ZIP/image restore, isolated/chunked drafts/cancellation, responsive editing, real color-picker changes, theme v2 export/v1 import, restart persistence, and live Windows light/dark changes. Model responses in these browser tests come from a local fixture.
- Visual checks cover 72 screen/palette combinations (nine palettes across seven main screens plus chat), character editors, Credits, selected/hover/disabled controls and visible keyboard focus. Forest, Charcoal, Midnight, Paper, purple, blue, red, neutral, and light custom backgrounds were checked. Windows preference changes are emulated. All eight new portraits were inspected; their RGBA transparency was checked separately.
- Laptop/short/mobile layouts include 1366×768, 960×540, 640×480, 390×844, and 800×450 with 75–150% UI size. The last is a viewport simulation of 1600×900 at 200% display scaling, not a physical monitor transition. Effects create their expected canvases with a custom palette; reduced motion removes them. The liquid-logo canvas is constrained to its CSS size on high-density rendering, with the static fallback hidden only while its canvas exists. Plain scenes retain the chosen background, and wide chat leaves full sprites visible beside the dialogue panel.
- TypeScript, production Vite and server/shared/desktop ESLint pass. Electron source lifecycle checks pass queued/repeated activation, minimized restoration, monitor fit, saved bounds, and bundled codecs with Node/Python removed from PATH. A late session request after the owning window is destroyed returns 401 without throwing; the shutdown guard avoids dereferencing a destroyed BrowserWindow.
- Final ASAR integrity, production executable launch timings, native inference smoke results, archive checks, and signing status are recorded in release/DELIVERY-0.3.1.md. The 0.3.0 artifacts are retained. Clean Windows VM installation and physical mixed-DPI transitions remain unavailable.


## 0.3 checks — 25 October 2026

- 32 Node tests pass: persona migration, add-once starters, deletion/isolation, bounded profile prompts, model-family deduplication, exact desktop access, public-card URL rules, transactional restore rollback and resumable verified runtime caching, in addition to prior storage/model/image checks.
- Eight browser scenarios pass: chat/memory/save points, responsive editing/themes, actual streamed prompt inspection including persona isolation and sharing-off behavior, V2/V3 PNG card preservation, backup restoration, isolated/chunked drafts/cancellation, and real image data through generation/restart/ZIP restore. The inference server in these browser scenarios is a fixture, not a physical model.
- TypeScript, Vite build and ESLint pass. Thirty-five visual combinations cover seven screens at 1366×768/100%, 960×540/150%, 640×480/150%, 1920×1080/75%, and 800×450/100%. The last simulates a 1600×900 desktop at 200% scaling; this is not a physical mixed-DPI monitor test. Keyboard controls and reduced-motion behavior are checked in browser tests. Short chat controls were inspected and remain within 800×450.
- Physical RTX 4060 Laptop / 16 GB RAM: Gemma 4 12B IQ4_XS with its projector passes real managed streaming/image inference, both drafting actions without metadata changes, and Stop. CPU/NVIDIA hardware detection is physical; other hardware tiers remain simulations.
- Pinned CUDA archives pass actual hash verification, extraction, executable startup and cache reuse without network fetch. Interrupted archive/resume/tamper checks use fixtures. AMD/Intel Vulkan inference and a real interrupted GPU network download remain unqualified.
- Source Electron with Node/Python removed from PATH passes protected loopback startup and codecs: initial-data launch 9.6s total (window 0.63s, library 3.46s, engine 7.81s); warm-data launch 7.3s total (window 0.19s, library 2.37s, engine 4.13s). Original 0.2 portable smoke: 65.6s initial-data / 9.7s warm-data total. These runs include smoke verification and shutdown, are filesystem-cache dependent, and are not controlled reboot benchmarks.
- The final ASAR payload passed real managed 12B CUDA chat/image inference in an Electron test harness. Unauthenticated requests to the desktop service and managed runner return 401; default logs omit the test prompt. Source Electron lifecycle checks pass queued/repeated launch, minimized restore, one owner window, monitor fit and saved bounds. The production EXE has ASAR-only/integrity fuses enabled and RunAsNode/Node options/Node inspection disabled. CPU E2B text and image inference also pass (single requests 1.3s / 17.5s excluding load; not a throughput benchmark).
- ASAR file integrity, packaged startup and artifact checks are recorded in the delivery notes alongside the release files. Clean Windows VM installation, physical mixed-DPI transitions, Windows Search UI interaction and signing are unavailable; builds remain unsigned.



## 0.2 checks — 25 October 2026

- 23 Node tests pass, including simulated hardware tiers/free-memory pressure, theme validation, off-monitor bounds, website/V3 metadata preservation, dialogue formats/malformed drafts, image normalization, streamed ZIP restore/hash validation, and interrupted paired model/projector downloads.
- TypeScript, production Vite build, and ESLint checks pass for added server/shared/desktop code.
- Source Electron checks pass for activation queued during startup, successful duplicate exit, restoring a minimized owner, one retained window, monitor work-area fit, persisted bounds, and image codecs with Node/Python removed from PATH.
- Seven browser scenarios pass: six combined chat/memory/save-point/streaming, V3 PNG preservation, draft isolation/chunking/cancellation, and image payload/ZIP/reload tests; plus theme import/export and reachable editing at 150% UI size across 1366×768, 960×540, 800×480, and 640×480.
- The packaged 0.2 app passes queued/repeated activation, restoration from minimized state, cross-binary activation, monitor fit, bounds persistence, and codecs with Node/Python removed from PATH. Loading the managed 12B model and closing the packaged app also verifies native-runner shutdown.
- Gemma 4 E2B Q4_K_M and Gemma 4 12B IQ4_XS, including their matching projectors, were downloaded and SHA-256 verified. Native CUDA text and image inference passed on this RTX 4060 Laptop / 16 GB RAM machine. With 2,048 context, measured single-request times excluding load were E2B: text 9.1s, image 15.4s; 12B: text 5.5s, image 6.2s. These are smoke timings, not benchmarks.
- The 12B model also passed actual Astral → SillyTavern → llama.cpp chat completion/streaming, image description, cancellation, and both raw drafting actions at 4,096 context. Drafting left saved chat/memory metadata unchanged.
- CPU fallback passed real E2B text and image inference at 2,048 context (0.9s text, 14.3s image for individual smoke requests, excluding load). The Vulkan executable enumerates the NVIDIA and Intel adapters; Intel shared memory is excluded from Astral's dedicated-VRAM recommendations.
- The nine catalog tiers are simulated estimates. AMD/Intel Vulkan hardware, every other quantization, physical mixed-DPI monitor transitions, Windows Search UI automation, and a genuinely clean Windows VM remain unqualified here. Packaged launch checks remove Node/Python from PATH but are not equivalent to a fresh OS installation. Public character-card sites can block access or change APIs; compatibility adapters and fallback/error paths are included, not a guarantee of live site availability.

## Previous 0.1 baseline

Verified on 24–25 October 2026 on Windows x64, RTX 4060 Laptop GPU (8 GB VRAM), 16 GB RAM.

## Checks

- TypeScript checking and production Vite build pass.
- ESLint passes for added server code and modified upstream entry points.
- 17 Node tests cover removed-mode rejection, upgrade archiving, character ownership, memory scope and disabling, deleted-fact suppression, persistence, save-point restoration, rollback, unsafe backup data, local URL validation, GGUF validation, linked-file retention, resumable downloads, checksum rejection, disk-space failure, pause/resume, and model sampling reset/overrides. A codec regression test additionally checks PNG, JPEG, and WebP encoding/decoding from local WASM files.
- Browser scenarios cover first-run guidance, real SillyTavern story creation, memory editing, save points, the four-character library without a mode switch, restart persistence, mobile navigation and character creation, OpenAI-compatible streaming through SillyTavern, actual prompt inspection, automatic summary updates, memory removal from prompts, PNG character-card round-trip, portable backup restore, and traversal rejection.
- Screenshots inspected at 1440×960, 1366×768, and 390×844. Full effects create three canvases without remote requests or uncaught page errors. Reduced motion removes all effect canvases.
- Electron source and packaged launches reach the initialized SillyTavern/React interface. The upstream SHAKE cache hash was replaced with SHA-256 for Electron's BoringSSL compatibility.
- The packaged app passes startup and JPEG-thumbnail checks with Node and Python removed from PATH. Closing the packaged window with a model loaded also stops the native runner. Browser libraries are compiled during the build and shipped with the app; startup does not invoke webpack compilation. The Node/Electron codec compatibility patch is exercised by the image regression test.

## Real model inference

Both optional IQ4_XS downloads completed and passed their pinned SHA-256 checks. Each model was loaded separately with CUDA and 28 GPU layers, using the bundled llama.cpp b11669 runner.

| Model | Context | Short-reply check |
| --- | --- | --- |
| Angelic Eclipse 12B IQ4_XS | 2048 | 21 completion tokens, approximately 2.5 seconds for one measured request |
| Forgotten Safeword 12B v4.0 IQ4_XS | 2048 | 21 completion tokens, approximately 2.1 seconds for one measured request |

These are individual smoke-test timings, not benchmarks or performance guarantees. Model-load time is excluded. Separate managed chats go through the actual Astral → SillyTavern → llama.cpp streaming path with 4096 context: Angelic Eclipse uses ChatML; Forgotten Safeword uses Mistral V3-Tekken. Each check requires a newly saved character reply and verifies cancellation. Forgotten's pinned GGUF template hash is `e7deee034838db2bfc7487788a3013d8a307ab69f72f3c54a85f06fd76007d4e`; the explicit preset handles this hash even though upstream's automatic template lookup does not recognize it.

## Distribution limits

Windows x64 is the supported packaged target. Installers are unsigned. No public upload or signing credentials are configured. Native CPU/CUDA artifacts and app-local Microsoft C++ runtime DLLs are included; model weights remain separate downloads. CPU-only inference and a truly fresh Windows VM have not been benchmarked or independently qualified. Other operating systems and arbitrary third-party SillyTavern extensions are outside this release's acceptance tests.
