(() => {
  const DEFAULT_FPS = 24;
  const DEFAULT_TOTAL = 360;
  const LANE_COUNT = 5;
  const DEFAULT_LANE_H = 74;
  const LEFT_PAD = 150;
  const SNAP_STEP = 8;
  const TRANSITION_TYPES = [
    {value:'none', label:'None (Hard Cut)'},
    {value:'fade', label:'Dissolve (Cross Fade)'},
    {value:'fadeblack', label:'Fade to Black'},
    {value:'fadewhite', label:'Fade to White'},
    {value:'wipeleft', label:'Wipe Left'},
    {value:'wiperight', label:'Wipe Right'},
    {value:'wipeup', label:'Wipe Up'},
    {value:'wipedown', label:'Wipe Down'},
    {value:'slideleft', label:'Slide Left'},
    {value:'slideright', label:'Slide Right'},
    {value:'slideup', label:'Slide Up'},
    {value:'slidedown', label:'Slide Down'},
    {value:'circleopen', label:'Circle Open'},
    {value:'circleclose', label:'Circle Close'},
    {value:'smoothleft', label:'Smooth Left'},
    {value:'smoothright', label:'Smooth Right'},
    {value:'pixelize', label:'Pixelize'},
    {value:'radial', label:'Radial'},
  ];
  const state = {
    project:null, media:[], selectedClipId:null, selectedClipIds:[], currentFrame:0, pxPerFrame:4,
    snap:true, peakSnap:false, loop:false, mute:false, previewMode:'single', wipePos:50, range:{start:null,end:null}, mediaView:'grid', mediaThumb:104, drag:null, fonts:[],
    versionCompareSel:[], versionCompareClips:null, prerender:null,
    totalFrames:DEFAULT_TOTAL, audioMonitor:'auto', monitorVolume:1.0, scrubAudio:false, lockedLanes:{}, hiddenLanes:{}, playing:false, laneHeight:DEFAULT_LANE_H
  };
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (v,min,max) => Math.max(min, Math.min(max, Number(v)||0));
  const trunc = (s,n) => String(s||'').length>n ? String(s).slice(0,n-1)+'…' : String(s||'');
  const status = msg => { const el=$('status'); if(el) el.textContent=msg; };
  const fps = () => Number(state.project?.settings?.fps || DEFAULT_FPS) || DEFAULT_FPS;
  const totalFrames = () => Math.max(1, Number(state.project?.settings?.total_frames || state.totalFrames || DEFAULT_TOTAL));
  const frameToSec = frame => frame / fps();
  const fmtTime = frame => { const sec=Math.max(0, frameToSec(frame)); const m=Math.floor(sec/60); const s=Math.floor(sec%60); const ms=Math.round((sec-Math.floor(sec))*1000); return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}.${String(ms).padStart(3,'0')}`; };
  const maxFrame = () => Math.max(totalFrames(), ...((state.project?.clips||[]).map(c=>c.start+c.length)), Math.round(fps()*15));
  const findClip = id => (state.project?.clips||[]).find(c=>c.id===id);
  const isSelected = id => state.selectedClipIds.includes(id);
  const selectedClip = () => findClip(state.selectedClipId);
  const selectedClips = () => (state.project?.clips||[]).filter(c=>isSelected(c.id));
  const mediaFor = clip => clip ? state.media.find(m=>m.id===clip.media_id) : null;
  // A clip's active Version Stack entry (see ensureVersions/setActiveVersion)
  // overrides the shared media-bin item's path for playback/export, without
  // touching the shared media entry other clips of the same source still use.
  const monitorMediaFor = clip => { const base=mediaFor(clip) || clip; return (clip && clip.versions && clip.versions.length) ? {...base, path:clip.path, url:clip.url||null} : base; };
  const audioCapable = c => c && ['video','audio'].includes(c.kind);
  const fileUrl = item => !item ? '' : item.url ? item.url : item.path ? `/itda/api/file?path=${encodeURIComponent(item.path)}&project=${encodeURIComponent(state.project?.name || 'itda-project-1')}` : '';
  const snapFrame = f => state.snap ? Math.round(f / SNAP_STEP) * SNAP_STEP : Math.round(f);
  // Trimming must stay frame-accurate. Snap is for moving/placing clips only.
  const trimFrame = f => Math.round(f);
  const clipEnd = c => c.start + c.length;
  const laneH = () => Number(state.laneHeight || DEFAULT_LANE_H);
  function sourceTotalFrames(c){
    if(!c) return 1;
    const m = mediaFor(c);
    return Math.max(1, Math.round(Number(m?.total_frames || c.source_total_frames || c.source_frames || c.source_out || c.length || 1)));
  }
  function isTimeBoundClip(c){ return c && ['video','audio'].includes(c.kind); }
  function maxClipLength(c, srcIn=null){
    if(!isTimeBoundClip(c)) return Number.MAX_SAFE_INTEGER;
    const total = sourceTotalFrames(c);
    const input = srcIn == null ? Number(c.source_in || 0) : Number(srcIn || 0);
    return Math.max(1, total - Math.max(0, Math.min(total - 1, input)));
  }
  function normalizeClipBounds(c){
    if(!c) return c;
    if(!isTimeBoundClip(c)){
      c.length = Math.max(1, Math.round(Number(c.length || 1)));
      c.source_in = Math.max(0, Math.round(Number(c.source_in || 0)));
      c.source_out = Math.max(c.source_in + 1, Math.round(Number(c.source_out || (c.source_in + c.length))));
      return c;
    }
    const total = sourceTotalFrames(c);
    c.source_total_frames = total;
    c.source_in = Math.max(0, Math.min(total - 1, Math.round(Number(c.source_in || 0))));
    c.length = Math.max(1, Math.min(Math.round(Number(c.length || 1)), total - c.source_in));
    c.source_out = Math.max(c.source_in + 1, Math.min(total, c.source_in + c.length));
    return c;
  }

  function hexToRgba(hex, alpha=1){
    const h=String(hex||'#000000').replace('#','');
    const full=h.length===3 ? h.split('').map(x=>x+x).join('') : h.padEnd(6,'0').slice(0,6);
    const n=parseInt(full,16);
    const r=(n>>16)&255, g=(n>>8)&255, b=n&255;
    return `rgba(${r},${g},${b},${Math.max(0,Math.min(1,Number(alpha)||0))})`;
  }

  async function api(path, opts={}) { const res=await fetch(path, opts); if(!res.ok){ let txt=''; try{txt=await res.text();}catch{} throw new Error(`${res.status} ${res.statusText}${txt?': '+txt:''}`); } return await res.json(); }

  function normalizeProject(p){
    p.settings = {...{fps:24,total_frames:360,snap:true,loop:false,mute:false,preview_mode:'single',scrub_audio:false}, ...(p.settings||{})};
    p.range = p.range || {start:null,end:null}; p.media = p.media || []; p.clips = p.clips || [];
    const oldLanes = Array.isArray(p.lanes) ? p.lanes : [];
    p.lanes = Array.from({length:LANE_COUNT}, (_,i)=>{
      const old = oldLanes.find(l=>Number(l.index)===i) || oldLanes[i] || {};
      const locked = !!old.locked;
      const visible = old.visible !== false;
      state.lockedLanes[i] = locked;
      state.hiddenLanes[i] = !visible;
      return {id:`lane_${i}`,index:i,locked,visible};
    });
    return p;
  }
  async function initProject(nameOverride=null){
    const name=nameOverride || state.project?.name || $('projectName').value || 'itda-project-1';
    const data=await api('/itda/api/init',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:name})});
    state.project=normalizeProject(data.project); state.range=state.project.range; state.snap=state.project.settings.snap!==false; state.loop=!!state.project.settings.loop; state.mute=!!state.project.settings.mute; state.previewMode=state.project.settings.preview_mode||'single'; state.scrubAudio=!!state.project.settings.scrub_audio; state.totalFrames=state.project.settings.total_frames||DEFAULT_TOTAL;
    $('projectName').value=state.project.name || 'itda-project-1'; await loadFonts(); await scanMedia(); renderAll(); status(`Loaded ${state.project.name}`);
  }
  async function saveProject(){
    if(!state.project) return; state.project.name=state.project.name || $('projectName').value || 'itda-project-1'; state.project.range=state.range; state.project.media=state.media.filter(m=>!m.local); state.project.settings={...state.project.settings,fps:fps(),total_frames:totalFrames(),snap:state.snap,loop:state.loop,mute:state.mute,preview_mode:state.previewMode,scrub_audio:state.scrubAudio};
    await api(`/itda/api/project/${encodeURIComponent(state.project.name)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state.project)});
    showModal('Save', `<p><b>${esc(state.project.name)}</b> saved.</p><p class="muted">ComfyUI/input/ITDA/projects/${esc(state.project.name)}.itda.json</p>`); status('Saved');
  }
  async function scanMedia(){
    if(!state.project) return; try{ const data=await api(`/itda/api/media/${encodeURIComponent(state.project.name)}`); const local=state.media.filter(m=>m.local); state.media=[...(data.items||[]),...local]; restoreBeats(); }catch(e){ status(`Media scan failed: ${e.message}`); }
  }
  // scanMedia() rebuilds state.media from a fresh server scan, so anything
  // computed client-side (detected beats) has to be re-attached from the
  // saved project afterwards, keyed by path since media ids are regenerated.
  function restoreBeats(){
    const saved=state.project?.settings?.beats || {};
    state.media.forEach(m=>{ if(m.path && Array.isArray(saved[m.path])) m.beats=saved[m.path]; });
  }
  function rememberBeats(m, frames){
    m.beats=frames;
    if(!state.project) return;
    state.project.settings=state.project.settings||{};
    state.project.settings.beats={...(state.project.settings.beats||{}), [m.path]:frames};
  }

  async function loadFonts(){
    try{
      const data = await api('/itda/api/fonts');
      state.fonts = data.items || [];
      let style = document.getElementById('itda-font-face-style');
      if(!style){ style = document.createElement('style'); style.id='itda-font-face-style'; document.head.appendChild(style); }
      style.textContent = state.fonts.map(f=>`@font-face{font-family:'${String(f.family).replace(/'/g,"\\'")}';src:url('${f.url}') format('${f.format||'truetype'}');font-display:swap;}`).join('\n');
    }catch(e){ state.fonts=[]; status(`Font scan failed: ${e.message}`); }
  }

  function renderAll(){ autoLanes(); renderMedia(); renderTimeline(); updateControls(); updateProps(); updatePreview(); }

  function renderMedia(){
    state.media.forEach(m=>ensureWaveform(m));
    const list=$('mediaList'); list.innerHTML=''; list.classList.toggle('list-view', state.mediaView==='list'); list.style.setProperty('--thumb', `${state.mediaThumb || 104}px`);
    const items=state.media; $('mediaCount').textContent=`${items.length} item${items.length===1?'':'s'}`;
    if(!items.length){ list.innerHTML='<div class="empty">Put media in ComfyUI/input/ITDA, or add session media with the + buttons above.</div>'; return; }
    for(const item of items){
      const div=document.createElement('div'); div.className='media-item'; div.draggable=true; div.title=`${item.name}\n${item.fps?Number(item.fps).toFixed(3)+' fps':''} ${item.total_frames||''} frames`;
      const src=fileUrl(item); let thumb='';
      if(item.kind==='video') thumb=item.thumb_url ? `<img src="${item.thumb_url}" loading="lazy">` : `<video src="${src}#t=0.001" muted preload="metadata"></video>`; else if(item.kind==='image') thumb=`<img src="${src}" loading="lazy">`; else if(item.kind==='text') thumb=`<div class="icon">T</div>`; else thumb=`<div class="icon">♪</div>`;
      div.innerHTML=`<button class="media-delete" title="Remove">×</button><div class="thumb">${thumb}</div><div><div class="media-name">${esc(item.name)}</div><div class="media-meta">${item.kind}${item.fps?` · ${Number(item.fps).toFixed(2)}fps`:''}${item.total_frames?` · ${item.total_frames}f`:''}</div></div>`;
      div.querySelector('.media-delete').onclick=e=>{e.stopPropagation(); removeMedia(item.id);};
      div.addEventListener('dragstart', e=>e.dataTransfer.setData('application/itda-media', JSON.stringify(item)));
      div.addEventListener('dblclick', ()=>mediaPreview(item));
      list.appendChild(div);
    }
  }
  // A native confirm()/alert() is a blocking browser dialog owned by the top
  // window - inside a cross-origin/sandboxed iframe (e.g. the ComfyUI
  // preview node embeds ITDA in one) browsers are free to suppress it
  // silently, which reads as "the delete button does nothing." Routing
  // through the app's own modal sidesteps that entirely.
  function confirmModal(title, bodyHtml, confirmLabel='Delete'){
    return new Promise(resolve=>{
      showModal(title, bodyHtml, `<button id="confirmYes">${esc(confirmLabel)}</button><button id="confirmNo">Cancel</button>`);
      $('confirmYes').onclick=()=>{ closeModal(); resolve(true); };
      $('confirmNo').onclick=()=>{ closeModal(); resolve(false); };
    });
  }
  async function removeMedia(id){
    const item=state.media.find(m=>m.id===id);
    if(!item) return;
    const ok=await confirmModal('Delete Media', `<p>Removing this from the Media Bin also permanently deletes the library file.</p><p><b>${esc(item.name)}</b></p><p class="muted">Delete it?</p>`);
    if(!ok) return;
    if(item.path && !item.local){
      try{ await api('/itda/api/media/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:state.project?.name||'itda-project-1',path:item.path})}); }catch(e){ status(`Media delete failed: ${e.message}`); return; }
    }
    state.media=state.media.filter(m=>m.id!==id);
    if(state.project) state.project.clips=(state.project.clips||[]).filter(c=>c.media_id!==id);
    setSelection(null); renderAll(); status('Media deleted from library');
  }
  function mediaPreview(item){ const temp={id:'preview',media_id:item.id,name:item.name,kind:item.kind,start:0,length:item.total_frames||Math.round((item.duration||5)*fps()),source_in:0,lane:0,path:item.path,url:item.url||null,text:item.text||'',font_family:item.font_family||'system',shadow_enabled:false,shadow_color:'#000000',shadow_opacity:0.6,fps:item.fps||fps()}; const v=$('previewVideo'); const vb=$('previewVideoB'); if(v){ v.controls = item.kind==='video' || item.kind==='audio'; v.muted=false; v.volume=state.monitorVolume; } if(vb){ vb.controls=false; } loadPreviewForClip(temp,v,$('previewImage'),$('textOverlay')); if(item.kind==='audio'){ const src=fileUrl(item); if(v){ v.pause(); v.src=src; v.dataset.src=src; v.controls=true; v.load(); } } status('Media preview loaded. Use native controls, Space, or click preview to play.'); }
  async function addLocalFiles(files, kindHint=null){
    if(!state.project) return;
    const fd=new FormData(); [...files].forEach(f=>fd.append('files',f)); fd.append('project', state.project.name || $('projectName').value || 'itda-project-1');
    try{
      const data=await fetch('/itda/api/media/upload',{method:'POST',body:fd}).then(r=>{if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json();});
      await scanMedia(); renderAll(); status(`Imported ${(data.items||[]).length} file(s) to input/ITDA/media/${state.project.name}`);
    }catch(err){
      [...files].forEach(file=>{ const kind=file.type.startsWith('video/')?'video':file.type.startsWith('audio/')?'audio':file.type.startsWith('image/')?'image':kindHint; if(!kind) return; const item={id:`local:${Date.now()}:${Math.random().toString(16).slice(2)}`,name:file.name,kind,path:null,url:URL.createObjectURL(file),local:true,fps:fps(),total_frames:Math.round(fps()*5),duration:5,width:null,height:null}; if(kind==='video') loadVideoMeta(item); state.media.push(item); });
      renderMedia(); status(`Upload failed, using temporary session media: ${err.message}`);
    }
  }
  function loadVideoMeta(item){ const v=document.createElement('video'); v.preload='metadata'; v.src=item.url; v.onloadedmetadata=()=>{ item.duration=v.duration||item.duration||5; item.width=v.videoWidth; item.height=v.videoHeight; item.original_fps=item.fps||fps(); item.fps=fps(); item.total_frames=Math.round(item.duration*fps()); renderAll(); }; }
  function addTextMedia(){ const item={id:`text:${Date.now()}`,name:'Text Clip',kind:'text',local:true,text:'Subtitle Text',fps:fps(),total_frames:Math.round(fps()*3),duration:3}; state.media.push(item); renderMedia(); addClipFromMedia(item,state.currentFrame); }
  function addClipFromMedia(media,startFrame){ const length=media.total_frames||Math.round((media.duration||5)*fps())||120; const clip={id:`clip_${Date.now()}_${Math.random().toString(16).slice(2)}`,media_id:media.id,name:media.name,kind:media.kind,path:media.path,url:media.url||null,fps:fps(),width:media.width||null,height:media.height||null,start:Math.max(0,snapFrame(startFrame)),length,source_in:0,source_out:length,source_total_frames:media.total_frames||length,lane:0,group_id:null,audio_detached:false,text:media.text||'',x:50,y:88,size:42,opacity:1,color:'#ffffff',font_family:'system',shadow_enabled:false,shadow_color:'#000000',shadow_opacity:0.6}; normalizeClipBounds(clip); state.project.clips.push(clip); setSelection(clip.id); renderAll(); }

  function setSelection(id,additive=false){
    // Any new clip selection invalidates a version-compare in progress -
    // it's scoped to whichever clip's Properties panel it was started from.
    state.versionCompareSel=[]; state.versionCompareClips=null;
    if(!id){state.selectedClipId=null;state.selectedClipIds=[];return;}
    const c=findClip(id);
    const groupIds = c?.group_id ? (state.project?.clips||[]).filter(x=>x.group_id===c.group_id).map(x=>x.id) : [id];
    if(additive){
      const allSelected=groupIds.every(x=>isSelected(x));
      state.selectedClipIds = allSelected ? state.selectedClipIds.filter(x=>!groupIds.includes(x)) : [...new Set([...state.selectedClipIds, ...groupIds])];
      state.selectedClipId=state.selectedClipIds[state.selectedClipIds.length-1]||null;
    } else {
      state.selectedClipId=id;
      state.selectedClipIds=groupIds;
    }
  }
  function autoLanes(){ if(!state.project) return; for(const c of state.project.clips||[]) c.lane=clamp(c.lane??0,0,LANE_COUNT-1); state.project.lanes=Array.from({length:LANE_COUNT},(_,i)=>({id:`lane_${i}`,index:i,locked:!!state.lockedLanes[i],visible:!state.hiddenLanes[i]})); }
  function setLaneState(index, patch){
    if(!state.project) return;
    const i=Number(index);
    if(patch.locked !== undefined) state.lockedLanes[i]=!!patch.locked;
    if(patch.visible !== undefined) state.hiddenLanes[i]=!patch.visible;
    autoLanes();
    const row=document.querySelector(`.lane[data-lane="${i}"]`);
    if(row){ row.classList.add('state-refresh'); setTimeout(()=>row.classList.remove('state-refresh'),140); }
    renderTimeline();
    updatePreview();
    updateProps();
    updateControls();
  }

  function resamplePeaks(peaks, count){
    if(!Array.isArray(peaks) || !peaks.length) return [];
    count = Math.max(16, Math.min(640, Math.round(count || 160)));
    if(peaks.length === count) return peaks;
    const out=[];
    for(let i=0;i<count;i++){
      const a=Math.floor(i*peaks.length/count);
      const b=Math.max(a+1, Math.floor((i+1)*peaks.length/count));
      let peak=0;
      for(let j=a;j<b && j<peaks.length;j++) peak=Math.max(peak, Math.abs(Number(peaks[j])||0));
      out.push(Math.max(0, Math.min(1, peak)));
    }
    return out;
  }
  function beatTicksMarkup(c){
    const beats=beatFramesForClip(c);
    if(!beats.length) return '';
    return `<div class="beat-ticks">${beats.map(bf=>`<i style="left:${((bf-c.start)*state.pxPerFrame).toFixed(1)}px"></i>`).join('')}</div>`;
  }
  function waveformMarkup(c){
    if(!audioCapable(c)) return '';
    const m=mediaFor(c) || c;
    const peaks=m.waveform || c.waveform;
    if(Array.isArray(peaks) && peaks.length) return '<canvas class="wf-canvas"></canvas>';
    return '<div class="waveform waveform-loading" title="Real waveform cache pending"></div>';
  }
  // Draws a real, screen-pixel-dense amplitude envelope (one column per device
  // pixel, mirrored around the vertical center) instead of one DOM element per
  // source frame — the old per-frame <i> bars were sub-pixel wide on anything
  // longer than a few seconds and rendered as illegible gray noise rather than
  // a recognizable waveform shape.
  function drawClipWaveform(canvas,c){
    const m=mediaFor(c) || c;
    const peaks=m.waveform || c.waveform;
    if(!Array.isArray(peaks) || !peaks.length) return;
    // .clip-bars (canvas's parent) has a fixed 8px left/right inset; a <canvas>
    // is a replaced element, so CSS "width:auto" between left/right offsets does
    // NOT stretch it like a normal div — it silently falls back to intrinsic
    // canvas size. So the canvas must be sized explicitly here, in real CSS
    // pixels, from the .clip element's own width (not the padded parent).
    const clipEl=canvas.closest('.clip');
    const clipRect=(clipEl||canvas).getBoundingClientRect();
    const barsRect=canvas.parentElement.getBoundingClientRect();
    const cssW=Math.max(1, Math.round(clipRect.width));
    const cssH=Math.max(1, Math.round(barsRect.height));
    canvas.style.width=`${cssW}px`;
    canvas.style.height=`${cssH}px`;
    const dpr=window.devicePixelRatio || 1;
    canvas.width=Math.max(1, Math.round(cssW*dpr));
    canvas.height=Math.max(1, Math.round(cssH*dpr));
    const ctx=canvas.getContext('2d');
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,cssW,cssH);
    const sourceTotal=Math.max(1, Number(m.total_frames || c.source_total_frames || c.source_out || c.length || peaks.length));
    const srcIn=Math.max(0, Math.min(sourceTotal-1, Math.round(Number(c.source_in || 0))));
    const length=Math.max(1, Math.min(Math.round(Number(c.length || 1)), sourceTotal-srcIn));
    ctx.fillStyle = c.kind==='audio' ? 'rgba(205,255,235,.92)' : 'rgba(238,222,255,.92)';
    const mid=cssH/2;
    for(let x=0;x<cssW;x++){
      const frameA = srcIn + (x/cssW)*length;
      const frameB = srcIn + ((x+1)/cssW)*length;
      const a=Math.max(0, Math.min(peaks.length-1, Math.floor(frameA/sourceTotal*peaks.length)));
      const b=Math.max(a+1, Math.min(peaks.length, Math.ceil(frameB/sourceTotal*peaks.length)));
      let peak=0;
      for(let j=a;j<b;j++){ const v=Math.abs(Number(peaks[j])||0); if(v>peak) peak=v; }
      const h=Math.max(1, peak*mid);
      ctx.fillRect(x, mid-h, 1, h*2);
    }
  }
  function drawAllWaveforms(){
    document.querySelectorAll('#lanes .wf-canvas').forEach(canvas=>{
      const clipEl=canvas.closest('.clip');
      const c=clipEl && findClip(clipEl.dataset.clipId);
      if(c) drawClipWaveform(canvas,c);
    });
  }
  async function ensureWaveform(item){
    if(!item || item.waveform || item.waveformLoading || !['video','audio'].includes(item.kind) || !item.path) return;
    item.waveformLoading = true;
    try{
      const bars = Math.max(240, Math.min(1200, Math.round((item.total_frames || totalFrames()) * 2))); // dense source-aligned peak cache
      const data = await api('/itda/api/waveform', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project:state.project?.name||'itda-project-1', path:item.path, bars})
      });
      item.waveformLoading = false;
      if(data && data.ok && Array.isArray(data.peaks)){
        item.waveform = data.peaks;
        item.waveform_cache_path = data.cache_path || null;
        renderTimeline();
        renderMedia();
      } else {
        item.waveform = [];
        status(`Waveform unavailable: ${item.name}`);
      }
    }catch(e){
      item.waveformLoading = false;
      item.waveform = [];
      status(`Waveform failed: ${item.name} · ${e.message}`);
    }
  }
  function renderRuler(){ const ruler=$('ruler'); ruler.innerHTML=''; const total=maxFrame(); ruler.style.width=`${LEFT_PAD+total*state.pxPerFrame+500}px`; const major=Math.max(1,Math.round(fps())); const minor=Math.max(1,Math.round(major/4)); for(let f=0; f<=total; f+=minor){ const tick=document.createElement('div'); const isMajor=f%major===0; tick.className=isMajor?'tick':'tick minor'; tick.style.left=`${LEFT_PAD+f*state.pxPerFrame}px`; if(isMajor) tick.innerHTML=`${fmtTime(f).slice(0,5)}<span class="sub">${Math.round(f)}f</span>`; ruler.appendChild(tick); } const projectEnd=document.createElement('div'); projectEnd.className='total-frame-marker'; projectEnd.style.left=`${LEFT_PAD+totalFrames()*state.pxPerFrame}px`; projectEnd.innerHTML='<span>END</span>'; ruler.appendChild(projectEnd); }
  function renderTimeline(){ if(!state.project) return; autoLanes(); renderRuler(); const lanes=$('lanes'); lanes.innerHTML=''; lanes.style.width=$('ruler').style.width; lanes.style.height=`${LANE_COUNT*laneH()}px`; $('rangeLayer').style.height=`${LANE_COUNT*laneH()}px`;
    for(const lane of state.project.lanes){
      const row=document.createElement('div');
      row.className=`lane ${lane.locked?'locked':''} ${!lane.visible?'hidden-lane preview-off':''}`;
      row.dataset.lane=lane.index;
      row.style.height=`${laneH()}px`;
      const visIcon = lane.visible ? '👁' : '◌';
      const lockIcon = lane.locked ? '🔒' : '🔓';
      const visTitle = lane.visible ? 'Preview ON - click to disable' : 'Preview OFF - click to enable';
      const lockTitle = lane.locked ? 'Track Locked - click to unlock' : 'Track Unlocked - click to lock';
      row.innerHTML=`<div class="lane-label"><div class="lane-name">T${lane.index+1}</div><span class="tools"><button class="lane-tool vis ${lane.visible?'on':'off'}" data-vis="${lane.index}" title="${visTitle}" aria-pressed="${lane.visible?'true':'false'}">${visIcon}</button><button class="lane-tool lock ${lane.locked?'on':'off'}" data-lock="${lane.index}" title="${lockTitle}" aria-pressed="${lane.locked?'true':'false'}">${lockIcon}</button></span></div>`;
      lanes.appendChild(row);
    }
    lanes.querySelectorAll('[data-lock]').forEach(b=>b.onclick=e=>{e.preventDefault(); e.stopPropagation(); const i=Number(b.dataset.lock); setLaneState(i,{locked:!state.lockedLanes[i]}); status(`T${i+1} ${state.lockedLanes[i]?'locked':'unlocked'}`);});
    lanes.querySelectorAll('[data-vis]').forEach(b=>b.onclick=e=>{e.preventDefault(); e.stopPropagation(); const i=Number(b.dataset.vis); setLaneState(i,{visible:!!state.hiddenLanes[i]}); status(`T${i+1} preview ${state.hiddenLanes[i]?'OFF':'ON'}`);});
    const hasSel=state.selectedClipIds.length>0;
    for(const c of state.project.clips||[]){ normalizeClipBounds(c); const row=lanes.children[c.lane]; if(!row) continue; const el=document.createElement('div'); const stitched=!!(c.kind==='stitched'||c.children); el.className=`clip ${c.kind||'video'} ${c.group_id?'grouped':''} ${stitched?'stitched':''} ${isSelected(c.id)?'selected':''} ${hasSel&&!isSelected(c.id)?'dimmed':''}`; el.dataset.clipId=c.id; el.style.left=`${LEFT_PAD+c.start*state.pxPerFrame}px`; el.style.width=`${Math.max(32,c.length*state.pxPerFrame)}px`; el.style.height=`${Math.max(34,laneH()-19)}px`; el.title=`${c.name}
Trim ${c.source_in||0}f–${c.source_out||c.length}f
Timeline ${c.start}f–${c.start+c.length}f`; const icon=stitched?'◆':c.kind==='audio'?'♫':c.kind==='image'?'▧':c.kind==='text'?'T':'▣'; el.innerHTML=`<div class="clip-title"><span class="clip-name">${icon} ${esc(trunc(c.name,24))}</span>${['video','audio'].includes(c.kind) ? `<span class="clip-audio-icon ${c.audio_enabled===false?'off':'on'}" title="${c.audio_enabled===false?'Audio Off':'Audio On'}">${c.audio_enabled===false?'\u{1F507}':'\u{1F50A}'}</span>` : ''}<span class="clip-trim">${c.source_in||0}f to ${c.source_out||c.length}f / ${fmtTime(c.length)}</span></div><div class="clip-bars">${waveformMarkup(c)}</div>${beatTicksMarkup(c)}<div class="clip-handle left" data-trim="left"></div><div class="clip-handle right" data-trim="right"></div>`; el.addEventListener('pointerdown', startClipPointer); row.appendChild(el); }
    renderRange(); updatePlayhead(); drawAllWaveforms(); }
  function renderRange(){ const layer=$('rangeLayer'); layer.innerHTML=''; if(state.range.start==null || state.range.end==null) return; const a=Math.min(state.range.start,state.range.end), b=Math.max(state.range.start,state.range.end); const box=document.createElement('div'); box.className='range-box'; box.style.left=`${LEFT_PAD+a*state.pxPerFrame}px`; box.style.width=`${Math.max(1,(b-a)*state.pxPerFrame)}px`; layer.appendChild(box); }
  function updatePlayhead(){
    const ph=$('playhead');
    ph.style.left=`${LEFT_PAD+state.currentFrame*state.pxPerFrame}px`;
    ph.style.height=`${48 + LANE_COUNT * laneH()}px`;
    $('frameLabel').textContent=`Frame ${Math.round(state.currentFrame)}`;
    $('timeLabel').textContent=fmtTime(state.currentFrame);
    updatePreview(); updatePlaybackAudio(); scheduleAudioScrub();
  }

  function startClipPointer(e){
    e.preventDefault(); e.stopPropagation();
    const el=e.currentTarget; const c=findClip(el.dataset.clipId); if(!c || state.lockedLanes[c.lane]) return;
    const trim=e.target?.dataset?.trim;
    const additive=e.ctrlKey||e.metaKey;
    if(e.shiftKey && state.selectedClipId && state.selectedClipId!==c.id){
      // Range-select: everything spanning the time x lane rectangle between
      // the last-selected clip (anchor) and the shift-clicked one - same
      // rectangle-intersection rule as drag Box Select, just anchored by a
      // click instead of a mouse-drag corner.
      const anchor=findClip(state.selectedClipId);
      if(anchor){
        const frameLo=Math.min(anchor.start,c.start), frameHi=Math.max(clipEnd(anchor),clipEnd(c));
        const laneLo=Math.min(anchor.lane,c.lane), laneHi=Math.max(anchor.lane,c.lane);
        const hits=(state.project?.clips||[]).filter(x=>x.lane>=laneLo && x.lane<=laneHi && x.start<frameHi && clipEnd(x)>frameLo);
        if(hits.length){ setSelection(hits[0].id,false); for(let i=1;i<hits.length;i++) setSelection(hits[i].id,true); }
      }
    }
    else if(additive) setSelection(c.id,true);
    else if(!isSelected(c.id)) setSelection(c.id,false);
    const dragClips = selectedClips();
    state.drag={
      clipId:c.id,startX:e.clientX,startY:e.clientY,origStart:c.start,origLen:c.length,origSourceIn:c.source_in||0,origLane:c.lane,trim,moved:false,
      items:dragClips.map(x=>({id:x.id,start:x.start,lane:x.lane,length:x.length,source_in:x.source_in||0,source_out:x.source_out||x.length}))
    };
    renderTimeline(); updateProps(); updateControls(); updatePreview();
    document.addEventListener('pointermove', onClipPointer, {passive:false});
    document.addEventListener('pointerup', endClipPointer, {once:true});
  }
  // Snap means "magnetically attach to a neighboring clip's edge," not "only
  // allow moving in fixed N-frame increments." There is no grid fallback:
  // with snap on, a clip within reach of another clip's start/end attaches to
  // it exactly; otherwise it moves at plain frame-accurate (unsnapped)
  // precision, same as with snap off.
  // Peak Match: local maxima in a clip's cached waveform (item.waveform, from
  // ensureWaveform), mapped from source-frame position to this clip instance's
  // absolute timeline position - i.e. "where a transient/beat in this clip's
  // audio actually lands once placed on the timeline," clipped to the portion
  // of the source currently visible through this clip's trim (source_in/out).
  function peakFramesForClip(c){
    if(!audioCapable(c)) return [];
    const m=mediaFor(c) || c;
    const peaks=m.waveform;
    if(!Array.isArray(peaks) || peaks.length<3) return [];
    const sourceTotal=Math.max(1, Number(m.total_frames || c.source_total_frames || c.length || peaks.length));
    const srcIn=Number(c.source_in||0), srcOut=Number(c.source_out||c.length);
    const out=[];
    for(let i=1;i<peaks.length-1;i++){
      const v=Math.abs(Number(peaks[i])||0);
      if(v<0.4) continue;
      if(v>=Math.abs(peaks[i-1]) && v>=Math.abs(peaks[i+1])){
        const srcFrame=(i/peaks.length)*sourceTotal;
        if(srcFrame>=srcIn && srcFrame<srcOut) out.push(c.start+(srcFrame-srcIn));
      }
    }
    return out;
  }
  // Detected beats (AI Detect -> Beat Detect, librosa-backed) live on the
  // media item as SOURCE frame numbers, since they describe the underlying
  // audio, not any one clip's placement - same source/timeline remap as
  // peakFramesForClip. These are real tracked beats rather than raw waveform
  // maxima, so they're the better snap target when available.
  function beatFramesForClip(c){
    if(!audioCapable(c)) return [];
    const m=mediaFor(c) || c;
    const beats=m.beats;
    if(!Array.isArray(beats) || !beats.length) return [];
    const srcIn=Number(c.source_in||0), srcOut=Number(c.source_out||c.length);
    return beats.filter(bf=>bf>=srcIn && bf<srcOut).map(bf=>c.start+(bf-srcIn));
  }
  function snapMoveStart(rawStart, length, excludeIds){
    if(!state.snap) return Math.round(rawStart);
    const thresholdFrames = Math.max(4, 14/state.pxPerFrame);
    let bestEdge=null, bestEdgeDist=Infinity;
    for(const o of (state.project?.clips||[])){
      if(excludeIds.has(o.id)) continue;
      const cands=[o.start, clipEnd(o), o.start-length, clipEnd(o)-length];
      if(state.peakSnap){
        for(const pf of peakFramesForClip(o)){ cands.push(pf, pf-length); }
        for(const bf of beatFramesForClip(o)){ cands.push(bf, bf-length); }
      }
      for(const cand of cands){
        const d=Math.abs(cand-rawStart);
        if(d<=thresholdFrames && d<bestEdgeDist){ bestEdge=cand; bestEdgeDist=d; }
      }
    }
    return bestEdge!=null ? Math.max(0, Math.round(bestEdge)) : Math.max(0, Math.round(rawStart));
  }
  function wouldOverlap(id,lane,start,length, extra=[]){
    const end=start+length;
    const clips=[...(state.project?.clips||[]), ...extra];
    return clips.some(o=>o.id!==id && o.lane===lane && start<clipEnd(o) && end>o.start);
  }
  function fitSingleMove(c, proposedStart, proposedLane, dxFrames){
    let ns=Math.max(0, proposedStart), lane=clamp(proposedLane,0,LANE_COUNT-1);
    if(!wouldOverlap(c.id,lane,ns,c.length)) return {start:ns,lane};
    const others=(state.project?.clips||[]).filter(o=>o.id!==c.id && o.lane===lane).sort((a,b)=>a.start-b.start);
    if(dxFrames>=0){
      for(const o of others){ if(ns < clipEnd(o) && ns+c.length > o.start) ns=clipEnd(o); }
    }else{
      for(const o of [...others].reverse()){ if(ns < clipEnd(o) && ns+c.length > o.start) ns=o.start-c.length; }
    }
    ns=Math.max(0,ns);
    return wouldOverlap(c.id,lane,ns,c.length) ? {start:c.start,lane:c.lane} : {start:ns,lane};
  }
  function canPlaceGroup(proposals){
    const ids=new Set(proposals.map(p=>p.id));
    for(const p of proposals){ if(p.start<0 || p.lane<0 || p.lane>=LANE_COUNT || state.lockedLanes[p.lane]) return false; }
    for(let i=0;i<proposals.length;i++) for(let j=i+1;j<proposals.length;j++){
      const a=proposals[i], b=proposals[j]; if(a.lane===b.lane && a.start < b.start+b.length && a.start+a.length > b.start) return false;
    }
    for(const p of proposals){
      if((state.project?.clips||[]).some(o=>!ids.has(o.id) && o.lane===p.lane && p.start < clipEnd(o) && p.start+p.length > o.start)) return false;
    }
    return true;
  }
  function onClipPointer(e){
    if(!state.drag) return; e.preventDefault();
    const c=findClip(state.drag.clipId); if(!c) return;
    const dxFrames=Math.round((e.clientX-state.drag.startX)/state.pxPerFrame);
    if(Math.abs(e.clientX-state.drag.startX)>2 || Math.abs(e.clientY-state.drag.startY)>2) state.drag.moved=true;
    if(state.drag.trim==='left'){
      const oldEnd=state.drag.origStart+state.drag.origLen;
      let ns=clamp(trimFrame(state.drag.origStart+dxFrames),0,oldEnd-1);
      let diff=ns-state.drag.origStart;
      let srcIn=Math.max(0,Math.round(state.drag.origSourceIn+diff));
      if(isTimeBoundClip(c)) srcIn=Math.min(sourceTotalFrames(c)-1,srcIn);
      let newLen=Math.max(1,oldEnd-ns);
      const maxLen=maxClipLength(c,srcIn);
      if(newLen>maxLen){ newLen=maxLen; ns=oldEnd-newLen; diff=ns-state.drag.origStart; srcIn=Math.max(0,Math.round(state.drag.origSourceIn+diff)); if(isTimeBoundClip(c)) srcIn=Math.min(sourceTotalFrames(c)-1,srcIn); }
      if(!wouldOverlap(c.id,c.lane,ns,newLen)){ c.start=ns; c.length=newLen; c.source_in=srcIn; c.source_out=c.source_in+c.length; normalizeClipBounds(c); }
    } else if(state.drag.trim==='right'){
      let newLen=Math.max(1,trimFrame(state.drag.origLen+dxFrames));
      newLen=Math.min(newLen,maxClipLength(c,c.source_in||0));
      if(!wouldOverlap(c.id,c.lane,c.start,newLen)){ c.length=newLen; c.source_out=(c.source_in||0)+c.length; normalizeClipBounds(c); }
    } else {
      const targetLane=laneFromClientY(e.clientY);
      const laneDelta=targetLane-state.drag.origLane;
      const movingSelected=state.drag.items.length>1 && isSelected(c.id);
      if(movingSelected){
        // Snap the dragged (primary) clip's edge to the nearest grid/neighbor
        // target, then shift the whole group by that same amount so their
        // relative spacing to each other doesn't change.
        const excludeIds=new Set(state.drag.items.map(it=>it.id));
        const primarySnapped=snapMoveStart(state.drag.origStart+dxFrames, c.length, excludeIds);
        const snapDx=primarySnapped-state.drag.origStart;
        const proposals=state.drag.items.map(it=>({id:it.id,start:Math.max(0,Math.round(it.start+snapDx)),lane:clamp(it.lane+laneDelta,0,LANE_COUNT-1),length:it.length}));
        if(canPlaceGroup(proposals)) proposals.forEach(p=>{ const clip=findClip(p.id); if(clip){clip.start=p.start; clip.lane=p.lane;} });
      } else {
        const target=snapMoveStart(state.drag.origStart+dxFrames, c.length, new Set([c.id]));
        const fitted=fitSingleMove(c,target,targetLane,dxFrames);
        c.start=fitted.start; c.lane=fitted.lane;
      }
    }
    renderTimeline(); updateProps(); updatePlayhead();
  }
  function endClipPointer(e){ document.removeEventListener('pointermove',onClipPointer); state.drag=null; renderAll(); }
  function frameFromTimelineEvent(e){ const rect=$('timeline').getBoundingClientRect(); return clamp(Math.round((e.clientX-rect.left+$('timeline').scrollLeft-LEFT_PAD)/state.pxPerFrame),0,maxFrame()); }
  // #lanes is a normal-flow (non-sticky) child, so its own getBoundingClientRect()
  // already reflects the current scroll position - it visually shifts as
  // #timeline scrolls, unlike #timeline's own rect (which never moves for its
  // own internal scrolling). Adding scrollTop again here double-counts it and
  // drifts the hit-test away from the cursor by exactly that scroll amount.
  function laneFromClientY(y){ const rect=$('lanes').getBoundingClientRect(); return clamp(Math.floor((y-rect.top)/laneH()),0,LANE_COUNT-1); }
  function laneFromTimelineEvent(e){ return laneFromClientY(e.clientY); }

  function childClipAtFrame(stitched, frame, kinds=null){
    if(!stitched?.children) return null;
    const local=frame-stitched.start;
    const child=(stitched.children||[]).filter(ch=>local>=ch.rel_start && local<ch.rel_start+ch.length && (!kinds || kinds.includes(ch.kind))).sort((a,b)=>(a.lane??0)-(b.lane??0))[0];
    if(!child) return null;
    return {...child,id:`${stitched.id}:${child.id}`,start:stitched.start+child.rel_start,media_id:child.media_id,path:child.path,url:child.url};
  }
  function activeClipsAtFrame(frame){ return (state.project?.clips||[]).filter(c=>frame>=c.start && frame<clipEnd(c) && !state.hiddenLanes[c.lane]).sort((a,b)=>a.lane-b.lane); }
  function topVisualClip(frame){
    const base = topBaseVisualClip(frame);
    return base || topTextClip(frame);
  }
  function topBaseVisualClip(frame){
    for(const c of activeClipsAtFrame(frame)){
      if(c.kind==='stitched'||c.children){ const ch=childClipAtFrame(c,frame,['video','image']); if(ch) return ch; }
      if(['video','image'].includes(c.kind)) return c;
    }
    return null;
  }
  function topTextClip(frame){
    for(const c of activeClipsAtFrame(frame)){
      if(c.kind==='stitched'||c.children){ const ch=childClipAtFrame(c,frame,['text']); if(ch) return ch; }
      if(c.kind==='text') return c;
    }
    return null;
  }
  function topAudioClip(frame){
    for(const c of activeClipsAtFrame(frame)){
      if(c.kind==='stitched'||c.children){ const ch=childClipAtFrame(c,frame,['video','audio']); if(ch && ch.audio_enabled!==false) return ch; }
      if(['video','audio'].includes(c.kind) && c.audio_enabled!==false) return c;
    }
    return null;
  }
  // A pre-render is only valid for the exact timeline it was baked from, so
  // it carries a signature of everything that can change what the composite
  // looks or sounds like. Any edit changes the signature and the cache stops
  // being used - silently showing a stale render would be worse than the
  // stutter pre-rendering exists to remove.
  function projectSignature(){
    return (state.project?.clips||[]).map(c=>
      `${c.id}|${c.lane}|${c.start}|${c.length}|${c.source_in}|${c.source_out}|${c.path||c.url||''}|${c.kind}|${c.text||''}|${c.x}|${c.y}|${c.size}|${c.opacity}|${c.color}|${c.font_family}|${c.shadow_enabled}|${c.shadow_color}|${c.shadow_opacity}|${c.audio_enabled}|${c.volume}|${c.solo}`
    ).join(';');
  }
  function prerenderStale(){
    return !!state.prerender && state.prerender.signature !== projectSignature();
  }
  function activePrerender(){
    const pr=state.prerender;
    if(!pr || prerenderStale()) return null;
    if(state.currentFrame < pr.start_frame || state.currentFrame >= pr.end_frame) return null;
    return pr;
  }
  function updatePreview(){ const pv=$('previewVideo'), pvb=$('previewVideoB'); if(pv && document.activeElement!==pv) pv.controls=false; if(pvb) pvb.controls=false;
    const stage=$('previewStage'); const v=$('previewVideo'), vB=$('previewVideoB'), img=$('previewImage'), imgB=$('previewImageB'), t=$('textOverlay'), tB=$('textOverlayB');
    stage.className='preview-stage'; [v,vB,img,imgB].forEach(el=>{el.style.display='';}); clearTextOverlay(t); clearTextOverlay(tB);

    // Pre-rendered range: one already-composited file replaces the whole
    // layer stack (and its baked-in mix replaces the per-clip audio monitor).
    // Only in Single - Compare/Overlay/Wipe are about seeing two specific
    // clips, which a flattened composite cannot show.
    const pr = state.previewMode==='single' ? activePrerender() : null;
    if(pr){
      const src=pr.url;
      if(v.dataset.src!==src){ v.pause(); v.removeAttribute('src'); v.load(); v.src=src; v.dataset.src=src; }
      [vB,img,imgB].forEach(x=>{ if(x){ x.pause?.(); x.removeAttribute('src'); if(x.dataset) x.dataset.src=''; x.load?.(); } });
      const local=(state.currentFrame - pr.start_frame)/fps();
      if(Number.isFinite(local) && Math.abs((v.currentTime||0)-local)>.08){ try{ v.currentTime=local; }catch{} }
      v.muted=state.mute; v.volume=state.monitorVolume;
      stage.classList.add('has-content','has-primary-video','prerendered');
      updatePlaybackAudio();
      return;
    }

    let primary=null, secondary=null, overlayText=null; const sel=selectedClips();
    if(state.previewMode==='wipe' && state.versionCompareClips && state.versionCompareClips.length===2){ [primary,secondary]=state.versionCompareClips; }
    else if((state.previewMode==='compare'||state.previewMode==='overlay'||state.previewMode==='wipe') && sel.length===2){ [primary,secondary]=sel; }
    else {
      // Normal Preview = layer renderer, not selected-clip renderer.
      // Text clips are transparent overlays over the highest video/image layer below them.
      primary=topBaseVisualClip(state.currentFrame);
      // While a text clip is selected (being edited in Clip Properties), keep
      // showing ITS live values even if the playhead sits outside its range or
      // another text clip has layer priority there — otherwise every commit
      // (onchange/onblur) snaps the overlay back to whatever's under the
      // playhead, making edits look like they silently revert.
      const selForText=selectedClip();
      overlayText=(selForText && selForText.kind==='text') ? selForText : topTextClip(state.currentFrame);
      secondary=null;
    }
    if(!primary){ [v,vB].forEach(x=>{x.pause(); x.removeAttribute('src'); x.dataset.src=''; x.load();}); [img,imgB].forEach(x=>x.removeAttribute('src')); }
    else loadPreviewForClip(primary,v,img,t);
    if(overlayText){ loadTextOverlay(overlayText,t); stage.classList.add('has-text'); }
    if(secondary) loadPreviewForClip(secondary,vB,imgB,tB,true);
    if(primary || overlayText) stage.classList.add('has-content');
    if(primary?.kind==='video') stage.classList.add('has-primary-video'); if(primary?.kind==='image') stage.classList.add('has-primary-image');
    if(secondary?.kind==='video') stage.classList.add('has-secondary-video'); if(secondary?.kind==='image') stage.classList.add('has-secondary-image'); if(secondary?.kind==='text') stage.classList.add('has-text-b');
    if(state.previewMode==='compare' && secondary) stage.classList.add('compare'); if(state.previewMode==='overlay' && secondary) stage.classList.add('overlay'); if(state.previewMode==='wipe' && secondary){ stage.classList.add('wipe'); stage.style.setProperty('--wipe-pos', `${state.wipePos}%`); }
    updateAudioMonitor();
  }
  function clearTextOverlay(textEl){
    if(!textEl) return;
    textEl.textContent='';
    textEl.style.display='';
  }
  function loadTextOverlay(c, textEl){
    if(!textEl || !c) return;
    textEl.textContent=c.text||c.name||'Text';
    textEl.style.left=`${c.x??50}%`;
    textEl.style.bottom=`${100-(c.y??88)}%`;
    textEl.style.fontSize=`${c.size||42}px`;
    textEl.style.opacity=c.opacity??1;
    textEl.style.color=c.color||'#ffffff';
    textEl.style.fontFamily=(c.font_family && c.font_family !== 'system') ? `'${String(c.font_family).replace(/'/g,"\'")}', sans-serif` : 'Inter, Segoe UI, Arial, sans-serif';
    textEl.style.background='transparent';
    if(c.shadow_enabled){
      const alpha = Math.max(0, Math.min(1, Number(c.shadow_opacity ?? 0.6)));
      const hex = c.shadow_color || '#000000';
      textEl.style.textShadow = `0 2px 4px ${hex}${Math.round(alpha*255).toString(16).padStart(2,'0')}, 0 0 8px ${hex}${Math.round(alpha*210).toString(16).padStart(2,'0')}`;
    }else{
      textEl.style.textShadow = 'none';
    }
  }
  function loadPreviewForClip(c, videoEl, imgEl, textEl, secondary=false){
    if(c.kind==='stitched'||c.children){ const ch=childClipAtFrame(c,state.currentFrame,['video','image','text']); if(ch) return loadPreviewForClip(ch,videoEl,imgEl,textEl,secondary); }
    const m=monitorMediaFor(c); const src=fileUrl(m);
    clearTextOverlay(textEl);
    if(c.kind==='video'){
      if(imgEl) imgEl.removeAttribute('src');
      if(videoEl.dataset.src!==src){ videoEl.pause(); videoEl.removeAttribute('src'); videoEl.load(); videoEl.src=src; videoEl.dataset.src=src; videoEl.onerror=()=>status('Preview video load failed'); }
      videoEl.volume = clamp(state.monitorVolume * ((c.volume??100)/100), 0, 1); videoEl.muted = secondary || state.mute || audioMutedForClip(c); seekElementToFrame(videoEl,c,state.currentFrame);
    } else if(c.kind==='image'){
      if(videoEl){ videoEl.pause(); videoEl.removeAttribute('src'); videoEl.dataset.src=''; videoEl.load(); }
      if(imgEl.src!==src) imgEl.src=src;
    } else if(c.kind==='text'){
      if(videoEl){ videoEl.pause(); videoEl.removeAttribute('src'); videoEl.dataset.src=''; videoEl.load(); }
      if(imgEl) imgEl.removeAttribute('src');
      loadTextOverlay(c,textEl);
    }
  }
  function seekElementToFrame(video,c,frame){ if(!video.src) return; const local=Math.max(0,(frame-c.start+(c.source_in||0))/(c.fps||fps())); if(Number.isFinite(local) && Math.abs((video.currentTime||0)-local)>.08){ try{ video.currentTime=local; }catch{} } }
  // Stitched clips get resolved (via childClipAtFrame) into synthetic child
  // objects whose id is `${stitched.id}:${child.id}` - a different string
  // than the top-level clip's own id. Matching must tolerate that compound
  // form, or every solo/selection check below silently falls through.
  function idMatches(topId, resolvedId){
    return resolvedId===topId || (typeof resolvedId==='string' && resolvedId.startsWith(topId+':'));
  }
  function audioMutedForClip(c){
    if(c.audio_enabled===false) return true;
    if(state.mute) return true;
    // Solo is a persistent per-clip flag, independent of selection - once any
    // clip is soloed, only soloed clips are audible regardless of what's
    // selected (unlike the selection-based monitor rule below).
    const soloed=(state.project?.clips||[]).filter(x=>x.solo && x.audio_enabled!==false);
    if(soloed.length) return !soloed.some(x=>idMatches(x.id,c.id));
    const sel=selectedClips();
    if(sel.length===0){ const top=topAudioClip(state.currentFrame); return !top || !idMatches(top.id,c.id); }
    if(sel.length===1) return !idMatches(sel[0].id,c.id);
    if(sel.length===2) return !sel.some(x=>idMatches(x.id,c.id));
    return true;
  }
  function clipAudibleAtFrame(c, frame=state.currentFrame){
    if(!c || !audioCapable(c)) return false;
    if(state.hiddenLanes[c.lane]) return false;
    const local = frame - c.start;
    if(local < 0 || local >= c.length) return false;
    const srcIn = Number(c.source_in || 0);
    const srcOut = Number(c.source_out || (srcIn + c.length));
    return srcIn + local < srcOut;
  }
  function monitoredAudioClips(){
    if(state.mute) return [];
    // Solo is a persistent per-clip flag that overrides selection entirely -
    // matches the export-time behavior in export.py and the primary-preview
    // rule in audioMutedForClip.
    const soloed=(state.project?.clips||[]).filter(x=>x.solo && x.audio_enabled!==false && ['video','audio'].includes(x.kind));
    if(soloed.length) return soloed.filter(c=>clipAudibleAtFrame(c)).slice(0,2);
    const selAll=selectedClips().filter(c=>['video','audio'].includes(c.kind));
    if(selAll.length===1) return selAll.filter(c=>clipAudibleAtFrame(c));
    if(selAll.length===2) return selAll.filter(c=>clipAudibleAtFrame(c));
    if(selAll.length>=3) return [];
    const top=topAudioClip(state.currentFrame);
    return top && clipAudibleAtFrame(top) ? [top] : [];
  }
  function updateAudioMonitor(){
    const v=$('previewVideo'), vB=$('previewVideoB');
    [v,vB].forEach(x=>{ if(x){ x.volume=state.monitorVolume; x.muted=true; }});
    updatePlaybackAudio();
  }
  function ensurePlaybackAudioElements(){
    if(state.monitorAudios) return state.monitorAudios;
    state.monitorAudios=[new Audio(),new Audio()];
    state.monitorAudios.forEach(a=>{a.preload='auto'; a.volume=state.monitorVolume;});
    return state.monitorAudios;
  }
  function syncAudioElement(a,c,autoplay){
    if(!c || !clipAudibleAtFrame(c)){ a.pause(); if(!c){ a.removeAttribute('src'); a.dataset.src=''; } return; }
    const m=monitorMediaFor(c), src=fileUrl(m); if(!src){ a.pause(); return; }
    if(a.dataset.src!==src){ a.pause(); a.src=src; a.dataset.src=src; a.load(); }
    const sec=Math.max(0,(state.currentFrame-c.start+(c.source_in||0))/(c.fps||fps()));
    if(Number.isFinite(sec) && Math.abs((a.currentTime||0)-sec)>.12){ try{ a.currentTime=sec; }catch{} }
    const gain=Math.max(0, (c.volume??100)/100);
    a.volume=clamp(state.monitorVolume * gain, 0, 1); a.muted=state.mute || state.monitorVolume<=0;
    if(autoplay && !a.muted){ a.play().catch(()=>{}); } else if(!autoplay){ a.pause(); }
  }
  function updatePlaybackAudio(){
    const els=ensurePlaybackAudioElements();
    // The pre-rendered file already contains the finished mix, so the
    // per-clip monitor would double every sound on top of it.
    if(activePrerender()){ els.forEach(a=>a.pause()); return; }
    const clips=monitoredAudioClips().slice(0,2);
    els.forEach((a,i)=>syncAudioElement(a,clips[i],state.playing));
  }

  function startPlaybackClock(){
    state.playStartFrame=state.currentFrame;
    state.playStartedAt=performance.now();
    cancelAnimationFrame(state.playRaf);
    const tick=()=>{
      if(!state.playing) return;
      const elapsed=(performance.now()-state.playStartedAt)/1000;
      let next=state.playStartFrame + Math.floor(elapsed*fps());
      if(state.loop && state.range.start!=null && state.range.end!=null){
        const a=Math.min(state.range.start,state.range.end), b=Math.max(state.range.start,state.range.end);
        if(b>a && next>=b){
          const span=b-a;
          next=a + ((next-a) % span);
          state.playStartFrame=next;
          state.playStartedAt=performance.now();
        }
      }
      if(next>=maxFrame()){
        state.currentFrame=maxFrame();
        stopPlaybackClock();
        updatePlayhead();
        return;
      }
      if(next!==state.currentFrame){ state.currentFrame=next; updatePlayhead(); }
      state.playRaf=requestAnimationFrame(tick);
    };
    state.playRaf=requestAnimationFrame(tick);
  }
  function stopPlaybackClock(){
    state.playing=false;
    cancelAnimationFrame(state.playRaf);
    $('playPause').textContent='▶';
    $('previewVideo').pause(); $('previewVideoB').pause(); (state.monitorAudios||[]).forEach(a=>a.pause());
  }
  function togglePlay(){
    const v=$('previewVideo'), vB=$('previewVideoB');
    if(!state.playing){
      if(v && !v.muted) v.play().catch(()=>{});
      if(state.previewMode!=='single' && vB && !vB.muted) vB.play().catch(()=>{});
      updatePlaybackAudio();
      state.playing=true;
      $('playPause').textContent='❚❚';
      startPlaybackClock();
    } else {
      stopPlaybackClock();
    }
  }
  function ensureScrubAudioElements(){ if(state.scrubAudios) return state.scrubAudios; state.scrubAudios=[new Audio(),new Audio()]; state.scrubAudios.forEach(a=>{a.preload='auto'; a.volume=state.monitorVolume;}); return state.scrubAudios; }
  function scheduleAudioScrub(){ if(state.playing || state.mute || !state.scrubAudio) return; clearTimeout(state.audioScrubTimer); state.audioScrubTimer=setTimeout(playAudioScrub,35); }
  function playAudioScrub(){
    if(state.playing || state.mute || !state.scrubAudio) return;
    const clips=monitoredAudioClips().slice(0,2); const els=ensureScrubAudioElements();
    els.forEach((a,i)=>{
      const c=clips[i];
      if(!c){ a.pause(); return; }
      const m=monitorMediaFor(c), src=fileUrl(m); if(!src){ a.pause(); return; }
      if(a.dataset.src!==src){ a.pause(); a.src=src; a.dataset.src=src; }
      const sec=Math.max(0,(state.currentFrame-c.start+(c.source_in||0))/(c.fps||fps()));
      try{ a.currentTime=sec; a.volume=state.monitorVolume; a.muted=false; a.play().then(()=>setTimeout(()=>{ if(!state.playing) a.pause(); },180)).catch(()=>{}); }catch{}
    });
  }
  function stepFrame(delta){ if(delta==='first') state.currentFrame=0; else if(delta==='last') state.currentFrame=maxFrame(); else state.currentFrame=clamp(state.currentFrame+Number(delta),0,maxFrame()); updatePlayhead(); }
  function gotoSelectedStart(){ const c=selectedClip(); if(!c) return; state.currentFrame=c.start; updatePlayhead(); }
  function gotoSelectedEnd(){ const c=selectedClip(); if(!c) return; state.currentFrame=clipEnd(c)-1; updatePlayhead(); }
  function playSelectedFromStart(){ const c=selectedClip(); if(c){ state.currentFrame=c.start; updatePlayhead(); } togglePlay(); }

  function splitSelected(){
    const c=selectedClip();
    if(!c || c.kind==='stitched' || state.currentFrame<=c.start || state.currentFrame>=clipEnd(c)) return;
    const leftLen=state.currentFrame-c.start, rightLen=clipEnd(c)-state.currentFrame;
    const left=normalizeClipBounds({...c,id:`clip_${Date.now()}_L`,length:leftLen,source_out:(c.source_in||0)+leftLen,group_id:null,stitch_id:null});
    const right=normalizeClipBounds({...c,id:`clip_${Date.now()}_R`,start:state.currentFrame,length:rightLen,source_in:(c.source_in||0)+leftLen,source_out:(c.source_in||0)+leftLen+rightLen,group_id:null,stitch_id:null});
    state.project.clips=(state.project.clips||[]).filter(x=>x.id!==c.id).concat([left,right]);
    setSelection(right.id); renderAll(); status('Split');
  }
  function stitchSelected(){
    const cs=selectedClips().filter(c=>c.kind!=='stitched').sort((a,b)=>a.start-b.start || a.lane-b.lane);
    if(cs.length<2) return;
    const minStart=Math.min(...cs.map(c=>c.start));
    const maxEnd=Math.max(...cs.map(c=>clipEnd(c)));
    const lane=Math.min(...cs.map(c=>c.lane));
    const children=cs.map(c=>({...c,rel_start:c.start-minStart,orig_start:c.start,orig_lane:c.lane,group_id:null,stitch_id:null}));
    const stitched={id:`stitched_${Date.now()}`,name:`Stitched Clip (${cs.length})`,kind:'stitched',media_id:null,start:minStart,length:maxEnd-minStart,lane,source_in:0,source_out:maxEnd-minStart,children,stitch_id:`stitch_${Date.now()}`};
    state.project.clips=(state.project.clips||[]).filter(c=>!cs.some(x=>x.id===c.id));
    state.project.clips.push(stitched); setSelection(stitched.id); renderAll(); status('Stitched as layer container');
  }
  // Auto Stitch (v0.7 Frame Stitching Engine, first pass): analyzes the
  // overlap between two selected video clips near their shared boundary and
  // recommends where to cut the earlier one (A) and where to start the
  // later one (B) so the join reads as continuous, using frame similarity
  // (primary) and audio continuity (secondary) - see itda/stitch.py. Motion
  // matching is intentionally deferred; this is a recommend-then-Apply flow,
  // never an automatic edit.
  function autoStitchSelected(){
    const cs=selectedClips().filter(c=>c.kind==='video').sort((x,y)=>x.start-y.start);
    if(cs.length!==2){ status('Select exactly 2 video clips (in time order) for Auto Stitch'); return; }
    const [a,b]=cs;
    if(!a.path || !b.path){ status('Both clips need a source file for Auto Stitch'); return; }
    showModal('Auto Stitch - Analyze', `
      <p class="muted">Compares the tail of "${esc(trunc(a.name,30))}" against the head of "${esc(trunc(b.name,30))}" to find the best overlap cut point.</p>
      <div class="modal-grid"><label>Analysis window (sec)</label><input id="stitchWindowSec" type="number" min="0.5" max="10" step="0.5" value="2"></div>
    `, `<button id="stitchAnalyzeBtn">Analyze</button><button id="modalOk">Cancel</button>`);
    $('stitchAnalyzeBtn').onclick=async()=>{
      const windowSec=Number($('stitchWindowSec').value)||2;
      showModal('Auto Stitch - Analyzing…', `<p class="muted">Extracting frames and audio near the boundary, this can take a few seconds…</p>`, '');
      try{
        const data=await api('/itda/api/stitch_analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project:state.project?.name||'itda-project-1', path_a:a.path, source_out_a:a.source_out||a.length,
          path_b:b.path, source_in_b:b.source_in||0, fps:a.fps||fps(), window_sec:windowSec,
        })});
        if(!data.ok || !data.candidates?.length){ showModal('Auto Stitch', `<p>${esc(data.error||'No candidates found - try a larger window.')}</p>`); return; }
        showStitchResults(a,b,data.candidates);
      }catch(e){ showModal('Auto Stitch', `<p>Analysis failed: ${esc(e.message)}</p>`); }
    };
  }
  function showStitchResults(a,b,candidates){
    const rows=candidates.map((c,i)=>`
      <div class="stitch-candidate ${i===0?'best':''}" data-idx="${i}">
        <div class="stitch-candidate-scores">
          <b>${i===0?'★ Best':`#${i+1}`}</b>
          Frame ${(c.frame_score*100).toFixed(0)}% · Motion ${c.motion_score!=null?`${(c.motion_score*100).toFixed(0)}%`:'n/a'} · <b>${(c.combined_score*100).toFixed(0)}%</b>
        </div>
        <div class="muted" title="Audio level continuity - shown for reference only. It does not affect ranking: measured against known-correct cut points it could not tell good cuts from bad ones on generated footage.">Audio level ${c.audio_score!=null?`${(c.audio_score*100).toFixed(0)}%`:'n/a'} (info only)
        </div>
        <div class="muted">Cut A @ frame ${c.frame_a} → Start B @ frame ${c.frame_b}</div>
        <button class="stitch-apply-btn" data-idx="${i}">Apply</button>
      </div>`).join('');
    showModal('Auto Stitch - Recommendations', `<div class="stitch-candidate-list">${rows}</div>`, `<button id="modalOk">Close</button>`);
    $('modalBody').querySelectorAll('.stitch-apply-btn').forEach(btn=>{
      btn.onclick=()=>{ applyStitchCandidate(a,b,candidates[Number(btn.dataset.idx)]); closeModal(); };
    });
  }
  function applyStitchCandidate(a,b,cand){
    a.source_out=cand.frame_a; a.length=Math.max(1, a.source_out-(a.source_in||0)); normalizeClipBounds(a);
    b.source_in=cand.frame_b; b.length=Math.max(1, (b.source_out||b.length)-b.source_in); b.start=a.start+a.length; normalizeClipBounds(b);
    setSelection(a.id,false); setSelection(b.id,true);
    renderAll(); status(`Auto Stitch applied: A cut @${cand.frame_a}, B starts @${cand.frame_b}`);
  }
  // Add Transition: a separate action from Auto Stitch - takes two clips
  // that are already chronologically adjacent (B starts exactly where A
  // ends) and turns their join into a real blended transition on export.
  // The export-time xfade compositor (itda/export.py) only ever detects a
  // transition between clips whose active windows *overlap* (same-lane clips
  // can't overlap at all - wouldOverlap forbids it), so this action moves B
  // to a free lane and pulls it backward by the chosen duration to create
  // that overlap, then tags it with transition_type/transition_frames.
  function adjacentClipPair(){
    const cs=selectedClips().filter(c=>['video','image'].includes(c.kind)).sort((x,y)=>x.start-y.start);
    if(cs.length!==2) return null;
    const [a,b]=cs;
    if(b.start!==clipEnd(a)) return null;
    return [a,b];
  }
  // A clip carrying transition_type only means something relative to
  // whichever clip it currently overlaps - if that pair drifts apart (one
  // side dragged off on its own), the transition tag silently stops doing
  // anything on export rather than erroring, which is safe but confusing.
  // Sharing a group_id (the same mechanism Group/Ungroup already uses) keeps
  // them moving together by construction, so that drift shouldn't happen
  // through normal dragging.
  function existingTransitionPair(){
    const cs=selectedClips().filter(c=>['video','image'].includes(c.kind));
    if(cs.length!==2) return null;
    const [x,y]=cs;
    const b = (x.transition_type && x.transition_type!=='none') ? x : ((y.transition_type && y.transition_type!=='none') ? y : null);
    if(!b) return null;
    const a = b===x ? y : x;
    if(!a.group_id || a.group_id!==b.group_id) return null;
    // [a,b] roles come from which one actually carries transition_type, not
    // from start order - reordering by start here would let removeTransition
    // clear the wrong (untagged) clip whenever the tagged one drifts to an
    // earlier position than its partner.
    return [a,b];
  }
  function addTransitionSelected(){
    const pair=adjacentClipPair();
    if(!pair){ status('Select 2 adjacent video/image clips (B starting exactly where A ends) to add a transition'); return; }
    const [a,b]=pair;
    showModal('Add Transition', `
      <div class="modal-grid">
        <label>Type</label>
        <select id="transType">${TRANSITION_TYPES.filter(t=>t.value!=='none').map(t=>`<option value="${t.value}">${t.label}</option>`).join('')}</select>
        <label>Duration (frames)</label>
        <input id="transFrames" type="number" min="1" max="${Math.max(1,Math.min(a.length,b.length)-1)}" step="1" value="${Math.min(12,Math.max(1,Math.min(a.length,b.length)-1))}">
      </div>
      <p class="muted">Pulls "${esc(trunc(b.name,30))}" back to overlap "${esc(trunc(a.name,30))}"'s tail by this many frames and blends across the join on export. A and B are linked afterward (like Group) so dragging one drags both, keeping the overlap intact.</p>
    `, `<button id="transApply">Apply</button><button id="modalOk">Cancel</button>`);
    $('transApply').onclick=()=>{
      const type=$('transType').value;
      const dur=Math.max(1,Math.min(Number($('transFrames').value)||12, a.length-1, b.length-1));
      const freeLane=[0,1,2,3,4].find(l=>l!==a.lane && !state.lockedLanes[l] && !wouldOverlap(b.id,l,a.start+a.length-dur,b.length));
      if(freeLane==null){ status('No free lane available to overlap B onto for the transition'); closeModal(); return; }
      if((a.group_id && b.group_id && a.group_id!==b.group_id)){
        status('A and B already belong to different groups - ungroup one first, then add the transition'); closeModal(); return;
      }
      b.lane=freeLane; b.start=a.start+a.length-dur; normalizeClipBounds(b);
      b.transition_type=type; b.transition_frames=dur;
      // Reuse whichever clip's group is already there (extending it to the
      // other) instead of always minting a fresh id, so this doesn't quietly
      // detach either clip from an unrelated group it was already part of.
      const gid=a.group_id || b.group_id || `trans_${Date.now()}`;
      a.group_id=gid; b.group_id=gid;
      setSelection(a.id,false); setSelection(b.id,true);
      renderAll(); closeModal(); status(`Transition added: ${type}, ${dur}f (B moved to T${freeLane+1}, linked to A)`);
    };
  }
  function removeTransitionSelected(){
    const pair=existingTransitionPair();
    if(!pair) return;
    const [a,b]=pair;
    const gid=b.group_id;
    b.transition_type=null; b.transition_frames=null;
    b.group_id=null;
    // Only clear A's group_id too if nothing else still shares it - A may
    // have been part of a larger pre-existing group that B was merged into
    // when the transition was added, and that group should survive B leaving.
    const groupHasOtherMembers=gid && (state.project?.clips||[]).some(c=>c.id!==a.id && c.id!==b.id && c.group_id===gid);
    if(!groupHasOtherMembers) a.group_id=null;
    const restoreStart=clipEnd(a);
    const restoreLane=[a.lane,0,1,2,3,4].find(l=>!state.lockedLanes[l] && !wouldOverlap(b.id,l,restoreStart,b.length));
    if(restoreLane!=null){
      b.lane=restoreLane; b.start=restoreStart; normalizeClipBounds(b);
      setSelection(a.id,false); setSelection(b.id,true);
      renderAll(); status('Transition removed');
    } else {
      setSelection(a.id,false); setSelection(b.id,true);
      renderAll(); status('Transition removed, but no free spot to move B back next to A - it stayed in place, drag it manually');
    }
  }
  // AI Detect (v0.8 AI Layer, first pass): scene-change detection and beat
  // tracking for the selected clip. Both are recommend-then-apply like Auto
  // Stitch - detection never edits the timeline on its own.
  function aiDetectSelected(){
    const c=selectedClip();
    if(!c || !['video','audio'].includes(c.kind)){ status('Select a video or audio clip for AI Detect'); return; }
    if(!c.path){ status('AI Detect needs a clip with a source file'); return; }
    const isVideo=c.kind==='video';
    showModal('AI Detect', `
      ${isVideo ? `<div class="ai-section">
        <b>Scene Detect</b>
        <p class="muted">Finds shot changes inside this clip, then splits it at each one.</p>
        <div class="ai-row"><label>Sensitivity</label><input id="sceneThreshold" type="range" min="0.1" max="0.8" step="0.05" value="0.3"><span id="sceneThresholdLabel" class="muted">0.30</span></div>
        <button id="sceneDetectBtn">Detect Scenes</button>
        <div id="sceneResult"></div>
      </div>` : ''}
      <div class="ai-section">
        <b>Beat Detect</b>
        <p class="muted">Tracks tempo in this clip's audio and marks the beats on the timeline.</p>
        <button id="beatDetectBtn">Detect Beats</button>
        <div id="beatResult"></div>
      </div>
    `, `<button id="modalOk">Close</button>`);

    const thr=$('sceneThreshold');
    if(thr) thr.oninput=()=>{ $('sceneThresholdLabel').textContent=Number(thr.value).toFixed(2); };
    const sceneBtn=$('sceneDetectBtn');
    if(sceneBtn) sceneBtn.onclick=async()=>{
      $('sceneResult').innerHTML='<p class="muted">Analyzing…</p>';
      try{
        const data=await api('/itda/api/scene_detect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project:state.project?.name||'itda-project-1', path:c.path, fps:c.fps||fps(), threshold:Number(thr.value)||0.3,
        })});
        if(!data.ok){ $('sceneResult').innerHTML=`<p>${esc(data.error||'Scene detection failed')}</p>`; return; }
        const srcIn=Number(c.source_in||0), srcOut=Number(c.source_out||c.length);
        const cuts=(data.frames||[]).filter(f=>f>srcIn && f<srcOut);
        if(!cuts.length){ $('sceneResult').innerHTML='<p class="muted">No scene changes found in this clip’s trimmed range - try raising the sensitivity.</p>'; return; }
        $('sceneResult').innerHTML=`<p><b>${cuts.length}</b> scene change(s) found.</p><button id="sceneSplitBtn">Split into ${cuts.length+1} clips</button>`;
        $('sceneSplitBtn').onclick=()=>{ splitClipAtSourceFrames(c, cuts); closeModal(); };
      }catch(e){ $('sceneResult').innerHTML=`<p>Failed: ${esc(e.message)}</p>`; }
    };
    $('beatDetectBtn').onclick=async()=>{
      $('beatResult').innerHTML='<p class="muted">Analyzing…</p>';
      try{
        const data=await api('/itda/api/beat_detect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          project:state.project?.name||'itda-project-1', path:c.path, fps:c.fps||fps(),
        })});
        if(!data.ok){ $('beatResult').innerHTML=`<p>${esc(data.error||'Beat detection failed')}</p>`; return; }
        const m=mediaFor(c)||c;
        rememberBeats(m, data.frames||[]);
        renderTimeline();
        $('beatResult').innerHTML=`<p><b>${data.bpm} BPM</b> · ${(data.frames||[]).length} beats marked.</p><p class="muted">Turn on 〰 Peak Match to snap clips to these beats.</p>`;
      }catch(e){ $('beatResult').innerHTML=`<p>Failed: ${esc(e.message)}</p>`; }
    };
  }
  function splitClipAtSourceFrames(c, srcFrames){
    const srcIn=Number(c.source_in||0), srcOut=Number(c.source_out||c.length);
    const cuts=[...new Set(srcFrames)].filter(f=>f>srcIn && f<srcOut).sort((a,b)=>a-b);
    if(!cuts.length) return;
    const bounds=[srcIn, ...cuts, srcOut];
    const pieces=[];
    for(let i=0;i<bounds.length-1;i++){
      const a=bounds[i], b=bounds[i+1];
      if(b-a<1) continue;
      pieces.push(normalizeClipBounds({...c,
        id:`clip_${Date.now()}_${i}_${Math.random().toString(16).slice(2)}`,
        start:c.start+(a-srcIn), length:b-a, source_in:a, source_out:b, group_id:null, stitch_id:null,
      }));
    }
    if(pieces.length<2) return;
    state.project.clips=(state.project.clips||[]).filter(x=>x.id!==c.id).concat(pieces);
    setSelection(pieces[0].id,false);
    for(let i=1;i<pieces.length;i++) setSelection(pieces[i].id,true);
    renderAll(); status(`Split into ${pieces.length} scene clips`);
  }
  function unstitchSelected(){
    const cs=selectedClips().filter(c=>c.kind==='stitched'||c.children);
    if(!cs.length) return;
    const restored=[];
    for(const m of cs){
      (m.children||[]).forEach(ch=>{ const c={...ch,id:`clip_${Date.now()}_${Math.random().toString(16).slice(2)}`,start:m.start+(ch.rel_start||0),lane:(ch.orig_lane ?? ch.lane ?? m.lane),group_id:null,stitch_id:null}; delete c.rel_start; delete c.orig_start; restored.push(c); });
    }
    state.project.clips=(state.project.clips||[]).filter(c=>!cs.some(m=>m.id===c.id)).concat(restored);
    setSelection(restored[0]?.id||null); renderAll(); status('UnStitched');
  }
  function deleteSelected(){ if(!state.selectedClipIds.length) return; state.project.clips=state.project.clips.filter(c=>!isSelected(c.id)); setSelection(null); renderAll(); status('Deleted selected clips'); }
  function duplicateSelected(){
    const cs=selectedClips();
    if(!cs.length) return;
    const newIds=cs.map(c=>{
      const clone={...c,id:`clip_${Date.now()}_${Math.random().toString(16).slice(2)}`,start:c.start+c.length,group_id:null,stitch_id:null};
      normalizeClipBounds(clone);
      state.project.clips.push(clone);
      return clone.id;
    });
    state.selectedClipIds=newIds; state.selectedClipId=newIds[newIds.length-1]||null;
    renderAll(); status(`Duplicated ${cs.length} clip(s)`);
  }
  function copySelected(){
    const cs=selectedClips();
    if(!cs.length) return;
    state.clipboard=cs.map(c=>({...c}));
    status(`Copied ${cs.length} clip(s)`);
  }
  function pasteClipboard(){
    const cb=state.clipboard;
    if(!cb || !cb.length) return;
    const minStart=Math.min(...cb.map(c=>c.start));
    const target=snapFrame(state.currentFrame);
    const newIds=cb.map(c=>{
      const clone={...c,id:`clip_${Date.now()}_${Math.random().toString(16).slice(2)}`,start:Math.max(0,target+(c.start-minStart)),group_id:null,stitch_id:null};
      normalizeClipBounds(clone);
      state.project.clips.push(clone);
      return clone.id;
    });
    state.selectedClipIds=newIds; state.selectedClipId=newIds[newIds.length-1]||null;
    renderAll(); status(`Pasted ${cb.length} clip(s)`);
  }
  function groupSelected(){ const cs=selectedClips(); if(cs.length){ const gid=`group_${Date.now()}`; cs.forEach(c=>c.group_id=gid); renderAll(); status('Grouped'); } }
  function ungroupSelected(){ selectedClips().forEach(c=>c.group_id=null); renderAll(); status('Ungrouped'); }
  function detachAudio(){
    const c=selectedClip();
    if(!c || c.kind!=='video') return;
    // Detaching audio must silence the video's own track - otherwise the
    // original video clip keeps playing its native audio right alongside
    // the newly split-out audio clip, doubling it up.
    c.audio_enabled=false;
    const audio={...c,id:`clip_${Date.now()}_audio`,kind:'audio',name:`${c.name} (Audio)`,lane:clamp(c.lane+1,0,4),audio_detached:true,audio_enabled:true,detached_from:c.id};
    state.project.clips.push(audio);
    setSelection(audio.id); renderAll(); status('Audio detached');
  }
  function mergeAudioBack(){
    const c=selectedClip();
    if(!c) return;
    // Works from either side: select the detached audio clip, or the video
    // clip it was split from.
    let audioClip=null, videoClip=null;
    if(c.kind==='audio' && c.detached_from){ audioClip=c; videoClip=findClip(c.detached_from); }
    else if(c.kind==='video'){ audioClip=(state.project.clips||[]).find(x=>x.kind==='audio' && x.detached_from===c.id); videoClip=c; }
    if(!audioClip || !videoClip){ status('No matching detached audio clip found for this selection'); return; }
    videoClip.audio_enabled=true;
    state.project.clips=(state.project.clips||[]).filter(x=>x.id!==audioClip.id);
    setSelection(videoClip.id); renderAll(); status('Audio merged back into video');
  }

  // Version Stack: alternate ComfyUI-generated takes of the same clip, kept
  // as a list on the clip itself (not the shared media-bin item, since two
  // clips can point at the same source media but hold different version
  // history). setActiveVersion overwrites the clip's own path/url in place -
  // that's the one field both the editor's playback path (monitorMediaFor)
  // and the exporter (export.py reads clip["path"] directly, no separate
  // media lookup) already treat as the source of truth, so no other code
  // needs to know versions exist.
  function ensureVersions(c){
    if(!c.versions || !c.versions.length){
      c.versions=[{id:'orig', path:c.path, url:c.url||null, name:c.name}];
      c.active_version_id='orig';
    }
    return c.versions;
  }
  function setActiveVersion(c, versionId){
    const v=(c.versions||[]).find(x=>x.id===versionId);
    if(!v) return;
    c.active_version_id=versionId; c.path=v.path; c.url=v.url||null;
    renderAll(); status(`Active version: ${v.name}`);
  }
  async function addVersionToClip(c, file){
    const fd=new FormData(); fd.append('files', file); fd.append('project', state.project?.name || 'itda-project-1');
    try{
      const data=await fetch('/itda/api/media/upload',{method:'POST',body:fd}).then(r=>{if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json();});
      const path=(data.items||[])[0];
      if(!path){ status('Version upload failed'); return; }
      ensureVersions(c);
      const vid=`v_${Date.now()}`;
      c.versions.push({id:vid, path, name:file.name});
      setActiveVersion(c, vid);
    }catch(e){ status(`Add Version failed: ${e.message}`); }
  }
  function deleteVersion(c, versionId){
    ensureVersions(c);
    if(c.versions.length<=1) return;
    const wasActive=c.active_version_id===versionId;
    c.versions=c.versions.filter(v=>v.id!==versionId);
    state.versionCompareSel=(state.versionCompareSel||[]).filter(id=>id!==versionId);
    if(wasActive) setActiveVersion(c, c.versions[0].id); else renderAll();
  }
  function compareVersions(c, idA, idB){
    const vA=(c.versions||[]).find(v=>v.id===idA), vB=(c.versions||[]).find(v=>v.id===idB);
    if(!vA || !vB) return;
    state.versionCompareClips=[{...c,path:vA.path,url:vA.url||null,name:vA.name},{...c,path:vB.path,url:vB.url||null,name:vB.name}];
    state.previewMode='wipe';
    renderAll();
  }
  function renderVersionsSection(c){
    ensureVersions(c);
    const compareSel=state.versionCompareSel||[];
    const rows=c.versions.map(v=>{
      const active=v.id===c.active_version_id, marked=compareSel.includes(v.id);
      return `<div class="version-row ${active?'active':''} ${marked?'compare-sel':''}" data-vid="${v.id}" title="Click: make active - Ctrl/Shift+Click: pick for Compare (Wipe)">
        <span class="version-name">${esc(trunc(v.name,26))}${active?' ✓':''}</span>
        ${c.versions.length>1?`<button class="version-delete" data-vid="${v.id}" title="Delete version">×</button>`:''}
      </div>`;
    }).join('');
    return `<div class="props-section">Versions</div><div class="version-list" id="versionList">${rows}</div>
      <div class="version-actions"><button id="addVersionBtn">+ Add Version</button><button id="compareVersionsBtn" ${compareSel.length===2?'':'disabled'}>Compare (Wipe)</button></div>
      <input type="file" id="versionFilePicker" accept="video/*,audio/*,image/*" style="display:none">`;
  }
  function sliderField(prop,label,min,max,step,value){
    return `<label>${label}</label><div class="slider-field"><input data-prop="${prop}" type="range" min="${min}" max="${max}" step="${step}" value="${value}"><input type="number" class="mirror-num" data-mirror-for="${prop}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
  }
  function toggleField(prop,label,checked){
    return `<label>${label}</label><label class="switch"><input data-prop="${prop}" type="checkbox" ${checked?'checked':''}><span class="slider-track"></span></label>`;
  }
  function updateProps(){
    const body=$('clipProps');
    const c=selectedClip();
    if(!c){ body.innerHTML='No clip selected.'; return; }
    const fontOptions = [`<option value="system">System Default</option>`].concat((state.fonts||[]).map(f=>`<option value="${esc(f.family)}">${esc(f.family)}</option>`)).join('');
    body.innerHTML=`<div class="props-grid">
    <div class="props-section">Clip</div><label>Name</label><input data-prop="name" value="${esc(c.name)}"><label>Type</label><select data-prop="kind"><option>video</option><option>audio</option><option>image</option><option>text</option></select><label>Lane</label><input data-prop="lane" type="number" min="1" max="5" value="${c.lane+1}">
    <div class="props-section">Timing</div><label>Start</label><input data-prop="start" type="number" min="0" value="${c.start}"><label>Length</label><input data-prop="length" type="number" min="1" value="${c.length}"><label>Trim In</label><input data-prop="source_in" type="number" min="0" value="${c.source_in||0}"><label>Trim Out</label><input data-prop="source_out" type="number" min="1" value="${c.source_out||c.length}">
    ${['video','audio'].includes(c.kind) ? `<div class="props-section">Audio</div>${toggleField('audio_enabled','Audio',c.audio_enabled!==false)}${toggleField('solo','Solo',!!c.solo)}${sliderField('volume','Gain %',0,200,1,c.volume??100)}` : ''}
    ${['video','image'].includes(c.kind) ? `<div class="props-section">Transition In</div><label>Type</label><select data-prop="transition_type">${TRANSITION_TYPES.map(t=>`<option value="${t.value}" ${((c.transition_type||'none')===t.value)?'selected':''}>${t.label}</option>`).join('')}</select><label>Frames (0=auto)</label><input data-prop="transition_frames" type="number" min="0" value="${c.transition_frames||0}"><div class="muted" style="grid-column:1/-1">Blends this clip's head with whatever other clip's active window it starts inside of - drag it onto a different lane so it overlaps that clip's tail.</div>` : ''}
    ${['video','audio','image'].includes(c.kind) ? renderVersionsSection(c) : ''}
    <div class="props-section">Text / Overlay</div><textarea data-prop="text">${esc(c.text||'')}</textarea><label>Font</label><select data-prop="font_family">${fontOptions}</select>${sliderField('x','X %',0,100,1,c.x??50)}${sliderField('y','Y %',0,100,1,c.y??88)}${sliderField('size','Size',8,220,1,c.size||42)}${sliderField('opacity','Opacity',0,1,0.05,c.opacity??1)}<label>Text Color</label><input data-prop="color" type="color" value="${esc(c.color||'#ffffff')}">${toggleField('shadow_enabled','Shadow',c.shadow_enabled)}<label>Shadow Color</label><input data-prop="shadow_color" type="color" value="${esc(c.shadow_color||'#000000')}">${sliderField('shadow_opacity','Shadow Opacity',0,1,0.05,c.shadow_opacity??0.6)}
  </div>`;
    const kind=body.querySelector('[data-prop="kind"]'); if(kind) kind.value=c.kind||'video';
    const font=body.querySelector('[data-prop="font_family"]'); if(font) font.value=c.font_family||'system';
    body.addEventListener('mousedown', e=>e.stopPropagation(), true);
    body.addEventListener('pointerdown', e=>e.stopPropagation(), true);
    body.addEventListener('keydown', e=>e.stopPropagation(), true);
    body.querySelectorAll('.slider-field').forEach(wrap=>{
      const range=wrap.querySelector('input[type="range"]');
      const num=wrap.querySelector('input.mirror-num');
      if(!range||!num) return;
      range.addEventListener('input', ()=>{ num.value=range.value; });
      num.addEventListener('input', ()=>{ range.value=num.value; range.dispatchEvent(new Event('input',{bubbles:true})); });
      num.addEventListener('change', ()=>{ range.dispatchEvent(new Event('change',{bubbles:true})); });
    });
    { const versionList=body.querySelector('#versionList');
      if(versionList){
        versionList.querySelectorAll('.version-row').forEach(row=>{
          row.addEventListener('click', e=>{
            if(e.target.closest('.version-delete')) return;
            const vid=row.dataset.vid;
            if(e.ctrlKey||e.metaKey||e.shiftKey){
              const sel=state.versionCompareSel||[];
              state.versionCompareSel = sel.includes(vid) ? sel.filter(x=>x!==vid) : [...sel, vid].slice(-2);
              updateProps();
            } else setActiveVersion(c, vid);
          });
          const del=row.querySelector('.version-delete');
          if(del) del.addEventListener('click', e=>{ e.stopPropagation(); deleteVersion(c, row.dataset.vid); });
        });
        const addBtn=body.querySelector('#addVersionBtn'), fp=body.querySelector('#versionFilePicker');
        if(addBtn && fp){ addBtn.onclick=e=>{ e.stopPropagation(); fp.click(); }; fp.onchange=e=>{ const f=e.target.files[0]; if(f) addVersionToClip(c,f); fp.value=''; }; }
        const cmpBtn=body.querySelector('#compareVersionsBtn');
        if(cmpBtn) cmpBtn.onclick=e=>{ e.stopPropagation(); const sel=state.versionCompareSel||[]; if(sel.length===2) compareVersions(c, sel[0], sel[1]); };
      }
    }
    body.querySelectorAll('[data-prop]').forEach(input=>{
      const readValue=()=>{
        const p=input.dataset.prop;
        let v=input.type==='checkbox' ? input.checked : input.value;
        if(['start','length','source_in','source_out','x','y','size','opacity','shadow_opacity','volume','transition_frames'].includes(p)) v=Number(v);
        return {p,v};
      };
      const applyModelOnly=()=>{
        const {p,v}=readValue();
        if(p==='lane') c.lane=clamp(Number(v)-1,0,4);
        else c[p]=v;
        if(p==='kind') c.kind=v;
        normalizeClipBounds(c);
      };
      const commit=()=>{
        applyModelOnly();
        renderAll();
      };

      // IMPORTANT: never render timeline/preview on every keystroke.
      // Rendering while input/textarea is focused replaces DOM and drops the caret after one key.
      input.oninput=()=>{
        applyModelOnly();
        // Live-update only the visible text overlay without rebuilding Clip Properties.
        if(input.dataset.prop==='text' || input.dataset.prop==='color' || input.dataset.prop==='opacity' || input.dataset.prop==='size' || input.dataset.prop==='x' || input.dataset.prop==='y' || input.dataset.prop==='shadow_enabled' || input.dataset.prop==='shadow_color' || input.dataset.prop==='shadow_opacity' || input.dataset.prop==='font_family'){
          updatePreviewTextOnly();
        }
      };
      input.onchange=commit;
      input.onblur=commit;
    });
  }
  function updatePreviewTextOnly(){
    const frame = state.currentFrame;
    // While a text clip is selected (i.e. being edited in Clip Properties), show
    // its live values regardless of the playhead's position: otherwise, editing a
    // text clip that isn't the layer-priority clip under the current playhead
    // silently updates its data with no visible feedback, which reads as "the
    // sliders don't do anything."
    const sel = selectedClip();
    const txt = (sel && sel.kind==='text') ? sel : topTextClip(frame);
    const t = $('textOverlay');
    if(!t) return;
    if(!txt){ clearTextOverlay(t); return; }
    // Delegate to the same function the full render path (updatePreview) uses.
    // This used to duplicate loadTextOverlay's styling inline and had drifted:
    // different font-family fallback ('system-ui' vs 'Inter, Segoe UI, Arial'),
    // different text-shadow formula, and top-vs-bottom positioning. That drift
    // meant every commit (releasing a slider) visibly snapped the font/shadow/
    // position back to a different look than what was shown while dragging.
    loadTextOverlay(txt, t);
  }

  function updateControls(){ const two=selectedClips().length===2; const hasVersionCompare=!!(state.versionCompareClips && state.versionCompareClips.length===2); $('compareTop').disabled=!two; $('overlayTop').disabled=!two; const wipeTop=$('wipeTop'); if(wipeTop) wipeTop.disabled=!two && !hasVersionCompare; if(!two && !hasVersionCompare && state.previewMode!=='single') state.previewMode='single'; $('previewMode').classList.toggle('active',state.previewMode==='single'); $('compareTop').classList.toggle('active',state.previewMode==='compare'); $('overlayTop').classList.toggle('active',state.previewMode==='overlay'); if(wipeTop) wipeTop.classList.toggle('active',state.previewMode==='wipe'); $('snapToggle').classList.toggle('active',state.snap); const peakBtn=$('peakSnapToggle'); if(peakBtn) peakBtn.classList.toggle('active',state.peakSnap); const prBtn=$('prerender'); if(prBtn){ const stale=prerenderStale(); prBtn.classList.toggle('active', !!state.prerender && !stale); prBtn.textContent = state.prerender ? (stale?'Pre-render (stale)':`Pre-rendered ${state.prerender.start_frame}–${state.prerender.end_frame}f`) : 'Pre-render'; } const autoStitchBtn=$('autoStitchClip'); if(autoStitchBtn){ const svids=selectedClips().filter(c=>c.kind==='video'); autoStitchBtn.disabled=svids.length!==2; } const transBtn=$('addTransition'); if(transBtn){ const existingTrans=existingTransitionPair(); if(existingTrans){ transBtn.disabled=false; transBtn.textContent='🎞 Remove Transition'; transBtn.dataset.mode='remove'; } else { transBtn.disabled=!adjacentClipPair(); transBtn.textContent='🎞 Transition'; transBtn.dataset.mode='add'; } } const aiBtn=$('aiDetect'); if(aiBtn){ const sc=selectedClip(); aiBtn.disabled=!(sc && ['video','audio'].includes(sc.kind) && sc.path); } $('loopToggle').classList.toggle('active',state.loop); $('muteToggle').classList.toggle('active',state.mute); const sab=$('scrubAudioToggle'); if(sab) sab.classList.toggle('active',state.scrubAudio); $('snapStatus').textContent=state.snap?'ON':'OFF'; $('statusbarFps').textContent=`Project FPS: ${fps().toFixed(3)}`; $('totalStatus').textContent=`Total: ${totalFrames()}f / ${fmtTime(totalFrames())}`; $('projectFpsStatus').textContent=`FPS ${fps().toFixed(3)} · Total ${totalFrames()}f`; }

  function showModal(title,html,footer=''){ $('modalTitle').textContent=title; $('modalBody').innerHTML=html; $('modalFooter').innerHTML=footer||'<button id="modalOk">OK</button>'; $('modal').classList.remove('hidden'); const ok=$('modalOk'); if(ok) ok.onclick=closeModal; }
  function closeModal(){ $('modal').classList.add('hidden'); }
  async function showProjectPopup(){
    showModal('Project Library', `<p class="muted">Projects are stored in ComfyUI/input/ITDA/projects.</p><div id="projectLibraryList" class="project-list"><div class="muted">Loading...</div></div>`, `<button id="projectNew">+ New Project</button><button id="projectOpen">Open</button><button id="projectDuplicate">Duplicate</button><button id="projectRename">Rename</button><button id="projectDelete">Delete</button><button id="modalOk">Close</button>`);
    let selected = state.project?.name || 'itda-project-1';
    const listEl = $('projectLibraryList');
    async function refreshList(){
      try{
        const data=await api('/itda/api/projects');
        const items=data.items||[];
        if(!items.length){ listEl.innerHTML='<div class="muted">No projects yet.</div>'; return; }
        listEl.innerHTML=items.map(it=>`<div class="project-row ${it.name===selected?'active':''}" data-project="${esc(it.name)}">${esc(it.name)}</div>`).join('');
        listEl.querySelectorAll('.project-row').forEach(row=>row.onclick=()=>{selected=row.dataset.project; refreshList();});
      }catch(e){ listEl.innerHTML=`<div class="muted">Project list failed: ${esc(e.message)}</div>`; }
    }
    await refreshList();
    $('projectNew').onclick=async()=>{ const base=prompt('New Project Name','itda-project-1'); if(!base) return; const data=await api('/itda/api/project/new',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:base})}); closeModal(); await initProject(data.project?.name || base); };
    $('projectOpen').onclick=()=>{ if(!selected) return; closeModal(); initProject(selected); };
    $('projectDuplicate').onclick=async()=>{ if(!selected) return; const target=prompt('Duplicate Project Name', `${selected}-copy`); if(!target) return; const data=await api('/itda/api/project/duplicate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:selected,target})}); selected=data.project||target; await refreshList(); status(`Duplicated: ${selected}`); };
    $('projectRename').onclick=async()=>{ if(!selected) return; const target=prompt('Rename Project', selected); if(!target || target===selected) return; try{ const data=await api('/itda/api/project/rename',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({source:selected,target})}); const renamed=data.project||target; if(state.project?.name===selected){ closeModal(); await initProject(renamed); } else { selected=renamed; await refreshList(); } }catch(e){ status(`Rename failed: ${e.message}`); } };
    $('projectDelete').onclick=async()=>{
      if(!selected) return;
      const target=selected;
      const ok=await confirmModal('Delete Project', `<p>Delete project <b>${esc(target)}</b>?</p><p class="muted">Project file, media folder, and cache folder will be deleted.</p>`);
      if(!ok){ await showProjectPopup(); return; }
      try{
        await api('/itda/api/project/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:target})});
        if(state.project?.name===target){ await initProject('itda-project-1'); } else { selected=state.project?.name||'itda-project-1'; }
        await showProjectPopup();
      }catch(e){ status(`Delete failed: ${e.message}`); await showProjectPopup(); }
    };
    $('modalOk').onclick=closeModal;
  }
  // Only meaningful when ITDA is running standalone (no filesystem shared
  // with ComfyUI, see itda_standalone.py) - "Send To ComfyUI" then uploads
  // over ComfyUI's own /upload/image API instead of writing a local file.
  // Empty = same-process mode, i.e. the existing local-write behavior.
  function getComfyUrl(){ return localStorage.getItem('itda_comfy_url') || ''; }
  function setComfyUrl(v){ v ? localStorage.setItem('itda_comfy_url', v) : localStorage.removeItem('itda_comfy_url'); }

  function showSettingsPopup(){ showModal('Project Settings', `<div class="modal-grid"><label>Project FPS</label><input id="settingsFps" type="number" min="16" max="120" step="0.001" value="${fps()}"><label>Total Frames</label><input id="settingsTotal" type="number" min="1" value="${totalFrames()}"><label>Frame Policy</label><select id="framePolicy"><option value="normalize">Normalize to Project FPS</option><option value="drop">Frame Drop</option><option value="interpolate">Interpolation</option></select><label>ComfyUI Server URL</label><input id="settingsComfyUrl" type="text" placeholder="http://127.0.0.1:8188 (leave blank if running inside ComfyUI)" value="${esc(getComfyUrl())}"></div><p class="muted">Below 16fps is not allowed; 60fps and above is flagged as a warning. Changing these rescales the timeline ruler and every clip's frame positions together.</p><p class="muted">ComfyUI Server URL is only needed in the standalone app - it's where "Send To ComfyUI" uploads clips to, since a standalone instance has no folder shared with ComfyUI. Leave blank when running inside ComfyUI itself.</p>`, `<button id="settingsApply">Apply</button><button id="modalOk">Cancel</button>`); $('settingsApply').onclick=()=>{ const oldFps=fps(); let nf=Number($('settingsFps').value||24); if(nf<16){nf=16;status('Below 16fps is not allowed - clamped to 16fps');} if(nf>=60) status('Warning: 60fps or higher'); const total=Number($('settingsTotal').value||DEFAULT_TOTAL); const ratio=nf/oldFps; state.project.settings={...state.project.settings,fps:nf,total_frames:Math.max(1,Math.round(total))}; state.totalFrames=state.project.settings.total_frames; (state.project.clips||[]).forEach(c=>{ c.start=Math.round(c.start*ratio); c.length=Math.max(1,Math.round(c.length*ratio)); c.source_in=Math.round((c.source_in||0)*ratio); c.source_out=Math.round((c.source_out||c.length)*ratio); c.fps=nf; normalizeClipBounds(c); }); setComfyUrl($('settingsComfyUrl').value.trim()); closeModal(); renderAll(); }; $('modalOk').onclick=closeModal; }
  function snapshotClipCandidate(){
    const sel=selectedClips();
    let c=sel.find(x=>state.currentFrame>=x.start && state.currentFrame<clipEnd(x) && ['video','image','stitched'].includes(x.kind));
    if(!c) c=topVisualClip(state.currentFrame);
    if(c && (c.kind==='stitched'||c.children)){
      const ch=childClipAtFrame(c,state.currentFrame,['video','image']);
      if(ch) c=ch;
    }
    return c;
  }
  function sourceFrameForClip(c, timelineFrame=state.currentFrame){
    return Math.max(0, Math.round((c.source_in||0) + (timelineFrame - c.start)));
  }
  async function snapshot(){
    const c=snapshotClipCandidate();
    if(c && c.path && (c.kind==='video'||c.kind==='image')){
      try{
        const payload={project:state.project?.name||'itda-project-1',path:c.path,kind:c.kind,source_frame:sourceFrameForClip(c),source_fps:c.original_fps||c.fps||fps()};
        await api('/itda/api/snapshot_frame',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        const toast=$('snapshotToast'); toast.textContent=`Snapshot saved · F${payload.source_frame}`; toast.classList.remove('hidden'); setTimeout(()=>toast.classList.add('hidden'),1600); status(`Snapshot saved: source frame ${payload.source_frame}`); return;
      }catch(e){ status(`Original frame snapshot failed, fallback viewport: ${e.message}`); }
    }
    const stage=$('previewStage'); const rect=stage.getBoundingClientRect(); const canvas=document.createElement('canvas'); canvas.width=Math.max(2,Math.round(rect.width)); canvas.height=Math.max(2,Math.round(rect.height)); const ctx=canvas.getContext('2d'); ctx.clearRect(0,0,canvas.width,canvas.height);
    const drawContain=(el)=>{ if(!el || getComputedStyle(el).display==='none') return; const vw=el.videoWidth||el.naturalWidth, vh=el.videoHeight||el.naturalHeight; if(!vw||!vh) return; const scale=Math.min(canvas.width/vw, canvas.height/vh); const w=vw*scale,h=vh*scale,x=(canvas.width-w)/2,y=(canvas.height-h)/2; try{ctx.drawImage(el,x,y,w,h);}catch{} };
    drawContain($('previewVideo')); drawContain($('previewImage')); drawContain($('previewVideoB')); drawContain($('previewImageB'));
    const text=$('textOverlay'); if(text.textContent){ ctx.font=`${parseInt(text.style.fontSize||42,10)}px sans-serif`; ctx.fillStyle=(state.selectedClipId && findClip(state.selectedClipId)?.color) || '#fff'; ctx.textAlign='center'; ctx.shadowColor='transparent'; ctx.shadowBlur=0; ctx.fillText(text.textContent, canvas.width/2, canvas.height*.82); }
    const blob=await new Promise(res=>canvas.toBlob(res,'image/png'));
    try{ const fd=new FormData(); fd.append('project',state.project?.name||'itda-project-1'); fd.append('image',blob,'snapshot.png'); await fetch('/itda/api/snapshot',{method:'POST',body:fd}).then(r=>{if(!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json();}); const toast=$('snapshotToast'); toast.textContent='Snapshot saved'; toast.classList.remove('hidden'); setTimeout(()=>toast.classList.add('hidden'),1600); status('Snapshot saved to input/ITDA-SNAPSHOT'); }catch(e){ status(`Snapshot failed: ${e.message}`); }
  }

  async function exportProject(){
    if(!state.project) return;
    showModal('Export', `<div class="modal-grid"><label>Format</label><select id="exportFormat"><option value="mp4">MP4 (H.264 + AAC)</option><option value="mov">MOV (H.264 + AAC)</option><option value="webm">WEBM (VP9 + Opus)</option></select></div>`, '<button id="exportGo">Render</button><button id="modalOk">Cancel</button>');
    $('exportGo').onclick=()=>runExport($('exportFormat').value);
  }
  async function runExport(fmt){
    status(`Exporting timeline to ${fmt.toUpperCase()}... this can take a while for long timelines.`);
    // Real per-frame progress isn't available without parsing ffmpeg's own
    // progress stream, which the export request doesn't surface yet - but
    // silence with no feedback at all reads as "is this even doing
    // anything?" for a render that can take a while. A spinner + elapsed
    // timer at least confirms it's alive and shows how long it's been.
    const startedAt = Date.now();
    showModal('Export', `<div class="export-progress"><div class="spinner"></div><p>Rendering <b>${esc(state.project.name)}</b> to ${fmt.toUpperCase()}...</p><p class="muted" id="exportElapsed">0s elapsed</p><p class="muted">Compositing every layer (video/image/text) and mixing audio via ffmpeg.</p></div>`, '<button id="modalOk" disabled>Rendering...</button>');
    const elapsedTimer = setInterval(()=>{
      const el = document.getElementById('exportElapsed');
      if(el) el.textContent = `${Math.round((Date.now()-startedAt)/1000)}s elapsed`;
    }, 1000);
    try{
      const data=await api('/itda/api/export',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project:state.project.name,format:fmt})});
      clearInterval(elapsedTimer);
      const secs=Math.round((Date.now()-startedAt)/1000);
      showModal('Export Complete', `<p>✅ <b>${esc(state.project.name)}</b> exported in ${secs}s.</p><p class="muted">${esc(data.path)}</p><p class="muted">${data.width}x${data.height} · ${data.total_frames}f @ ${data.fps}fps ${data.has_audio?'· with audio':'· no audio'}</p>`);
      status(`Exported to ${data.path}`);
    }catch(e){
      clearInterval(elapsedTimer);
      showModal('Export Failed', `<p>${esc(e.message)}</p>`);
      status(`Export failed: ${e.message}`);
    }
  }

  async function sendAllTimelineToComfy(){
    const clips=(state.project?.clips||[]).filter(c=>c.path && ['video','image','audio'].includes(c.kind));
    if(!clips.length){ showModal('Send To ComfyUI', '<p>No sendable clips (video/image/audio) on this timeline.</p>'); return; }
    const comfyUrl=getComfyUrl();
    status(`Sending ${clips.length} clip(s) to ComfyUI...`);
    const items=[];
    for(const c of clips){
      try{
        const payload={project:state.project?.name||'itda-project-1',path:c.path,kind:c.kind,source_in:c.source_in||0,source_out:c.source_out||c.length,fps:c.fps||fps(),name:c.name,comfy_url:comfyUrl};
        const data=await api('/itda/api/send_to_comfy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
        items.push(comfyUrl ? {name:data.comfy_name, subfolder:data.comfy_subfolder, type:data.comfy_type, kind:c.kind} : {relative:data.relative, kind:c.kind});
      }catch(e){ status(`Send failed for ${c.name}: ${e.message}`); }
    }
    if(!items.length){ showModal('Send To ComfyUI', '<p>All clips failed to export - see status bar.</p>'); return; }
    if(comfyUrl){
      // Standalone: nothing to auto-open across origins for a batch - the
      // files are on ComfyUI's side now, ready to pick from its own node UI.
      showModal('Send To ComfyUI', `<p>Sent ${items.length}/${clips.length} clip(s) to ComfyUI at <b>${esc(comfyUrl)}</b>.</p><p class="muted">Pick them up from a Load node's file list there (subfolder: ITDA/send/${esc(state.project?.name||'')}).</p>`);
    } else {
      const url=`${location.origin}/?itda_send_batch=${encodeURIComponent(JSON.stringify(items))}`;
      window.open(url,'_blank');
    }
    status(`Sent ${items.length}/${clips.length} clip(s) to ComfyUI`);
  }
  async function sendToComfy(){
    const sel=selectedClips();
    if(sel.length===0){ return sendAllTimelineToComfy(); }
    if(sel.length!==1){ showModal('Send To ComfyUI', `<p>Select exactly one Video, Image, or Audio clip to send that clip/range, or clear selection to send the whole timeline as a batch.</p>`); return; }
    const c=sel[0];
    if(!c.path || !['video','image','audio'].includes(c.kind)){ showModal('Send To ComfyUI', `<p>Text/stitched clips cannot be sent yet. Select a Video, Image, or Audio clip.</p>`); return; }
    let srcIn=c.source_in||0, srcOut=c.source_out||c.length, mode='clip';
    if(state.range.start!=null && state.range.end!=null){
      const a=Math.min(state.range.start,state.range.end), b=Math.max(state.range.start,state.range.end);
      const clipStart=c.start, clipEnd=c.start+c.length;
      const overlapStart=Math.max(a,clipStart), overlapEnd=Math.min(b,clipEnd);
      if(overlapEnd>overlapStart){
        srcIn=(c.source_in||0)+(overlapStart-clipStart);
        srcOut=(c.source_in||0)+(overlapEnd-clipStart);
        mode='range';
      }
    }
    const comfyUrl=getComfyUrl();
    status(`Sending ${mode} to ComfyUI...`);
    try{
      const payload={project:state.project?.name||'itda-project-1',path:c.path,kind:c.kind,source_in:srcIn,source_out:srcOut,fps:c.fps||fps(),name:c.name,comfy_url:comfyUrl};
      const data=await api('/itda/api/send_to_comfy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
      if(comfyUrl){
        status(`Sent ${mode} to ComfyUI (${comfyUrl}): ${data.comfy_subfolder}/${data.comfy_name}`);
      } else {
        const url=`${location.origin}/?itda_send=${encodeURIComponent(data.relative)}&itda_kind=${encodeURIComponent(c.kind)}`;
        window.open(url,'_blank');
        status(`Sent ${mode} to ComfyUI input: ${data.relative}`);
      }
    }catch(e){ status(`Send To ComfyUI failed: ${e.message}`); }
  }

  async function runPrerender(){
    if(state.prerender && !prerenderStale()){
      // Second press on a still-valid render clears it and returns the
      // preview to live compositing.
      state.prerender=null; renderAll(); status('Pre-render cleared');
      return;
    }
    if(state.range.start==null || state.range.end==null){
      showModal('Pre-render', '<p>Mark an In (I) and Out (O) point on the timeline first.</p><p class="muted">Pre-render flattens that range into one cached file so it plays back smoothly.</p>');
      return;
    }
    const a=Math.min(state.range.start,state.range.end), b=Math.max(state.range.start,state.range.end);
    if(b-a<1){ showModal('Pre-render', '<p>That range is empty.</p>'); return; }
    const started=Date.now();
    showModal('Pre-render', `<div class="export-progress"><div class="spinner"></div><p>Rendering ${b-a} frames (${fmtTime(b-a)})…</p><p class="muted" id="prTimer">0.0s</p></div>`, '');
    const timer=setInterval(()=>{ const el=$('prTimer'); if(el) el.textContent=`${((Date.now()-started)/1000).toFixed(1)}s`; },100);
    try{
      const data=await api('/itda/api/prerender',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({project:state.project?.name, range:{start:a, end:b}})});
      clearInterval(timer);
      if(!data.ok){ showModal('Pre-render', `<p>Failed: ${esc(data.error||'unknown error')}</p>`); return; }
      state.prerender={
        start_frame:data.start_frame, end_frame:data.end_frame, path:data.path,
        url:`/itda/api/file?path=${encodeURIComponent(data.path)}&project=${encodeURIComponent(state.project?.name||'')}&_cb=${Date.now()}`,
        signature:projectSignature(),
      };
      renderAll();
      showModal('Pre-render', `<p><b>${data.start_frame}f – ${data.end_frame}f</b> pre-rendered in ${((Date.now()-started)/1000).toFixed(1)}s.</p><p class="muted">Playback inside that range now uses the cached composite. Any edit invalidates it automatically; press R again to clear it.</p>`);
    }catch(e){
      clearInterval(timer);
      showModal('Pre-render', `<p>Failed: ${esc(e.message)}</p>`);
    }
  }
  function applyTooltips(){
    const tips={settingsTop:'Settings (Ctrl+,)',projectMenu:'Project Library (Ctrl+P)',saveProject:'Save Project (Ctrl+S)',exportProject:'Export (Ctrl+E)',sendComfy:'Send To ComfyUI (Ctrl+Enter)',previewMode:'Single Preview (1)',compareTop:'Compare Preview (2) - requires 2 selected clips',overlayTop:'Overlay Preview (3) - requires 2 selected clips',wipeTop:'Wipe Compare (4) - requires 2 selected clips, drag the split line',snapshotTop:'Snapshot (P)',fullscreenTop:'Fullscreen (F)',gotoClipStart:'Selected Clip Start',gotoClipEnd:'Selected Clip End',loopToggle:'Loop Range (L)',muteToggle:'Mute Monitor (M)',markIn:'Mark In (I)',markOut:'Mark Out (O)',clearRange:'Clear Range (Alt+X)',snapToggle:'Snap Toggle (S)',splitClip:'Split / Cut (C)',stitchClip:'Stitch selected clips (Shift+M)',autoStitchClip:'Auto Stitch - analyze the best overlap cut point between 2 selected video clips',addTransition:'Add Transition - select 2 adjacent video/image clips and insert a blended transition at the join',aiDetect:'AI Detect - scene changes / beat tracking for the selected clip',unstitchClip:'UnStitch selected clips (Shift+U)',groupClip:'Group selected clips (G)',ungroupClip:'Ungroup selected clips (Shift+G)',detachAudio:'Detach Audio (D)',mergeAudio:'Merge Audio back into video',prerender:'Pre-render the marked In/Out range into one cached file for smooth playback (R). Press again to clear.',deleteClip:'Delete selected clip (Delete/Backspace)',hZoom:'Horizontal Timeline Zoom',vZoom:'Vertical Track Zoom'};
    Object.entries(tips).forEach(([id,t])=>{const el=$(id); if(el) el.title=t;});
  }
  function bind(){
    applyTooltips();
    document.addEventListener('pointerup', e=>{ if(e.target.closest('button,input[type="range"]')) requestAnimationFrame(()=>document.activeElement?.blur?.()); }, true);
    $('saveProject').onclick=saveProject; $('projectMenu').onclick=showProjectPopup; $('settingsTop').onclick=showSettingsPopup; $('exportProject').onclick=exportProject; $('sendComfy').onclick=sendToComfy;
    $('clearMedia').onclick=()=>{state.media=[]; if(state.project){state.project.media=[];state.project.clips=[];} setSelection(null); renderAll();};
    $('addVideo').onclick=()=>{const fp=$('filePicker'); fp.accept='video/*'; fp.dataset.kind='video'; fp.click();}; $('addAudio').onclick=()=>{const fp=$('filePicker'); fp.accept='audio/*'; fp.dataset.kind='audio'; fp.click();}; $('addImage').onclick=()=>{const fp=$('filePicker'); fp.accept='image/*'; fp.dataset.kind='image'; fp.click();}; $('addText').onclick=addTextMedia; $('filePicker').onchange=e=>{addLocalFiles(e.target.files,e.target.dataset.kind); e.target.value='';};
    $('gridView').onclick=()=>{state.mediaView='grid'; $('gridView').classList.add('active'); $('listView').classList.remove('active'); renderMedia();}; $('listView').onclick=()=>{state.mediaView='list'; $('listView').classList.add('active'); $('gridView').classList.remove('active'); renderMedia();}; $('thumbScale').oninput=e=>{state.mediaThumb=Number(e.target.value)||104; renderMedia();};
    const mediaBin=document.querySelector('.media-bin');
    if(mediaBin){
      mediaBin.addEventListener('dragover',e=>{ if(e.dataTransfer?.types?.includes('Files')){ e.preventDefault(); mediaBin.classList.add('drag-over'); }});
      mediaBin.addEventListener('dragleave',()=>mediaBin.classList.remove('drag-over'));
      mediaBin.addEventListener('drop',e=>{ if(e.dataTransfer?.files?.length){ e.preventDefault(); mediaBin.classList.remove('drag-over'); addLocalFiles(e.dataTransfer.files,null); }});
    }
    $('playPause').onclick=playSelectedFromStart; $('previewStage').onclick=e=>{ if(e.target.id!=='snapshotToast' && !e.target.closest('#wipeHandle')) togglePlay(); };
    { const wh=$('wipeHandle'), stage=$('previewStage');
      wh.addEventListener('pointerdown', e=>{
        e.preventDefault(); e.stopPropagation();
        const move=ev=>{
          const rect=stage.getBoundingClientRect();
          state.wipePos=clamp(((ev.clientX-rect.left)/rect.width)*100, 2, 98);
          stage.style.setProperty('--wipe-pos', `${state.wipePos}%`);
        };
        move(e);
        document.addEventListener('pointermove', move);
        document.addEventListener('pointerup', ()=>document.removeEventListener('pointermove', move), {once:true});
      });
    } $('gotoClipStart').onclick=gotoSelectedStart; $('gotoClipEnd').onclick=gotoSelectedEnd; $('compareTop').onclick=()=>{ if(selectedClips().length===2){state.previewMode=state.previewMode==='compare'?'single':'compare'; renderAll();} }; $('overlayTop').onclick=()=>{ if(selectedClips().length===2){state.previewMode=state.previewMode==='overlay'?'single':'overlay'; renderAll();} }; const wipeTop=$('wipeTop'); if(wipeTop) wipeTop.onclick=()=>{ if(selectedClips().length===2){state.previewMode=state.previewMode==='wipe'?'single':'wipe'; renderAll();} }; $('previewMode').onclick=()=>{state.previewMode='single'; renderAll();}; $('snapshotTop').onclick=snapshot; $('fullscreenTop').onclick=()=>{ const el=$('previewStage'); if(document.fullscreenElement) document.exitFullscreen(); else el.requestFullscreen?.(); };
    document.querySelectorAll('[data-step]').forEach(btn=>btn.onclick=()=>stepFrame(btn.dataset.step)); $('snapToggle').onclick=()=>{state.snap=!state.snap; updateControls();}; const peakBtn=$('peakSnapToggle'); if(peakBtn) peakBtn.onclick=()=>{state.peakSnap=!state.peakSnap; updateControls(); status(`Peak Match ${state.peakSnap?'ON':'OFF'}`);}; $('loopToggle').onclick=()=>{state.loop=!state.loop; updateControls();}; $('muteToggle').onclick=()=>{state.mute=!state.mute; updateControls(); updatePreview();}; $('scrubAudioToggle').onclick=()=>{state.scrubAudio=!state.scrubAudio; updateControls(); if(!state.scrubAudio)(state.scrubAudios||[]).forEach(a=>a.pause());}; $('monitorVolume').oninput=e=>{const v=Math.min(100,Math.max(0,Number(e.target.value)||0)); e.target.value=v; state.monitorVolume=v/100; $('volumeLabel').textContent=`${v}%`; [$('previewVideo'),$('previewVideoB'),...(state.scrubAudios||[]),...(state.monitorAudios||[])].forEach(a=>{ if(a){ a.volume=state.monitorVolume; if(v>0 && !state.mute) a.muted=false; }});}; $('markIn').onclick=()=>{state.range.start=state.currentFrame; renderRange();}; $('markOut').onclick=()=>{state.range.end=state.currentFrame; renderRange();}; $('clearRange').onclick=()=>{state.range={start:null,end:null}; renderRange();};
    $('splitClip').onclick=splitSelected; $('stitchClip').onclick=stitchSelected; $('unstitchClip').onclick=unstitchSelected; const autoStitchBtn2=$('autoStitchClip'); if(autoStitchBtn2) autoStitchBtn2.onclick=autoStitchSelected; const transBtn2=$('addTransition'); if(transBtn2) transBtn2.onclick=()=>{ if(transBtn2.dataset.mode==='remove') removeTransitionSelected(); else addTransitionSelected(); }; const aiDetectBtn2=$('aiDetect'); if(aiDetectBtn2) aiDetectBtn2.onclick=aiDetectSelected; $('groupClip').onclick=groupSelected; $('ungroupClip').onclick=ungroupSelected; $('detachAudio').onclick=detachAudio; $('mergeAudio').onclick=mergeAudioBack; $('prerender').onclick=runPrerender; $('deleteClip').onclick=deleteSelected; const hz=$('hZoom'); if(hz) hz.oninput=e=>{state.pxPerFrame=Number(e.target.value)||state.pxPerFrame; renderTimeline();}; const vz=$('vZoom'); if(vz) vz.oninput=e=>{state.laneHeight=Number(e.target.value)||DEFAULT_LANE_H; renderTimeline();};
    const timeline=$('timeline'), ruler=$('ruler'); let scrubbing=false; const scrub=e=>{state.currentFrame=frameFromTimelineEvent(e); if(state.playing){state.playStartFrame=state.currentFrame; state.playStartedAt=performance.now();} updatePlayhead();}; ruler.addEventListener('mousedown',e=>{e.preventDefault(); e.stopPropagation(); scrubbing=true; scrub(e);}); document.addEventListener('mousemove',e=>{if(scrubbing){e.preventDefault(); scrub(e);}}); document.addEventListener('mouseup',e=>{ if(scrubbing){ e.preventDefault?.(); e.stopPropagation?.(); } scrubbing=false;});
    timeline.addEventListener('mousedown',e=>{
      if(e.target.closest('.clip')||e.target.closest('.lane-label')||e.target.closest('#ruler')) return;
      e.preventDefault();
      const additive=e.ctrlKey||e.metaKey||e.shiftKey;
      const box={startX:e.clientX,startY:e.clientY,moved:false,additive};
      const onMove=ev=>{
        if(Math.abs(ev.clientX-box.startX)>3 || Math.abs(ev.clientY-box.startY)>3) box.moved=true;
        if(!box.moved) return;
        const rect=timeline.getBoundingClientRect();
        const x1=Math.min(box.startX,ev.clientX)-rect.left+timeline.scrollLeft, x2=Math.max(box.startX,ev.clientX)-rect.left+timeline.scrollLeft;
        // y1/y2 are already correct #timeline-relative content coordinates -
        // #boxSelect is positioned absolute within #timeline, whose content
        // space starts at its own top (the sticky ruler still reserves its
        // 48px of flow space there). The old "-48" here subtracted that
        // reserved space a second time, drawing the box a constant 48px
        // above the actual cursor regardless of scroll.
        const y1=Math.min(box.startY,ev.clientY)-rect.top+timeline.scrollTop, y2=Math.max(box.startY,ev.clientY)-rect.top+timeline.scrollTop;
        const bs=$('boxSelect'); bs.style.display='block'; bs.style.left=`${x1}px`; bs.style.width=`${Math.max(1,x2-x1)}px`; bs.style.top=`${Math.max(0,y1)}px`; bs.style.height=`${Math.max(1,y2-y1)}px`;
      };
      const onUp=ev=>{
        document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp);
        $('boxSelect').style.display='none';
        if(!box.moved){ setSelection(null); state.currentFrame=frameFromTimelineEvent(e); renderAll(); return; }
        const fA=frameFromTimelineEvent({clientX:box.startX}), fB=frameFromTimelineEvent(ev);
        const frameLo=Math.min(fA,fB), frameHi=Math.max(fA,fB);
        const laneA=laneFromClientY(box.startY), laneB=laneFromClientY(ev.clientY);
        const laneLo=Math.min(laneA,laneB), laneHi=Math.max(laneA,laneB);
        const hits=(state.project?.clips||[]).filter(c=>c.lane>=laneLo && c.lane<=laneHi && c.start<frameHi && clipEnd(c)>frameLo);
        if(!hits.length){ if(!box.additive) setSelection(null); renderAll(); return; }
        if(box.additive){ hits.forEach(c=>{ if(!isSelected(c.id)) setSelection(c.id,true); }); }
        else { setSelection(hits[0].id,false); for(let i=1;i<hits.length;i++) setSelection(hits[i].id,true); }
        renderAll();
      };
      document.addEventListener('mousemove',onMove); document.addEventListener('mouseup',onUp);
    });
    timeline.addEventListener('dragover',e=>{e.preventDefault();}); timeline.addEventListener('drop',e=>{e.preventDefault(); const raw=e.dataTransfer.getData('application/itda-media'); if(!raw) return; const item=JSON.parse(raw); addClipFromMedia(item,frameFromTimelineEvent(e)); const c=selectedClip(); if(c){ const lane=laneFromTimelineEvent(e); if(!state.lockedLanes[lane]){ const fitted=fitSingleMove(c,c.start,lane,1); c.lane=fitted.lane; c.start=fitted.start; } renderAll(); }});
    timeline.addEventListener('wheel',e=>{ if(!e.ctrlKey) return; e.preventDefault(); const old=state.pxPerFrame; state.pxPerFrame=Math.max(.5,Math.min(20,state.pxPerFrame+(e.deltaY<0?.5:-.5))); timeline.scrollLeft=timeline.scrollLeft*(state.pxPerFrame/old); renderTimeline(); },{passive:false});
    function isShortcutBlockedByTextInput(e){
      if(e.isComposing) return true;
      const editableTypes = new Set(['text','number','search','url','email','password','tel','color','date','datetime-local','month','week','time']);
      const nodes = [];
      if(e.target) nodes.push(e.target);
      if(document.activeElement) nodes.push(document.activeElement);
      if(typeof e.composedPath === 'function') nodes.push(...e.composedPath());
      return nodes.some(el=>{
        if(!el || el === window || el === document || !el.tagName) return false;
        const tag = el.tagName.toUpperCase();
        if(el.isContentEditable) return true;
        if(tag === 'TEXTAREA' || tag === 'SELECT') return true;
        if(tag === 'INPUT'){
          const type = (el.getAttribute('type') || 'text').toLowerCase();
          return editableTypes.has(type);
        }
        return false;
      });
    }
    document.addEventListener('keydown',e=>{
      if(isShortcutBlockedByTextInput(e)) return;
      const k=e.key.toLowerCase();
      if((e.ctrlKey||e.metaKey) && k===','){e.preventDefault(); showSettingsPopup(); return;}
      if((e.ctrlKey||e.metaKey) && k==='p'){e.preventDefault(); showProjectPopup(); return;}
      if((e.ctrlKey||e.metaKey) && k==='s'){e.preventDefault(); saveProject(); return;}
      if((e.ctrlKey||e.metaKey) && k==='e'){e.preventDefault(); $('exportProject').click(); return;}
      if((e.ctrlKey||e.metaKey) && e.key==='Enter'){e.preventDefault(); $('sendComfy').click(); return;}
      if((e.ctrlKey||e.metaKey) && k==='d'){e.preventDefault(); duplicateSelected(); return;}
      if((e.ctrlKey||e.metaKey) && k==='c'){e.preventDefault(); copySelected(); return;}
      if((e.ctrlKey||e.metaKey) && k==='v'){e.preventDefault(); pasteClipboard(); return;}
      if(e.code==='Space'){e.preventDefault(); togglePlay();}
      else if(e.key==='Escape'){setSelection(null); renderAll();}
      else if(e.key==='Delete'||e.key==='Backspace') deleteSelected();
      else if(e.key==='ArrowLeft'&&e.altKey) stepFrame('first');
      else if(e.key==='ArrowRight'&&e.altKey) stepFrame('last');
      else if(e.key==='ArrowLeft'&&e.shiftKey) stepFrame(-5);
      else if(e.key==='ArrowRight'&&e.shiftKey) stepFrame(5);
      else if(e.key==='ArrowLeft') stepFrame(-1);
      else if(e.key==='ArrowRight') stepFrame(1);
      else if(k==='s' && !e.ctrlKey && !e.metaKey){state.snap=!state.snap; updateControls();}
      else if(k==='i'){state.range.start=state.currentFrame; renderRange();}
      else if(k==='o'){state.range.end=state.currentFrame; renderRange();}
      else if(k==='x'&&e.altKey){state.range={start:null,end:null}; renderRange();}
      else if(k==='l'){state.loop=!state.loop; updateControls();}
      else if(k==='m'&&e.shiftKey){stitchSelected();}
      else if(k==='u'&&e.shiftKey){unstitchSelected();}
      else if(k==='c'){splitSelected();}
      else if(k==='g'&&e.shiftKey){ungroupSelected();}
      else if(k==='g'){groupSelected();}
      else if(k==='d'&&!e.ctrlKey&&!e.metaKey){detachAudio();}
      else if(k==='r'){ $('prerender').click();}
      else if(k==='m'){state.mute=!state.mute; updateControls(); updatePreview();}
      else if(k==='a'){state.scrubAudio=!state.scrubAudio; updateControls(); if(!state.scrubAudio)(state.scrubAudios||[]).forEach(x=>x.pause());}
      else if(k==='f'){$('fullscreenTop').click();}
      else if(k==='1'){state.previewMode='single'; renderAll();}
      else if(k==='2'){if(selectedClips().length===2){state.previewMode=state.previewMode==='compare'?'single':'compare'; renderAll();}}
      else if(k==='3'){if(selectedClips().length===2){state.previewMode=state.previewMode==='overlay'?'single':'overlay'; renderAll();}}
      else if(k==='4'){if(selectedClips().length===2){state.previewMode=state.previewMode==='wipe'?'single':'wipe'; renderAll();}}
      else if(k==='p') snapshot();
      else if(e.key==='='||e.key==='+'){state.pxPerFrame=Math.min(20,state.pxPerFrame+.5); if($('hZoom')) $('hZoom').value=state.pxPerFrame; renderTimeline();}
      else if(e.key==='-'){state.pxPerFrame=Math.max(.5,state.pxPerFrame-.5); if($('hZoom')) $('hZoom').value=state.pxPerFrame; renderTimeline();}
    });
    $('previewVideo').addEventListener('timeupdate',()=>{ /* playhead is driven by frame clock, not video end events */ });
    let resizing=false; $('resizeHandle').addEventListener('mousedown',()=>resizing=true); document.addEventListener('mousemove',e=>{ if(!resizing) return; const y=e.clientY-46,h=window.innerHeight-46,upper=Math.max(250,Math.min(h-210,y)); $('upperPane').style.height=`${upper}px`; document.querySelector('.lower').style.height=`${h-upper-5}px`; }); document.addEventListener('mouseup',()=>resizing=false); $('modalClose').onclick=closeModal; $('modal').addEventListener('click',e=>{if(e.target.id==='modal') closeModal();});
  }
  bind(); initProject(new URLSearchParams(location.search).get('project')).catch(e=>status(`Init failed: ${e.message}`));
})();
