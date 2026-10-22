/* Files are held only in the local browser's IndexedDB, never uploaded remotely. */
const DB='ECDYSIS_LOCAL_SPECIMENS_V2', STORE='images';
function db(){return new Promise((resolve,reject)=>{if(!('indexedDB'in window)){reject(Error('IndexedDB unavailable'));return;}const request=indexedDB.open(DB,1);request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function transact(mode,index,value){const database=await db();return new Promise((resolve,reject)=>{const tr=database.transaction(STORE,mode);const store=tr.objectStore(STORE);const request=mode==='readonly'?store.get(index):store.put(value,index);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);tr.oncomplete=()=>database.close();tr.onerror=()=>database.close();});}
export async function readStage(index){try{return await transact('readonly',index)}catch{return undefined}}
export async function saveStage(index,file){return transact('readwrite',index,{blob:file,name:file.name})}
