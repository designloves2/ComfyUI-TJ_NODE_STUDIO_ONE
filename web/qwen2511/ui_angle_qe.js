// ui_angle_qe.js — Angle panel: hover-on-line controls (no click required)
import { C, el, BRAND, buildAnglePrompt } from "./core_qwen2511.js";
import { panel, label, numberField, select, row, col } from "./ui_common_qe.js";
import { buildAngleGraph } from "./graph_builder_qwen2511.js";
import { uploadImage } from "./api_qwen2511.js";

// ─ Presets ───────────────────────────────────────────────────────────────────
const H_OPTS = [
  { label:"front view",       value:0   },
  { label:"front-right view", value:45  },
  { label:"right view",       value:90  },
  { label:"back-right view",  value:135 },
  { label:"back view",        value:180 },
  { label:"back-left view",   value:225 },
  { label:"left view",        value:270 },
  { label:"front-left view",  value:315 },
];
const V_OPTS = [
  { label:"low-angle shot",  value:-30 },
  { label:"eye-level shot",  value:0   },
  { label:"elevated shot",   value:30  },
  { label:"high-angle shot", value:60  },
];
const Z_OPTS = [
  { label:"close-up",    value:1  },
  { label:"medium shot", value:5  },
  { label:"wide shot",   value:10 },
];

const V_MIN = -45, V_MAX = 75, Z_MIN = 1, Z_MAX = 10;
const H_OFFSET = 320;   // display H=0 maps to world azimuth 320°

const nearestH = d => { const a=((d%360)+360)%360; return H_OPTS.reduce((b,o)=>{const x=Math.abs(((o.value-a+540)%360)-180);return x<Math.abs(((b.value-a+540)%360)-180)?o:b;},H_OPTS[0]); };
const nearestV = d => V_OPTS.reduce((b,o)=>Math.abs(o.value-d)<Math.abs(b.value-d)?o:b, V_OPTS[1]);
const nearestZ = z => Z_OPTS.reduce((b,o)=>Math.abs(o.value-z)<Math.abs(b.value-z)?o:b, Z_OPTS[1]);

const COL_H   = "#e91e8c";
const COL_V   = "#00e5c8";
const COL_Z   = "#ffd740";
const COL_CAM = "#e91e8c";

