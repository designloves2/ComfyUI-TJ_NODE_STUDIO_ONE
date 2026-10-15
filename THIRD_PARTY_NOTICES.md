# Third-party notices / 서드파티 고지

## License of this package / 이 패키지의 라이선스

From the release that adds the LTX 2.5 Director code, **TJ NODE STUDIO ONE is distributed under the GNU General Public License v3.0**
(see [LICENSE](LICENSE)). The parts written by designloves2 were MIT-licensed before this change
([LICENSE-MIT](LICENSE-MIT)) and remain available under those terms to anyone who takes **only that code**
(the `ltx25_studio_backend/director/` and `web/ltx25/director/` folders excluded). The package as a whole is conveyed under GPL-3.0.

LTX 2.5 Director 코드가 들어간 릴리즈부터 이 패키지 전체는 **GPL-3.0** 으로 배포됩니다. 그 이전에 designloves2가 작성한 코드의 MIT 조건은
[LICENSE-MIT](LICENSE-MIT) 에 보존되어 있습니다(단, `ltx25_studio_backend/director/`, `web/ltx25/director/` 는 GPL-3.0 전용).

## LTX 2.5 Director (copied code, GPL-3.0)

- Location: `ltx25_studio_backend/director/*.py`, `web/ltx25/director/*.js`
- Source: LTX-2.5-Director by **CGlide** — https://github.com/CGlide/LTX-2.5-Director (GPL-3.0), commit `17aa8bc` (2026-08-12)
- Which is a fork of **WhatDreamsCost's LTX Director** — https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI (GPL-3.0)
- LTX models by Lightricks — https://github.com/Lightricks
- Changes made here (each copied file carries a header): node keys `*CS25` -> `*TJ25`; HTTP routes `/ltx_director*` -> `/ltx25_one/director/*`;
  upload folder `cglide` -> `ltx25_one`; output folders `ltx_director_handoff` / `ltx_director_runs` -> `ltx25_one_handoff` / `ltx25_one_runs`;
  display names; the guide script reads `app` from `window.comfyAPI`. Unused files of the original (`ltx_keyframer.py`, `ltx_sequencer.py`,
  `load_audio_ui.*`, the example workflow) were not copied.
- Do not copy the Director-derived folders into any non-GPL project (the web project AI-ONE-STUDIO included).
