/* ECDYSIS V23 — full-quality 3D ink while moving, fixed resolution, identical surface coverage */
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const palettes={origin:0,prism:1,shell:2,mint:3,custom:4,monotone:5};
const defaults={progress:0,modification:0,scale:1,palette:'origin',inkA:'#599782',inkB:'#72092a',intensity:.6,hue:0,mode:'surface',monoWhite:0};
const rgb=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255);
const specimenScaleBias=.75;
const STAGE_COUNT=3;
/* V39: Cyclic mirrored hue drift. 0deg runs A to B, and +/-180deg
 * reverses B to A. There is no sliding gradient beyond the canvas. */
function gradientPhase(u,hue){
 return .5-.5*Math.cos(Math.PI*clamp(u,0,1)+hue*Math.PI/180);
}
function paletteAt(stops,t){
 const p=clamp(t,0,1)*(stops.length-1),i=Math.min(stops.length-2,Math.floor(p)),f=p-i;
 const a=rgb(stops[i]),b=rgb(stops[i+1]);
 return 'rgb('+a.map((n,j)=>Math.round((n+(b[j]-n)*f)*255)).join(',')+')';
}
function orientedGradient(ctx,width,height,stops,hue){
 const g=ctx.createLinearGradient(0,0,width,height);
 for(let k=0;k<=64;k++){
  const u=k/64;
  g.addColorStop(u,paletteAt(stops,gradientPhase(u,hue)));
 }
 return g;
}


/* A safe triangulator that does not stretch concave caps across the specimen. */
export function parseOBJGeometry(source){
 const vertex=[],rawFaces=[];
 for(const raw of source.split(/\r?\n/)){
  const l=raw.trim();
  if(l.startsWith('v ')){
   const v=l.split(/\s+/).slice(1,4).map(Number);
   if(v.length===3&&v.every(Number.isFinite))vertex.push(v);
  }else if(l.startsWith('f ')){
   const f=[];
   for(const part of l.slice(2).split(/\s+/)){
    const id=parseInt(part.split('/')[0],10);
    const n=id>0?id-1:vertex.length+id;
    if(!id||!Number.isFinite(n)||n<0||n>=vertex.length){f.length=0;break;}
    if(n!==f.at(-1))f.push(n);
   }
   if(f.length>2){if(f[0]===f.at(-1))f.pop();if(f.length>2)rawFaces.push(f);}
  }
 }
 if(!vertex.length||!rawFaces.length)throw Error('OBJ has no valid faces');
 const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
 for(const v of vertex)for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],v[a]);hi[a]=Math.max(hi[a],v[a]);}
 const range=lo.map((n,i)=>Math.max(1e-8,hi[i]-n)),mid=lo.map((n,i)=>(n+hi[i])/2),scale=3.55/Math.max(...range);
 const pos=new Float32Array(vertex.length*3),uv=new Float32Array(vertex.length*2),norm=new Float32Array(vertex.length*3);
 // OBJ z = body length (visual horizontal axis); original x/y form the cross section.
 // The supplied OBJ's vt entries are frequently collapsed at (0,0), so use
 // longitudinal + cylindrical UVs instead of those degenerate texture coordinates.
 // Estimate the bent centreline in local length bins to prevent side smearing.
 const BIN_COUNT=96, binSums=Array.from({length:BIN_COUNT},()=>[0,0,0]);
 for(const [x,y,z] of vertex){
  const bin=Math.min(BIN_COUNT-1,Math.floor(clamp((z-lo[2])/range[2])*(BIN_COUNT-1)));
  binSums[bin][0]+=x;binSums[bin][1]+=y;binSums[bin][2]++;
 }
 const centerline=binSums.map(([x,y,n])=>n?[x/n,y/n]:null);
 for(let b=0;b<BIN_COUNT;b++)if(!centerline[b]){
  let nearest=0,best=Infinity;
  for(let j=0;j<BIN_COUNT;j++)if(centerline[j]&&Math.abs(b-j)<best){nearest=j;best=Math.abs(b-j);}
  centerline[b]=centerline[nearest]??[mid[0],mid[1]];
 }
 // Low-pass filter the centreline so adjacent rings share a stable UV direction.
 const smoothLine=centerline.map((_,i)=>{
  let sx=0,sy=0,w=0;
  for(let j=Math.max(0,i-3);j<=Math.min(BIN_COUNT-1,i+3);j++){
   const k=4-Math.abs(i-j);sx+=centerline[j][0]*k;sy+=centerline[j][1]*k;w+=k;
  }
  return [sx/w,sy/w];
 });
 for(let i=0;i<vertex.length;i++){
  const [x,y,z]=vertex[i];
  const u=clamp((z-lo[2])/range[2]);
  const bin=Math.min(BIN_COUNT-1,Math.floor(u*(BIN_COUNT-1)));
  const center=smoothLine[bin];
  // Re-use the actual original mesh; only its surface coordinates are regenerated.
  pos.set([(z-mid[2])*scale,(y-mid[1])*scale,(x-mid[0])*scale],i*3);
  uv.set([u,Math.atan2(y-center[1],x-center[0])/(2*Math.PI)+.5],i*2);
 }
 const triangles=[];
 const xyz=n=>vertex[n];
 const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 function triangulate(face){
  if(face.length===3)return face;
  const p=face.map(xyz);let n=[0,0,0];
  for(let i=0;i<p.length;i++){
   const a=p[i],b=p[(i+1)%p.length];
   n[0]+=(a[1]-b[1])*(a[2]+b[2]);n[1]+=(a[2]-b[2])*(a[0]+b[0]);n[2]+=(a[0]-b[0])*(a[1]+b[1]);
  }
  const drop=[Math.abs(n[0]),Math.abs(n[1]),Math.abs(n[2])].indexOf(Math.max(...n.map(Math.abs)));
  const q=p.map(v=>drop===0?[v[1],v[2]]:drop===1?[v[0],v[2]]:[v[0],v[1]]);
  const sign=Math.sign(q.reduce((s,v,i)=>s+v[0]*q[(i+1)%q.length][1]-v[1]*q[(i+1)%q.length][0],0))||1;
  const remain=face.map((_,i)=>i),out=[];
  for(let safety=0;remain.length>3&&safety<face.length*3;safety++){
   let clipped=false;
   for(let j=0;j<remain.length;j++){
    const a=remain[(j+remain.length-1)%remain.length],b=remain[j],c=remain[(j+1)%remain.length];
    if(sign*cross(q[a],q[b],q[c])<=1e-12)continue;
    let hit=false;
    for(const v of remain)if(v!==a&&v!==b&&v!==c&&sign*cross(q[a],q[b],q[v])>=-1e-10&&sign*cross(q[b],q[c],q[v])>=-1e-10&&sign*cross(q[c],q[a],q[v])>=-1e-10){hit=true;break;}
    if(hit)continue;
    out.push(face[a],face[b],face[c]);remain.splice(j,1);clipped=true;break;
   }
   if(!clipped)break; // do not invent large triangles over an invalid cap
  }
  if(remain.length===3)out.push(...remain.map(i=>face[i]));
  return out;
 }
 let skipped=0;
 for(const face of rawFaces){const tri=triangulate(face);if(!tri.length)skipped++;triangles.push(...tri);}
 const clean=[],lines=[],edges=new Set(),count=vertex.length;
 for(let i=0;i<triangles.length;i+=3){
  const [a,b,c]=triangles.slice(i,i+3),ia=a*3,ib=b*3,ic=c*3;
  const ux=pos[ib]-pos[ia],uy=pos[ib+1]-pos[ia+1],uz=pos[ib+2]-pos[ia+2];
  const vx=pos[ic]-pos[ia],vy=pos[ic+1]-pos[ia+1],vz=pos[ic+2]-pos[ia+2];
  const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
  if(nx*nx+ny*ny+nz*nz<1e-16)continue;
  clean.push(a,b,c);
  for(const id of [a,b,c]){norm[id*3]+=nx;norm[id*3+1]+=ny;norm[id*3+2]+=nz;}
  // Real wireframe follows mesh topology; thin lines are shaded separately.
  for(const [u,v] of [[a,b],[b,c],[c,a]]){
   const x=Math.min(u,v),y=Math.max(u,v),key=x*count+y;
   if(!edges.has(key)){edges.add(key);lines.push(x,y);}
  }
 }
 for(let i=0;i<norm.length;i+=3){const d=Math.hypot(norm[i],norm[i+1],norm[i+2])||1;norm[i]/=d;norm[i+1]/=d;norm[i+2]/=d;}
 // At the circumference's seam, duplicate only necessary vertices and shift
 // their V by +1 so triangles never interpolate across the whole texture atlas.
 const expandedPosition=Array.from(pos),expandedNormal=Array.from(norm),expandedUV=Array.from(uv);
 const seamCache=new Map(),seamTri=new Uint32Array(clean.length);
 for(let i=0;i<clean.length;i+=3){
  const ids=[clean[i],clean[i+1],clean[i+2]],vs=ids.map(id=>uv[id*2+1]);
  const seam=Math.max(...vs)-Math.min(...vs)>.5;
  for(let j=0;j<3;j++){
   const original=ids[j];
   if(seam&&vs[j]<.5){
    if(!seamCache.has(original)){
     const newID=expandedPosition.length/3;
     expandedPosition.push(...pos.slice(original*3,original*3+3));
     expandedNormal.push(...norm.slice(original*3,original*3+3));
     expandedUV.push(uv[original*2],uv[original*2+1]+1);
     seamCache.set(original,newID);
    }
    seamTri[i+j]=seamCache.get(original);
   }else seamTri[i+j]=original;
  }
 }
 return {pos:new Float32Array(expandedPosition),uv:new Float32Array(expandedUV),
  norm:new Float32Array(expandedNormal),tri:seamTri,
  lines:new Uint32Array(lines),skipped};
}

