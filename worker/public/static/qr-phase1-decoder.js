/* Fixed local Apache-2.0 jsQR, provenance in qr-vendor. No credential or network API. */
importScripts('/static/qr-vendor/jsqr-1.4.0.js');
self.onmessage=({data:v})=>{
 if(!v||!Number.isSafeInteger(v.id)||!Number.isSafeInteger(v.width)||!Number.isSafeInteger(v.height)||v.width<49||v.height<49||v.width>1280||v.height>1280||!(v.buffer instanceof ArrayBuffer)||v.buffer.byteLength!==v.width*v.height*4)return;
 const pixels=new Uint8ClampedArray(v.buffer);let text=null;
 try{const found=self.jsQR(pixels,v.width,v.height,{inversionAttempts:'attemptBoth'});if(found&&typeof found.data==='string'&&found.data.startsWith('OLG1|')&&new TextEncoder().encode(found.data).length<=512)text=found.data;}finally{pixels.fill(0);self.postMessage({id:v.id,text});}
};
