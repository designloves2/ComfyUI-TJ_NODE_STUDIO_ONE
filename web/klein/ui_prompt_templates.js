// ui_prompt_templates.js — built-in categorized + custom prompt templates
import { C, el, clear } from "./core_klein.js";
import { panel, label, button, row } from "./ui_common.js";
import { getConfig, saveConfig } from "./api_klein.js";

// ── Built-in templates keyed by mode ─────────────────────────────────────────
const BUILT_IN = {
  edit: {
    categories: [
      { cat: "ANGLES", items: [
        { label: "Close-up",    prompt: "Shift to a tight close-up on the subject. Crop the frame closely to focus on the main details while keeping the background sharp and visible. Ensure all colors, textures, and environmental elements from the original scene remain identical and perfectly clear, simply viewed from a much shorter camera distance." },
        { label: "Wide-angle",  prompt: "Switch to a wide-angle lens while keeping the subject at the center. Reveal more of the existing environment, ensuring the architecture, lighting, and background elements remain identical to the original scene." },
        { label: "Aerial view", prompt: "Transition to a high-altitude aerial view. Reinterpret the original environment's layout from above, keeping all landmarks, colors, and lighting consistent with the source image." },
        { label: "Low-angle",   prompt: "Move the camera to a low-angle ground position. Keep the environment identical but show more of the sky or ceiling, ensuring the subject and background maintain their established relationship and scale." },
      ]},
      { cat: "RELIGHT", items: [
        { label: "Soft Azure Drift",     prompt: "relight with gentle soft blue lighting emanating from the upper right corner" },
        { label: "Dramatic Slats",       prompt: "Relight the image with a strong directional light source from the bottom left, creating distinct shadows and casting linear shadows on the background" },
        { label: "Amber Sideglow",       prompt: "relight with noticeable warm amber daylight emanating from the right side" },
        { label: "Shadow Fade Mystery",  prompt: "add soft, warm lighting from the right side that gradually fades to shadows on the left, creating a dim, mysterious atmosphere with gentle gradients from light to dark" },
        { label: "High-Top Backlight",   prompt: "Relight the image with a strong backlight like lighting from the top" },
        { label: "Soft Foggy Bloom",     prompt: "Relight the scene with a soft, diffused foggy glow emanating from the top left side" },
        { label: "Dim Silver Moon",      prompt: "relight with dim silver moonlight coming from the top right" },
        { label: "Dappled Canopy",       prompt: "add dappled sunlight filtered through leaves from the top creating the shadows, source out of the scene" },
        { label: "Subtle Cool Bloom",    prompt: "relight with a subtle cool white glow from the right side, source off-camera" },
        { label: "Warm Hearth Flicker",  prompt: "relight with flickering warm orange light from the bottom center, source out of frame" },
        { label: "Sharp Cool Burst",     prompt: "add a sharp burst of cool white light from the upper left, source off-camera" },
        { label: "Golden Doorway Glow",  prompt: "add a warm yellow glow coming through a doorway from the side, source out of frame" },
        { label: "Faint Moon Hue",       prompt: "relight with a faint desaturated blue moonlight from the top left, source out of frame" },
        { label: "Neutral Studio Soft",  prompt: "relight with soft neutral white studio lighting from the top left, source out of frame" },
        { label: "Golden Rim Halo",      prompt: "add a strong golden hour backlight, creating a glowing outline, source off-camera" },
        { label: "Blue-Magenta Split",   prompt: "relight with a mix of cool blue and deep magenta light from opposite sides, source off-camera" },
        { label: "Low-Key Beam",         prompt: "add low-key dramatic lighting with a narrow beam of light from the side, source out of frame" },
        { label: "Harsh Top-Down Noir",  prompt: "relight with a harsh cool white top-down light, source off-camera, heavy shadows" },
        { label: "Dawn Flare",           prompt: "relight with a low-angle warm orange sunrise from the horizon, long soft shadows, hazy morning glow, source out of frame." },
        { label: "Amber Beams",          prompt: "relight with warm volumetric light beams from the top right, hazy atmosphere, source out of frame." },
        { label: "Teal-Orange Mix",      prompt: "relight with a teal ambient fill and a warm orange key light from the opposite side, classic cinematic color grade, source out of frame." },
        { label: "Deep Kicker",          prompt: "add a strong cool white kicker light from the back-left, grazing the edges of the subject, deep shadows in front, source out of frame." },
        { label: "Cross Light",          prompt: "relight with two opposing light sources from the left and right sides, high contrast, creating a bright central highlight, source out of frame." },
        { label: "Cold Fill",            prompt: "add a subtle desaturated cold blue fill light to the shadow areas, keeping the main light warm, professional color contrast, source out of frame." },
        { label: "Vignette Rim",         prompt: "add a sharp white rim light from the back-right, separating the subject from a dark background, source out of frame." },
        { label: "Velvet Shadow",        prompt: "relight with low-intensity soft light from the top, creating deep velvet-like shadows and subtle highlights on top surfaces, source out of frame." },
      ]},
      { cat: "STYLES", items: [
        { label: "35mm",         prompt: "Change style to a grainy 35mm film photograph, shot on Kodak Portra 400, vintage aesthetic, natural colors." },
        { label: "Polaroid",     prompt: "Change style to an authentic 1980s Polaroid photo, faded edges, soft focus, square format with white border." },
        { label: "NatGeo",       prompt: "Change style to a raw documentary photograph, high-detail texture, natural sunlight, National Geographic aesthetic." },
        { label: "3D Render",    prompt: "Change style to a clean 3D isometric render, soft clay-like textures, pastel color palette, Octane Render, studio lighting." },
        { label: "Oil Paint",    prompt: "Change style to a classical oil painting, thick impasto brushstrokes, rich canvas texture, dramatic chiaroscuro." },
        { label: "VHS",          prompt: "Change style to a 1990s VHS recording, tracking lines, chromatic aberration, low resolution, analog video glitch." },
        { label: "Portrait",     prompt: "Change style to a high-end studio portrait, dramatic Rembrandt lighting, deep shadows, sharp focus on eyes, 8k professional photography." },
        { label: "Sketch",       prompt: "Change style to a detailed graphite pencil sketch on textured paper, hand-drawn strokes, cross-hatching, artistic shading." },
        { label: "Digicam",      prompt: "Change style to a 2000s consumer digital camera photo, overexposed flash, slight motion blur, dated date stamp in right corner \"01-08-2002\", low dynamic range." },
        { label: "Impressionist",prompt: "Change style to impressionist painting, vibrant dappled light, short thick brushstrokes, focus on light's movement, Monet-inspired palette." },
        { label: "Double Exp",   prompt: "Change style to a double exposure photograph, blending the subject with a lush forest landscape, surreal overlays, ethereal atmosphere." },
        { label: "Gothic",       prompt: "Change style to a dark moody gothic aesthetic, desaturated colors, misty atmosphere, sharp contrast, cinematic shadows." },
        { label: "Ukiyo-e",      prompt: "Change style to traditional Japanese Ukiyo-e woodblock print, flat colors, bold outlines, decorative patterns, antique paper texture." },
        { label: "Charcoal",     prompt: "Change style to a rough charcoal drawing, smudged textures, heavy dark strokes, expressive hand-drawn feel on textured canvas." },
        { label: "Marble",       prompt: "Change style to a classical marble sculpture, smooth white stone texture, fine chiseled details, soft museum spotlighting." },
        { label: "Watercolor",   prompt: "Change style to a delicate watercolor painting, soft pigment bleeds, wet-on-wet technique, hand-painted on cold-press paper." },
        { label: "Daguerreotype",prompt: "Change style to an 1800s daguerreotype, antique silver plate texture, sepia tones, heavy scratches, blurred edges, historical look." },
        { label: "Embroidery",   prompt: "Change style to detailed needlepoint embroidery, textured silk threads, hand-stitched patterns, fabric canvas texture." },
        { label: "Claymation",   prompt: "Change style to a stop-motion claymation figure, handmade plasticine texture, thumbprint details, studio macro lighting." },
        { label: "Low Poly",     prompt: "Change style to a low-poly geometric art, sharp triangular facets, flat shading, minimalist 3D aesthetic." },
        { label: "Vector Art",   prompt: "Change style to clean flat vector illustration, geometric shapes, bold solid colors, minimalist digital art." },
        { label: "16-Bit Pixel", prompt: "Change style to 16-bit retro pixel art, limited color palette, clean sprites, nostalgic SNES aesthetic." },
        { label: "Fortnite 3D",  prompt: "Change style to Fortnite stylized 3D, vibrant colors, clean cartoonish textures, smooth lighting, battle royale aesthetic." },
      ]},
      { cat: "OTHER", items: [
        { label: "Enhance",         prompt: "Enhance the overall image quality by restoring fine details and sharpening the focus. Remove all types of blur, including motion and lens blur, while preserving the original features, textures, and likeness. Increase clarity and micro-contrast without introducing artifacts, ensuring a clean, high-definition result that stays true to the source." },
        { label: "Text edit",       prompt: "Replace the existing text \"[OLD TEXT]\" with the new text \"[NEW TEXT]\" in the image. Replicate the exact typography, font family, letter shapes, color palette, effects, and texturing of the original text perfectly. Maintain the exact same position, scale, and alignment within the scene." },
        { label: "Try-on",          prompt: "Using Image 1 as the subject reference and Image 2 as the outfit reference: Modify only the clothing of the person from Image 1, completely replacing it with the exact outfit, style, textures, materials, and colors shown in Image 2. Retain the exact face, identity, hair, expression, pose, and background from Image 1. Conform the new clothing from Image 2 realistically to the subject's body shape and the lighting environment of Image 1. Maintain the original camera framing.", dual: true },
        { label: "Texture transfer", prompt: "Using Image 1 as the subject and geometry reference, and Image 2 as the texture and material reference: Completely replace the surface material of the subject in Image 1 with the exact tactile texture, pattern, and material characteristics shown in Image 2. Conform the new texture perfectly to the 3D contours, shapes, curves, and lighting of Image 1. Maintain the original face, pose, anatomy, and background from Image 1 perfectly.", dual: true },
      ]},
    ],
  },
  i2i: {
    categories: [{ cat: "I2I", items: [] }],
  },
  inpaint: {
    categories: [
      { cat: "SKETCH",  items: [{ label: "Sketch to photo",     prompt: "Transform this sketch into a hyper-realistic photographic scene. Interpret the lines as real-world objects with high-quality textures, cinematic lighting, and natural shadows. Maintain the original composition while adding depth, realistic materials, and 8k resolution details." }] },
      { cat: "COLLAGE", items: [{ label: "Collage to scene",    prompt: "Transform this image collage into a cohesive, fully realized and unified scene. Seamlessly blend all the disparate elements into a singular, logical style, strictly maintaining the exact spatial arrangement and relative composition of the original collage while logically generating the missing environment, shadows, and context to naturally connect all objects. Scene Description: [Specify the overall art style or level of realism, the new specific lighting conditions, background environment setting, and overall mood here]" }] },
      { cat: "INPAINT", items: [{ label: "Edit masked area",    prompt: "Edit the masked area: [DESCRIBE THE CHANGE — add, remove, replace, or modify the content]. Seamlessly blend with the surrounding scene, preserving the original lighting, shadows, depth of field, and photo grain." }] },
      { cat: "OUTPAINT",items: [{ label: "Extend composition",  prompt: "Extend the composition of this image. Replace all black or empty spaces with a logical continuation of the background and foreground. Ensure the transition is invisible and the new elements perfectly match the perspective and color palette of the original image. Scene description: [briefly describe what should appear in the expanded areas]" }] },
    ],
  },
  faceswap: {
    categories: [
      { cat: "FACE SWAP (make sure you have a Faceswap LoRA selected in Settings)", items: [
        { label: "Head swap", prompt: "Replace the head in image 1 with the head from image 2, adapting the facial features to match the artistic style, focus, and environmental lighting of the image 1." },
      ]},
    ],
  },
};