/* Big OBJ parsing runs off the UI thread when possible. */
let worker=null,seq=0;const jobs=new Map();
export function parseOBJAsync(text){
 if(typeof Worker==='undefined')return Promise.resolve().then(()=>parseOBJGeometry(text));
 try{
  if(!worker){
   const src=`import {parseOBJGeometry} from ${JSON.stringify(import.meta.url)};self.onmessage=e=>{const {id,text}=e.data;try{const g=parseOBJGeometry(text);self.postMessage({id,g},[g.pos.buffer,g.uv.buffer,g.norm.buffer,g.tri.buffer,g.lines.buffer]);}catch(err){self.postMessage({id,error:String(err)});}}`;
   const url=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));
   worker=new Worker(url,{type:'module'});setTimeout(()=>URL.revokeObjectURL(url),15000);
   worker.onmessage=e=>{const j=jobs.get(e.data.id);if(!j)return;jobs.delete(e.data.id);e.data.error?j.reject(Error(e.data.error)):j.resolve(e.data.g);};
   worker.onerror=e=>{for(const j of jobs.values())j.reject(Error('OBJ worker failed'));jobs.clear();worker.terminate();worker=null;};
  }
  return new Promise((resolve,reject)=>{const id=++seq;jobs.set(id,{resolve,reject});worker.postMessage({id,text});});
 }catch{return Promise.resolve().then(()=>parseOBJGeometry(text));}
}

/* Construct source alpha ONE TIME per image. Avoid per-frame pixel loops. */
function prepareImage(img){
 const sourceWidth=img.naturalWidth||img.width,sourceHeight=img.naturalHeight||img.height;
 const width=Math.min(3072,sourceWidth),height=Math.max(1,Math.round(width*sourceHeight/sourceWidth));
 const c=document.createElement('canvas');c.width=width;c.height=height;
 const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,width,height);
 const frame=ctx.getImageData(0,0,width,height),d=frame.data;
 for(let i=0;i<d.length;i+=4){const light=Math.max(d[i],d[i+1],d[i+2]);d[i+3]=Math.round(d[i+3]*clamp((light-6)/58));}
 ctx.putImageData(frame,0,0);return c;
}

/* Preserve cocoon7's original pixel scale and ratio in real artwork fragments.
 * The original is never stretched to fill a mesh UV cylinder.
 * Instead, choose naturally ink-rich rectangles from the source and pack them
 * into equal-aspect atlas cells. Each tile holds authentic RGB/linework. */
