# Third-party notices

Astral.AI is a modified distribution of [SillyTavern](https://github.com/SillyTavern/SillyTavern), copyright its contributors, under **GNU AGPL-3.0**. The full license is at the repository root. Upstream release 1.19.0 is pinned at `06bde939fb1e9c4c8d8641d810f0a916b5bce127`. Astral additions remain under the same license.

| Component | License / attribution |
| --- | --- |
| llama.cpp b11669 | MIT; Georgi Gerganov and contributors; pinned native artifacts in `runner.lock.json` |
| Vulkan runner | llama.cpp MIT; bundled Vulkan/driver dependency notices apply |
| NVIDIA CUDA runtime / cuBLAS redistributables | NVIDIA redistributable terms; notices shipped with native archives apply |
| Microsoft Visual C++ runtime libraries | Microsoft runtime redistributable terms; app-local x64 DLLs and vendor license included |
| Electron | MIT; Electron contributors; bundled Chromium notices accompany the runtime |
| React, React DOM | MIT; Meta Platforms, Inc. and affiliates |
| React Three Fiber, Three.js | MIT; respective contributors |
| ShaderGradient | MIT; ruucm / stone-skipper and contributors |
| Paper Shaders / shaders-react | MIT; Paper Design, Inc. and contributors |
| Liquid Glass JS | MIT; copyright 2025 Armagan Amcalar; source pinned at `78cb6ccb0b9987bb60a88b14ccbd13a9e6e8ab2a` |
| Lucide icons | ISC; Lucide contributors |
| Outfit / DM Sans | SIL Open Font License 1.1; bundled font package notices apply |
| Taste skill / UI UX Pro Max | MIT; Leonxlnx / nextlevelbuilder and contributors; authoring guidance, not app runtime |

Liquid Glass's vendored container has an ESM export and a small lifecycle cleanup addition. Its original license is retained in `ui/vendor/LIQUID-GLASS-LICENSE.txt`. Its refraction samples shipped scene art instead of capturing private conversation contents.

The liquid-logo example was used as an approach reference; its hosted Next.js app, analytics, and uploads are not copied. The app uses the independently installed Paper shader package. Awesome Claude Design was used for design references, not copied brand assets.

Recommended model repositories report Apache-2.0 metadata; weights are **optional separate downloads**, not included in the application. Source model documentation and model hashes are recorded in `models.lock.json`. Imported models retain their own licenses.

Original character scenes were generated using the built-in image-generation tool for this project. See `ARTWORK.md`. They do not depict existing franchise characters or real people.

The original SillyTavern dependency licenses continue to apply. The generated `licenses/DEPENDENCY-LICENSES.txt` includes installed dependency notices, including renderer dependencies compiled into the application. Keep all bundled Electron, llama.cpp, CUDA, font, and npm license files with redistributed builds.

Pinned @jsquash Emscripten factory files receive a small, idempotent Node file-fetch compatibility patch during npm ci and packaging. scripts/patch-codecs.mjs records the exact transformation. Original package copyright and license notices are retained.

## 0.3 distribution

ItsDT — Creator & product direction. The eight original character portraits and sparse scenes have provenance in ARTWORK.md. CPU llama.cpp support is bundled; CUDA/Vulkan archives are optional pinned downloads, with upstream notices retained in their installed folders. Electron 44.9.3 and current compatible dependency patches are recorded in package-lock.json. Optional upstream transformers and webpack tooling are development dependencies, not desktop runtime dependencies.

0.3.1 Credits explicitly identifies AI-generated character portraits/backgrounds and AI-assisted UI elements. Artwork revisions and provenance are recorded in ARTWORK.md.

The Microsoft runtime license is included as its original, unmodified DOCX document from https://visualstudio.microsoft.com/wp-content/uploads/2021/09/Visual-C-Runtime-2015-2022-License-1.docx (SHA-256 f1e3d56ceb2ad68aae0711b910375009e651ac5530fa0760f0dea6e81e54fae1). The small HTML file links to that document instead of bundling the vendor website and its analytics scripts.
