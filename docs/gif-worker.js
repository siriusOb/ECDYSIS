/* ECDYSIS V32 / self-contained GIF89a indexed LZW encoder. No CDN. */
function writeGIF(frames,width,height,delay){
    const chunks=[];
    const byte=v=>chunks.push(v&255);
    const word=v=>{byte(v);byte(v>>8);};
    for(const c of 'GIF89a')byte(c.charCodeAt(0));
    word(width);word(height);byte(0xf7);byte(0);byte(0);
    // 3-3-2 (RGB) palette; stable across all recorded frames.
    for(let i=0;i<256;i++){byte(Math.round(((i>>5)&7)*255/7));byte(Math.round(((i>>2)&7)*255/7));byte(Math.round((i&3)*255/3));}
    // Repeat indefinitely.
    chunks.push(0x21,0xff,0x0b);
    for(const c of 'NETSCAPE2.0')byte(c.charCodeAt(0));
    chunks.push(3,1,0,0,0);
    for(let f=0;f<frames.length;f++){
     // Graphics control extension: no transparency. Frame delay centiseconds.
     chunks.push(0x21,0xf9,4,0,Math.max(2,delay)&255,(Math.max(2,delay)>>8)&255,0,0);
     byte(0x2c);word(0);word(0);word(width);word(height);byte(0);
     byte(8);
     const data=frames[f];const pixels=new Uint8Array(width*height);
     for(let p=0,k=0;p<pixels.length;p++,k+=4) pixels[p]=((data[k]>>5)<<5)|((data[k+1]>>5)<<2)|(data[k+2]>>6);
     // GIF LZW with standard clear/end codes, 9 to 12 bit code width.
     let codes=[],current=-1,dict=new Map(),next=258,bits=9;
     let acc=0,count=0;const compressed=[];
     const emit=(code)=>{acc|=(code<<count);count+=bits;while(count>=8){compressed.push(acc&255);acc>>>=8;count-=8;}};
     const clear=()=>{dict=new Map();next=258;bits=9;emit(256);};
     clear();
     for(let p=0;p<pixels.length;p++){
      const value=pixels[p];
      if(current<0){current=value;continue;}
      const key=current*256+value;
      const existing=dict.get(key);
      if(existing!==undefined){current=existing;continue;}
      emit(current);
      if(next<4096){dict.set(key,next++);if(next>(1<<bits) && bits<12)bits++;}
      else clear();
      current=value;
     }
     if(current>=0)emit(current);
     emit(257);
     if(count)compressed.push(acc&255);
     for(let k=0;k<compressed.length;k+=255){const len=Math.min(255,compressed.length-k);byte(len);for(let j=0;j<len;j++)byte(compressed[k+j]);}
     byte(0);
    }
    byte(0x3b);
    return new Blob([Uint8Array.from(chunks)],{type:'image/gif'});
   }
   self.onmessage=e=>{
    try{const {frames,width,height,delay}=e.data;const result=writeGIF(frames,width,height,delay);self.postMessage({ok:true,blob:result});}
    catch(err){self.postMessage({ok:false,error:String(err)});}
   };
   