const fibreCache = new WeakMap();
const ATLAS_COLUMNS = 7;
const ATLAS_ROWS = 7;
const TILE_W = 224;
const TILE_H = 152;
const PAD = 2;
function prepareFibreAtlas(image) {
  if (fibreCache.has(image)) return fibreCache.get(image);
  const sourceW = image.naturalWidth || image.width;
  const sourceH = image.naturalHeight || image.height;
  const source = document.createElement('canvas');
  source.width = sourceW;
  source.height = sourceH;
  const sourceCtx = source.getContext('2d', { willReadFrequently: true });
  sourceCtx.imageSmoothingEnabled = true;
  sourceCtx.imageSmoothingQuality = 'high';
  sourceCtx.drawImage(image, 0, 0);
  const pixels = sourceCtx.getImageData(0, 0, sourceW, sourceH).data;
  const patchW = TILE_W - 2 * PAD;
  const patchH = TILE_H - 2 * PAD;
  const candidates = [];
  const stepX = Math.max(20, Math.floor(patchW / 2.4));
  const stepY = Math.max(16, Math.floor(patchH / 2.5));
  for (let y = 0; y <= sourceH - patchH; y += stepY) {
    for (let x = 0; x <= sourceW - patchW; x += stepX) {
      let ink = 0, samples = 0;
      for (let dy = 5; dy < patchH; dy += 11) {
        for (let dx = 5; dx < patchW; dx += 11) {
          const i = ((y + dy) * sourceW + (x + dx)) * 4;
          const brightness = Math.max(pixels[i], pixels[i+1], pixels[i+2]);
          if (brightness * pixels[i+3] / 255 > 24) ink++;
          samples++;
        }
      }
      const fraction = ink / Math.max(1, samples);
      if (fraction > .06) candidates.push({x, y, fraction});
    }
  }
  candidates.sort((a, b) => (b.fraction - a.fraction) || (a.y - b.y) || (a.x - b.x));
  if (!candidates.length) {
    candidates.push({
      x: Math.max(0, ((sourceW - patchW) / 2) | 0),
      y: Math.max(0, ((sourceH - patchH) / 2) | 0),
      fraction: 1
    });
  }

  const atlas = document.createElement('canvas');
  atlas.width = TILE_W * ATLAS_COLUMNS;
  atlas.height = TILE_H * ATLAS_ROWS;
  const ctx = atlas.getContext('2d', {willReadFrequently: true});
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const patchCanvas = document.createElement('canvas');
  patchCanvas.width = TILE_W;
  patchCanvas.height = TILE_H;
  const patchCtx = patchCanvas.getContext('2d', {willReadFrequently: true});
  patchCtx.imageSmoothingEnabled = true;
  patchCtx.imageSmoothingQuality = 'high';

  const totalTiles = ATLAS_COLUMNS * ATLAS_ROWS;
  for (let i = 0; i < totalTiles; i++) {
    const pick = candidates[(i * 19 + Math.floor(i / ATLAS_COLUMNS) * 7) % candidates.length];
    const col = i % ATLAS_COLUMNS;
    const row = Math.floor(i / ATLAS_COLUMNS);
    patchCtx.clearRect(0, 0, TILE_W, TILE_H);
    patchCtx.drawImage(
      source, pick.x, pick.y, Math.min(patchW, sourceW), Math.min(patchH, sourceH),
      PAD, PAD, patchW, patchH
    );

    const frame = patchCtx.getImageData(0, 0, TILE_W, TILE_H);
    const data = frame.data;
    const seedA = 0.31 + i * 0.47;
    const seedB = 1.11 + i * 0.29;
    const seedC = 2.07 + i * 0.61;
    for (let py = 0; py < TILE_H; py++) {
      const ny = (py + 0.5) / TILE_H * 2 - 1;
      for (let px = 0; px < TILE_W; px++) {
        const nx = (px + 0.5) / TILE_W * 2 - 1;
        const idx = (py * TILE_W + px) * 4;
        const ax = Math.abs(nx), ay = Math.abs(ny);
        const polar = Math.atan2(ny, nx);
        const radial = Math.sqrt(nx * nx * 0.92 + ny * ny * 1.08);
        const wobble =
          0.10 * Math.sin(polar * 3.0 + seedA) +
          0.08 * Math.sin(polar * 5.0 - seedB) +
          0.05 * Math.sin((nx + ny) * 5.5 + seedC) +
          0.04 * Math.cos((nx - ny) * 7.2 - seedA);
        const edge = 0.78 + wobble;
        const softMask = clamp((edge - radial) / 0.14);
        const cornerTrim = clamp((1.18 - (ax * 0.82 + ay * 1.03)) / 0.22);
        const mask = Math.max(0, Math.min(1, softMask * cornerTrim));
        data[idx + 3] = Math.round(data[idx + 3] * mask);
      }
    }
    patchCtx.putImageData(frame, 0, 0);
    ctx.drawImage(patchCanvas, col * TILE_W, row * TILE_H);
  }

  const atlasFrame = ctx.getImageData(0, 0, atlas.width, atlas.height);
  const data = atlasFrame.data;
  for (let i = 0; i < data.length; i += 4) {
    const value = Math.max(data[i], data[i+1], data[i+2]);
    data[i+3] = Math.round(data[i+3] * clamp((value - 4) / 44));
  }
  ctx.putImageData(atlasFrame, 0, 0);
  fibreCache.set(image, atlas);
  return atlas;
}

