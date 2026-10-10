-- Fixed QR version 8, error correction L, byte mode, mask 0. 49 modules, max192 bytes.
-- Pure Lua 5.1. No network, keys, SavedVariables, bit-library or truncated payloads.
OlympusQr = {}
local function xor(a,b)
 local out,p=0,1
 while a>0 or b>0 do local x,y=a%2,b%2;if x~=y then out=out+p end;a=math.floor(a/2);b=math.floor(b/2);p=p*2 end
 return out
end
local exp,log={},{}
do local x=1;for i=0,254 do exp[i]=x;log[x]=i;x=x*2;if x>=256 then x=xor(x,285) end end;for i=255,510 do exp[i]=exp[i-255] end end
local function mul(a,b) if a==0 or b==0 then return 0 end return exp[log[a]+log[b]] end
local function ecc(data)
 local g={1};for i=0,23 do local n={};for j=1,#g+1 do n[j]=0 end;for j=1,#g do n[j]=xor(n[j],g[j]);n[j+1]=xor(n[j+1],mul(g[j],exp[i])) end;g=n end
 local r={};for i=1,24 do r[i]=0 end
 for _,b in ipairs(data) do local f=xor(b,r[1]);for i=1,23 do r[i]=xor(r[i+1],mul(g[i+1],f)) end;r[24]=mul(g[25],f) end
 return r
end
function OlympusQr.Encode(text)
 if type(text)~='string' or #text>192 then return nil,'QR capacity exceeded; use the complete copy/paste observation' end
 local bits={};local function put(v,n) for i=n-1,0,-1 do bits[#bits+1]=math.floor(v/2^i)%2 end end
 put(4,4);put(#text,8);for i=1,#text do put(text:byte(i),8) end
 local capacity=194*8;for i=1,math.min(4,capacity-#bits) do bits[#bits+1]=0 end;while #bits%8~=0 do bits[#bits+1]=0 end
 local data={};for i=1,#bits,8 do local b=0;for j=0,7 do b=b*2+bits[i+j] end;data[#data+1]=b end
 local pad=236;while #data<194 do data[#data+1]=pad;pad=pad==236 and 17 or 236 end
 local blocks={{},{}};for i=1,97 do blocks[1][i]=data[i];blocks[2][i]=data[i+97] end
 local e1,e2=ecc(blocks[1]),ecc(blocks[2]);local words={};for i=1,97 do words[#words+1]=blocks[1][i];words[#words+1]=blocks[2][i] end;for i=1,24 do words[#words+1]=e1[i];words[#words+1]=e2[i] end
 local m,used={},{};for y=0,48 do m[y]={};used[y]={} end
 local function set(x,y,v) if x>=0 and x<49 and y>=0 and y<49 then m[y][x]=v==1;used[y][x]=true end end
 local function finder(cx,cy) for dy=-4,4 do for dx=-4,4 do local d=math.max(math.abs(dx),math.abs(dy));set(cx+dx,cy+dy,(d~=2 and d~=4) and 1 or 0) end end end
 finder(3,3);finder(45,3);finder(3,45)
 for i=8,40 do set(6,i,i%2==0 and 1 or 0);set(i,6,i%2==0 and 1 or 0) end
 for _,cy in ipairs({6,24,42}) do for _,cx in ipairs({6,24,42}) do if not ((cx==6 and cy==6) or (cx==6 and cy==42) or (cx==42 and cy==6)) then
 for dy=-2,2 do for dx=-2,2 do local d=math.max(math.abs(dx),math.abs(dy));set(cx+dx,cy+dy,d~=1 and 1 or 0) end end end end end
 -- L/mask0 BCH format: 0x77c4. ISO version8 BCH: 0x085bc.
 local format=30660;local function bit(v,i) return math.floor(v/2^i)%2 end
 for i=0,5 do set(8,i,bit(format,i)) end;set(8,7,bit(format,6));set(8,8,bit(format,7));set(7,8,bit(format,8));for i=9,14 do set(14-i,8,bit(format,i)) end
 for i=0,7 do set(48-i,8,bit(format,i)) end;for i=8,14 do set(8,49-15+i,bit(format,i)) end;set(8,41,1)
 for i=0,17 do local a=38+i%3;local b=math.floor(i/3);set(a,b,bit(34236,i));set(b,a,bit(34236,i)) end
 local stream={};for _,w in ipairs(words) do for i=7,0,-1 do stream[#stream+1]=bit(w,i) end end
 local pos,up,right=1,true,48
 while right>=1 do if right==6 then right=5 end;for vert=0,48 do local y=up and 48-vert or vert;for j=0,1 do local x=right-j;if not used[y][x] then local b=stream[pos] or 0;pos=pos+1;if (x+y)%2==0 then b=1-b end;m[y][x]=b==1 end end end;up=not up;right=right-2 end
 if pos-1~=#stream then return nil,'QR layout invariant failed' end
 return m
end
