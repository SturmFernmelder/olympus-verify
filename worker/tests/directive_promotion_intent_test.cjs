'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {loadPureSource218}=require('./helpers/pure_source218.cjs');
const root=path.resolve(__dirname,'..'),m=loadPureSource218(root,'promotion-intent-directive'),r=loadPureSource218(root,'native-rank-schemes');
const at=1800000000,key='synthetic-server-only-plan-key';
const plan={version:1,id:'synthetic-original-intent',actorGuid:'Player-1-0001',targetGuid:'Player-1-0002',name:'Fixture Candidate',subjectDigest:'b'.repeat(64),rankProfile:r.DIRECTIVE_NATIVE_PROFILE,rankSchemeDigest:r.DIRECTIVE_RANK_DIGEST,originSnapshotId:10,originSnapshotAt:at-10,originContext:'a'.repeat(32),startSlot:9,finalSlot:7,reason:'verified-initiate',issuedAt:at,expiresAt:at+500,acknowledgedSteps:0,lastSnapshotId:10,lastObservedAt:at-10};
const input={actorGuid:plan.actorGuid,guid:plan.targetGuid,name:plan.name,subjectDigest:plan.subjectDigest,snapshotId:11,snapshotAt:at+2,slot:8,rankProfile:plan.rankProfile,rankSchemeDigest:plan.rankSchemeDigest,knight:'non-knight',confirmedFrom:9,confirmedTo:8,confirmedAt:at+1};
(async()=>{
 const token=await m.sealPromotionIntent(plan,key,at);
 assert.deepEqual(await m.readPromotionIntent(token,key,at),plan);
 assert.equal(await m.readPromotionIntent(token,key+'wrong',at),null);
 assert.equal(await m.readPromotionIntent(token.slice(0,-1)+(token.endsWith('0')?'1':'0'),key,at),null);
 assert.equal(await m.readPromotionIntent(token,key,at+500),null);
 assert(m.continuationAdmitted(plan,input,at+3));
 for(const delta of [{actorGuid:'Player-1-0003'},{guid:'Player-1-0003'},{name:'Renamed Candidate'},{subjectDigest:'c'.repeat(64)},{snapshotId:10},{snapshotAt:at},{slot:7},{confirmedFrom:8},{confirmedTo:7},{confirmedAt:at-1},{rankSchemeDigest:'d'.repeat(64)},{rankProfile:'historical'},{knight:'knight'},{knight:'unknown'}])assert.equal(m.continuationAdmitted(plan,{...input,...delta},at+3),false,JSON.stringify(delta));
 assert.equal(m.validPromotionIntent({...plan,startSlot:8},at),false,'ordinary Alt cannot mint nonKnight intent');
 const k={...plan,finalSlot:5,reason:'knight-veteran'};
 let current=k;
 for(let n=0;n<3;n++){
  const observed={...input,knight:'knight',snapshotId:11+n,snapshotAt:at+2+n*2,slot:8-n,confirmedFrom:9-n,confirmedTo:8-n,confirmedAt:at+1+n*2};
  assert(m.continuationAdmitted(current,observed,at+3+n*2));
  assert.equal(m.continuationAdmitted(current,{...observed,slot:observed.slot-1,confirmedFrom:observed.confirmedFrom-1,confirmedTo:observed.confirmedTo-1},at+3+n*2),false,'cannot skip an owned step');
  current={...current,acknowledgedSteps:n+1,lastSnapshotId:observed.snapshotId,lastObservedAt:observed.confirmedAt};
  const renewed=await m.readPromotionIntent(await m.sealPromotionIntent(current,key,at+3+n*2),key,at+3+n*2);
  assert.equal(renewed.id,k.id);assert.equal(renewed.expiresAt,k.expiresAt);assert.equal(renewed.startSlot,9);
 }
 assert.equal(current.acknowledgedSteps,3,'fourth click only remains after three confirmed continuations');
 assert.equal(m.validPromotionIntent({...current,acknowledgedSteps:4},at+20),false,'completed plan does not authorize fifth click');
 console.log('PASS server seal, immutable original intent, fresh identity/privacy/source fences, ordinaryAlt and three Knight continuations');
})().catch(error=>{console.error(error);process.exitCode=1;});
