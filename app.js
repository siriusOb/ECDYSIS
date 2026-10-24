/* ECDYSIS V27 — independent 2D/3D scales (2D 1.30, 3D 0.75) */
import {Specimen2D,Specimen3D,SpecimenSoftware3D,parseOBJAsync} from './webgl.js?v=68';
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const IS_ANDROID=/Android/i.test(navigator.userAgent);
const IS_MOBILE_COLOR=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const names=['COCOON','HATCH','MOLT'];
const STAGE_COUNT=names.length;
const stageProgress=index=>Math.round(100*index/(STAGE_COUNT-1));
const DEFAULT={progress:0,modification:0,scale:1.3,palette:'origin',inkA:'#599782',inkB:'#72092a',intensity:.35,hue:0,mode:'surface',rotate:false,monoWhite:0};
const dimensionScales={ '2d':1.3, '3d':0.75 }; // Android MAGNITUDE starts at 0.75; remains user-adjustable.
let state={...DEFAULT},dimension='2d',twoD=null,threeD=null,playing=false,playStart=0,frameId=0,introTimer=0,introFade=0,toastTimer=0,modelsLoading=null;
const pics=Array(STAGE_COUNT).fill(null);
let texture3D = null; // Original cocoon7.png is reserved for 3D surface artwork.
function toast(message){const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500);}
const getImage=url=>new Promise((resolve,reject)=>{const img=new Image();img.decoding='async';img.onload=()=>resolve(img);img.onerror=()=>reject(Error(url+' not found'));img.src=url;});

/* Only small CSS for the separate dimension selector; all main styles stay in styles.css. */
const dim=document.createElement('section');dim.className='v7-dimension';dim.innerHTML=`<div class="v7-dim-buttons"><button class="active" type="button" data-dimension="2d" aria-pressed="true">IMPRINT / 2D</button><button type="button" data-dimension="3d" aria-pressed="false">EMBODIMENT / 3D</button></div>`;
// Keep any legacy four-stage HTML compatible with the three-stage controller.
$$('[data-stage]').forEach(button=>{
 if(Number(button.dataset.stage)>=STAGE_COUNT)button.remove();
});
const labLegend=$('.dial-legend span');
if(labLegend)labLegend.textContent='COCOON → MOLT';
const labHeading=$('#view-ecdysis .lab-heading .topline span:last-child');
if(labHeading)labHeading.textContent='THREE SKINS / THREE BODIES';
const dimensionMount=$('#dimension-mount');
if(dimensionMount) dimensionMount.appendChild(dim);
else $('.stage-buttons')?.insertAdjacentElement('afterend',dim);
/* ECDYSIS V21 — independent canvas backdrop selector; does not alter artwork. */
const backdropControl=document.createElement('section');
backdropControl.className='backdrop-control';
backdropControl.setAttribute('role','group');
backdropControl.setAttribute('aria-label','Image experiment background');
backdropControl.innerHTML=`<div class="micro backdrop-heading"><span>HABITAT</span><span>03 / GROUND</span></div><div class="backdrop-buttons"><button type="button" data-backdrop-choice="beige" class="active" aria-pressed="true"><i class="backdrop-swatch backdrop-swatch-beige" aria-hidden="true"></i> SAND / BEIGE</button><button type="button" data-backdrop-choice="black" aria-pressed="false"><i class="backdrop-swatch backdrop-swatch-black" aria-hidden="true"></i> VOID / BLACK</button></div>`;
const habitatMount=$('#habitat-mount');
if(habitatMount) habitatMount.appendChild(backdropControl);
else dim.insertAdjacentElement('afterend',backdropControl);
// V35: the ORBIT control belongs directly below DISPLAY DIMENSION.
const orbitControl=$('#toggle-rotate');
if(orbitControl){const orbitMount=$('#orbit-mount');if(orbitMount)orbitMount.appendChild(orbitControl);else dim.insertAdjacentElement('afterend',orbitControl);}
const modeBackgrounds={'2d':'beige','3d':'black'};
// V68: 3D ORBIT is active by default on every platform, including Android.
// Android keeps its existing frame throttling for ordinary operation.
const modeOrbits={'2d':false,'3d':true};
const specimenStage=$('#view-molt .canvas-stage');
if(specimenStage)specimenStage.dataset.dimension=dimension;
let canvasBackground='beige';
function setCanvasBackground(selection){
 canvasBackground=selection==='black'?'black':'beige';
 modeBackgrounds[dimension]=canvasBackground;
 state.monoWhite=canvasBackground==='black'?1:0;
 if(active())render();
 const stage=$('.canvas-stage');
 if(stage)stage.dataset.backdrop=canvasBackground;
 $$('[data-backdrop-choice]').forEach(button=>{
  const selected=button.dataset.backdropChoice===canvasBackground;
  button.classList.toggle('active',selected);
  button.setAttribute('aria-pressed',String(selected));
 });
}
$$('[data-backdrop-choice]').forEach(button=>button.addEventListener('click',()=>setCanvasBackground(button.dataset.backdropChoice)));
setCanvasBackground('beige');
let canvas3D=$('#webgl-canvas');const canvas2D=document.createElement('canvas');canvas2D.id='canvas-2d';canvas3D.parentElement.insertBefore(canvas2D,canvas3D);canvas3D.style.display='none';
const meshModes=$('.mode-buttons');if(meshModes)meshModes.style.display='none';
$('.assets')?.remove();
function active(){return dimension==='3d'?threeD:twoD;}
function render(){active()?.setParams(state);}
function show(which){const target=which==='molt'?'molt':'ecdysis';$$('.view').forEach(el=>el.hidden=el.id!=='view-'+target);$$('.site-nav button').forEach(el=>{const yes=el.dataset.view===target;el.classList.toggle('current',yes);if(yes)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});history.replaceState(null,'','#'+target);window.scrollTo({top:0,behavior:'instant'});if(target==='molt')init2D();}
$$('[data-view]').forEach(b=>b.addEventListener('click',()=>show(b.dataset.view)));

/* ECDYSIS V30: preload intro INK and custom font before a single animation.
   Intro image has a permanent src in index.html. Never replace its pixels. */
function fitIntro(){
 const title=$('#intro-word'),box=$('.intro-fit');
 if(!title||!box)return;
 title.style.setProperty('--fit','1');
 title.style.setProperty('--fit',String(Math.min(1,(box.clientWidth-16)/Math.max(1,title.scrollWidth))));
}
let introRun=0;
function closeIntro(){
 ++introRun;
 clearTimeout(introTimer);
 const el=$('#intro');
 if(!el||el.hidden)return;
 el.classList.add('is-leaving');
 clearTimeout(introFade);
 introFade=setTimeout(()=>{el.hidden=true;el.classList.remove('is-leaving','intro-playing');},830);
}
function waitForIntroInk(){
 const image=$('.intro-image');
 if(!image)return Promise.resolve();
 if(image.complete)return image.naturalWidth>0?image.decode?.().catch(()=>{})??Promise.resolve():Promise.resolve();
 return new Promise(resolve=>{
  image.addEventListener('load',()=>resolve(),{once:true});
  image.addEventListener('error',()=>{console.warn('[ECDYSIS] Intro ink unavailable: assets/cocoon7-ink.png');resolve();},{once:true});
 });
}
async function intro(){
 const el=$('#intro');if(!el)return;
 const run=++introRun;
 clearTimeout(introTimer);clearTimeout(introFade);
 el.hidden=false;
 el.classList.remove('is-leaving','intro-playing');
 // Browser fonts use font-display:swap elsewhere; don't expose the heading
 // until the actual custom face is resolved to prevent font flashes.
 const inkReady=waitForIntroInk();
 const fontReady=document.fonts?.load('64px "ECD Gothic"').catch(error=>{
  console.warn('[ECDYSIS] Intro font loading:',error);return [];
 })??Promise.resolve([]);
 // Avoid an indefinitely blank intro when Safari delays an image decode or font.
 // Readiness normally resolves immediately, but the opening always starts
 // within 1.6 seconds even if an asset request stalls.
 await Promise.race([
  Promise.all([inkReady,fontReady]),
  new Promise(resolve=>setTimeout(resolve,1600))
 ]);
 if(run!==introRun||el.hidden)return;
 fitIntro();
 // A single forced style read gives replay a fresh animation timeline.
 void el.offsetWidth;
 el.classList.add('intro-playing');
 introTimer=setTimeout(closeIntro,matchMedia('(prefers-reduced-motion: reduce)').matches?900:4000);
}
$('#intro-threads')?.remove();
$('#intro-skip')?.addEventListener('click',closeIntro);
$('#replay-intro')?.addEventListener('click',()=>{void intro();});
window.addEventListener('resize',()=>{if($('#intro')?.classList.contains('intro-playing'))fitIntro();});
// V36: V35 accidentally removed the initial intro() call while simplifying
// editorial image loading. Without it, CSS leaves ink + title invisible.
// Start exactly ONCE; replay is handled separately by the REPLAY INTRO button.
void intro();