export class Specimen2D{
 constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:true});this.params={...defaults};this.images=Array(STAGE_COUNT).fill(null);this.zoom=1;this.angle=0;this.cache=new Map();this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();}
 setImage(i,img){this.images[i]=prepareImage(img);this.cache.clear();this.draw();}
 setParams(p){const colorChanged=['palette','inkA','inkB','intensity','hue','monoWhite'].some(k=>k in p&&p[k]!==this.params[k]);Object.assign(this.params,p);if(colorChanged)this.cache.clear();this.draw();}
 resize(){const r=this.canvas.getBoundingClientRect(),dpr=Math.min(1.5,devicePixelRatio||1);const w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));if(w!==this.canvas.width||h!==this.canvas.height){this.canvas.width=w;this.canvas.height=h;}this.draw();}
 tinted(i){const src=this.images[i]||this.images[0];if(!src)return null;const p=this.params;
  if(p.palette==='origin'||(p.palette!=='monotone'&&p.intensity<.005))return src;
  const key=[i,p.palette,p.inkA,p.inkB,p.intensity,p.hue,p.monoWhite].join('|');if(this.cache.has(key))return this.cache.get(key);
  const c=document.createElement('canvas');c.width=src.width;c.height=src.height;const ctx=c.getContext('2d');ctx.drawImage(src,0,0);
  if(p.palette==='monotone'){ctx.globalCompositeOperation='source-in';ctx.fillStyle=p.monoWhite?'#ffffff':'#000000';ctx.fillRect(0,0,c.width,c.height);ctx.globalCompositeOperation='source-over';if(this.cache.size>=6)this.cache.clear();this.cache.set(key,c);return c;}
  let stops;
  if(p.palette==='prism')stops=['#04b7b0','#8db9a2','#d5a65e','#bc396e','#6856cc','#1ab7c5'];
  else if(p.palette==='shell')stops=['#72092a','#b15169','#e8dec4'];
  else if(p.palette==='mint')stops=['#184c48','#599782','#c7f9e4'];
  else stops=[p.inkA,p.inkB];
  const g=orientedGradient(ctx,c.width,c.height,stops,p.hue);
  // Preserve all fine alpha detail, recolour with a compositing operation.
  ctx.globalCompositeOperation='source-atop';ctx.globalAlpha=p.intensity;ctx.fillStyle=g;ctx.fillRect(0,0,c.width,c.height);
  ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  if(this.cache.size>=6)this.cache.clear();this.cache.set(key,c);return c;
 }
 draw(){const ctx=this.ctx,w=this.canvas.width,h=this.canvas.height,p=this.params;ctx.clearRect(0,0,w,h);
  const f=p.progress/100*(STAGE_COUNT-1),a=Math.min(STAGE_COUNT-1,Math.floor(f)),b=Math.min(STAGE_COUNT-1,a+1),t=f-a;
  for(const [i,alpha] of [[a,1-t],[b,t]]){if(alpha<.001)continue;const img=this.tinted(i);if(!img)continue;
   const stageScale=(i===1?1.1385:1); // V48: HATCH default is 1.1x the former V47 size
   const stretchY=(i===2?1.035:1); // V48: 2D MOLT is slightly taller vertically
   const stageYOffset=(i===1?h*.066:0); // V58: 2D HATCH an additional 1.0% canvas-height lower
   const s=Math.min(w/(img.width*1.12),h/(img.height*1.14))*p.scale*this.zoom*specimenScaleBias*stageScale;
   ctx.save();ctx.translate(w/2,h/2 + stageYOffset);ctx.rotate(this.angle||0);ctx.scale(s,s*stretchY);ctx.globalAlpha=alpha;
   const m=p.modification;
   if(m<.001){ctx.drawImage(img,-img.width/2,-img.height/2);}else{
    // Continuous single-piece ripple; no artificial 4-way peel.
    const strip=6;
    for(let y=0;y<img.height;y+=strip){const sh=Math.min(strip,img.height-y),v=y/img.height;
     const bend=m*(34*Math.sin(v*31)+18*Math.sin(v*68))*(.3+.7*Math.sin(Math.PI*v));
     ctx.drawImage(img,0,y,img.width,sh,-img.width/2+bend,-img.height/2+y,img.width,sh+.4);
    }
   }ctx.restore();
  }
 }
 exportCanvas(){this.draw();return this.canvas;}
}

const VS = `#version 300 es
precision highp float;
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec2 a_uv;
uniform float u_aspect,u_scale,u_yaw,u_pitch,u_modification,u_verticalRatio,u_stageOffsetY;
out vec3 v_obj;
out vec3 v_normal;
out vec3 v_objNormal;
void main() {
  vec3 p = a_position;
  vec3 n = normalize(a_normal);
  float m = clamp(u_modification, 0.0, 1.0);
  // Smooth low-frequency folds along actual surface normals; preserves volume.
  float breathe =
      0.055 * sin(p.x * 4.1 + p.y * 2.0 + p.z * 1.3)
    + 0.023 * sin(p.x * 7.9 - p.z * 3.6)
    + 0.012 * cos(p.y * 6.1 + p.x * 2.1);
  p += n * m * breathe;
  v_obj = a_position;      // Anchor patches in original object coordinates.
  v_objNormal = n;        // Object-space triplanar weights avoid camera swimming.
  float cy = cos(u_yaw), sy = sin(u_yaw);
  float cx = cos(u_pitch), sx = sin(u_pitch);
  vec3 rp = vec3(cy*p.x + sy*p.z,p.y,-sy*p.x + cy*p.z);
  rp = vec3(rp.x,cx*rp.y - sx*rp.z,sx*rp.y + cx*rp.z);
  vec3 rn = vec3(cy*n.x + sy*n.z,n.y,-sy*n.x + cy*n.z);
  v_normal = normalize(vec3(rn.x,cx*rn.y - sx*rn.z,sx*rn.y + cx*rn.z));
  float perspective = 4.6 / max(1.35, 4.6 - rp.z);
  gl_Position = vec4(
    rp.x*u_scale*.66*perspective/u_aspect,
    rp.y*u_scale*.75*perspective*u_verticalRatio+u_stageOffsetY,
    rp.z*.09,1.0
  );
}`;