// ─ 3-D Scene ─────────────────────────────────────────────────────────────────
function createScene(st, onChange) {
  const W = 280, SH = 280;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = SH;
  cv.style.cssText = `width:${W}px;height:${SH}px;display:block;margin:0 auto;cursor:default;border-radius:8px;`;
  const ctx = cv.getContext("2d");

  const VIEW_ELEV = 28 * Math.PI / 180;
  // Rotate viewer so world H_OFFSET direction (320°) faces front-bottom of ring
  const VIEW_AZ   = (360 - H_OFFSET) * Math.PI / 180;   // 40°
  const CX = W / 2, CY = SH * 0.54;
  const R = W * 0.37;

  // World → screen: Y-axis rotation (VIEW_AZ) then X-axis tilt (VIEW_ELEV)
  function proj(wx, wy, wz) {
    const ca = Math.cos(VIEW_AZ), sa = Math.sin(VIEW_AZ);
    const rx  = wx * ca + wz * sa;          // rotate around Y
    const rz0 = -wx * sa + wz * ca;
    const ry  = wy * Math.cos(VIEW_ELEV) - rz0 * Math.sin(VIEW_ELEV);  // rotate around X
    const rz  = wy * Math.sin(VIEW_ELEV) + rz0 * Math.cos(VIEW_ELEV);
    return [CX + R * rx, CY - R * ry, rz];
  }

  // ── Line-proximity finders ───────────────────────────────────────────────────
  // Returns { dist, value } for nearest point on each geometric line

  function nearestOnRing(mx, my) {
    // Azimuth ring: sample 360 world-angle points, return display-angle (world - H_OFFSET)
    let bestDisplay = 0, bestDist = Infinity;
    for (let i = 0; i < 360; i++) {
      const worldA = ((i + H_OFFSET) % 360) * Math.PI / 180;
      const [sx, sy] = proj(Math.sin(worldA), 0, Math.cos(worldA));
      const d = Math.hypot(mx-sx, my-sy);
      if (d < bestDist) { bestDist=d; bestDisplay=i; }
    }
    return { dist:bestDist, value:bestDisplay };
  }

  // V arc is drawn at a larger radius to avoid crossing the H ring
  const ARC_R = 1.22;

  function nearestOnArc(mx, my) {
    // Elevation arc at current H azimuth (offset radius ARC_R): sample V_MIN..V_MAX
    const h = st.angleHorizontal ?? 0;
    const worldHr = ((h + H_OFFSET) % 360) * Math.PI / 180;
    let bestV = 0, bestDist = Infinity;
    for (let vi = V_MIN*2; vi <= V_MAX*2; vi++) {
      const vd = vi * 0.5;
      const vr = vd * Math.PI / 180;
      const [sx, sy] = proj(ARC_R*Math.cos(vr)*Math.sin(worldHr), ARC_R*Math.sin(vr), ARC_R*Math.cos(vr)*Math.cos(worldHr));
      const d = Math.hypot(mx-sx, my-sy);
      if (d < bestDist) { bestDist=d; bestV=vd; }
    }
    return { dist:bestDist, value:bestV };
  }

  function nearestOnRod(mx, my) {
    // Rod from subject (0,0.05,0) to camera position
    const sub = proj(0, 0.05, 0);
    const h = st.angleHorizontal ?? 0, v = st.angleVertical ?? 0;
    const worldHr = ((h + H_OFFSET) % 360) * Math.PI / 180, vr = v*Math.PI/180;
    const cam = proj(Math.cos(vr)*Math.sin(worldHr), Math.sin(vr), Math.cos(vr)*Math.cos(worldHr));
    const dx = cam[0]-sub[0], dy = cam[1]-sub[1];
    const len2 = dx*dx + dy*dy;
    if (len2 < 4) return { dist:Infinity, value:st.angleZoom??4 };
    // Project mouse onto rod segment, clamp t to [0.05, 0.95]
    let t = ((mx-sub[0])*dx + (my-sub[1])*dy) / len2;
    t = Math.max(0.05, Math.min(0.95, t));
    const px = sub[0]+t*dx, py = sub[1]+t*dy;
    return { dist:Math.hypot(mx-px, my-py), value: Z_MIN + t*(Z_MAX-Z_MIN) };
  }

  // ── Draw helpers ─────────────────────────────────────────────────────────────
  function shadeHex(hex, p) {
    const n=parseInt(hex.replace("#",""),16);
    return `rgb(${Math.max(0,Math.min(255,((n>>16)&255)+p))},${Math.max(0,Math.min(255,((n>>8)&255)+p))},${Math.max(0,Math.min(255,(n&255)+p))})`;
  }
  function sphere3d(sx, sy, r, color, glowA=0.3) {
    ctx.save();
    const g1=ctx.createRadialGradient(sx,sy,0,sx,sy,r*2.4);
    g1.addColorStop(0,color); g1.addColorStop(1,"transparent");
    ctx.fillStyle=g1; ctx.globalAlpha=glowA;
    ctx.beginPath(); ctx.arc(sx,sy,r*2.4,0,2*Math.PI); ctx.fill();
    ctx.globalAlpha=1;
    const g2=ctx.createRadialGradient(sx-r*.3,sy-r*.3,r*.05,sx,sy,r);
    g2.addColorStop(0,"#fff"); g2.addColorStop(0.2,color); g2.addColorStop(1,shadeHex(color,-55));
    ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(sx,sy,r,0,2*Math.PI); ctx.fill();
    ctx.restore();
  }
  // Flat circle (Z control point)
  function flatDot(sx, sy, r, color) {
    ctx.save();
    ctx.fillStyle = color; ctx.globalAlpha = 0.92;
    ctx.beginPath(); ctx.arc(sx,sy,r,0,2*Math.PI); ctx.fill();
    ctx.strokeStyle="#000"; ctx.lineWidth=1; ctx.globalAlpha=0.35;
    ctx.beginPath(); ctx.arc(sx,sy,r,0,2*Math.PI); ctx.stroke();
    ctx.restore();
  }
  function glowLine(seg, color, lw, alpha=0.9) {
    if (seg.length < 2) return;
    ctx.save();
    ctx.strokeStyle=color; ctx.lineWidth=lw*2.8; ctx.globalAlpha=alpha*0.18;
    ctx.lineCap="round"; ctx.lineJoin="round";
    ctx.beginPath(); seg.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)); ctx.stroke();
    ctx.lineWidth=lw; ctx.globalAlpha=alpha;
    ctx.beginPath(); seg.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y)); ctx.stroke();
    ctx.restore();
  }

  // Control point screen positions (updated each draw for hit-testing)
  const pts = {
    h: { sx:0, sy:0, r:14 },
    v: { sx:0, sy:0, r:14 },
    z: { sx:0, sy:0, r:12 },
  };

  // ── Draw ─────────────────────────────────────────────────────────────────────
  function draw() {
    ctx.clearRect(0, 0, W, SH);
    const h  = st.angleHorizontal ?? 0;
    const v  = st.angleVertical   ?? 0;
    const z  = st.angleZoom       ?? 5;
    // Display angle h → world angle for 3D scene (H_OFFSET shifts zero point)
    const worldHr = ((h + H_OFFSET) % 360) * Math.PI / 180;
    const vr = v * Math.PI / 180;

    const cvx = Math.cos(vr)*Math.sin(worldHr);
    const cvy = Math.sin(vr);
    const cvz = Math.cos(vr)*Math.cos(worldHr);
    const [csx,csy,csz] = proj(cvx,cvy,cvz);

    // Determine if viewer sees back of view-plane
    const planeFacingViewer = cvz*Math.cos(VIEW_ELEV) - cvy*Math.sin(VIEW_ELEV);
    const isBack = planeFacingViewer < 0;

    // Black background
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, SH);

    // Azimuth ring (back then front)
    const N=120, backR=[], frontR=[];
    for (let i=0;i<=N;i++){
      const a=(i/N)*2*Math.PI;
      const [sx,sy,sz]=proj(Math.sin(a),0,Math.cos(a));
      (sz<0?backR:frontR).push([sx,sy]);
    }
    glowLine(backR, COL_H,3.5,0.22);
    glowLine(frontR,COL_H,3.5,0.85);

    // FRONT reference indicator at H=0 (world 320° = H_OFFSET) — always drawn at fixed position
    {
      const fwr = H_OFFSET * Math.PI / 180;
      const [frx, fry] = proj(Math.sin(fwr), 0, Math.cos(fwr));
      const [fox, foy] = proj(1.28 * Math.sin(fwr), 0, 1.28 * Math.cos(fwr));
      // Dashed spoke from ring outward
      ctx.save();
      ctx.strokeStyle = "rgba(255,255,255,0.38)"; ctx.lineWidth = 1.2;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(frx, fry); ctx.lineTo(fox, foy); ctx.stroke();
      ctx.setLineDash([]);
      // Label
      ctx.fillStyle = "rgba(255,255,255,0.52)";
      ctx.font = "bold 8px 'Segoe UI',sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "top";
      ctx.fillText("FRONT / 0°", fox, foy + 1);
      ctx.restore();
    }

    // H control dot on ring at world H position
    const [hsx,hsy]=proj(Math.sin(worldHr),0,Math.cos(worldHr));
    pts.h.sx=hsx; pts.h.sy=hsy;

    // Elevation arc at camera azimuth — drawn at ARC_R offset (outside the H ring)
    const arcBack=[], arcFront=[];
    for (let i=0;i<=80;i++){
      const vv=(-40+i)*Math.PI/180;
      const [sx,sy,sz]=proj(ARC_R*Math.cos(vv)*Math.sin(worldHr), ARC_R*Math.sin(vv), ARC_R*Math.cos(vv)*Math.cos(worldHr));
      (sz<0?arcBack:arcFront).push([sx,sy]);
    }
    glowLine(arcBack, COL_V,3,0.22);
    glowLine(arcFront,COL_V,3,0.88);

    // V control dot on arc
    const [vsx,vsy]=proj(ARC_R*Math.cos(vr)*Math.sin(worldHr), ARC_R*Math.sin(vr), ARC_R*Math.cos(vr)*Math.cos(worldHr));
    pts.v.sx=vsx; pts.v.sy=vsy;

    // View plane: V is NEGATED so dragging slider up tilts image down, down tilts image up
    const vr_plane = -vr;
    const right=[Math.cos(worldHr),0,-Math.sin(worldHr)];
    const px=Math.cos(vr_plane)*Math.sin(worldHr), py=Math.sin(vr_plane), pz=Math.cos(vr_plane)*Math.cos(worldHr);
    const camDir=[-px,-py,-pz];
    const upV=[
      right[1]*camDir[2]-right[2]*camDir[1],
      right[2]*camDir[0]-right[0]*camDir[2],
      right[0]*camDir[1]-right[1]*camDir[0],
    ];
    const scX=0.52,scY=0.68;
    const corners=[[-scX,+scY],[scX,+scY],[scX,-scY],[-scX,-scY]].map(([rx,ry])=>
      proj(rx*right[0]+ry*upV[0], rx*right[1]+ry*upV[1], rx*right[2]+ry*upV[2])
    );
    const sc=corners.map(c=>[c[0],c[1]]);

    ctx.save();
    ctx.beginPath(); ctx.moveTo(sc[0][0],sc[0][1]);
    sc.slice(1).forEach(([x,y])=>ctx.lineTo(x,y)); ctx.closePath(); ctx.clip();

    const imgEl=st._imgEl;
    if (imgEl && imgEl.naturalWidth>0) {
      const [x0,y0]=sc[0],[x1,y1]=sc[1],[x3,y3]=sc[3];
      const iw=imgEl.naturalWidth, ih=imgEl.naturalHeight;
      ctx.transform((x1-x0)/iw,(y1-y0)/iw,(x3-x0)/ih,(y3-y0)/ih,x0,y0);
      ctx.drawImage(imgEl,0,0);
    } else {
      ctx.fillStyle="rgba(40,40,80,0.55)"; ctx.fill();
      ctx.strokeStyle="rgba(90,90,160,0.35)"; ctx.lineWidth=0.7;
      for (let t=0.25;t<1;t+=0.25){
        const a=[sc[0][0]+(sc[1][0]-sc[0][0])*t,sc[0][1]+(sc[1][1]-sc[0][1])*t];
        const b=[sc[3][0]+(sc[2][0]-sc[3][0])*t,sc[3][1]+(sc[2][1]-sc[3][1])*t];
        ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
      }
      for (let t=0.33;t<1;t+=0.33){
        const a=[sc[0][0]+(sc[3][0]-sc[0][0])*t,sc[0][1]+(sc[3][1]-sc[0][1])*t];
        const b=[sc[1][0]+(sc[2][0]-sc[1][0])*t,sc[1][1]+(sc[2][1]-sc[1][1])*t];
        ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.stroke();
      }
    }
    ctx.restore();

    // Backface darkening overlay (clip to plane shape)
    if (isBack) {
      ctx.save();
      ctx.beginPath(); ctx.moveTo(sc[0][0],sc[0][1]);
      sc.slice(1).forEach(([x,y])=>ctx.lineTo(x,y)); ctx.closePath(); ctx.clip();
      ctx.fillStyle="rgba(0,0,0,0.58)"; ctx.fill();
      ctx.restore();
    }

    // Plane border
    ctx.save(); ctx.strokeStyle=COL_CAM; ctx.lineWidth=1.8; ctx.globalAlpha=0.85;
    ctx.beginPath(); ctx.moveTo(sc[0][0],sc[0][1]);
    sc.slice(1).forEach(([x,y])=>ctx.lineTo(x,y)); ctx.closePath(); ctx.stroke();
    ctx.restore();

    // Rod: subject → camera
    const sub=proj(0,0.05,0);
    ctx.save(); ctx.strokeStyle=COL_Z; ctx.lineWidth=2.2; ctx.globalAlpha=0.8;
    ctx.beginPath(); ctx.moveTo(sub[0],sub[1]); ctx.lineTo(csx,csy); ctx.stroke();
    ctx.restore();

    // Z control dot position on rod
    const zfrac=(z-Z_MIN)/(Z_MAX-Z_MIN);
    const zpx=sub[0]+(csx-sub[0])*zfrac;
    const zpy=sub[1]+(csy-sub[1])*zfrac;
    pts.z.sx=zpx; pts.z.sy=zpy;

    // Camera endpoint marker (flat dot at rod tip)
    flatDot(csx, csy, 4, COL_CAM);

    // ── Control dots (all flat circles, same style) ────────────────────────────
    flatDot(zpx, zpy, 6, COL_Z);   // Z — gold
    flatDot(hsx, hsy, 6, COL_H);   // H — pink
    flatDot(vsx, vsy, 6, COL_V);   // V — teal
  }

  // ── Click-and-hold drag interaction ─────────────────────────────────────────
  const THRESH_RING = 15;
  const THRESH_ARC  = 15;
  const THRESH_ROD  = 13;
  let dragging = null;  // 'h' | 'v' | 'z' | null

  function getScaled(e) {
    const rect=cv.getBoundingClientRect(), s=W/rect.width;
    return [(e.clientX-rect.left)*s, (e.clientY-rect.top)*s];
  }

  function detectLine(mx, my) {
    const ring = nearestOnRing(mx, my);
    const arc  = nearestOnArc(mx, my);
    const rod  = nearestOnRod(mx, my);
    const cands = [];
    if (ring.dist < THRESH_RING) cands.push({ axis:'h', dist:ring.dist, val:ring.value });
    if (arc.dist  < THRESH_ARC)  cands.push({ axis:'v', dist:arc.dist,  val:arc.value  });
    if (rod.dist  < THRESH_ROD)  cands.push({ axis:'z', dist:rod.dist,  val:rod.value  });
    if (!cands.length) return null;
    cands.sort((a,b)=>a.dist-b.dist);
    return cands[0];
  }

  cv.addEventListener("mousedown", e => {
    const [mx, my] = getScaled(e);
    const hit = detectLine(mx, my);
    if (hit) {
      dragging = hit.axis;
      onChange(hit.axis, hit.val);
      cv.style.cursor = "grabbing";
      e.preventDefault();
    }
  });

  document.addEventListener("mousemove", e => {
    if (!dragging) return;
    const [mx, my] = getScaled(e);
    // Compute value for the currently dragged line
    let val;
    if (dragging === 'h')      val = nearestOnRing(mx, my).value;
    else if (dragging === 'v') val = nearestOnArc(mx, my).value;
    else                       val = nearestOnRod(mx, my).value;
    onChange(dragging, val);
  });

  document.addEventListener("mouseup", () => {
    if (dragging) { dragging = null; cv.style.cursor = "default"; }
  });

  cv.addEventListener("mousemove", e => {
    if (dragging) return;
    const [mx, my] = getScaled(e);
    cv.style.cursor = detectLine(mx, my) ? "grab" : "default";
  });

  cv.addEventListener("mouseleave", () => { if (!dragging) cv.style.cursor="default"; });

  draw();
  return { el:cv, draw };
}