/* V35: Editorial art is displayed directly from cocoon7-ink.png in HTML.
   Do not redraw it on a temporary canvas or replace it asynchronously. */

/* ECDYSIS V12: 2D stages use cocoon1.png–cocoon3.png ONLY.
   The 3D OBJ surface uses cocoon7.png independently.
   Do not reuse the 2D stage-1 PNG for the OBJ texture. */
async function loadPictures() {
  let loaded = 0;
  for (let i = 0; i < STAGE_COUNT; i++) {
    const filename = `cocoon${i + 1}.png`;
    try {
      const picture = await getImage(`assets/${filename}`);
      pics[i] = picture;
      if(dimension==='2d')syncOriginSwatch(Math.min(STAGE_COUNT-1,Math.round(state.progress/100*(STAGE_COUNT-1))));
      loaded++;
      twoD?.setImage(i, picture);
      console.info(`[ECDYSIS] 2D ${names[i]} -> ${filename}`);
    } catch (error) {
      pics[i] = null;
      console.warn(`[ECDYSIS] Missing 2D image: assets/${filename}`, error);
    }
  }

  // Missing stages reuse an available image only as a clearly reported preview.
  // No 2D step is silently remapped to cocoon7.png.
  const preview = pics.find(Boolean);
  if (preview) {
    for (let i = 0; i < STAGE_COUNT; i++) {
      if (!pics[i]) {
        pics[i] = preview;
        twoD?.setImage(i, preview);
      }
    }
  } else {
    toast('2D images missing: add cocoon1.png, cocoon2.png, cocoon3.png to assets.');
  }
  if (dimension === '2d') {
    $('#geometry-status').textContent = `2D / ${loaded}/${STAGE_COUNT} PNG LOADED`;
  }
}

function apply3DTexture() {
  if (!threeD || !texture3D) return;
  for (let i = 0; i < STAGE_COUNT; i++) {
    threeD.setImage(i, texture3D);
  }
}

async function load3DTexture() {
  for (const filename of ['cocoon7.png', 'cocoon7-ink.png']) {
    try {
      texture3D = await getImage(`assets/${filename}`);
      if(dimension==='3d')syncOriginSwatch(Math.min(STAGE_COUNT-1,Math.round(state.progress/100*(STAGE_COUNT-1))));
      console.info(`[ECDYSIS] 3D surface artwork -> ${filename}`);
      apply3DTexture();
      return;
    } catch {}
  }
  console.error('[ECDYSIS] Missing 3D artwork: assets/cocoon7.png');
  toast('3D texture missing: add cocoon7.png to assets.');
}

void loadPictures();
void load3DTexture();
function init2D(){if(!twoD){twoD=new Specimen2D(canvas2D);pics.forEach((im,i)=>{if(im)twoD.setImage(i,im);});twoD.setParams(state);}twoD.resize();updateUI();}
/* Renderer selection: show the canvas BEFORE context creation, then try GPU.
   If WebGL2 is blocked or shaders fail, use a real software 3D projection. */
let backend = 'uninitialised';
let gpuError = '';
async function init3D(){
  if(threeD) return true;
  canvas3D.style.display = 'block';
  canvas2D.style.display = 'none';
  try {
    const candidate = new Specimen3D(canvas3D);
    threeD = candidate;
    backend = 'WebGL2';
  } catch(error) {
    gpuError = String(error?.message || error);
    console.warn('[ECDYSIS] GPU 3D startup failed:', error);
    // A canvas that has ever acquired WebGL cannot acquire a 2D context.
    // Replace it before constructing the software renderer.
    const replacement = document.createElement('canvas');
    replacement.id = 'webgl-canvas';
    replacement.setAttribute('aria-label','Interactive software 3D OBJ specimen');
    canvas3D.replaceWith(replacement);
    canvas3D = replacement;
    try {
      threeD = new SpecimenSoftware3D(canvas3D);
      backend = 'Software 3D';
      toast('WebGL2 blocked: software 3D is active.');
    } catch(fallbackError) {
      console.error('[ECDYSIS] Software 3D startup failed:', fallbackError);
      gpuError += ' | Software 3D: ' + String(fallbackError?.message || fallbackError);
      $('#geometry-status').textContent = '3D ERROR — SEE CONSOLE';
      toast('3D error — open browser console.');
      canvas3D.style.display = 'none';
      canvas2D.style.display = 'block';
      return false;
    }
  }
  // V46: before uploading the shared atlas or rendering any loaded OBJ,
  // initialise the viewer at the currently selected phase. This prevents
  // a one-frame default-COCOON flash on first switching from 2D to 3D.
  Object.assign(threeD.params,state,{scale:dimensionScales['3d']});
  apply3DTexture();
  threeD.resize();
  $('#geometry-status').textContent = '3D / ' + backend.toUpperCase() + ' — LOADING';
  if(!modelsLoading) modelsLoading = loadModels().catch(err=> {
    console.error('[ECDYSIS] OBJ load failed:',err);
    $('#geometry-status').textContent = '3D / OBJ LOAD FAILED';
  });
  return true;
}
async function loadModels(){
 let loaded=0;
 for(let i=0;i<STAGE_COUNT;i++){
  const file='cocoon'+(i+1)+'.obj';
  $('#geometry-status').textContent = '3D / '+backend.toUpperCase()+' — LOADING '+file.toUpperCase();
  try{
   const res=await fetch('assets/'+file,{cache:'no-store'});
   if(!res.ok)throw Error('HTTP '+res.status+' '+file);
   const g=await parseOBJAsync(await res.text(),{mobileLOD:IS_ANDROID});
   threeD?.setMesh(i,g);
   loaded++;
   console.info('[ECDYSIS] '+file+': '+(g.pos.length/3)+' vertices, '+(g.tri.length/3)+' triangles');
  }catch(err){
   console.warn('[ECDYSIS] OBJ stage missing:',file,err);
   if(i===0)toast('Missing cocoon1.obj — put it in assets.');
  }
 }
 $('#geometry-status').textContent = '3D / '+backend.toUpperCase()+' — '+loaded+'/'+STAGE_COUNT+' OBJ';
 threeD?.draw();
}
async function changeDimension(to){
 if(to!=="2d"&&to!=="3d")return;
 if(to===dimension){ updateUI(); return; }
 modeOrbits[dimension]=state.rotate;
 modeBackgrounds[dimension]=canvasBackground;
 // Remember the viewer-adjusted slider value before switching modes.
 dimensionScales[dimension]=state.scale;
 if(to==='3d'){
  // Entering Android 3D should always enable ORBIT; the user can pause it.
  if(IS_ANDROID)modeOrbits['3d']=true;
  // Make the existing 3D surface reflect the selected phase before revealing
  // it; it must never temporarily display a stale/default COCOON frame.
  if(threeD) threeD.setParams({...state,scale:dimensionScales['3d']});
  canvas3D.style.display='block'; canvas2D.style.display='none';
  if(!await init3D()){
   canvas3D.style.display='none'; canvas2D.style.display='block';
   updateUI(); return;
  }
  dimension='3d';
  if(meshModes)meshModes.style.display='flex';
  threeD.setInteractiveMode?.(state.rotate);
  threeD.resize();
 }else{
  dimension='2d';
  canvas3D.style.display='none'; canvas2D.style.display='block';
  if(meshModes)meshModes.style.display='none';
  threeD?.setInteractiveMode?.(false);
  init2D();
 }
 state.scale=dimensionScales[dimension];
 state.rotate=modeOrbits[dimension];
 if(specimenStage)specimenStage.dataset.dimension=dimension;
 setCanvasBackground(modeBackgrounds[dimension]);
 threeD?.setInteractiveMode?.(dimension==='3d' && state.rotate);
 $('#geometry-status').textContent=dimension==='2d'
  ?'2D / IMAGE SEQUENCE'
  :'3D / '+backend.toUpperCase()+(backend==='Software 3D'?' (FALLBACK)':'');
 $$('[data-dimension]').forEach(b=>{
  const yes=b.dataset.dimension===dimension;
  b.classList.toggle('active',yes);
  b.setAttribute('aria-pressed',String(yes));
 });
 updateUI();
 render();
 animate();
}
$$('[data-dimension]').forEach(b=>b.addEventListener('click',()=>void changeDimension(b.dataset.dimension)));

