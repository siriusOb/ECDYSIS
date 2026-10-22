/* ECDYSIS V27 — independent 2D/3D scales (2D 1.30, 3D 0.75) */
import {Specimen2D,Specimen3D,SpecimenSoftware3D,parseOBJAsync} from './webgl.js';
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const names=['COCOON','HATCH','MOLT'];
const STAGE_COUNT=names.length;
const stageProgress=index=>Math.round(100*index/(STAGE_COUNT-1));
const DEFAULT={progress:0,modification:0,scale:1.3,palette:'origin',inkA:'#599782',inkB:'#72092a',intensity:.6,hue:0,mode:'surface',rotate:false};
const dimensionScales={ '2d':1.3, '3d':0.75 };
let state={...DEFAULT},dimension='2d',twoD=null,threeD=null,playing=false,playStart=0,frameId=0,introTimer=0,introFade=0,toastTimer=0,modelsLoading=null;
const pics=Array(STAGE_COUNT).fill(null);
let texture3D = null; // Original cocoon7.png is reserved for 3D surface artwork.
function toast(message){const el=$('#toast');if(!el)return;el.textContent=message;el.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('visible'),3500);}
const getImage=url=>new Promise((resolve,reject)=>{const img=new Image();img.decoding='async';img.onload=()=>resolve(img);img.onerror=()=>reject(Error(url+' not found'));img.src=url;});

/* Only small CSS for the separate dimension selector; all main styles stay in styles.css. */
const dim=document.createElement('section');dim.className='v7-dimension';dim.innerHTML=`<div class="micro v7-dim-heading">DISPLAY DIMENSION <span>02 / VIEW</span></div><div class="v7-dim-buttons"><button class="active" type="button" data-dimension="2d" aria-pressed="true">2D / IMAGE</button><button type="button" data-dimension="3d" aria-pressed="false">3D / OBJ</button></div>`;
// Keep any legacy four-stage HTML compatible with the three-stage controller.
$$('[data-stage]').forEach(button=>{
 if(Number(button.dataset.stage)>=STAGE_COUNT)button.remove();
});
const labLegend=$('.dial-legend span');
if(labLegend)labLegend.textContent='COCOON → MOLT';
const labHeading=$('#view-molt .lab-heading .topline span:last-child');
if(labHeading)labHeading.textContent='THREE SKINS / THREE BODIES';
$('.stage-buttons')?.insertAdjacentElement('afterend',dim);
/* ECDYSIS V21 — independent canvas backdrop selector; does not alter artwork. */
const backdropControl=document.createElement('section');
backdropControl.className='backdrop-control';
backdropControl.setAttribute('role','group');
backdropControl.setAttribute('aria-label','Image experiment background');
backdropControl.innerHTML=`<div class="micro backdrop-heading"><span>SPECIMEN BACKGROUND</span><span>03 / CANVAS</span></div><div class="backdrop-buttons"><button type="button" data-backdrop-choice="beige" class="active" aria-pressed="true"><i class="backdrop-swatch backdrop-swatch-beige" aria-hidden="true"></i> BEIGE</button><button type="button" data-backdrop-choice="black" aria-pressed="false"><i class="backdrop-swatch backdrop-swatch-black" aria-hidden="true"></i> BLACK</button></div>`;
dim.insertAdjacentElement('afterend',backdropControl);
let canvasBackground='beige';
function setCanvasBackground(selection){
 canvasBackground=selection==='black'?'black':'beige';
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

/* Intro grows without rotation or radiating SVG lines. */
function fitIntro(){const title=$('#intro-word'),box=$('.intro-fit');if(!title||!box)return;title.style.setProperty('--fit',1);title.style.setProperty('--fit',String(Math.min(1,(box.clientWidth-16)/Math.max(1,title.scrollWidth))));}
function closeIntro(){clearTimeout(introTimer);const el=$('#intro');if(!el||el.hidden)return;el.classList.add('is-leaving');clearTimeout(introFade);introFade=setTimeout(()=>{el.hidden=true;el.classList.remove('is-leaving');},830);}
function intro(){const el=$('#intro');clearTimeout(introTimer);clearTimeout(introFade);el.hidden=false;el.classList.remove('is-leaving');for(const child of el.querySelectorAll('.intro-image,.intro-serial,.intro-fit h1,.intro-caption,.intro-timeline i')){child.style.animation='none';void child.offsetWidth;child.style.removeProperty('animation');}fitIntro();introTimer=setTimeout(closeIntro,matchMedia('(prefers-reduced-motion: reduce)').matches?900:4000);}
$('#intro-threads')?.remove();$('#intro-skip')?.addEventListener('click',closeIntro);$('#replay-intro')?.addEventListener('click',intro);window.addEventListener('resize',fitIntro);document.fonts?.ready?.then(fitIntro);

/* Intro artwork keeps original resolution; alpha is prepared only once. */
async function introArt(){let img=null;for(const url of ['assets/cocoon7-ink.png','assets/cocoon7.png']){try{img=await getImage(url);break;}catch{}}
 if(!img)return;
 const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);const data=ctx.getImageData(0,0,c.width,c.height);for(let i=0;i<data.data.length;i+=4){const d=data.data,b=Math.max(d[i],d[i+1],d[i+2]);d[i+3]=Math.round(d[i+3]*Math.min(1,Math.max(0,(b-7)/70)));}ctx.putImageData(data,0,0);
 const blob=await new Promise(resolve=>c.toBlob(resolve,'image/png'));if(blob){const url=URL.createObjectURL(blob);$$('.intro-image,.processed-cocoon').forEach(node=>node.src=url);}
}
void introArt();intro();

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
  apply3DTexture();
  Object.assign(threeD.params,state);
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
   const g=await parseOBJAsync(await res.text());
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
 // Remember the viewer-adjusted slider value before switching modes.
 dimensionScales[dimension]=state.scale;
 if(to==='3d'){
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
}
$$('[data-dimension]').forEach(b=>b.addEventListener('click',()=>void changeDimension(b.dataset.dimension)));