// ── Template button shown in mode panels ──────────────────────────────────────
export function createTemplateBtn(onSelect) {
  return button("📋 Templates", () => onSelect(), "default");
}

// ── Full template overlay ─────────────────────────────────────────────────────
export function createTemplateOverlay(state, ctx, onApply) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9996",
    background: "rgba(11,11,11,0.97)", borderRadius: "inherit",
    display: "none", flexDirection: "column",
    padding: "12px", gap: "8px", boxSizing: "border-box", overflowY: "auto",
  }});

  // ── Header ────────────────────────────────────────────────────────────────
  const topRow = el("div", { style: { display: "flex", alignItems: "center", gap: "8px", flexShrink: "0" } });
  topRow.appendChild(el("div", { text: "📋 Prompt Templates", style: { color: "#fff", fontSize: "14px", fontWeight: "700", flex: "1" } }));
  const closeBtn = button("✕", () => { ov.style.display = "none"; }, "danger");
  topRow.appendChild(closeBtn);
  ov.appendChild(topRow);

  // ── Built-in section ──────────────────────────────────────────────────────
  const builtInEl = el("div", { style: { display: "flex", flexDirection: "column", gap: "10px" } });
  ov.appendChild(builtInEl);

  function renderBuiltIn() {
    clear(builtInEl);
    const mode = state.mode || "t2i";
    const data  = BUILT_IN[mode];
    if (!data || !data.categories.length) return;

    data.categories.forEach(cat => {
      if (!cat.items.length) return;

      const catLabel = el("div", { text: cat.cat, style: {
        color: C.muted, fontSize: "10px", fontWeight: "700", letterSpacing: "0.08em",
        textTransform: "uppercase", marginTop: "4px",
      }});
      builtInEl.appendChild(catLabel);

      const grid = el("div", { style: {
        display: "flex", flexWrap: "wrap", gap: "5px",
      }});
      cat.items.forEach(item => {
        const btn = el("button", { type: "button", text: item.label, style: {
          cursor: "pointer", fontFamily: "inherit", fontSize: "11px",
          padding: "4px 10px", borderRadius: "14px",
          background: C.bg2, color: C.text, border: `1px solid ${C.border}`,
          whiteSpace: "nowrap",
        }});
        btn.onmouseenter = () => { btn.style.background = C.bg3; btn.style.borderColor = C.lime; btn.style.color = "#ffffff"; };
        btn.onmouseleave = () => { btn.style.background = C.bg2; btn.style.borderColor = C.border; btn.style.color = C.text; };
        btn.onclick = () => { onApply(item.prompt); ov.style.display = "none"; };
        grid.appendChild(btn);
      });
      builtInEl.appendChild(grid);
    });
  }

  // ── Divider ───────────────────────────────────────────────────────────────
  const divider = el("div", { style: { borderTop: `1px solid ${C.border}`, margin: "4px 0" } });
  ov.appendChild(divider);

  // ── Custom templates section ──────────────────────────────────────────────
  const customHeader = el("div", { style: { display: "flex", alignItems: "center", gap: "8px" } });
  customHeader.appendChild(el("div", { text: "MY TEMPLATES", style: { color: C.muted, fontSize: "10px", fontWeight: "700", letterSpacing: "0.08em", flex: "1" } }));
  const addBtn = button("+ New", () => startEdit(null));
  customHeader.appendChild(addBtn);
  ov.appendChild(customHeader);

  let customTemplates = [];
  const listEl = el("div", { style: { display: "flex", flexDirection: "column", gap: "5px" } });
  ov.appendChild(listEl);

  function renderCustom() {
    clear(listEl);
    if (!customTemplates.length) {
      listEl.appendChild(el("div", { text: "No custom templates yet. Click + New to add one.", style: { color: C.muted, fontSize: "11px", padding: "8px 0" } }));
      return;
    }
    customTemplates.forEach((t, i) => {
      const card = el("div", { style: {
        background: C.bg2, border: `1px solid ${C.border}`, borderRadius: "8px",
        padding: "7px 10px", display: "flex", alignItems: "flex-start", gap: "8px",
      }});
      const info = el("div", { style: { flex: "1", minWidth: "0" } });
      info.appendChild(el("div", { text: t.name, style: { color: C.text, fontSize: "12px", fontWeight: "600", marginBottom: "2px" } }));
      info.appendChild(el("div", { text: t.prompt.slice(0, 100) + (t.prompt.length > 100 ? "…" : ""), style: { color: C.muted, fontSize: "11px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }));
      const applyBtn = button("Apply", () => { onApply(t.prompt); ov.style.display = "none"; }, "primary");
      const editBtn  = button("Edit", () => startEdit(i));
      const delBtn   = button("✕", () => {
        if (!confirm(`Delete "${t.name}"?`)) return;
        customTemplates.splice(i, 1); saveCustom(); renderCustom();
      }, "danger");
      card.appendChild(info); card.appendChild(applyBtn); card.appendChild(editBtn); card.appendChild(delBtn);
      listEl.appendChild(card);
    });
  }

  // ── Edit form ─────────────────────────────────────────────────────────────
  const editForm = el("div", { style: { display: "none", flexDirection: "column", gap: "6px", padding: "10px", background: C.bg1, borderRadius: "8px", border: `1px solid ${C.border}` } });
  const nameIn   = el("input", { type: "text", placeholder: "Template name…", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "6px", fontSize: "12px", fontFamily: "inherit",
  }});
  const promptTA = el("textarea", { placeholder: "Prompt text…", style: {
    width: "100%", boxSizing: "border-box", background: C.bg2, color: C.text,
    border: `1px solid ${C.border}`, borderRadius: "6px", padding: "7px",
    fontSize: "12px", fontFamily: "inherit", resize: "vertical", minHeight: "70px", outline: "none",
  }});
  editForm.appendChild(label("Name")); editForm.appendChild(nameIn);
  editForm.appendChild(label("Prompt")); editForm.appendChild(promptTA);

  let editIdx = null;
  const saveEditBtn   = button("💾 Save", () => {
    const n = nameIn.value.trim(); const p = promptTA.value.trim();
    if (!n || !p) { alert("Please fill in both name and prompt."); return; }
    if (editIdx === null) customTemplates.push({ name: n, prompt: p });
    else customTemplates[editIdx] = { name: n, prompt: p };
    saveCustom(); editForm.style.display = "none"; renderCustom();
  }, "primary");
  const cancelEditBtn = button("Cancel", () => { editForm.style.display = "none"; });
  editForm.appendChild(row([saveEditBtn, cancelEditBtn]));
  ov.appendChild(editForm);

  function startEdit(idx) {
    editIdx = idx;
    nameIn.value   = idx !== null ? customTemplates[idx].name   : "";
    promptTA.value = idx !== null ? customTemplates[idx].prompt : "";
    editForm.style.display = "flex";
  }

  function saveCustom() {
    saveConfig({ t2i_templates: customTemplates }).catch(() => {});
  }

  let loaded = false;
  return {
    el: ov,
    show() {
      ov.style.display = "flex";
      renderBuiltIn();
      if (!loaded) {
        loaded = true;
        getConfig().then(cfg => {
          customTemplates = Array.isArray(cfg.t2i_templates) ? cfg.t2i_templates : [];
          renderCustom();
        }).catch(() => renderCustom());
      }
    },
    hide() { ov.style.display = "none"; },
  };
}