function setProgress(v,smooth=false){
 const value=Math.min(100,Math.max(0,Number(v)||0));
 // Only Android's timed cycle uses fractional progress. Manual controls remain
 // whole-number steps, and existing stage geometry/appearance is unchanged.
 state.progress=smooth?Math.round(value*10)/10:Math.round(value);
 updateUI();render();
}
function syncOriginSwatch(_stageIndex){
 // ORIGIN is a fixed six-colour reference key, not a stage-thumbnail.
 // The actual original image and 3D pigment rendering remain unchanged.
 const swatch=$('.swatch-origin');
 if(!swatch)return;
 swatch.style.backgroundImage='linear-gradient(90deg, #178963 0%, #675b3f 20%, #89443d 40%, #701e28 60%, #6e1d59 80%, #2d3257 100%)';
 swatch.style.backgroundSize='100% 100%';
 swatch.style.backgroundPosition='center';
 swatch.style.backgroundRepeat='no-repeat';
}
function updateUI(){const p=Math.round(state.progress),phase=Math.min(STAGE_COUNT-1,Math.round(p/100*(STAGE_COUNT-1)));$('#progress-range').value=p;if($('#progress-readout'))$('#progress-readout').textContent=p+'%';$('#dial-number').textContent=String(p).padStart(2,'0');$('#dial-arc').style.strokeDashoffset=515.22*(1-p/100);syncOriginSwatch(phase);$('#progress-dial').setAttribute('aria-valuenow',String(p));$('#stage-counter').innerHTML=String(p).padStart(2,'0')+'<span>%</span>';$('#stage-state').textContent=names[phase]+' / '+['ORIGIN','OPENING','SHEDDING'][phase];$$('[data-stage]').forEach((b,i)=>{const selected=phase===i;b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));});$$('[data-param]').forEach(inp=>{const key=inp.dataset.param;inp.value=state[key];const out=$('#out-'+key);if(out)out.textContent=key==='hue'?String(state.hue):Number(state[key]).toFixed(2);});$$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));$$('[data-palette]').forEach(b=>{const yes=b.dataset.palette===state.palette;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes));});$('#color-a').value=state.inkA;$('#color-b').value=state.inkB;document.documentElement.style.setProperty('--a',state.inkA);document.documentElement.style.setProperty('--b',state.inkB);const orbit=$('#toggle-rotate');orbit.setAttribute('aria-pressed',String(state.rotate));$('#orbit-pill').textContent=state.rotate?'ON':'OFF';$('#orbit-state').textContent=state.rotate?'ACTIVE / CLICK TO PAUSE':'PAUSED / CLICK TO ORBIT';$('#play-sequence').textContent=playing?'Ⅱ PAUSE CYCLE':'▶ UNFOLD CYCLE';$('#play-sequence').classList.toggle('is-playing',playing);$('#play-sequence').setAttribute('aria-pressed',String(playing));}
const dial=$('#progress-dial');function pointDial(e){const r=dial.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;setProgress(Math.round(((Math.atan2(x,-y)+Math.PI*2)%(Math.PI*2))/(Math.PI*2)*100));}
dial.addEventListener('pointerdown',e=>{e.preventDefault();dial.setPointerCapture(e.pointerId);pointDial(e);});dial.addEventListener('pointermove',e=>{if(dial.hasPointerCapture(e.pointerId))pointDial(e);});dial.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const dir=['ArrowLeft','ArrowDown'].includes(e.key)?-1:1;setProgress(e.key==='Home'?0:e.key==='End'?100:state.progress+dir*(e.shiftKey?10:1));});$('#progress-range').addEventListener('input',e=>setProgress(e.target.value));$$('[data-stage]').forEach((b,i)=>b.addEventListener('click',()=>setProgress(stageProgress(i))));
/* Render just ONE visible canvas, with one animation frame for slider bursts. */
let inputRAF=0;
$$('[data-param]').forEach(inp=>inp.addEventListener('input',()=>{state[inp.dataset.param]=Number(inp.value);if(inp.dataset.param==='scale')dimensionScales[dimension]=state.scale;updateUI();if(!inputRAF)inputRAF=requestAnimationFrame(()=>{inputRAF=0;render();});}));
$$('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;updateUI();render();}));
$$('[data-palette]').forEach(b=>b.addEventListener('click',()=>{state.palette=b.dataset.palette;updateUI();render();}));
for(const [selector,key] of [['#color-a','inkA'],['#color-b','inkB']])$(selector).addEventListener('input',e=>{state[key]=e.target.value;state.palette='custom';updateUI();if(!inputRAF)inputRAF=requestAnimationFrame(()=>{inputRAF=0;render();});});
$('#reset-all').addEventListener('click',()=>{playing=false;dimensionScales['2d']=1.3;dimensionScales['3d']=0.75;modeBackgrounds['2d']='beige';modeBackgrounds['3d']='black';modeOrbits['2d']=false;modeOrbits['3d']=true;state={...DEFAULT,scale:dimensionScales[dimension],rotate:modeOrbits[dimension]};if(twoD){twoD.zoom=1;twoD.angle=0;}if(threeD){threeD.zoom=1;threeD.yaw=0;threeD.pitch=0;threeD.setInteractiveMode?.(dimension==='3d'&&state.rotate);}setCanvasBackground(modeBackgrounds[dimension]);updateUI();render();animate();toast('RESET / ORIGIN RESTORED');});
$('#toggle-rotate').addEventListener('click',()=>{state.rotate=!state.rotate;modeOrbits[dimension]=state.rotate;threeD?.setInteractiveMode?.(state.rotate&&dimension==='3d');updateUI();animate();});
// UNFOLD CYCLE: pointerdown is immediate on mouse/touch, with click
// fallback for keyboard. 100% restarts from the initial COCOON state.
function toggleCycle(){
 if(playing){playing=false;updateUI();return;}
 if(state.progress>=100)setProgress(0);
 playStart=performance.now()-state.progress/100*16000;
 playing=true;updateUI();animate();
}
let lastCyclePointer=-Infinity;
$('#play-sequence').addEventListener('pointerdown',e=>{
 lastCyclePointer=performance.now();e.preventDefault();toggleCycle();
});
$('#play-sequence').addEventListener('click',()=>{
 if(performance.now()-lastCyclePointer<500)return;
 toggleCycle();
});
// 3D orbit is frame-rate independent; cap GPU work near 30fps instead of 60.
let lastOrbitTime=0,lastOrbitPaint=0,lastCyclePaint=0;
function animate(){
 if(frameId)return;
 function tick(now){
  frameId=0;
  if(document.hidden){lastOrbitTime=0;return;}
  if(playing){
   const t=Math.min(1,(now-playStart)/16000);
   // V63 rounded the entire 16-second cycle to just 101 discrete images
   // (around 6 changes per second). During Android playback, preserve 0.1%
   // progress increments but throttle actual UI/GPU work to ~20 fps.
   if(!IS_ANDROID || t===1 || now-lastCyclePaint>=45){
    lastCyclePaint=now;
    const next=IS_ANDROID?Math.round(t*1000)/10:Math.round(t*100);
    if(next!==state.progress)setProgress(next,IS_ANDROID);
   }
   if(t===1){playing=false;updateUI();}
  }
  if(state.rotate && (dimension==='3d'?Boolean(threeD):Boolean(twoD))){
   const dt=lastOrbitTime?Math.min(IS_ANDROID?150:70,now-lastOrbitTime):16.7;
   if(dimension==='3d')threeD.yaw+=(dt*.00024);
   else twoD.angle=(twoD.angle||0)+dt*.00021;
   lastOrbitTime=now;
   if(now-lastOrbitPaint>=(IS_ANDROID?(logSession?45:85):32)){
    lastOrbitPaint=now;
    if(dimension==='3d'){if(typeof threeD.requestDraw==='function')threeD.requestDraw();else threeD.draw();}
    else twoD.draw();
   }
  }else{lastOrbitTime=0;}
  if(playing||(state.rotate&&(dimension==='3d'?Boolean(threeD):Boolean(twoD))))frameId=requestAnimationFrame(tick);
 }
 frameId=requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(playing||state.rotate))animate();});