function setProgress(v){state.progress=Math.min(100,Math.max(0,Math.round(Number(v)||0)));updateUI();render();}
function updateUI(){const p=state.progress,phase=Math.min(STAGE_COUNT-1,Math.round(p/100*(STAGE_COUNT-1)));$('#progress-range').value=p;$('#progress-readout').textContent=p+'%';$('#dial-number').textContent=String(p).padStart(2,'0');$('#dial-arc').style.strokeDashoffset=515.22*(1-p/100);$('#progress-dial').setAttribute('aria-valuenow',String(p));$('#stage-counter').innerHTML=String(p).padStart(2,'0')+'<span>%</span>';$('#stage-state').textContent=names[phase]+' / '+['ORIGIN','OPENING','SHEDDING'][phase];$$('[data-stage]').forEach((b,i)=>b.classList.toggle('selected',phase===i));$$('[data-param]').forEach(inp=>{const key=inp.dataset.param;inp.value=state[key];const out=$('#out-'+key);if(out)out.textContent=key==='hue'?String(state.hue):Number(state[key]).toFixed(2);});$$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));$$('[data-palette]').forEach(b=>{const yes=b.dataset.palette===state.palette;b.classList.toggle('active',yes);b.setAttribute('aria-pressed',String(yes));});$('#color-a').value=state.inkA;$('#color-b').value=state.inkB;document.documentElement.style.setProperty('--a',state.inkA);document.documentElement.style.setProperty('--b',state.inkB);$('#toggle-rotate').checked=state.rotate;$('#play-sequence').textContent=playing?'Ⅱ PAUSE SEQUENCE':'▶ PLAY SEQUENCE';}
const dial=$('#progress-dial');function pointDial(e){const r=dial.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;setProgress(Math.round(((Math.atan2(x,-y)+Math.PI*2)%(Math.PI*2))/(Math.PI*2)*100));}
dial.addEventListener('pointerdown',e=>{e.preventDefault();dial.setPointerCapture(e.pointerId);pointDial(e);});dial.addEventListener('pointermove',e=>{if(dial.hasPointerCapture(e.pointerId))pointDial(e);});dial.addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;e.preventDefault();const dir=['ArrowLeft','ArrowDown'].includes(e.key)?-1:1;setProgress(e.key==='Home'?0:e.key==='End'?100:state.progress+dir*(e.shiftKey?10:1));});$('#progress-range').addEventListener('input',e=>setProgress(e.target.value));$$('[data-stage]').forEach((b,i)=>b.addEventListener('click',()=>setProgress(stageProgress(i))));
/* Render just ONE visible canvas, with one animation frame for slider bursts. */
let inputRAF=0;
$$('[data-param]').forEach(inp=>inp.addEventListener('input',()=>{state[inp.dataset.param]=Number(inp.value);if(inp.dataset.param==='scale')dimensionScales[dimension]=state.scale;updateUI();if(!inputRAF)inputRAF=requestAnimationFrame(()=>{inputRAF=0;render();});}));
$$('[data-mode]').forEach(b=>b.addEventListener('click',()=>{state.mode=b.dataset.mode;updateUI();render();}));
$$('[data-palette]').forEach(b=>b.addEventListener('click',()=>{state.palette=b.dataset.palette;updateUI();render();}));
for(const [selector,key] of [['#color-a','inkA'],['#color-b','inkB']])$(selector).addEventListener('input',e=>{state[key]=e.target.value;state.palette='custom';updateUI();if(!inputRAF)inputRAF=requestAnimationFrame(()=>{inputRAF=0;render();});});
$('#reset-all').addEventListener('click',()=>{setCanvasBackground('beige');playing=false;dimensionScales['2d']=1.3;dimensionScales['3d']=0.75;state={...DEFAULT,scale:dimensionScales[dimension]};if(twoD)twoD.zoom=1;if(threeD){threeD.zoom=1;threeD.yaw=-.38;threeD.pitch=.2;threeD.setInteractiveMode?.(false);}updateUI();render();toast('RESET / ORIGIN RESTORED');});
$('#toggle-rotate').addEventListener('change',e=>{state.rotate=e.target.checked;threeD?.setInteractiveMode?.(state.rotate&&dimension==='3d');animate();});
$('#play-sequence').addEventListener('click',()=>{playing=!playing;if(playing)playStart=performance.now()-state.progress/100*16000;updateUI();animate();});
// 3D orbit is frame-rate independent; cap GPU work near 30fps instead of 60.
let lastOrbitTime=0,lastOrbitPaint=0;
function animate(){
 if(frameId)return;
 function tick(now){
  frameId=0;
  if(document.hidden){lastOrbitTime=0;return;}
  if(playing){
   const t=Math.min(1,(now-playStart)/16000);
   const next=Math.round(t*100);
   if(next!==state.progress)setProgress(next);
   if(t===1){playing=false;updateUI();}
  }
  if(state.rotate&&dimension==='3d'&&threeD){
   const dt=lastOrbitTime?Math.min(70,now-lastOrbitTime):16.7;
   threeD.yaw+=(dt*.00024);
   lastOrbitTime=now;
   if(now-lastOrbitPaint>=32){
    lastOrbitPaint=now;
    if(typeof threeD.requestDraw==='function')threeD.requestDraw();
    else threeD.draw();
   }
  }else{lastOrbitTime=0;}
  if(playing||(state.rotate&&dimension==='3d'&&threeD))frameId=requestAnimationFrame(tick);
 }
 frameId=requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&(playing||state.rotate))animate();});