const FS = `#version 300 es
precision highp float;
in vec3 v_obj;
in vec3 v_normal;
in vec3 v_objNormal;
uniform sampler2D u_tex;
uniform float u_palette,u_intensity,u_hue,u_alpha,u_glow,u_wire,u_monoWhite;
uniform float u_phaseMin,u_phaseMax;
uniform vec3 u_a,u_b;
out vec4 outColor;

float hash21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

mat2 rot(float a){
  float c=cos(a), s=sin(a);
  return mat2(c,-s,s,c);
}

vec3 spectrum(float h) {
  return clamp(abs(fract(h+vec3(0.0,.666667,.333333))*6.0-3.0)-1.0,0.0,1.0);
}

vec4 atlasSample(vec2 uv){
  return texture(u_tex, clamp(uv, vec2(0.0008), vec2(0.9992)));
}

vec4 sourceFragment(vec2 plane, float seed) {
  vec2 warped = plane;
  warped += 0.090 * vec2(
    sin(plane.y * 2.15 + seed * 1.13) + 0.42 * sin(plane.x * 4.33 - seed * 0.71),
    cos(plane.x * 2.57 - seed * 0.89) + 0.35 * cos(plane.y * 4.81 + seed * 0.49)
  );

  vec2 cells = warped * vec2(1.28, 1.94);
  vec2 id = floor(cells);
  vec2 local = fract(cells) - 0.5;

  float rand = hash21(id + seed*vec2(2.23,7.91));
  float tile = floor(rand * 49.0);
  vec2 tileIndex = vec2(mod(tile,7.0),floor(tile/7.0));

  float angle = (hash21(id + seed*vec2(8.1,1.9)) - 0.5) * 0.34;
  local = rot(angle) * local;
  local += 0.07 * vec2(
    sin((local.y + seed) * 8.7),
    cos((local.x - seed) * 7.9)
  );

  vec2 within = (vec2(2.0) + (local + 0.5) * vec2(220.0,148.0)) / vec2(224.0,152.0);
  vec2 uv = (tileIndex + within) / 7.0;
  vec4 texel = atlasSample(uv);

  float bright = max(texel.r, max(texel.g, texel.b));
  texel.a = smoothstep(0.055, 0.16, bright) * texel.a;
  return texel;
}

vec4 chooseStronger(vec4 a, vec4 b){
  return (a.a >= b.a) ? a : b;
}

vec4 irregularCluster(vec2 plane, float seed) {
  vec4 a = sourceFragment(plane, seed);
  vec4 b = sourceFragment(plane * 0.93 + vec2(0.24, -0.16), seed + 6.7);
  vec4 c = sourceFragment(plane * 1.07 + vec2(-0.22, 0.13), seed + 12.1);
  vec4 d = sourceFragment(plane * 0.79 + vec2(0.08, 0.27), seed + 19.4);

  vec4 strongest = chooseStronger(a, b);
  strongest = chooseStronger(strongest, c);

  // Keep sparse passages of the original fibre drawing visible.
  // The fourth patch is a subtle safety layer, not a full-coverage fill.
  if (strongest.a < 0.18) {
    strongest.rgb = mix(strongest.rgb, d.rgb, 0.22);
    strongest.a = max(strongest.a, d.a * 0.46);
  }
  return strongest;
}

vec4 objectInk(vec3 p, vec3 n) {
  vec3 w = pow(abs(normalize(n)), vec3(5.0));
  w /= max(w.x + w.y + w.z, 0.00001);

  vec4 x = irregularCluster(vec2(p.z, p.y), 1.13);
  vec4 y = irregularCluster(vec2(p.x, p.z), 3.79);
  vec4 z = irregularCluster(vec2(p.x, p.y), 6.53);

  vec4 px = vec4(x.rgb, x.a * w.x);
  vec4 py = vec4(y.rgb, y.a * w.y);
  vec4 pz = vec4(z.rgb, z.a * w.z);

  vec4 strongest = chooseStronger(px, py);
  strongest = chooseStronger(strongest, pz);

  // V37: cross-fade actual source-pigment samples across triplanar transitions.
  // Preserve the strongest source alpha to keep the original open fibre density.
  // Weighted RGB removes abrupt colour islands caused by chooseStronger().
  vec3 smoothWeights = vec3(
    smoothstep(0.01, 0.34, x.a) * w.x,
    smoothstep(0.01, 0.34, y.a) * w.y,
    smoothstep(0.01, 0.34, z.a) * w.z
  );
  float weightSum = smoothWeights.x + smoothWeights.y + smoothWeights.z;
  if (weightSum > 0.00001) {
    vec3 blendedSource = (
      x.rgb * smoothWeights.x +
      y.rgb * smoothWeights.y +
      z.rgb * smoothWeights.z
    ) / weightSum;
    strongest.rgb = mix(strongest.rgb, blendedSource, 0.88);
  }

  // Restrict secondary projection to genuine soft gaps; retain the
  // source artwork's organic breathing space instead of a sealed shell.
  if (strongest.a < 0.14) {
    vec4 fill1 = irregularCluster(vec2(p.x + p.y, p.z - p.y) * 0.81, 11.71);
    vec4 fill2 = irregularCluster(vec2(p.x - p.z, p.y + p.z) * 0.68, 17.33);
    vec4 fill = chooseStronger(fill1, fill2);
    strongest.rgb = mix(strongest.rgb, fill.rgb, 0.28);
    strongest.a = max(strongest.a, fill.a * 0.43);
  }

  strongest.a = clamp(strongest.a, 0.0, 1.0);
  return strongest;
}


/* FULL-QUALITY ROTATION: every camera angle samples the exact same object-space
 * multi-projection fibre field. No sparse preview shader is ever substituted. */
void main() {
  vec4 artwork = objectInk(v_obj, v_objNormal);
  // Smooth continuous volume-space pigment field: never fract() at the
  // seam, never a hard two-colour boundary. Stable under camera rotation.
  // Normalize across the specimen's OWN longitudinal axis, not the camera.
  // Hue drift changes gradient orientation, never total colour dominance.
  float longitudinal = clamp((v_obj.x-u_phaseMin)/max(0.001,u_phaseMax-u_phaseMin),0.0,1.0);
  float phase = 0.5 - 0.5*cos(3.14159265*longitudinal + radians(u_hue));
  vec3 pigment = artwork.rgb;
  if (u_palette > 0.5) {
    vec3 target = artwork.rgb;
    if (u_palette < 1.5) {
      target = mix(
        mix(vec3(.08,.77,.72),vec3(.88,.71,.42),smoothstep(0.0,0.58,phase)),
        vec3(.76,.22,.49),smoothstep(0.45,1.0,phase)
      );
    } else if (u_palette < 2.5) {
      target = mix(
        mix(vec3(.447,.035,.165),vec3(.75,.28,.43),smoothstep(0.0,0.52,phase)),
        vec3(.91,.87,.79),smoothstep(0.47,1.0,phase)
      );
    } else if (u_palette < 3.5) {
      target = mix(
        mix(vec3(.07,.29,.27),vec3(.36,.67,.60),smoothstep(0.0,0.52,phase)),
        vec3(.78,.97,.89),smoothstep(0.46,1.0,phase)
      );
    } else {
      target = mix(u_a,u_b,smoothstep(0.02,0.98,phase));
    }
    pigment = mix(artwork.rgb,target,u_intensity);
  }

  // A small chroma and brightness lift, derived from actual source pigment.
  // No extra white or pale shell overlay is added to the artwork.
  float luminance = dot(pigment, vec3(.2126,.7152,.0722));
  pigment = clamp(mix(vec3(luminance),pigment,1.12)*1.07,0.0,1.0);
  float shade = 0.965 + 0.035*abs(dot(normalize(v_normal),normalize(vec3(.26,.70,1.0))));
  pigment *= shade*(1.0+u_glow*.035*artwork.a);
  if(u_wire>0.5) pigment *= .91;

  // Density is determined by organic PNG fibre pixels, not by an opaque
  // coloured OBJ support layer. Discard only near-empty source fragments.
  float inkAlpha = clamp(artwork.a,0.0,1.0);
  float coverage = smoothstep(0.045,0.30,inkAlpha);
  if(coverage < 0.035) discard;
  float alpha = u_alpha * coverage * (0.42 + 0.52*inkAlpha);
  if(u_palette>4.5) pigment=vec3(u_monoWhite>.5?1.0:0.0);
  outColor = vec4(pigment,clamp(alpha,0.0,1.0));
}`;