/* Export settings retained from V7. */
const wrap=$('#export-wrap'),exportBtn=$('#export-png');function toggleMenu(open){wrap.classList.toggle('open',open);exportBtn.setAttribute('aria-expanded',String(open));}
exportBtn.addEventListener('click',()=>toggleMenu(!wrap.classList.contains('open')));document.addEventListener('pointerdown',e=>{if(!wrap.contains(e.target))toggleMenu(false);});document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleMenu(false);});
async function exportPNG(kind){
 try{
  const renderer=active();if(!renderer){toast('OPEN MOLT FIRST');return;}
  const src=renderer.exportCanvas();
  if(!src?.width||!src?.height)throw Error('Render canvas is not ready');
  const out=document.createElement('canvas');
  out.width=IS_ANDROID?Math.min(960,Math.max(640,src.width)):Math.min(2400,Math.max(1400,src.width));
  out.height=Math.round(out.width*src.height/src.width);
  const ctx=export2DContext(out,{alpha:kind!=='background'});
  if(!ctx)throw Error('PNG canvas is unavailable');
  ctx.setTransform(1,0,0,1,0,0);
  ctx.globalAlpha=1;
  if(kind==='background'){
   ctx.fillStyle=canvasBackground==='black'?'#08090b':'#e8dec4';
   ctx.fillRect(0,0,out.width,out.height);
  }
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  if(kind==='background'&&IS_MOBILE_COLOR){
   drawMobileOpaqueSpecimen(ctx,src,0,0,out.width,out.height);
  }else{
   // Transparent PNG must remain genuinely transparent, not matte-filled.
   drawExportSpecimen(ctx,src,0,0,out.width,out.height);
  }
  if(kind==='background'){
   ctx.fillStyle=canvasBackground==='black'?'#c7f9e4':'#72092a';
   ctx.font=`${Math.round(out.width*.018)}px monospace`;
   ctx.fillText('ECDYSIS / '+dimension.toUpperCase(),out.width*.04,out.height*.92);
   ctx.textAlign='right';
   ctx.fillText(state.progress+'%',out.width*.96,out.height*.92);
  }
  const blob=await new Promise((resolve,reject)=>out.toBlob(x=>x?resolve(x):reject(Error('PNG encoder failed')),'image/png'));
  const filename=`ECDYSIS_${dimension.toUpperCase()}_${state.progress}P_${kind.toUpperCase()}.png`;
  if(IS_ANDROID){showAndroidSave(blob,filename);return;}
  const file=new File([blob],filename,{type:'image/png'});
  if(/iPhone|iPad|iPod/.test(navigator.userAgent)&&navigator.share&&navigator.canShare?.({files:[file]})){
   try{await navigator.share({files:[file]});return;}
   catch(e){if(e.name==='AbortError')return;}
  }
  outputFile(blob,filename);toast('PNG EXPORTED');
 }catch(error){console.error(error);toast('EXPORT FAILED: '+error.message);}
}
$$('[data-export]').forEach(b=>b.addEventListener('click',()=>{toggleMenu(false);void exportPNG(b.dataset.export);}));

/* ECDYSIS V33 / reliable motion LOG.
   GIF is encoded locally in a worker with an inline main-thread fallback.
   MP4 recording is optional and cannot prevent GIF export. */
// Mobile GIF frames are kept in memory before encoding; limit Android peak RAM.
// Desktop + Apple export quality/length remain unchanged.
const LOG_FPS=30, GIF_FPS=8, GIF_WIDTH=960, MAX_LOG_SECONDS=60;
// Android uses bounded capture buffers rather than running a second large
// pixel-processing loop while its 3D GPU is busy.
// V64: Android LOG restores the original 60-second safety limit (the user
// may stop sooner by tapping LOG a second time). Raise capture cadence for
// motion while keeping the V61 bounded output resolution and frame buffers.
// V65: Keep good colour/detail without driving the OBJ shader at video-canvas resolution.
// Video/GIF buffers are 2D composites; their size does NOT alter WebGL surface pixels.
// Lower-tier Android keeps the 720px tier while capable devices get 960px video.
const ANDROID_CAPABLE=(navigator.hardwareConcurrency||4)>=6 && (navigator.deviceMemory===undefined||navigator.deviceMemory>=4);
const ANDROID_GIF_FPS=8, ANDROID_GIF_WIDTH=ANDROID_CAPABLE?500:440, ANDROID_MAX_LOG_SECONDS=60;
const ANDROID_VIDEO_FPS=ANDROID_CAPABLE?24:20, ANDROID_VIDEO_WIDTH=ANDROID_CAPABLE?960:720;

/* V37: GIF quality 960px with spatial ordered dithering, stable palette.
   GIF has only 256 colours. The old RGB332 palette encoded beige
   #e8dec4 as pink #ffdbff. Use a finer 216-colour cube + 40 precisely
   chosen neutrals/pigments, shared by ALL frames for temporal stability. */