/* Export settings retained from V7. */
const wrap=$('#export-wrap'),exportBtn=$('#export-png');function toggleMenu(open){wrap.classList.toggle('open',open);exportBtn.setAttribute('aria-expanded',String(open));}
exportBtn.addEventListener('click',()=>toggleMenu(!wrap.classList.contains('open')));document.addEventListener('pointerdown',e=>{if(!wrap.contains(e.target))toggleMenu(false);});document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleMenu(false);});
async function exportPNG(kind){try{const renderer=active();if(!renderer){toast('OPEN MOLT FIRST');return;}const src=renderer.exportCanvas(),out=document.createElement('canvas');out.width=Math.min(2400,Math.max(1400,src.width));out.height=Math.round(out.width*src.height/src.width);const ctx=out.getContext('2d');if(kind==='background'){ctx.fillStyle=canvasBackground==='black'?'#08090b':'#e8dec4';ctx.fillRect(0,0,out.width,out.height);}ctx.drawImage(src,0,0,out.width,out.height);if(kind==='background'){ctx.fillStyle=canvasBackground==='black'?'#c7f9e4':'#72092a';ctx.font=`${Math.round(out.width*.018)}px monospace`;ctx.fillText('ECDYSIS / '+dimension.toUpperCase(),out.width*.04,out.height*.92);ctx.textAlign='right';ctx.fillText(state.progress+'%',out.width*.96,out.height*.92);}const blob=await new Promise((resolve,reject)=>out.toBlob(x=>x?resolve(x):reject(Error('PNG encoder failed')),'image/png'));const filename=`ECDYSIS_${dimension.toUpperCase()}_${state.progress}P_${kind.toUpperCase()}.png`,file=new File([blob],filename,{type:'image/png'});if(/iPhone|iPad|iPod/.test(navigator.userAgent)&&navigator.share&&navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file]});return;}catch(e){if(e.name==='AbortError')return;}}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('PNG EXPORTED');}catch(error){console.error(error);toast('EXPORT FAILED: '+error.message);}}
$$('[data-export]').forEach(b=>b.addEventListener('click',()=>{toggleMenu(false);void exportPNG(b.dataset.export);}));
$('#hero-heading').innerHTML='<span class="hero-molt">MOLT,</span><span class="hero-subline">until perfect.</span>'; 
updateUI();if(location.hash==='#molt')show('molt');
if(['localhost','127.0.0.1'].includes(location.hostname)){const events=new EventSource('/__ecdysis_events');events.addEventListener('reload',()=>location.reload());}
