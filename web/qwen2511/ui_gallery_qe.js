// ui_gallery_qe.js — Gallery overlay for Qwen Image Edit 2511 ONE (TJ)
import { C, el, clear, BRAND } from "./core_qwen2511.js";
import { button } from "./ui_common_qe.js";
import { getGallery } from "./api_qwen2511.js";

export function createGalleryOverlay(state, ctx) {
  const ov = el("div", { style: {
    position: "absolute", inset: "0", zIndex: "9998",
    background: "rgba(11,11,11,0.97)", borderRadius: "inherit",
    display: "none", flexDirection: "column", padding: "12px", gap: "8px",
    boxSizing: "border-box",
  }});

  const topRow = el("div", { style: { display:"flex", alignItems:"center", gap:"8px", flexShrink:"0" }});
  topRow.appendChild(el("div", { text:"🖼 Gallery — Qwen Image Edit 2511 ONE", style:{ color:"#fff", fontSize:"14px", fontWeight:"700", flex:"1" }}));

  const favToggle  = el("button",{type:"button",text:"☆ Favs",style:{cursor:"pointer",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"4px 10px",fontSize:"12px",fontFamily:"inherit"}});
  const refreshBtn = el("button",{type:"button",text:"↻",style:{cursor:"pointer",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"4px 8px",fontSize:"13px",fontFamily:"inherit"}});
  const closeBtn   = el("button",{type:"button",text:"✕",style:{cursor:"pointer",background:"transparent",color:C.err,border:"none",fontSize:"18px",padding:"0 4px",fontFamily:"inherit"},onclick:()=>ov.style.display="none"});
  topRow.append(refreshBtn, favToggle, closeBtn);
  ov.appendChild(topRow);

  const grid    = el("div",{style:{flex:"1",overflowY:"auto",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:"6px",padding:"4px"}});
  const footer  = el("div",{style:{flexShrink:"0",display:"flex",alignItems:"center",gap:"8px",paddingTop:"4px"}});
  const countEl = el("span",{style:{fontSize:"11px",color:C.muted,flex:"1"}});
  const loadMoreBtn = el("button",{type:"button",text:"Load more",style:{cursor:"pointer",background:C.bg2,color:C.text,border:`1px solid ${C.border}`,borderRadius:"6px",padding:"4px 12px",fontSize:"12px",fontFamily:"inherit",display:"none"}});
  footer.append(countEl, loadMoreBtn);
  ov.appendChild(grid); ov.appendChild(footer);

  let offset=0, total=0, showFavs=false;

  async function load(reset=false) {
    if (reset) { clear(grid); offset=0; total=0; }
    try {
      const data = await getGallery({ offset, limit: 40, favonly: showFavs });
      total = data.total || total;
      if (!data.images?.length && offset===0) {
        grid.appendChild(el("div",{text:"No images yet.",style:{color:C.muted,padding:"20px",gridColumn:"1/-1",textAlign:"center"}}));
        loadMoreBtn.style.display="none"; return;
      }
      data.images.forEach(img => {
        const url = `/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder||"")}&type=output`;
        const cell = el("div",{style:{position:"relative",cursor:"pointer",borderRadius:"6px",overflow:"hidden",background:C.bg2}});
        const im   = el("img",{src:url,title:img.filename,style:{width:"100%",aspectRatio:"1",objectFit:"cover",display:"block",transition:"transform .15s"}});
        const del  = el("button",{type:"button",text:"✕",style:{position:"absolute",top:"3px",left:"3px",background:"rgba(0,0,0,.7)",color:"#fff",border:"none",borderRadius:"3px",width:"18px",height:"18px",cursor:"pointer",fontSize:"10px",padding:"0",display:"none"}});
        const fav  = el("button",{type:"button",text:img.is_fav?"★":"☆",style:{position:"absolute",top:"3px",right:"3px",background:"rgba(0,0,0,.7)",color:img.is_fav?"#fbbf24":"#fff",border:"none",borderRadius:"3px",width:"18px",height:"18px",cursor:"pointer",fontSize:"12px",padding:"0",display:"none"}});
        cell.addEventListener("mouseenter",()=>{im.style.transform="scale(1.04)";del.style.display="block";fav.style.display="block";});
        cell.addEventListener("mouseleave",()=>{im.style.transform="scale(1)";del.style.display="none";fav.style.display="none";});
        im.addEventListener("click", () => { if (ctx.onGalleryPick) ctx.onGalleryPick(img); ov.style.display="none"; });
        cell.append(im, del, fav);
        grid.appendChild(cell);
      });
      offset += data.images.length;
      countEl.textContent = `${offset} / ${total||offset}`;
      loadMoreBtn.style.display = (offset < (total||offset)) ? "block" : "none";
    } catch(e) {
      grid.appendChild(el("div",{text:"Load error: "+e.message,style:{color:C.err,padding:"20px",gridColumn:"1/-1"}}));
    }
  }

  refreshBtn.addEventListener("click", () => load(true));
  loadMoreBtn.addEventListener("click", () => load(false));
  favToggle.addEventListener("click", () => {
    showFavs=!showFavs;
    favToggle.textContent=showFavs?"★ Favs":"☆ Favs";
    favToggle.style.color=showFavs?"#fbbf24":C.text;
    load(true);
  });

  return {
    el: ov,
    show() { ov.style.display="flex"; load(true); },
    hide() { ov.style.display="none"; },
  };
}