function gifPaletteColors(){
 const colors=[];
 for(let r=0;r<6;r++)for(let g=0;g<6;g++)for(let b=0;b<6;b++)colors.push([r*51,g*51,b*51]);
 const additional=[
  '#e8dec4','#08090b','#fffaee','#72092a','#c7f9e4','#599782',
  '#b15169','#184c48','#225d58','#89c9b3','#c58c9c','#c8d5bd',
  '#e8dcca','#e2d5bb','#e6decb','#e5dcc7','#ddd4c0','#d9cfb8',
  '#f1e7d5','#fff3e1','#997a82','#5e8176','#6faba0','#8dcabc',
  '#b9ded3','#72938b','#4f5f5a','#263e37','#3f7e74','#96a99f',
  '#c4b7a5','#b9b2a7','#8a7774','#6b5e5a','#c8a4aa','#815267',
  '#d5b4b8','#a1b6b2','#7b9897','#aacac1'
 ];
 for(const hex of additional){colors.push([1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)));}
 if(colors.length!==256)throw Error('GIF palette must contain 256 colors');
 return colors;
}
let gifColorLookup=null;
function getGifColorLookup(){
 if(gifColorLookup)return gifColorLookup;
 const palette=gifPaletteColors();
 const lookup=new Uint8Array(32768);
 for(let key=0;key<lookup.length;key++){
  const r=((key>>10)&31)*255/31,g=((key>>5)&31)*255/31,b=(key&31)*255/31;
  let best=0,dist=Infinity;
  for(let i=0;i<palette.length;i++){
   const c=palette[i],dr=r-c[0],dg=g-c[1],db=b-c[2];
   const d=2*dr*dr+3.1*dg*dg+2.1*db*db;
   if(d<dist){dist=d;best=i;}
  }
  lookup[key]=best;
 }
 gifColorLookup=lookup;
 return lookup;
}
let logSession=null,logReady={gif:null,video:null,videoFormat:null};
const logBtn=$('#log-toggle'),logLabel=$('#log-label');
let logMode='idle';
const logDialog=$('#log-dialog');
function logClock(s){const n=Math.floor(Math.max(0,s));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');}
function setLogButton(stage){
 logMode=stage;
 logBtn.disabled=stage==='processing';
 logBtn.classList.toggle('is-recording',stage==='recording');
 logBtn.setAttribute('aria-pressed',String(stage==='recording'));
 logLabel.textContent=stage==='processing'?'LOADING...':stage==='recording'?logClock(logSession?(performance.now()-logSession.start)/1000:0):'MOTION ARCHIVE';
 logBtn.title=stage==='recording'?'Click again to stop recording':stage==='processing'?'Preparing GIF and video':'Start motion recording';
}
function updateLogClock(session){
 if(logSession!==session || logMode!=='recording')return;
 logLabel.textContent=logClock((performance.now()-session.start)/1000);
}
// Different browser engines expose different encoders. Never pretend a WebM is MP4.
function availableVideoFormats(){
 if(typeof MediaRecorder==='undefined')return [];
 const formats=[
  {type:'video/mp4;codecs="avc1.42E01E"',extension:'mp4',label:'MP4'},
  {type:'video/mp4;codecs=avc1.42E01E',extension:'mp4',label:'MP4'},
  {type:'video/mp4',extension:'mp4',label:'MP4'},
  {type:'video/webm;codecs=vp9',extension:'webm',label:'WEBM'},
  {type:'video/webm;codecs=vp8',extension:'webm',label:'WEBM'},
  {type:'video/webm',extension:'webm',label:'WEBM'}
 ];
 return formats.filter(f=>{try{return MediaRecorder.isTypeSupported(f.type);}catch{return false;}});
}

/* V62: Mobile native image/video encoders must receive the same standard
 * sRGB colour values as the canvas. Opaque exports composite translucent fibres
 * against their selected background at the SOURCE resolution, then upscale the
 * finished opaque image. This avoids dark transparent edges from resampling
 * low-resolution Android WebGL canvases. No colour boosting or pixel loops. */
function export2DContext(canvas,options={}){
 return canvas.getContext('2d',{...options,colorSpace:'srgb'});
}
let mobileOpaqueCanvas=null;
function drawMobileOpaqueSpecimen(ctx,source,x,y,width,height){
 if(!source?.width||!source?.height)return;
 if(!mobileOpaqueCanvas)mobileOpaqueCanvas=document.createElement('canvas');
 if(mobileOpaqueCanvas.width!==source.width)mobileOpaqueCanvas.width=source.width;
 if(mobileOpaqueCanvas.height!==source.height)mobileOpaqueCanvas.height=source.height;
 const inner=export2DContext(mobileOpaqueCanvas,{alpha:false});
 if(!inner){drawExportSpecimen(ctx,source,x,y,width,height);return;}
 inner.setTransform(1,0,0,1,0,0);
 inner.globalAlpha=1;
 inner.fillStyle=canvasBackground==='black'?'#08090b':'#e8dec4';
 inner.fillRect(0,0,source.width,source.height);
 inner.drawImage(source,0,0);
 drawExportSpecimen(ctx,mobileOpaqueCanvas,x,y,width,height);
}
/* V42: canvas export composition must NEVER stretch a specimen when its
 * viewport changes from a square to a wide rectangle (or is resized mid-LOG).
 * Use centered contain fitting for the current rendered canvas dimensions. */
function drawExportSpecimen(ctx,source,x,y,width,height){
 if(!source || source.width<=0 || source.height<=0)return;
 const factor=Math.min(width/source.width,height/source.height);
 const drawWidth=source.width*factor,drawHeight=source.height*factor;
 ctx.drawImage(source,x+(width-drawWidth)/2,y+(height-drawHeight)/2,drawWidth,drawHeight);
}
function composeLogFrame(session,source){
 const {output,ctx}=session;
 const w=output.width,h=output.height;
 ctx.setTransform(1,0,0,1,0,0);
 ctx.globalAlpha=1;
 ctx.fillStyle=canvasBackground==='black'?'#08090b':'#e8dec4';
 ctx.fillRect(0,0,w,h);
 if(IS_MOBILE_COLOR)drawMobileOpaqueSpecimen(ctx,source,0,0,w,h);
 else drawExportSpecimen(ctx,source,0,0,w,h);
}
function outputFile(blob,filename){
 if(!(blob instanceof Blob)||!blob.size){toast('EXPORT FILE IS EMPTY');return;}
 const url=URL.createObjectURL(blob),link=document.createElement('a');
 link.href=url;link.download=filename;link.style.display='none';document.body.appendChild(link);
 // This runs synchronously inside a real tap/click on Android/Windows.
 link.click();link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),120000);
 if(IS_ANDROID)toast('DOWNLOAD STARTED / CHECK DOWNLOADS');
}
// Android native share must start from a fresh user tap (not after async toBlob()).
async function androidShareFile(blob,filename){
 if(typeof navigator.share!=='function' || typeof File!=='function'){
  toast('SHARE UNAVAILABLE / USE DOWNLOAD');return;
 }
 try{
  const file=new File([blob],filename,{type:blob.type||'application/octet-stream'});
  if(typeof navigator.canShare==='function'&&!navigator.canShare({files:[file]})){
   toast('THIS FILE CANNOT BE SHARED / USE DOWNLOAD');return;
  }
  await navigator.share({files:[file]});
 }catch(error){
  if(error?.name==='AbortError')return;
  console.warn('[ECDYSIS] Native sharing failed:',error);
  toast('SHARE UNAVAILABLE / USE DOWNLOAD');
 }
}
let pendingAndroidFile=null;
const androidSaveDialog=$('#android-save-dialog');
function showAndroidSave(blob,filename){
 if(!IS_ANDROID||!androidSaveDialog){outputFile(blob,filename);return;}
 pendingAndroidFile={blob,filename};
 $('#android-save-filename').textContent=filename;
 androidSaveDialog.hidden=false;
 $('#android-save-download').focus();
}
$('#android-save-download')?.addEventListener('click',()=>{
 if(pendingAndroidFile)outputFile(pendingAndroidFile.blob,pendingAndroidFile.filename);
 androidSaveDialog.hidden=true;
});
$('#android-save-share')?.addEventListener('click',()=>{
 if(pendingAndroidFile)void androidShareFile(pendingAndroidFile.blob,pendingAndroidFile.filename);
});
$('#android-save-close')?.addEventListener('click',()=>{androidSaveDialog.hidden=true;pendingAndroidFile=null;});

/* V65: GIF colour quantization is CPU-heavy. On Android, move pixel
 * classification + palette lookup off the UI thread, keeping the original
 * 256-colour palette, stable dithering and full 60-second recording length.
 * A bounded queue avoids stalled workers consuming unbounded mobile RAM. */
function quantizeGifPixels(rgba,width){
 const indexed=new Uint8Array(rgba.length/4);
 const lut=getGifColorLookup();
 const bayer=[0,8,2,10,12,4,14,6,3,11,1,9,15,7,13,5];
 for(let p=0,k=0;p<indexed.length;p++,k+=4){
  const r=rgba[k],g=rgba[k+1],b=rgba[k+2];
  if(r===232&&g===222&&b===196){indexed[p]=216;continue;}
  if(r===8&&g===9&&b===11){indexed[p]=217;continue;}
  const x=p%width,y=(p/width)|0;
  const delta=(bayer[((y&3)<<2)|(x&3)]-7.5)*1.6;
  const rr=Math.max(0,Math.min(255,Math.round(r+delta)));
  const gg=Math.max(0,Math.min(255,Math.round(g+delta*.85)));
  const bb=Math.max(0,Math.min(255,Math.round(b+delta*.95)));
  indexed[p]=lut[((rr>>3)<<10)|((gg>>3)<<5)|(bb>>3)];
 }
 return indexed;
}
/* V67: Android GIF capture pipeline.
 * Old pipeline rasterized/scaled the video frame and synchronously called
 * getImageData() on the UI thread 8 times a second during heavy WebGL.
 * Transfer an ImageBitmap snapshot to a dedicated OffscreenCanvas worker
 * whenever the browser supports it. All resizing + pixel readback + palette
 * conversion then happens OFF the input/render thread.
 * Older browsers retain the tested RGBA worker path without reducing any
 * GIF resolution, frame rate or palette size. Max 2 queued captures. */