function program(gl) {
  const compile = (type, source) => {
    const shader = gl.createShader(type);
    if (!shader) throw Error('Cannot allocate WebGL shader');
    gl.shaderSource(shader,source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) || 'unknown shader error';
      gl.deleteShader(shader);
      throw Error((type === gl.VERTEX_SHADER ? 'Vertex' : 'Fragment') + ' GLSL compile failed: ' + log);
    }
    return shader;
  };
  const vert = compile(gl.VERTEX_SHADER,VS);
  const frag = compile(gl.FRAGMENT_SHADER,FS);
  const compiled = gl.createProgram();
  if (!compiled) throw Error('Cannot allocate WebGL program');
  gl.attachShader(compiled,vert);
  gl.attachShader(compiled,frag);
  gl.linkProgram(compiled);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if (!gl.getProgramParameter(compiled,gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(compiled) || 'unknown link error';
    gl.deleteProgram(compiled);
    throw Error('GLSL link failed: ' + log);
  }
  return compiled;
}

function upload(gl,g){
 let phaseMin=Infinity,phaseMax=-Infinity;
 for(let j=0;j<g.pos.length;j+=3){const x=g.pos[j];if(x<phaseMin)phaseMin=x;if(x>phaseMax)phaseMax=x;}
 if(!Number.isFinite(phaseMin)||!Number.isFinite(phaseMax)){phaseMin=-1;phaseMax=1;}
 const vao=gl.createVertexArray();gl.bindVertexArray(vao);const data=new Float32Array(g.pos.length/3*8);for(let i=0;i<g.pos.length/3;i++){data.set(g.pos.subarray(i*3,i*3+3),i*8);data.set(g.norm.subarray(i*3,i*3+3),i*8+3);data.set(g.uv.subarray(i*2,i*2+2),i*8+6);}const vbo=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vbo);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);for(const [i,len,offset] of [[0,3,0],[1,3,12],[2,2,24]]){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,len,gl.FLOAT,false,32,offset);}const faces=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,faces);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,g.tri,gl.STATIC_DRAW);const lines=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,lines);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,g.lines,gl.STATIC_DRAW);gl.bindVertexArray(null);return {vao,vbo,faces,lines,tri:g.tri.length,wire:g.lines.length,phaseMin,phaseMax};}

function stageDensityGains(counts){
 const usable=counts.filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b);
 if(!usable.length)return counts.map(()=>1);
 const mid=usable.length%2?usable[(usable.length-1)>>1]:(usable[usable.length/2-1]+usable[usable.length/2])*.5;
 return counts.map(n=>!n?0:clamp(Math.pow(mid/n,.20),.88,1.16));
}

function stableStageWeights(progress,counts){
 const t=clamp(progress/100*(STAGE_COUNT-1),0,STAGE_COUNT-1);
 const radius=1.0;
 const raw=Array(STAGE_COUNT).fill(0).map((_,i)=>{
  const d=Math.abs(i-t);
  if(d>=radius)return 0;
  const falloff=1-d/radius;
  return Math.pow(falloff,1.45);
 });
 if(!raw.some(v=>v>0))raw[Math.round(t)]=1;
 const gains=stageDensityGains(counts);
 let adjusted=raw.map((v,i)=>v*(gains[i]||0));
 let total=adjusted.reduce((s,v)=>s+v,0);
 if(total<1e-6){adjusted=raw;total=adjusted.reduce((s,v)=>s+v,0)||1;}
 const target=1.04;
 return adjusted.map(v=>v/total*target);
}

