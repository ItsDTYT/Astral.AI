# Desktop security review — 0.3.0

Reviewed 25 October 2026. This is a local code and dependency review, not an independent penetration test.

The packaged service binds to loopback and requires an unpredictable per-launch desktop token before serving any route or asset. Electron supplies it only on requests from its owning webContents to the exact app origin. Origin/Host checks and upstream CSRF protection remain active. The token is absent from renderer JavaScript, URLs, diagnostics and model requests. IPC requires the owning main frame. Renderer sandboxing, context isolation, denied permissions, blocked popups/navigation/webviews, and HTTPS-only external links remain enabled. Production fuses disable RunAsNode, NODE_OPTIONS and Node inspection, enforce ASAR-only loading and embedded archive integrity. DevTools are disabled in packaged windows.

Managed llama.cpp runners also receive a separate ephemeral API key through their environment. Only backend requests to the exact managed origin receive it, redirects are rejected, and CORS is restricted to the app origin. The key is never returned to the renderer or sent to external model servers.

Default desktop console logging suppresses request bodies, prompts, profile fields, credentials and images. Runner diagnostics contain native loading information; user-directed exports and backups intentionally contain chat/profile data.

## CSP compatibility

Only local scripts are allowed; inline scripts, frames and plugins are blocked. The former document-height inline bootstrap is an external bundled script. 104 bundled Handlebars templates are precompiled at build time. Local user-authored SillyTavern prompt/story templates still use Handlebars compilation, requiring `unsafe-eval`; local tokenizer/image codecs require WASM execution. `wasm-unsafe-eval` documents that allowance. Inline styles are required by React, upstream widgets and dynamic layout. These are explicit compatibility allowances, not a claim of a strict no-eval policy. Remote script execution stays blocked. Optional third-party extensions and server plugins are disabled in desktop mode.

## Downloads and restoration

Public-card imports permit HTTPS, reject private/reserved addresses and credentials, pin validated DNS resolution for each connection, revalidate every redirect, and cap redirects, elapsed time, compressed/decompressed response sizes and gzip output. Unsupported sites retain a file-import fallback. GPU downloads have pinned size/hash checks, bounded extraction, Windows-safe names, duplicate-name/link rejection and atomic installation. They require an explicit action; CPU is included.

Backups reject traversal, reserved Windows names, alternate data streams, case-insensitive collisions and symlinks/junctions. Restores validate metadata and asset hashes in staging, then replace files transactionally. Prior files are copied back on failure; recovery data is retained if rollback also fails. Uploads have byte/pixel limits before image decoding. No passwords or cloud accounts are introduced.

## Dependency advisories

Compatible updates include Handlebars, DOMPurify, Express/body-parser, multer, image-size, compression, proxy-addr, ws and their transitive patches. simple-git was migrated to its patched 4.0.2 named API; Electron is 44.9.3. Overrides pin patched lodash-es 4.18.1 and basic-ftp 6.2.3. webpack and unused local transformer/ONNX tooling are development dependencies; transformers are loaded lazily and unavailable in desktop mode. This removes the vulnerable protobuf parser from production.

The production npm audit still reports 32 dependency entries: **0 critical, 29 high, 3 moderate**. Most entries are propagated findings from one underlying Zod advisory, not 29 distinct issues. The retained high finding is Zod 3 via Jimp (oversized constrained collections). Forcing Zod 4 would break Jimp's API. Astral never accepts raw Zod option collections from requests: it builds fixed image options internally, caps upload bytes and dimensions, and normalizes images. Optional upstream vector/classifier/caption/speech routes and third-party code execution are blocked. Residual risk remains in the image dependency chain; keep monitoring its compatible patch.

Moderate findings are Showdown and uuid via the optional upstream vector dependency. Showdown output used by upstream is sanitized by patched DOMPurify; Astral chat rendering uses React text. Vector routes are unavailable in desktop mode and UUID values are not authentication secrets. These are mitigations, not patched-version claims. Re-run `npm audit --omit=dev` when dependencies change. Full development audit may include optional upstream tooling absent from the installer.

References: [Electron security](https://www.electronjs.org/docs/latest/tutorial/security/), [ASAR behavior](https://www.electronjs.org/docs/latest/tutorial/asar-archives), [simple-git advisory](https://github.com/advisories/GHSA-x6jw-m9v5-85vh). Local administrators or software already running as the same Windows user can read/modify local data; this application does not provide disk encryption.

## 0.3.1 continuation — 26 October 2026

This update changes theme rendering, starter artwork, Credits and documentation. No dependencies, access policy, CSP allowances, or external services were added. The 0.3.0 review and its documented remaining dependency findings still apply. Glass navigation now generates its texture solely from palette colors, without using character artwork or private content.

The owning webContents is retained for request-header authorization, with an isDestroyed guard. Late requests after window destruction receive no desktop token. IPC and repeat-launch paths also check window lifetime; the desktop lifecycle test exercises a real session request after destruction.

## 0.3.2 publication review — 27 October 2026

The production audit still reports 32 advisory entries (0 critical, 29 high and 3 moderate), including propagated dependency findings. The documented mitigations above remain applicable; this release adds no dependencies. The staged-source scan uses Gitleaks 8.30.1. One reviewed false positive is the upstream tokenizer expression `ocab=new Array(this.tokens_`, recorded narrowly in .gitleaksignore. Microsoft website telemetry identifiers are no longer bundled with the runtime-license notice; the original Microsoft license DOCX is included unchanged and its source and SHA-256 are recorded in the notices. Installed tools, caches, model files, credentials, logs and personal data are excluded from Git.