function installAndroidGifQuantizer(session){
 if(!IS_ANDROID||typeof Worker==='undefined')return;
 let url=null;
 try{
  const source=`const gifPaletteColors=${gifPaletteColors.toString()};
let gifColorLookup=null;
${getGifColorLookup.toString()}
${quantizeGifPixels.toString()}
let offscreen=null,offCtx=null;
self.onmessage=e=>{
 const d=e.data||{};
 if(d.probe){self.postMessage({capable:typeof OffscreenCanvas==='function'&&typeof ImageBitmap!=='undefined'});return;}
 let bitmap=d.bitmap||null;
 try{
  const {id,width,height}=d;
  let rgba;
  if(bitmap){
   if(typeof OffscreenCanvas!=='function')throw Error('OffscreenCanvas unavailable');
   if(!offscreen||offscreen.width!==width||offscreen.height!==height){
    offscreen=new OffscreenCanvas(width,height);
    offCtx=offscreen.getContext('2d',{alpha:false,willReadFrequently:true,colorSpace:'srgb'});
   }
   if(!offCtx)throw Error('Worker canvas unavailable');
   offCtx.imageSmoothingEnabled=true;
   offCtx.imageSmoothingQuality='high';
   offCtx.drawImage(bitmap,0,0,width,height);
   bitmap.close();bitmap=null;
   rgba=offCtx.getImageData(0,0,width,height).data;
  }else rgba=new Uint8ClampedArray(d.rgba);
  const indexed=quantizeGifPixels(rgba,width);
  self.postMessage({id,buffer:indexed.buffer},[indexed.buffer]);
 }catch(error){self.postMessage({id:d.id,error:String(error?.message||error)});}
 finally{if(bitmap)try{bitmap.close()}catch{}}
};`;
  url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
  const worker=new Worker(url);
  URL.revokeObjectURL(url);
  session.gifWorker=worker;
  session.gifOffscreenReady=false;
  worker.onmessage=e=>{
   if(typeof e.data?.capable==='boolean'){
    session.gifOffscreenReady=Boolean(e.data.capable&&typeof createImageBitmap==='function');
    return;
   }
   session.gifOutstanding=Math.max(0,session.gifOutstanding-1);
   const {id,buffer,error}=e.data||{};
   if(buffer && id>=0 && id<session.frames.length)session.frames[id]=new Uint8Array(buffer);
   else if(error){
    if(session.gifOffscreenReady)session.gifOffscreenReady=false;
    console.warn('[ECDYSIS] Android GIF frame fallback:',error);
   }
  };
  worker.onerror=e=>{
   console.warn('[ECDYSIS] GIF quantizer unavailable; local fallback:',e.message);
   worker.terminate();if(session.gifWorker===worker)session.gifWorker=null;
   session.gifOffscreenReady=false;
   session.gifOutstanding=0;
  };
  worker.postMessage({probe:true});
 }catch(error){if(url)URL.revokeObjectURL(url);console.warn('[ECDYSIS] GIF quantizer worker unavailable:',error);}
}
function gifSnapshot(session){
 const {gifOutput,gifCtx,output}=session;
 if(session.gifWorker){
  // Bounded GPU snapshot queue, with no loss of GIF playback duration.
  if(session.gifOutstanding>=2){
   const previous=session.frames.length?session.frames[session.frames.length-1]:null;
   session.frames.push(previous||null);
   return;
  }
  if(session.gifOffscreenReady){
   const id=session.frames.length;
   session.frames.push(null);
   session.gifOutstanding++;
   // Bitmap capture resolves asynchronously: the 3D canvas, screenshot
   // scaling and getImageData never block a touch or WebGL draw callback.
   let bmpPromise;
   try{bmpPromise=createImageBitmap(output);}catch(error){bmpPromise=Promise.reject(error);}
   Promise.resolve(bmpPromise).then(bitmap=>{
    if(session.gifWorker&&!session.gifWorkerClosed){
     try{session.gifWorker.postMessage({id,width:gifOutput.width,height:gifOutput.height,bitmap},[bitmap]);return;}
     catch(error){console.warn('[ECDYSIS] bitmap transfer failed:',error);}
    }
    bitmap.close();session.gifOutstanding=Math.max(0,session.gifOutstanding-1);
   }).catch(error=>{
    console.warn('[ECDYSIS] Android async GIF capture unavailable:',error);
    session.gifOutstanding=Math.max(0,session.gifOutstanding-1);
    session.gifOffscreenReady=false; // fall back on following frame
   });
   return;
  }
 }
 // Compatibility path for old Android Chromium and non-Android browsers.
 gifCtx.drawImage(output,0,0,gifOutput.width,gifOutput.height);
 const rgba=gifCtx.getImageData(0,0,gifOutput.width,gifOutput.height).data;
 if(session.gifWorker){
  const id=session.frames.length;
  session.frames.push(null);
  session.gifOutstanding++;
  try{
   session.gifWorker.postMessage({id,width:gifOutput.width,rgba:rgba.buffer},[rgba.buffer]);
   return;
  }catch(error){
   session.frames.pop();session.gifOutstanding--;
   console.warn('[ECDYSIS] GIF worker post failed; local fallback:',error);
   session.gifWorker.terminate();session.gifWorker=null;
  }
 }
 session.frames.push(quantizeGifPixels(rgba,gifOutput.width));
}
function awaitGifWorkerDrain(session){
 if(!session.gifWorker)return Promise.resolve();
 return new Promise(resolve=>{
  const started=performance.now();
  const poll=()=>{
   if(session.gifOutstanding===0 || performance.now()-started>4500){
    session.gifWorker?.terminate();session.gifWorker=null;resolve();
   }else setTimeout(poll,50);
  };
  poll();
 });
}
/* GIF89a with a global 256-color RGB332 table.
   Critical LZW detail: the CLEAR code must be emitted in the *previous*
   code width, before resetting the width to 9 bits. V32 inverted this order
   and corrupted long or high-detail recordings. */
function encodeGifFrames(frames,width,height,delay){
 if(!frames?.length)throw Error('No frames recorded');
 if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0||width>65535||height>65535)throw Error('Invalid GIF size');
 // Typed 64KiB chunks keep long-GIF memory bounded.
 const chunks=[];let block=new Uint8Array(65536),used=0;
 const byte=v=>{if(used===block.length){chunks.push(block);block=new Uint8Array(65536);used=0;}block[used++]=v&255;};
 const word=v=>{byte(v);byte(v>>8);};
 for(const c of 'GIF89a')byte(c.charCodeAt(0));
 word(width);word(height);byte(0xf7);byte(0);byte(0);
 for(const color of gifPaletteColors()){
  byte(color[0]);byte(color[1]);byte(color[2]);
 }
 // Infinite animation loop.
 for(const x of [0x21,0xff,0x0b])byte(x);
 for(const c of 'NETSCAPE2.0')byte(c.charCodeAt(0));
 for(const x of [3,1,0,0,0])byte(x);
 const centiseconds=Math.max(2,Math.round(Number(delay)||13));
 for(const pixels of frames){
  if(pixels.length!==width*height)throw Error('GIF frame size mismatch');
  for(const x of [0x21,0xf9,4,0,centiseconds&255,(centiseconds>>8)&255,0,0])byte(x);
  byte(0x2c);word(0);word(0);word(width);word(height);byte(0);
  byte(8);
  let prefix=-1,dict=new Map(),next=258,bits=9,acc=0,count=0;
  const packed=[];
  const emit=code=>{
   acc|=code<<count;count+=bits;
   while(count>=8){packed.push(acc&255);acc>>>=8;count-=8;}
  };
  const clear=()=>{
   emit(256); // Emit with the OLD width. Do not reset first.
   dict=new Map();next=258;bits=9;
  };
  clear();
  for(let p=0;p<pixels.length;p++){
   const value=pixels[p];
   if(prefix<0){prefix=value;continue;}
   const key=prefix*256+value;
   const existing=dict.get(key);
   if(existing!==undefined){prefix=existing;continue;}
   emit(prefix);
   if(next<4096){
    dict.set(key,next++);
    if(next>(1<<bits)&&bits<12)bits++;
   }else clear();
   prefix=value;
  }
  if(prefix>=0)emit(prefix);
  emit(257);
  if(count)packed.push(acc&255);
  for(let start=0;start<packed.length;start+=255){
   const n=Math.min(255,packed.length-start);
   byte(n);
   for(let j=0;j<n;j++)byte(packed[start+j]);
  }
  byte(0);
 }
 byte(0x3b);if(used)chunks.push(block.slice(0,used));
 return new Blob(chunks,{type:'image/gif'});
}
/* Self-contained worker: works even if gif-worker.js was never uploaded.
   If Safari or CSP prevents Blob workers, encode on the main thread. */