export class Specimen3D{
 constructor(canvas){this.canvas=canvas;const gl=canvas.getContext('webgl2',{alpha:true,antialias:true,preserveDrawingBuffer:true,premultipliedAlpha:false});if(!gl)throw Error('WebGL2 unavailable');this.gl=gl;this.prog=program(gl);this.uniforms={};for(const k of ['tex','aspect','scale','yaw','pitch','modification','verticalRatio','stageOffsetY','palette','intensity','hue','alpha','glow','wire','monoWhite','phaseMin','phaseMax','a','b'])this.uniforms[k]=gl.getUniformLocation(this.prog,'u_'+k);this.meshes=Array(STAGE_COUNT).fill(null);this.textures=Array(STAGE_COUNT).fill(null);this.params={...defaults};this.yaw=0;this.pitch=0;this.zoom=1;this.flashAt=-1e9;this.flashFrame=0;this.drag=null;this.autoFast=false;this.drawPending=0;this.textureCache=new WeakMap();
  canvas.addEventListener('pointerdown',e=>{
   this.drag={x:e.clientX,y:e.clientY,yaw:this.yaw,pitch:this.pitch};
   canvas.setPointerCapture(e.pointerId);
   this.requestDraw();
  });
  canvas.addEventListener('pointermove',e=>{
   if(!this.drag)return;
   this.yaw=this.drag.yaw+(e.clientX-this.drag.x)*.006;
   this.pitch=clamp(this.drag.pitch+(e.clientY-this.drag.y)*.006,-1.35,1.35);
   this.requestDraw();
  });
  for(const type of ['pointercancel','pointerup'])canvas.addEventListener(type,()=>{
   if(!this.drag)return;
   this.drag=null;
   this.requestDraw();
  });
  canvas.addEventListener('wheel',e=>{
   e.preventDefault();
   this.zoom=clamp(this.zoom-e.deltaY*.0007,.55,1.85);
   this.requestDraw();
  },{passive:false});
  this.observer=new ResizeObserver(()=>this.resize());this.observer.observe(canvas);this.resize();
 }
 // Render once per animation frame, not once for every pointer event.
 isFast(){return Boolean(this.drag || this.autoFast);}
 requestDraw(){
  if(this.drawPending)return;
  this.drawPending=requestAnimationFrame(()=>{this.drawPending=0;this.draw();});
 }
 setInteractiveMode(value){
  const next=Boolean(value);
  if(this.autoFast===next)return;
  this.autoFast=next;
  this.requestDraw();
 }
 setMesh(i,g){const gl=this.gl,old=this.meshes[i];if(old){gl.deleteVertexArray(old.vao);for(const x of ['vbo','faces','lines'])gl.deleteBuffer(old[x]);}this.meshes[i]=upload(gl,g);this.draw();}
 setImage(i,img){
  // cocoon7.png is shared by every OBJ phase. Upload its atlas ONCE to GPU.
  const cached=this.textureCache.get(img);
  if(cached){this.textures[i]=cached;this.requestDraw();return;}
  const gl=this.gl;const src=prepareFibreAtlas(img);
  let tex=gl.createTexture();this.textures[i]=tex;this.textureCache.set(img,tex);gl.bindTexture(gl.TEXTURE_2D,tex);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);
  gl.generateMipmap(gl.TEXTURE_2D);
  const ext=gl.getExtension('EXT_texture_filter_anisotropic')||gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic');
  if(ext){const max=gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT);gl.texParameterf(gl.TEXTURE_2D,ext.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,max));}
  this.draw();}
 setParams(next){const old=this.params.progress;Object.assign(this.params,next);if('progress' in next&&old!==next.progress){const stage=p=>Math.min(STAGE_COUNT-1,Math.floor(p/100*(STAGE_COUNT-1)+1e-7));if(stage(old)!==stage(next.progress)){this.flashAt=performance.now();this.scheduleGlow();}}this.draw();}
 scheduleGlow(){if(this.flashFrame)return;const frame=t=>{this.flashFrame=0;this.draw();if(t-this.flashAt<440)this.flashFrame=requestAnimationFrame(frame);};this.flashFrame=requestAnimationFrame(frame);}
 resize(){
  const r=this.canvas.getBoundingClientRect();
  // Retina browsers otherwise shade millions of extra pixels per frame.
  const dpr=Math.min(1.45,window.devicePixelRatio||1);
  const w=Math.max(2,Math.round(r.width*dpr)),h=Math.max(2,Math.round(r.height*dpr));
  if(w!==this.canvas.width||h!==this.canvas.height){this.canvas.width=w;this.canvas.height=h;}
  this.requestDraw();
 }
 draw(){const gl=this.gl,p=this.params;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.prog);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.disable(gl.CULL_FACE);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
  const set=(k,v)=>gl.uniform1f(this.uniforms[k],v);const baseScale=p.scale*this.zoom*specimenScaleBias;set('aspect',this.canvas.width/this.canvas.height);set('yaw',this.yaw);set('pitch',this.pitch+0.17*clamp((p.progress-50)/50));set('modification',p.modification);set('palette',palettes[p.palette]??0);set('monoWhite',p.monoWhite||0);set('intensity',p.intensity);set('hue',p.hue);set('wire',p.mode==='wire'?1:0);set('glow',clamp(1-(performance.now()-this.flashAt)/440)**2);gl.uniform3fv(this.uniforms.a,rgb(p.inkA));gl.uniform3fv(this.uniforms.b,rgb(p.inkB));gl.uniform1i(this.uniforms.tex,0);
  const counts=this.meshes.map(m=>m?m.tri:0);
  const weights=stableStageWeights(p.progress,counts);
  for(let i=0;i<weights.length;i++){
   const opacity=weights[i];
   if(opacity<.045)continue;
   // Never substitute the COCOON OBJ when HATCH or MOLT is still loading.
   const mesh=this.meshes[i],tex=this.textures[i]||this.textures[0];if(!mesh||!tex)continue;
   gl.clear(gl.DEPTH_BUFFER_BIT);
   gl.activeTexture(gl.TEXTURE0);
   gl.bindTexture(gl.TEXTURE_2D,tex);
   gl.bindVertexArray(mesh.vao);
   set('scale',baseScale*(i<2?1.105:1)); // Keep V57 COCOON/HATCH size (85% of V56).
   set('verticalRatio',i===2?0.92:1.0); // Keep V56 MOLT flattening.
   set('stageOffsetY',i===1?0.024:0.0); // V58: HATCH up 1.2% of viewport height.
   set('alpha',opacity);
   set('phaseMin',mesh.phaseMin);
   set('phaseMax',mesh.phaseMax);
   gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,p.mode==='wire'?mesh.lines:mesh.faces);
   gl.drawElements(p.mode==='wire'?gl.LINES:gl.TRIANGLES,p.mode==='wire'?mesh.wire:mesh.tri,gl.UNSIGNED_INT,0);
  }
  gl.bindVertexArray(null);
 }
 exportCanvas(){this.draw();return this.canvas;}
}

/* ECDYSIS V11 — true 3D software renderer for browsers which reject WebGL2.
 * Projects actual OBJ surface samples using a camera and original cocoon PNG
 * fibre fragments. There is no dependency on WebGL, Three.js or the network.
 * It is deliberately lighter than rasterizing 228k mesh triangles on the CPU.
 */
