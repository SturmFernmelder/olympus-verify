'use strict';
// Decode only the fixed RGBA/filter-zero PNGs from our synthetic Lua renderer.
// This reuses the transport oracle's bounds; no workstation pngjs dependency.
const assert=require('node:assert/strict'),zlib=require('node:zlib');
function readSyntheticPng(png){
  assert.ok(Buffer.isBuffer(png)&&png.length<=32768);
  assert.deepEqual(png.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
  let at=8,header=null,ended=false;const compressed=[];
  while(at<png.length){
    assert.ok(at+12<=png.length);
    const length=png.readUInt32BE(at),kind=png.toString('ascii',at+4,at+8);
    assert.ok(at+12+length<=png.length);
    const data=png.subarray(at+8,at+8+length);
    assert.equal(zlib.crc32(png.subarray(at+4,at+8+length)),png.readUInt32BE(at+8+length));
    if(kind==='IHDR'){
      assert.equal(header,null);assert.equal(length,13);
      header={width:data.readUInt32BE(0),height:data.readUInt32BE(4)};
      assert.deepEqual([...data.subarray(8)],[8,6,0,0,0]);
    }else if(kind==='IDAT'){assert.ok(header&&!ended);compressed.push(data);}
    else if(kind==='IEND'){assert.equal(length,0);assert.equal(ended,false);ended=true;}
    else throw Error('Unexpected synthetic PNG metadata');
    at+=12+length;
  }
  assert.equal(ended,true);assert.equal(at,png.length);assert.deepEqual(header,{width:342,height:342});
  const rowSize=342*4,raw=zlib.inflateSync(Buffer.concat(compressed),{maxOutputLength:(rowSize+1)*342});
  assert.equal(raw.length,(rowSize+1)*342);
  const data=new Uint8ClampedArray(rowSize*342);
  try{for(let y=0;y<342;y++){assert.equal(raw[y*(rowSize+1)],0);data.set(raw.subarray(y*(rowSize+1)+1,(y+1)*(rowSize+1)),y*rowSize);}}
  finally{raw.fill(0);}
  return{...header,data};
}
module.exports={readSyntheticPng};