function gifFromFrames(frames,width,height,delay){
 return new Promise((resolve,reject)=>{
  let worker=null,url=null,finished=false,timer=null;
  const cleanup=()=>{
   if(timer!==null)clearTimeout(timer);
   if(worker)worker.terminate();
   if(url)URL.revokeObjectURL(url);
  };
  const finish=(error,result)=>{
   if(finished)return;
   finished=true;cleanup();
   error?reject(error):resolve(result);
  };
  const fallback=error=>{
   if(finished)return;
   console.warn('[ECDYSIS] GIF worker unavailable; using local encoder:',error);
   cleanup();worker=null;url=null;timer=null;
   // Yield so that LOADING has time to appear before local encoding begins.
   setTimeout(()=>{
    try{finish(null,encodeGifFrames(frames,width,height,delay));}
    catch(err){finish(err);}
   },25);
  };
  try{
   const code=`const gifPaletteColors = ${gifPaletteColors.toString()};\nconst encodeGifFrames = ${encodeGifFrames.toString()};\nself.onmessage = e => {try{const {frames,width,height,delay}=e.data;self.postMessage({ok:true,blob:encodeGifFrames(frames,width,height,delay)});}catch(error){self.postMessage({ok:false,error:String(error?.message||error)});}};`;
   url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
   worker=new Worker(url);
   worker.onmessage=e=>{
    if(e.data?.ok && e.data.blob instanceof Blob)finish(null,e.data.blob);
    else fallback(Error(e.data?.error||'GIF worker did not return a file'));
   };
   worker.onerror=e=>{e.preventDefault?.();fallback(Error(e.message||'GIF worker could not start'));};
   timer=setTimeout(()=>fallback(Error('GIF worker timed out')),90000);
   // Do not transfer buffers: retain frames for Safari fallback if a worker fails.
   worker.postMessage({frames,width,height,delay});
  }catch(err){fallback(err);}
 });
}
function showLogChoices(gif,video,seconds,videoFormat,gifFps){
 logReady={gif,video,videoFormat};
 const videoLabel=videoFormat?.label||'VIDEO';
 $('#log-dialog-details').textContent=`${logClock(seconds)} recorded / ${gifFps} FPS GIF / ${IS_ANDROID?ANDROID_VIDEO_FPS:LOG_FPS} FPS video`;
 const gifButton=$('#download-gif'),videoButton=$('#download-mp4');
 gifButton.disabled=!gif;
 videoButton.disabled=!video;
 // The second button is reused, but accurately labels the browser's actual container.
 videoButton.innerHTML=`${videoLabel} &#x2197;<span>VIDEO RECORDING</span>`;
 $('#log-dialog-note').textContent=gif&&video
  ?videoLabel==='WEBM'?'This browser records WebM, not MP4. Both GIF and WEBM are ready.':'Choose GIF or MP4. Both preserve background and color changes.'
  :gif?'GIF is ready. No compatible browser video recorder is available.'
  :video?`${videoLabel} is ready. GIF export could not be completed.`:'No recording format is available.';
 if(IS_ANDROID){
  $('#android-share-controls').hidden=false;
  $('#android-share-gif').hidden=!gif;
  $('#android-share-video').hidden=!video;
 }
 logDialog.hidden=false;
 (gif?gifButton:videoButton).focus();
}
async function startLog(){
 if(logSession)return;
 if(!active()){toast('OPEN THE MOLT EXPERIMENT FIRST');return;}
 let session=null;
 try{
  const source=active().exportCanvas();
  if(!source?.width||!source?.height)throw Error('Image canvas is not ready');
  const width=IS_ANDROID?ANDROID_VIDEO_WIDTH:1440; // Android: balanced quality tier; Apple/desktop unchanged.
  const height=Math.max(2,2*Math.round(width*source.height/source.width/2));
  const output=document.createElement('canvas');output.width=width;output.height=height;
  const ctx=export2DContext(output,{alpha:false});
  const gifWidth=IS_ANDROID?ANDROID_GIF_WIDTH:GIF_WIDTH;
  const gifFps=IS_ANDROID?ANDROID_GIF_FPS:GIF_FPS;
  const maxLogSeconds=IS_ANDROID?ANDROID_MAX_LOG_SECONDS:MAX_LOG_SECONDS;
  const gifOutput=document.createElement('canvas');gifOutput.width=gifWidth;
  gifOutput.height=Math.max(2,Math.round(height*gifWidth/width));
  const gifCtx=export2DContext(gifOutput,{willReadFrequently:true});
  if(gifCtx){gifCtx.imageSmoothingEnabled=true;gifCtx.imageSmoothingQuality='high';}
  if(!ctx||!gifCtx)throw Error('Canvas capture is not supported');
  session={output,ctx,gifOutput,gifCtx,gifFps,maxLogSeconds,videoFormat:null,frames:[],start:performance.now(),nextGifTime:0,lastPaintTime:-Infinity,lastRenderVersion:-1,gifWorker:null,gifOutstanding:0,recorder:null,chunks:[],stream:null,recordDone:null,stopped:false,raf:0,clockTimer:null,captureError:null,loggedCaptureError:false};
  logSession=session;
  if(IS_ANDROID)installAndroidGifQuantizer(session);
  // Android's ordinary low-power 3D draw cap is ~13fps. Lift it only while
  // recording so the video encoder receives newly rendered frames.
  if(IS_ANDROID&&dimension==='3d')threeD?.setRecordingCapture?.(true);
  logReady={gif:null,video:null,videoFormat:null};
  logDialog.hidden=true;
  composeLogFrame(session,source);
  try{gifSnapshot(session);}catch(error){console.warn('[ECDYSIS] Initial LOG snapshot unavailable; retrying during recording:',error);}
  session.nextGifTime=1000/session.gifFps;
  // Video is OPTIONAL: GIF capture must continue if the browser lacks MediaRecorder.
  const formats=availableVideoFormats();
  // On Android prefer hardware-backed VP8/H.264 when available; retain the
  // original format auto-detection and correct output extension.
  if(IS_ANDROID)formats.sort((x,y)=>((x.type.includes('vp8')?0:x.type.startsWith('video/mp4')?1:2)-(y.type.includes('vp8')?0:y.type.startsWith('video/mp4')?1:2)));
  if(formats.length&&typeof output.captureStream==='function'){
   try{
    session.stream=output.captureStream(IS_ANDROID?ANDROID_VIDEO_FPS:LOG_FPS);
    let recorder=null;
    const rates=IS_ANDROID?(ANDROID_CAPABLE?[4800000,3600000,2600000]:[3200000,2400000,1800000]):[12000000,8500000,6000000];
    for(const format of formats){
     if(recorder)break;
     for(const bps of rates){
      try{
       const candidate=new MediaRecorder(session.stream,{mimeType:format.type,videoBitsPerSecond:bps});
       // Reject empty files and retain the type selected by the browser encoder.
       const done=new Promise((resolve,reject)=>{
        candidate.ondataavailable=e=>{if(e.data?.size)session.chunks.push(e.data);};
        candidate.onstop=()=>{
         const actualType=(candidate.mimeType||format.type).split(';')[0].toLowerCase();
         resolve(new Blob(session.chunks,{type:actualType}));
        };
        candidate.onerror=e=>reject(Error(e.error?.message||'Video recorder failed'));
       });
       // Avoid an unhandled rejection if the browser throws immediately.
       done.catch(()=>{});
       candidate.start(1000);
       recorder=candidate;
       session.recordDone=done;
       const actualType=(candidate.mimeType||format.type).split(';')[0].toLowerCase();
       session.videoFormat=actualType==='video/webm'
        ?{extension:'webm',label:'WEBM',mimeType:actualType}
        :{extension:'mp4',label:'MP4',mimeType:'video/mp4'};
       console.info('[ECDYSIS] Video recording:',session.videoFormat.label,output.width+'x'+output.height,bps+'bps');
       break;
      }catch(error){console.warn('[ECDYSIS] Recorder candidate not supported:',format.type,bps,error);}
     }
    }
    if(!recorder)throw Error('No supported browser video encoder');
    session.recorder=recorder;
   }catch(error){
    console.warn('[ECDYSIS] Video unavailable; GIF recording continues:',error);
    session.stream?.getTracks().forEach(track=>track.stop());
    session.stream=null;session.recorder=null;session.recordDone=null;
   }
  }
  setLogButton('recording');
  session.clockTimer=setInterval(()=>updateLogClock(session),200);
  function frame(now){
   if(session.stopped)return;
   // Use the same monotonic clock as session.start, independently of the
   // browser's requestAnimationFrame timestamp implementation.
   const elapsed=Math.max(0,performance.now()-session.start);
   const current=dimension==='3d'?canvas3D:canvas2D;
   try{
    // V64: Android composites up to 20 frames/second while recording.
    // GIF samples up to 6fps from the same colour-correct opaque output.
    // V65: The Android GL renderer is already budgeted. Do not reread and
    // blend the same GPU frame into the 2D recording surface repeatedly.
    const fresh3D=dimension!=='3d' || typeof threeD?.renderVersion!=='number'
      || threeD.renderVersion!==session.lastRenderVersion;
    if((!IS_ANDROID || elapsed-session.lastPaintTime>=1000/ANDROID_VIDEO_FPS) && fresh3D){
     composeLogFrame(session,current);
     session.lastPaintTime=elapsed;
     if(dimension==='3d' && threeD)session.lastRenderVersion=threeD.renderVersion;
    }
    if(elapsed>=session.nextGifTime){
     gifSnapshot(session);
     // Keep a steady wall-clock cadence when a frame runs a little late.
     // Skip a genuine backlog rather than creating a burst of repeated frames.
     const step=1000/session.gifFps;
     session.nextGifTime+=step;
     if(session.nextGifTime<elapsed-step)session.nextGifTime=elapsed+step;
    }
    session.captureError=null;
   }catch(error){
    // V33 accidentally STOPPED recording on the first bad frame, which
    // opened the save popup without a second click (notably on Safari).
    // Keep the session alive and retry on the next frame instead.
    session.captureError=error;
    if(!session.loggedCaptureError){
      session.loggedCaptureError=true;
      console.warn('[ECDYSIS] LOG frame temporarily unavailable; retrying without stopping:',error);
    }
   }
   updateLogClock(session);
   if(elapsed>=session.maxLogSeconds*1000){void stopLog();return;}
   session.raf=requestAnimationFrame(frame);
  }
  session.raf=requestAnimationFrame(frame);
 }catch(error){
  console.error('[ECDYSIS] LOG could not start:',error);
  if(session?.clockTimer)clearInterval(session.clockTimer);
  if(session)session.gifWorkerClosed=true;
  session?.gifWorker?.terminate();
  session?.stream?.getTracks().forEach(track=>track.stop());
  if(IS_ANDROID)threeD?.setRecordingCapture?.(false);
  logSession=null;setLogButton('idle');
  toast('LOG START FAILED: '+(error.message||error));
 }
}
function timeoutPromise(promise,ms){
 return new Promise(resolve=>{
  let finished=false;
  const timeout=setTimeout(()=>{if(!finished){finished=true;resolve(null);}},ms);
  Promise.resolve(promise).then(value=>{if(!finished){finished=true;clearTimeout(timeout);resolve(value);}},error=>{
   console.warn('[ECDYSIS] MP4 completion failed:',error);
   if(!finished){finished=true;clearTimeout(timeout);resolve(null);}
  });
 });
}
async function stopLog(){
 const session=logSession;
 if(!session||session.stopped)return;
 session.stopped=true;
 if(IS_ANDROID)threeD?.setRecordingCapture?.(false);
 cancelAnimationFrame(session.raf);
 if(session.clockTimer){clearInterval(session.clockTimer);session.clockTimer=null;}
 setLogButton('processing');
 const seconds=(performance.now()-session.start)/1000;
 let gif=null,video=null;
 try{
  if(session.recorder&&session.recorder.state!=='inactive'){
   try{session.recorder.stop();}catch(error){console.warn('[ECDYSIS] MP4 stop failed:',error);}
  }
  // Finish GIF independently from MP4. One format failing cannot discard the other.
  const videoPromise=session.recordDone?timeoutPromise(session.recordDone,20000):Promise.resolve(null);
  try{
   await awaitGifWorkerDrain(session);
   // If the worker failed after taking a frame, retain the most recently
   // completed frame instead of discarding the whole session.
   let prev=session.frames.find(f=>f instanceof Uint8Array)||new Uint8Array(session.gifOutput.width*session.gifOutput.height);
   for(let i=0;i<session.frames.length;i++){
    if(!(session.frames[i] instanceof Uint8Array))session.frames[i]=prev;
    else prev=session.frames[i];
   }
   gif=await gifFromFrames(session.frames,session.gifOutput.width,session.gifOutput.height,Math.round(100/session.gifFps));
   if(!gif?.size)throw Error('Empty GIF result');
  }catch(error){console.error('[ECDYSIS] GIF encoding failed:',error);}
  const maybeVideo=await videoPromise;
  if(maybeVideo?.size)video=maybeVideo;
  if(gif||video)showLogChoices(gif,video,seconds,session.videoFormat,session.gifFps);
  else toast('LOG FAILED: No usable GIF or video. See Console for details.');
 }catch(error){
  console.error('[ECDYSIS] LOG failed:',error);
  toast('LOG FAILED: '+(error.message||error));
 }finally{
  session.stream?.getTracks().forEach(track=>track.stop());
  session.gifWorkerClosed=true;session.gifWorker?.terminate();session.gifWorker=null;
  session.frames=[];logSession=null;setLogButton('idle');
 }
}
// Prioritize stop on pointerdown so the heavy GIF snapshot loop cannot eat
// a touch/mouse click. Keep click as fallback for keyboard/assistive users.
let lastLogPointerStop=-Infinity;
logBtn.addEventListener('pointerdown',e=>{
 if(logMode!=='recording'||!logSession)return;
 lastLogPointerStop=performance.now();
 e.preventDefault();
 void stopLog();
});
logBtn.addEventListener('click',()=>{
 if(performance.now()-lastLogPointerStop<500)return;
 if(logMode==='processing')return;
 if(logMode==='recording')void stopLog();
 else void startLog();
});
function logFilename(extension){return 'ECDYSIS_LOG_'+Date.now()+'.'+extension;}
$('#download-gif').addEventListener('click',()=>{if(logReady.gif)outputFile(logReady.gif,logFilename('gif'));});
$('#download-mp4').addEventListener('click',()=>{
 if(logReady.video)outputFile(logReady.video,logFilename(logReady.videoFormat?.extension||'webm'));
});
$('#android-share-gif')?.addEventListener('click',()=>{
 if(logReady.gif)void androidShareFile(logReady.gif,logFilename('gif'));
});
$('#android-share-video')?.addEventListener('click',()=>{
 if(logReady.video)void androidShareFile(logReady.video,logFilename(logReady.videoFormat?.extension||'webm'));
});
$('#close-log-dialog').addEventListener('click',()=>{logDialog.hidden=true;});
logDialog.addEventListener('pointerdown',e=>{if(e.target===logDialog)logDialog.hidden=true;});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!logDialog.hidden)logDialog.hidden=true;});

$('#hero-heading').innerHTML='<span class="hero-molt">MOLT,</span><span class="hero-subline">until perfect.</span>'; 
updateUI();if(location.hash==='#molt')show('molt');
if(['localhost','127.0.0.1'].includes(location.hostname)){const events=new EventSource('/__ecdysis_events');events.addEventListener('reload',()=>location.reload());}