export class SpecimenSoftware3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {alpha:true});
    if (!this.ctx) throw new Error('Canvas2D is also unavailable');
    this.backend = 'software-3d';
    this.params = {...defaults};
    this.meshes = Array(STAGE_COUNT).fill(null);
    this.atlases = Array(STAGE_COUNT).fill(null);
    this.tintCache = new Map();
    this.yaw = 0;
    this.pitch = 0;
    this.zoom = 1;
    this.drag = null;
    this.dragMoved = false;
    this.lastDraw = 0;
    this.autoFast = false;
    this.drawPending = 0;
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    canvas.addEventListener('pointerdown', e => {
      this.drag = {x:e.clientX,y:e.clientY,yaw:this.yaw,pitch:this.pitch};
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', e => {
      if (!this.drag) return;
      this.yaw = this.drag.yaw + (e.clientX - this.drag.x)*.006;
      this.pitch = clamp(this.drag.pitch + (e.clientY - this.drag.y)*.006,-1.3,1.3);
      this.requestDraw();
    });
    for (const event of ['pointerup','pointercancel']) {
      canvas.addEventListener(event, () => {this.drag=null;this.requestDraw();});
    }
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      this.zoom = clamp(this.zoom - e.deltaY*.0007,.55,1.85);
      this.requestDraw();
    }, {passive:false});
    this.resize();
  }

  requestDraw(){
    if(this.drawPending)return;
    this.drawPending=requestAnimationFrame(()=>{this.drawPending=0;this.draw();});
  }
  setInteractiveMode(value){this.autoFast=Boolean(value);this.requestDraw();}

  setImage(i,img) {
    // Same 64 crops and same aspect ratio as the GPU fibre atlas.
    this.atlases[i] = prepareFibreAtlas(img);
    this.tintCache.clear();
    this.draw();
  }

  setMesh(i,geometry) {
    const positions = geometry.pos;
    const normals = geometry.norm;
    const indices = geometry.tri;
    const faces = indices.length / 3;
    const target = 3400;
    const step = Math.max(1, Math.floor(faces / target));
    const seen = new Set();
    const points = [];
    // Stratify by physical space so one very dense OBJ region does not
    // monopolize all texture fragments.
    for (let face = 0; face < faces; face += step) {
      const k = face*3;
      const a = indices[k]*3;
      const b = indices[k+1]*3;
      const c = indices[k+2]*3;
      const x = (positions[a]+positions[b]+positions[c])/3;
      const y = (positions[a+1]+positions[b+1]+positions[c+1])/3;
      const z = (positions[a+2]+positions[b+2]+positions[c+2])/3;
      const nx = (normals[a]+normals[b]+normals[c])/3;
      const ny = (normals[a+1]+normals[b+1]+normals[c+1])/3;
      const nz = (normals[a+2]+normals[b+2]+normals[c+2])/3;
      const key = [Math.floor((x+3)*32),Math.floor((y+3)*32),Math.floor((z+3)*32)].join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      points.push({x,y,z,nx,ny,nz,id:face});
      if (points.length >= 3600) break;
    }
    if (!points.length) throw new Error('OBJ has no renderable surface samples');
    this.meshes[i] = points;
    this.draw();
  }

  setParams(value) {
    const recolour = ['palette','inkA','inkB','hue','intensity'].some(k => k in value && value[k] !== this.params[k]);
    Object.assign(this.params,value);
    if (recolour) this.tintCache.clear();
    this.draw();
  }

  atlasForStage(i) {
    const base = this.atlases[i] || this.atlases[0];
    if (!base) return null;
    const p = this.params;
    if (p.palette === 'origin' || (p.palette!=='monotone' && p.intensity < .01)) return base;
    const key = [i,p.palette,p.inkA,p.inkB,p.hue,p.intensity,p.monoWhite].join('|');
    if (this.tintCache.has(key)) return this.tintCache.get(key);
    const result = document.createElement('canvas');
    result.width=base.width; result.height=base.height;
    const ctx=result.getContext('2d');
    ctx.drawImage(base,0,0);
    if(p.palette==='monotone'){ctx.globalCompositeOperation='source-in';ctx.fillStyle=p.monoWhite?'#ffffff':'#000000';ctx.fillRect(0,0,result.width,result.height);ctx.globalCompositeOperation='source-over';this.tintCache.set(key,result);return result;}
    const colours = p.palette === 'prism'
      ? ['#0ac6be','#ddb058','#e75280','#7a53c7','#75d8b8']
      : p.palette === 'shell' ? ['#72092a','#ba607a','#e8dec4']
      : p.palette === 'mint' ? ['#225d58','#599782','#c7f9e4']
      : [p.inkA,p.inkB];
    const g=orientedGradient(ctx,result.width,result.height,colours,p.hue);
    ctx.globalCompositeOperation='source-atop';
    ctx.globalAlpha=p.intensity;
    ctx.fillStyle=g;
    ctx.fillRect(0,0,result.width,result.height);
    ctx.globalCompositeOperation='source-over';
    this.tintCache.set(key,result);
    return result;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const ratio = Math.min(1.25,window.devicePixelRatio||1);
    const w = Math.max(2,Math.round(r.width*ratio));
    const h = Math.max(2,Math.round(r.height*ratio));
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.draw();
  }

  draw() {
    const canvas = this.canvas;
    const ctx = this.ctx;
    const w = canvas.width;
    const h = canvas.height;
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);
    const p = this.params;
    const counts=this.meshes.map(samples=>samples?samples.length:0);
    const weights=stableStageWeights(p.progress,counts);
    const baseUnit = Math.min(w/4.7,h/3.6) * p.scale * this.zoom * specimenScaleBias;
    const cy=Math.cos(this.yaw),sy=Math.sin(this.yaw);
    const viewPitch=this.pitch+0.17*clamp((p.progress-50)/50); // match WebGL front-on MOLT correction
    const cp=Math.cos(viewPitch),sp=Math.sin(viewPitch);

    const renderStage = (i,opacity) => {
      const unit=baseUnit*(i<2?1.105:1); // V57: COCOON/HATCH at 85% of V56
      const samples = this.meshes[i]; // Do not show COCOON while another OBJ loads.
      const atlas = this.atlasForStage(i);
      if (!samples || !atlas || opacity < .005) return false;
      const drawList = [];
      const stride=1; // Same OBJ surface sampling while dragging and at rest.
      for (let j=0;j<samples.length;j+=stride) {
        const v=samples[j];
        // Extremely small, smooth volume-preserving normal displacement.
        const displacement = p.modification * (
          .055*Math.sin(v.x*4.1+v.y*2.0+v.z*1.3)+
          .023*Math.sin(v.x*7.9-v.z*3.6)
        );
        const x = v.x + v.nx*displacement;
        const y = v.y + v.ny*displacement;
        const z = v.z + v.nz*displacement;
        const rx = cy*x+sy*z;
        const rz = -sy*x+cy*z;
        const ry = cp*y-sp*rz;
        const depth = sp*y+cp*rz;
        const perspective = 4.6/Math.max(1.4,4.6-depth);
        const X = w/2+rx*unit*perspective;
        const Y = h/2-ry*unit*perspective*(i===2?0.92:1.0) - (i===1?h*.012:0); // V58: raise 3D HATCH 1.2%
        if (X < -80 || X > w+80 || Y < -80 || Y > h+80) continue;
        // Orient source fragment along the material's local surface direction.
        const angle = Math.atan2(v.ny, v.nx)*.27;
        const patchWidth = clamp(unit*.135*perspective,7,52);
        drawList.push({X,Y,depth,angle,size:patchWidth,id:v.id});
      }
      drawList.sort((q,r) => q.depth-r.depth);
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.filter = 'saturate(1.12) brightness(1.07)';
      // A source-atop colour operation allows the colour controls to work
      // without any per-frame pixel reads and without replacing source lines.
      const palette = p.palette;
      let tint = null;
      if (palette==='shell') tint=p.inkB;
      else if (palette==='mint') tint='#599782';
      else if (palette==='custom') tint=p.inkA;
      for (const v of drawList) {
        const tile = ((v.id*1103515245+12345)>>>0)%49;
        const tx = (tile%7)*224+2;
        const ty = Math.floor(tile/7)*152+2;
        const wid = v.size;
        const hei = wid*148/220;
        ctx.save();
        ctx.translate(v.X,v.Y);
        ctx.rotate(v.angle);
        ctx.drawImage(atlas,tx,ty,220,148,-wid/2,-hei/2,wid,hei);
        ctx.restore();
      }
      ctx.restore();
      return true;
    };
    let rendered=false;
    weights.forEach((opacity,i)=>{
      if(opacity<.045)return;
      rendered=renderStage(i,opacity)||rendered;
    });
    // Leave the transparent viewport empty until the selected OBJ has loaded.
    // Displaying the COCOON texture here made HATCH/MOLT switches flash.
  }

  exportCanvas() {
    this.draw();
    return this.canvas;
  }
}
