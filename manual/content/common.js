MANUAL.add({
 "id": "common",
 "title": {
  "ko": "공통 기능",
  "en": "Common features"
 },
 "lead": {
  "ko": "여러 노드가 같이 쓰는 기능입니다.",
  "en": "Features shared by several nodes."
 },
 "sections": [
  {
   "h": {
    "ko": "설정 창 (⚙)",
    "en": "Settings window (⚙)"
   },
   "body": {
    "ko": "노드 오른쪽 위의 ⚙를 누르면 그 노드의 설정 창이 열립니다. 노드마다 탭 구성은 조금 다르지만 공통으로 **Model**(또는 노드 전용 모델 탭), **LLM**, **Translation**, **Node Skin** 탭이 있습니다. 위쪽 **Save All**로 저장하고 ✕로 닫습니다(Esc도 됩니다).\n• **모델 칸** — 각 칸 위의 검색창으로 파일을 찾고, **↻ Refresh Models**로 ComfyUI를 다시 켜지 않고 모델 폴더를 다시 읽습니다.\n• **언어** — 한국어 / English. 바꾸면 페이지를 새로고침합니다.\n• **Negative Prompt** — 모든 모드에 적용됩니다. **Prompt Suffix** — 프롬프트 뒤에 자동으로 붙습니다.\n• **Save Folder** — `ComfyUI/output/` 안의 저장 폴더 이름.\n• **모델 오버라이드 슬롯** — 켜면 Primitive(String) 노드로 모델 파일명을 연결해 설정 칸보다 우선 적용합니다(.gguf는 자동으로 GGUF 로더 사용).\n• **SeedVR2 업스케일 모델** — 이미지 노드의 UPSCALE 모드가 공통으로 씁니다(`models/SEEDVR2/`의 DiT + VAE 모델).",
    "en": "Press ⚙ at the top right of a node to open its settings window. The tabs differ a little per node, but all have **Model** (or a node-specific model tab), **LLM**, **Translation** and **Node Skin**. Use **Save All** at the top to save and ✕ to close (Esc works too).\n• **Model fields** — a search box above each field finds files; **↻ Refresh Models** rescans the model folders without restarting ComfyUI.\n• **Language** — 한국어 / English. Changing it reloads the page.\n• **Negative Prompt** — applies to every mode. **Prompt Suffix** — appended to the prompt automatically.\n• **Save Folder** — the folder name inside `ComfyUI/output/`.\n• **Model override slots** — when on, a Primitive(String) node can supply the model file name, which wins over the settings field (.gguf files use the GGUF loader automatically).\n• **SeedVR2 upscale model** — shared by the UPSCALE mode of the image nodes (a DiT + VAE model pair in `models/SEEDVR2/`)."
   }
  },
  {
   "h": {
    "ko": "LoRA",
    "en": "LoRA"
   },
   "body": {
    "ko": "• 이미지 노드는 LoRA를 최대 3개까지 체인으로 쓸 수 있습니다(Faceswap 모드는 1개, SDXL은 5개).\n• LoRA의 `.safetensors` 헤더에서 트리거 워드를 자동으로 읽어 보여 줍니다. LoRA를 바꾸면 이전 트리거 워드는 지워지고 새 LoRA의 것이 불러와집니다.\n• ON/OFF 토글로 LoRA마다 켜고 끕니다.\n• Strength는 0~2까지 조절하며, 0도 정상 값으로 저장됩니다.",
    "en": "• The image nodes chain up to three LoRAs (one in Faceswap mode, five in SDXL).\n• Trigger words are read automatically from the LoRA's `.safetensors` header and shown. When you change the LoRA the old trigger words are cleared and the new LoRA's are loaded.\n• An ON/OFF toggle enables each LoRA individually.\n• Strength runs from 0 to 2, and 0 is stored as a real value."
   }
  },
  {
   "h": {
    "ko": "프롬프트와 번역",
    "en": "Prompts and translation"
   },
   "body": {
    "ko": "• 프롬프트 칸의 **EN / 한** 버튼으로 영어(모델에 가는 원문)와 한국어 보기를 오갑니다. 한국어만 고친 칸은 **Generate 직전에 자동으로 영어로 번역**됩니다.\n• 번역에 쓸 모델은 ⚙ Settings의 **Translation** 탭에서 한 번만 정하며 모든 노드가 같이 씁니다.\n• 노드별로 \"한글 번역 사용\"을 끄면 *자동* 번역만 꺼지고 EN/한 버튼은 남습니다.\n• OpenRouter 모델이 비어 있으면 임의의 모델을 쓰지 않고 \"모델을 선택하세요\" 안내를 띄우며 요청을 보내지 않습니다.\n• **Refine**, **Auto Enhance**, **Prompt Edit**, **Prompt Preset**은 프롬프트 줄의 버튼입니다. LLM은 ⚙ Settings의 LLM 탭에서 고릅니다.",
    "en": "• The **EN / 한** button of a prompt box switches between the English text (what goes to the model) and the Korean view. A box where you edited only the Korean is **translated to English automatically right before Generate**.\n• The translation model is chosen once in the **Translation** tab of ⚙ Settings and shared by every node.\n• Turning off \"Korean translation\" for a node switches off only the *automatic* translation; the EN / 한 button stays.\n• If the OpenRouter model is empty, no model is picked for you: a \"choose a model\" notice appears and no request is sent.\n• **Refine**, **Auto Enhance**, **Prompt Edit** and **Prompt Preset** are buttons in the prompt row. The LLM is chosen in the LLM tab of ⚙ Settings."
   }
  },
  {
   "h": {
    "ko": "갤러리 (🖼)",
    "en": "Gallery (🖼)"
   },
   "body": {
    "ko": "• 저장된 결과를 타일로 보여 줍니다(무한 스크롤, 정사각형 격자).\n• 카드마다 ★ 즐겨찾기, 삭제, 폴더 열기, **Send to**(이미지를 다른 모드로 보내기)를 쓸 수 있습니다.\n• Esc로 닫습니다.\n• 영상 노드(H3, LTX)의 갤러리에는 합치기(🔗 Stitch), 업스케일, 보간, 디블러 같은 후처리와 전체 화면 플레이어가 더 있습니다.",
    "en": "• Shows saved results as tiles (infinite scroll, square grid).\n• Each card has ★ favourite, delete, open folder and **Send to** (hand the image to another mode).\n• Esc closes it.\n• The galleries of the video nodes (H3, LTX) add post-processing such as 🔗 Stitch, upscale, interpolate and deblur, plus a full-screen player."
   }
  },
  {
   "h": {
    "ko": "비교 슬라이더 (⇌)",
    "en": "Compare slider (⇌)"
   },
   "body": {
    "ko": "켜면 생성 전 원본과 생성 결과를 슬라이더를 끌어 나란히 비교합니다. SDXL에서는 Inpaint / Outpaint에서 쓰입니다(Outpaint는 패딩된 원본, Inpaint는 마스크가 적용된 결과와 비교).",
    "en": "When on, drag the slider to compare the source and the generated result side by side. In SDXL it is used in Inpaint / Outpaint (padded original for Outpaint, the masked result for Inpaint)."
   }
  },
  {
   "h": {
    "ko": "단축키",
    "en": "Keyboard shortcuts"
   },
   "body": {
    "ko": "| 키 | 동작 |\n|---|---|\n| `Esc` | 열린 팝업 / 갤러리 / 오버레이 닫기 |\n\n영상 갤러리의 전체 화면 플레이어에서는 스페이스 = 재생, ← → = 이동, `[` `]` = 이전/다음, Esc = 닫기입니다.",
    "en": "| Key | Action |\n|---|---|\n| `Esc` | close open popups, galleries or overlays |\n\nIn the video gallery's full-screen player: Space = play, ← → = seek, `[` `]` = previous / next, Esc = close."
   }
  },
  {
   "h": {
    "ko": "Node Skin — 노드 색 바꾸기",
    "en": "Node Skin — change a node's colors"
   },
   "body": {
    "ko": "각 노드의 ⚙ 설정 창에 있는 **Node Skin** 탭(ITDA는 ☰ Menu → App Settings의 🎨 버튼, 노드를 우클릭한 메뉴의 \"🎨 ONE STUDIO Node Skin…\"도 같은 창을 엽니다)에서 노드의 색을 바꿉니다. 색은 **노드 종류별로** 저장되어, 한 노드를 바꿔도 다른 노드는 그대로입니다.\n• **세 가지 기본 색** — Title Color(제목 줄), Node Color(노드 바탕), HighLight Color(보라색 포인트). 색 상자를 누르면 스펙트럼 팝업이 열리고 HEX / RGB 입력, 스포이트, 이전/현재 비교, 저장해 둔 색을 쓸 수 있습니다.\n• **세부 조정** — 실제 노드의 프레임·제목 글자·제목 점, 글자색 7종, 패널·입력칸·올림 면·테두리, 성공/경고/오류 색을 하나씩 정합니다. 정하지 않은 부분은 기본 세 색을 따라가고, ↺ 버튼으로 되돌립니다.\n• **스킨** — 색 묶음에 이름을 붙여 저장하면 **모든 노드가 같은 목록을 공유**합니다. 한 노드에서 만든 스킨을 다른 노드에서 Use로 불러오거나 All nodes로 전부에 적용할 수 있습니다.\n• **Apply**를 누르면 새로고침 없이 그 종류의 모든 노드에 바로 적용됩니다. 색은 브라우저와 서버(`config_theme.json`)에 저장되어 다른 브라우저에서도 같은 모습입니다.\n• 기본 색일 때는 아무것도 바꾸지 않습니다. 마스크 편집기처럼 따로 그려지는 일부 화면은 스킨 대상이 아닙니다.",
    "en": "Change a node's colors in the **Node Skin** tab of its ⚙ settings window (for ITDA: the 🎨 button in ☰ Menu → App Settings; the node's right-click menu entry \"🎨 ONE STUDIO Node Skin…\" opens the same window). Colors are stored **per node kind**, so changing one node leaves the others alone.\n• **Three main colors** — Title Color (title bar), Node Color (node background), HighLight Color (the purple accent). A color box opens a spectrum popup with HEX / RGB entry, an eyedropper, a before / now comparison and your saved colors.\n• **Fine tuning** — set the real node's frame, title text and title dot, seven text colors, panels, text fields, raised surfaces, borders and the success / warning / error colors one by one. A part you leave alone follows the three main colors; the ↺ button gives it back.\n• **Skins** — save a set of colors under a name and **every node shares the same list**. A skin made on one node can be loaded on another with Use, or put on all nodes at once with All nodes.\n• **Apply** puts the colors on every node of that kind at once, with no reload. Colors are kept in the browser and on the server (`config_theme.json`), so another browser shows the same look.\n• With the default colors nothing is changed. A few screens that draw themselves, such as the mask editor, are not skinned."
   }
  }
 ]
});
