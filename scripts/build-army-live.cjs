#!/usr/bin/env node
'use strict';
// Exact reviewed pilot guards are projected into a separate v2 publishing page, never patched in place.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..'),BASE='tools/guild-qr-pilot',TARGET='worker/public/static/army-live';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function once(source,before,after){if(source.split(before).length!==2)throw Error('Army pilot projection must be unique: '+before);return source.replace(before,after);}
function projectPilot(input){
 if(sha(input)!=='096065bd3e7bf5745adbe83a542250d6caea2692b0034926505787fb31293f24')throw Error('Original reviewed pilot pin drift');
 let s=input.toString('utf8');
 s=once(s,'  const protocol = window.OlympusGuildQRProtocol;','  const protocol = window.OlympusGuildQRProtocol;\n  const bridge = window.OlympusArmyReport;');
 s=once(s,'    const scanning = !!session;','    const scanning = !!session, blocked = !bridge || bridge.busy();\n    ui.start.disabled = blocked;\n    sourceButtons.forEach(button => { button.disabled = blocked; });');
 s=once(s,'    ui.copy.disabled = !scanning;','    ui.copy.disabled = blocked || !scanning;');
 s=once(s,"    ui.frames.disabled = !scanning || source !== 'paste';","    ui.frames.disabled = blocked || !scanning || source !== 'paste';");
 s=once(s,"    ui['review-frames'].disabled = !scanning || source !== 'paste';","    ui['review-frames'].disabled = blocked || !scanning || source !== 'paste';");
 s=once(s,"    ui.images.disabled = !scanning || source !== 'image' || imageBusy;","    ui.images.disabled = blocked || !scanning || source !== 'image' || imageBusy;");
 s=once(s,"    ui['share-window'].disabled = !scanning || source !== 'window' || !!stream;","    ui['share-window'].disabled = blocked || !scanning || source !== 'window' || !!stream;");
 s=once(s,"    ui['use-camera'].disabled = !scanning || source !== 'camera' || !!stream;","    ui['use-camera'].disabled = blocked || !scanning || source !== 'camera' || !!stream;");
 s=once(s,'  function clearAll() {','  function clearAll() {\n    if (bridge) bridge.clear();');
 s=once(s,'    session.assembler.clear(); session = null;','    bridge.onComplete(payload, {wallDeadline: now + remainingMs, monotonicDeadline: performance.now() + remainingMs});\n    session.assembler.clear(); session = null;');
 s=once(s,'  function start() {','  function start() {\n    if (!bridge || bridge.busy()) return;');
 s=once(s,'Use the pilot’s secure loopback server in a supported browser.','Use this secure Olympus page in a supported browser.');
 s=once(s,"ui['addon-command'].value = '/ogstats ' + nonce;","ui['addon-command'].value = '/ogarmy ' + nonce;");
 s=once(s,"new Worker('./decoder.js')","new Worker('/static/army-live/decoder.js')");
 s=once(s,'No OLCS1 pilot frame was found in one of the selected images.','No OLCS2 Army frame was found in one of the selected images.');
 s=once(s,"    if (source === button.dataset.source) return;","    if (!bridge || bridge.busy() || source === button.dataset.source) return;");
 s=once(s,'  controls();\n}());','  window.OlympusArmyCapture = Object.freeze({clear: clearAll, refreshControls: controls});\n  controls();\n}());');
 return Buffer.from(s);
}
function prepare(root=ROOT){
 const pilot=projectPilot(fs.readFileSync(path.join(root,BASE,'pilot.js'))),original=fs.readFileSync(path.join(root,BASE,'decoder.js'));
 if(sha(original)!=='d700694ed1f78fc9bb359d1a36e3b2395952d73539ba4aad72c2a1ed14b771d3')throw Error('Original reviewed decoder pin drift');
 let decoder=once(original.toString('utf8'),"importScripts('./vendor/jsqr-1.4.0.js');","importScripts('../qr-vendor/jsqr-1.4.0.js');");
 decoder=once(decoder,"result.data.startsWith('OLCS1|')","result.data.startsWith('OLCS2|')");
 const protocol=fs.readFileSync(path.join(root,'tools/army-qr-live/protocol.js'));
 if(protocol.length!==19221||sha(protocol)!=='0c2b81961f0b92b1a88703320e4ab3a5dcb7da2c109d720a65d4a18c2139392f')throw Error('Exact reviewed v2 Army protocol required');
 return new Map([['pilot.js',pilot],['decoder.js',Buffer.from(decoder)],['protocol.js',protocol]]);
}
function build(root=ROOT,write=false){const outputs=prepare(root);for(const[name,bytes]of outputs){const file=path.join(root,TARGET,name);if(write){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,bytes);}if(!fs.readFileSync(file).equals(bytes))throw Error('Army live projection drift: '+name);}return outputs.size;}
if(require.main===module){try{const args=process.argv.slice(2);if(args.length>1||args.length&&!['--check','--write'].includes(args[0]))throw Error('Use --check or --write');console.log('PASS '+build(ROOT,args[0]==='--write')+' exact Army live projections');}catch(e){console.error('FAIL '+e.message);process.exitCode=1;}}
module.exports=Object.freeze({projectPilot,prepare,build});