// ─ UI helpers ────────────────────────────────────────────────────────────────
function mkDd(opts, curVal, onChange) {
  const s=document.createElement("select");
  s.style.cssText=`background:${C.bg2};color:${C.text};border:1px solid ${C.border};border-radius:6px;padding:4px 5px;font-size:11px;font-family:inherit;outline:none;cursor:pointer;width:100%;`;
  opts.forEach(o=>{
    const opt=document.createElement("option");
    opt.value=String(o.value); opt.textContent=o.label;
    if(o.value===curVal) opt.selected=true;
    s.appendChild(opt);
  });
  s.addEventListener("change",e=>onChange(parseFloat(e.target.value)));
  return { el:s, setValue(v){s.value=String(v);} };
}

function mkDiv(style, children) {
  const d=document.createElement("div");
  Object.assign(d.style, style);
  (children||[]).forEach(c=>typeof c==="string"?(d.textContent=c):d.appendChild(c));
  return d;
}

function mkSpan(text, cssText) {
  const s=document.createElement("span"); s.textContent=text; s.style.cssText=cssText; return s;
}

// ─ Main export ───────────────────────────────────────────────────────────────
export function mountAngleLeft(leftEl, st, ctx) {
  const wrap=mkDiv({display:"flex",flexDirection:"column",gap:"6px"});
  leftEl.appendChild(wrap);

  // Defaults
  if (st.angleHorizontal==null) st.angleHorizontal=0;
  if (st.angleVertical  ==null) st.angleVertical  =0;
  if (st.angleZoom      ==null) st.angleZoom      =5;   // medium shot
  st._imgEl=null;

  // Source image
  const imgEl=document.createElement("img"); imgEl.style.display="none";
  if (st.angleCameraImage){
    imgEl.src=`/view?filename=${encodeURIComponent(st.angleCameraImage)}&type=input&t=${Date.now()}`;
    imgEl.onload=()=>{ st._imgEl=imgEl; scene.draw(); };
  }

  // Prompt
  const promptEl=mkDiv({
    color:"#e91e8c",fontSize:"11px",padding:"7px 9px",
    background:"rgba(233,30,140,0.07)",border:"1px solid rgba(233,30,140,0.25)",
    borderRadius:"6px",wordBreak:"break-word",fontFamily:"monospace",minHeight:"28px",
  });
  const updatePrompt=()=>{ promptEl.textContent=buildAnglePrompt(st.angleHorizontal,st.angleVertical,st.angleZoom); };
  updatePrompt();

  // Value labels
  const hValEl=mkSpan(`${Math.round(st.angleHorizontal)}°`, `color:#e91e8c;font-size:12px;font-weight:700;font-family:monospace;min-width:40px;text-align:right;`);
  const vValEl=mkSpan(`${st.angleVertical}°`,               `color:#00e5c8;font-size:12px;font-weight:700;font-family:monospace;min-width:40px;text-align:right;`);
  const zValEl=mkSpan(String(st.angleZoom??5),               `color:#ffd740;font-size:12px;font-weight:700;font-family:monospace;min-width:40px;text-align:right;`);

  // Dropdowns
  const hDd=mkDd(H_OPTS, nearestH(st.angleHorizontal).value, v=>{
    st.angleHorizontal=v; hValEl.textContent=`${v}°`; hDd.setValue(nearestH(v).value);
    ctx.persist(); scene.draw(); updatePrompt();
  });
  const vDd=mkDd(V_OPTS, nearestV(st.angleVertical).value, v=>{
    st.angleVertical=v; vValEl.textContent=`${v}°`; vDd.setValue(nearestV(v).value);
    ctx.persist(); scene.draw(); updatePrompt();
  });
  const zDd=mkDd(Z_OPTS, nearestZ(st.angleZoom??5).value, v=>{
    st.angleZoom=v; zValEl.textContent=String(v); zDd.setValue(nearestZ(v).value);
    ctx.persist(); scene.draw(); updatePrompt();
  });

  // 3D scene (created before it's appended — referenced via closure)
  const scene=createScene(st, (axis, val)=>{
    if (axis==='h'){
      st.angleHorizontal=Math.round(val);
      hValEl.textContent=`${st.angleHorizontal}°`;
      hDd.setValue(nearestH(st.angleHorizontal).value);
    } else if (axis==='v'){
      st.angleVertical=parseFloat(val.toFixed(1));
      vValEl.textContent=`${st.angleVertical}°`;
      vDd.setValue(nearestV(st.angleVertical).value);
    } else {
      st.angleZoom=parseFloat(val.toFixed(1));
      zValEl.textContent=String(st.angleZoom);
      zDd.setValue(nearestZ(st.angleZoom).value);
    }
    ctx.persist(); scene.draw(); updatePrompt();
  });

  // Reset button
  const resetBtn=document.createElement("button");
  resetBtn.type="button"; resetBtn.textContent="↺"; resetBtn.title="Reset";
  resetBtn.style.cssText=`cursor:pointer;font-family:inherit;font-size:14px;padding:4px 8px;border-radius:50%;background:transparent;color:#e91e8c;border:1.5px solid #e91e8c;flex-shrink:0;line-height:1;`;
  resetBtn.onclick=()=>{
    st.angleHorizontal=0; st.angleVertical=0; st.angleZoom=5;
    hDd.setValue(nearestH(0).value); vDd.setValue(0); zDd.setValue(nearestZ(5).value);
    hValEl.textContent="0°"; vValEl.textContent="0°"; zValEl.textContent="5";
    ctx.persist(); scene.draw(); updatePrompt();
  };

  // Control rows: H / V / Z — 3 separate rows
  function mkCtrlRow(labelText, labelColor, dd, valEl, extra) {
    const lbl=mkSpan(labelText, `color:${labelColor};font-size:12px;font-weight:700;width:14px;flex-shrink:0;`);
    const ddWrap=mkDiv({flex:"1",minWidth:"0"},[dd.el]);
    const row=mkDiv({display:"flex",alignItems:"center",gap:"6px"},[lbl,ddWrap,valEl]);
    if (extra) row.appendChild(extra);
    return row;
  }
  const ctrlBlock=mkDiv({display:"flex",flexDirection:"column",gap:"5px",padding:"5px 0 2px"},[
    mkCtrlRow("H","#e91e8c",hDd,hValEl),
    mkCtrlRow("V","#00e5c8",vDd,vValEl),
    mkCtrlRow("Z","#ffd740",zDd,zValEl,resetBtn),
  ]);

  // Image upload
  const fileInp=document.createElement("input");
  fileInp.type="file"; fileInp.accept="image/*"; fileInp.style.display="none";
  fileInp.addEventListener("change",async()=>{
    if(fileInp.files[0]){
      const name=await uploadImage(fileInp.files[0]);
      st.angleCameraImage=name;
      imgEl.src=`/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`;
      imgEl.onload=()=>{ st._imgEl=imgEl; scene.draw(); };
      ctx.persist();
    }
    fileInp.value="";
  });
  wrap.appendChild(fileInp);

  const uploadHint=mkDiv({textAlign:"center",fontSize:"10px",color:C.muted,marginTop:"2px",cursor:"pointer"},["Double-click or drag image onto scene"]);
  uploadHint.onclick=()=>fileInp.click();
  scene.el.addEventListener("dblclick",()=>fileInp.click());
  scene.el.addEventListener("dragover",e=>{e.preventDefault();scene.el.style.outline=`2px solid #e91e8c`;});
  scene.el.addEventListener("dragleave",()=>{ scene.el.style.outline=""; });
  scene.el.addEventListener("drop",async e=>{
    e.preventDefault(); scene.el.style.outline="";
    const f=e.dataTransfer.files[0];
    if(f){
      const name=await uploadImage(f);
      st.angleCameraImage=name;
      imgEl.src=`/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`;
      imgEl.onload=()=>{ st._imgEl=imgEl; scene.draw(); };
      ctx.persist();
    }
  });

  // Assemble scene panel
  const scenePanel=mkDiv({background:C.bg1,borderRadius:"10px",padding:"8px",border:`1px solid ${C.border}`});
  scenePanel.appendChild(promptEl);
  scenePanel.appendChild(mkDiv({height:"5px"}));
  scenePanel.appendChild(scene.el);
  scenePanel.appendChild(ctrlBlock);
  scenePanel.appendChild(uploadHint);
  wrap.appendChild(scenePanel);

  // ── Sampling params ───────────────────────────────────────────────────────
  wrap.appendChild(panel([
    row([
      col([label("Steps"), numberField(st.steps??20, v=>{st.steps=v;ctx.persist?.();}, 1)]),
      col([label("CFG"),   numberField(st.cfg??4,    v=>{st.cfg=v;ctx.persist?.();},   0.1)]),
    ]),
    row([
      col([label("Sampler"),   select(["euler","euler_ancestral","er_sde","heun","dpm_pp_2m"], st.sampler||"euler",   v=>{st.sampler=v;ctx.persist?.();})]),
      col([label("Scheduler"), select(["simple","normal","karras","exponential","sgm_uniform","beta"], st.scheduler||"simple", v=>{st.scheduler=v;ctx.persist?.();})]),
    ]),
  ]));

  // ── Angle LoRA notice ─────────────────────────────────────────────────────
  wrap.appendChild(el("div", { text:"⚠ Angle LoRA is required for best results. Assign the Camera Angle LoRA in ⚙ Settings.", style:{
    color:"#FFD700", fontSize:"11px", fontWeight:"600",
    padding:"6px 8px",
    background:"rgba(255,215,0,0.08)",
    border:"1px solid rgba(255,215,0,0.3)",
    borderRadius:"6px",
  }}));

  ctx._rerenderAngleLora = () => {};

  return {
    getSourceURL:()=>st.angleCameraImage?`/view?filename=${encodeURIComponent(st.angleCameraImage)}&type=input`:null,
    async getGraph(){ return buildAngleGraph(st); },
    setImage(name){
      st.angleCameraImage=name;
      imgEl.src=`/view?filename=${encodeURIComponent(name)}&type=input&t=${Date.now()}`;
      imgEl.onload=()=>{ st._imgEl=imgEl; scene.draw(); };
      ctx.persist();
    },
  };
}
