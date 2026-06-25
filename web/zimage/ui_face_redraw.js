// ui_face_redraw.js — FACE REDRAW (uses FaceDetailer from Impact Pack)
import { C, el, clear } from "./core.js";
import { panel, label, button, select, slider, numberField, row, col } from "./ui_common.js";
import { getModels, uploadImage } from "./api.js";
import { buildFaceRedrawGraph } from "./graph_builder.js";
import { mountLoraSection } from "./ui_lora_section.js";
import { createImageUpload } from "./ui_image_upload.js";

export function mountFaceRedrawLeft(leftEl, state, ctx) {
  const wrap = el("div",{style:{display:"flex",flexDirection:"column",gap:"6px"}});
  leftEl.appendChild(wrap);

  const detectWrap=el("div");
  function renderPicker(data) {
    clear(detectWrap);
    const dets=(data?.face_detectors?.length?data.face_detectors:["none"]);
    if(!state.faceDetectorModel||!dets.includes(state.faceDetectorModel)) state.faceDetectorModel=dets[0];
    detectWrap.appendChild(panel([
      label("Face Detector (ultralytics/bbox)"),
      select(dets,state.faceDetectorModel,v=>{state.faceDetectorModel=v;ctx.persist();}),
    ]));
  }
  renderPicker({}); getModels().then(renderPicker).catch(()=>{});
  wrap.appendChild(detectWrap);

  const up=createImageUpload({
    label:"Source Portrait",
    initialFilename:state.faceImage,
    onUpload:async f=>{const n=await uploadImage(f); state.faceImage=n; ctx.persist(); return n;},
  });
  wrap.appendChild(panel([label("Source Portrait"),up.el]));

  wrap.appendChild(panel([
    label("Detection Settings"),
    label("Threshold"),
    slider(0.1,0.99,0.01,state.faceThreshold??0.5,v=>{state.faceThreshold=v;ctx.persist();},v=>v.toFixed(2)),
    label("Dilation px"),
    numberField(state.faceDilation??4,v=>{state.faceDilation=v;ctx.persist();},1),
  ]));

  wrap.appendChild(panel([
    label("Regeneration Settings"),
    label("Denoise"),
    slider(0.1,1,0.01,state.faceDenoise??0.5,v=>{state.faceDenoise=v;ctx.persist();},v=>v.toFixed(2)),
    label("Feather px"),
    slider(0,64,1,state.faceFeather??5,v=>{state.faceFeather=v;ctx.persist();},v=>String(v)),
  ]));

  mountLoraSection(wrap,state,ctx);

  return {
    beforeGenerate:async()=>{
      if(!state.faceImage)  throw new Error("Upload a portrait image.");
      if(!state.faceDetectorModel||state.faceDetectorModel==="none") throw new Error("Select a face detector model.");
    },
    getGraph(){return buildFaceRedrawGraph(state);},
    getSourceURL(){return state.faceImage?`/view?filename=${encodeURIComponent(state.faceImage)}&type=input`:null;},
  };
}
