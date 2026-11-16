/* Private attended recovery. Inventory files contain proof data; keep them in
 * this page's memory only. Reading never automatically links or retries. */
window.mountLateProof285 = function mountLateProof285(container, {api}) {
  let destroyed=false,busy=false,paused=false,groups=[],next=0,reviewed=null;
  const results=new Map(),reasonCounts=new Map(),counts={eligible:0,held:0,unavailable:0};
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
  const root=el('section');root.className='card';
  root.append(el('h2','Stored verification proofs'));
  root.append(el('p','Use a private inventory prepared from the retained verification observations and the preserved archive. This checks the original signed whisper and its original request against a fresh native roster. It never resends an old upload or resets a role receipt. Stored mail stays held until its character identity can be proven.'));
  root.append(el('p','Count first, then review one eligible group and confirm it separately. The submitted inventories cannot prove that no other observation exists. A matching name or a Verify press alone is insufficient. This page sends no Discord messages or role requests; a completed link may qualify for the ordinary role system later.'));
  const input=el('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','Private verification inventory');
  const count=el('button','Count stored proof groups'),pause=el('button','Pause counts'),choose=el('select'),review=el('button','Review selected group'),confirm=el('button','Confirm this new verification claim');
  choose.setAttribute('aria-label','Eligible stored proof group');
  const actions=el('div');actions.className='actions';actions.append(input,count,pause,choose,review,confirm);root.append(actions);
  const status=el('p','Choose the private derived inventory. No records have been read.');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const summary=el('p'),reasons=el('p'),detail=el('div');root.append(status,summary,reasons,detail);container.replaceChildren(root);
  const explain={mail_requires_historical_guid_continuity:'Stored mail needs proven historical character continuity.',no_unconsumed_original_request:'No qualifying unconsumed original request.',original_request_unavailable:'The original request is unavailable.',native_guid_not_current:'A fresh native roster with this exact character is required.',native_identity_or_source_changed:'The current character identity or native source does not match.',negative_observation_not_superseded:'The roster does not supersede a negative membership observation.',conflicting_signed_senders:'Different signed senders require staff review.',observation_signature_invalid:'The original verification signature does not qualify.',observation_scope_mismatch:'The signed guild or realm does not match.',observation_outside_age_or_cutoff:'The signed observation is outside the thirty-day or launch boundary.',code_not_valid_when_observed:'The code was not valid for the original signed send time.',account_already_linked:'The account already has a character link.',character_identity_has_history:'This character has retained identity history requiring review.',account_unavailable:'Current account standing, membership or privacy controls prevent this claim.',ambiguous_original_request:'More than one original request matches.',request_history_truncated:'The original request history exceeds the bounded review.',configuration_held:'The supported verification configuration is unavailable.',configuration_changed:'The verification configuration changed during this read.',admin_admission_changed:'Administrator access changed during this read.',late_proof_unavailable:'The original evidence or current service could not be confirmed.'};
  const reason=data=>explain[data.reason]||'The original proof, request or current identity could not qualify. No link was changed.';
  function render(){
    if(destroyed)return;
    input.disabled=busy;count.disabled=busy||next>=groups.length;pause.disabled=!busy;
    choose.disabled=busy||!choose.children.length;review.disabled=busy||!choose.value||results.get(Number(choose.value))?.counts.eligible!==1;
    confirm.disabled=busy||!reviewed||reviewed.expiresAt<=Math.floor(Date.now()/1000);
    summary.textContent=`${next}/${groups.length} submitted groups counted. Eligible: ${counts.eligible}; held: ${counts.held}; unavailable: ${counts.unavailable}. These are groups, not people or confirmed links.`;
    reasons.textContent=[...reasonCounts].map(([label,n])=>`${label} ${n}`).join(' · ');
    count.textContent=next?'Resume counts':'Count stored proof groups';
  }
  const zero=data=>data&&data.roleChangesSent===0&&data.noticesSent===0&&data.linksChanged===0;
  function tally(data){
    if(!zero(data)||!data.counts||data.inventoryScope!=='submitted-group-only'||!['eligible','held','unavailable'].every(k=>Number.isInteger(data.counts[k])&&data.counts[k]>=0&&data.counts[k]<=1)||Object.values(data.counts).reduce((a,b)=>a+b,0)!==1||data.candidate||data.previewToken)throw Error('Counts-only coverage was not confirmed');
  }
  function clear(){groups=[];next=0;reviewed=null;results.clear();reasonCounts.clear();for(const k of Object.keys(counts))counts[k]=0;choose.replaceChildren();detail.replaceChildren();}
  input.addEventListener('change',async()=>{
    if(busy||destroyed)return;clear();busy=true;render();
    try{const file=input.files?.[0];if(!file||file.size>2*1024*1024)throw Error('Choose a derived JSON inventory below 2 MiB');
      const data=JSON.parse(await file.text());if(destroyed)return;
      if(!data||data.version!==285||data.kind!=='late-verification-inventory'||!Array.isArray(data.groups)||!data.groups.length||data.groups.length>1000||data.groups.some(g=>!g||g.version!==285||g.kind!=='late-verification-claim'||!Array.isArray(g.observations)||!g.observations.length||g.observations.length>32))throw Error('Unsupported or incomplete derived inventory');
      groups=data.groups;status.textContent='Inventory loaded locally. Count the groups before reviewing a new claim. No request has been sent.';
    }catch(error){if(!destroyed)status.textContent=error.message||'Inventory unavailable';}
    finally{busy=false;render();}
  });
  count.addEventListener('click',async()=>{
    if(busy||destroyed||next>=groups.length)return;busy=true;paused=false;reviewed=null;detail.replaceChildren();render();
    try{while(next<groups.length&&!paused&&!destroyed){
      const data=await api('POST','/api/admin/late-proof',{action:'count',envelope:groups[next]});if(destroyed)return;tally(data);
      results.set(next,data);for(const k of Object.keys(counts))counts[k]+=data.counts[k];
      if(data.counts.eligible!==1){const label=reason(data);reasonCounts.set(label,(reasonCounts.get(label)||0)+1);}
      if(data.counts.eligible===1){const option=el('option','Submitted group '+(next+1));option.value=String(next);choose.append(option);}
      next++;render();
    }
    if(!destroyed)status.textContent=next===groups.length?'Counts finished. Review an eligible group separately; nothing has been linked.':'Counts paused. Resume makes the next deliberate read.';
    }catch(error){if(!destroyed)status.textContent='Counts stopped. No automatic retry occurred. Resume deliberately when the source is ready. '+(error?.data?.error||error.message||'Read unavailable');}
    finally{busy=false;render();}
  });
  pause.addEventListener('click',()=>{paused=true;pause.disabled=true;});
  choose.addEventListener('change',()=>{reviewed=null;detail.replaceChildren();render();});
  review.addEventListener('click',async()=>{
    if(busy||destroyed||!choose.value)return;const index=Number(choose.value);if(!Number.isSafeInteger(index)||results.get(index)?.counts.eligible!==1)return;
    reviewed=null;busy=true;detail.replaceChildren();render();
    try{const data=await api('POST','/api/admin/late-proof',{action:'preview',envelope:groups[index]});if(destroyed)return;
      if(!data.previewToken){status.textContent=reason(data);return;}
      const c=data.candidate;
      if(!zero(data)||!c||!['subject','character','guid'].every(k=>typeof c[k]==='string'&&c[k].length>0&&c[k].length<128)||!(Number.isSafeInteger(c.requestId)&&c.requestId>0||typeof c.requestId==='string'&&c.requestId.length>0&&c.requestId.length<128)||!['observedAt','snapshotId','snapshotAt'].every(k=>Number.isSafeInteger(c[k])&&c[k]>0)||typeof data.previewToken!=='string'||!Number.isSafeInteger(data.expiresAt)||data.expiresAt<=Math.floor(Date.now()/1000))throw Error('Fresh claim details were not confirmed');
      reviewed={index,token:data.previewToken,expiresAt:data.expiresAt};
      const facts=el('dl');for(const [label,value]of [['Discord account',c.subject],['Character',c.character],['Character GUID',c.guid],['Original request',c.requestId],['Signed observation',new Date(c.observedAt*1000).toISOString()],['Current roster',c.snapshotId+' · '+new Date(c.snapshotAt*1000).toISOString()],['Confirmation expires',new Date(data.expiresAt*1000).toISOString()]])facts.append(el('dt',label),el('dd',value));
      detail.append(facts,el('p','Confirm creates a new verification claim and consumes only its original qualifying request. It does not establish what an old upload did. No role change or message is sent by this action.'));
      status.textContent='Fresh private details loaded. Review them before the separate confirmation.';
    }catch(error){if(!destroyed)status.textContent='Preview unavailable. No claim was submitted. '+(error?.data?.error||error.message||'Read unavailable');}
    finally{busy=false;render();}
  });
  confirm.addEventListener('click',async()=>{
    if(busy||destroyed||!reviewed)return;const selected=reviewed;reviewed=null;
    if(selected.expiresAt<=Math.floor(Date.now()/1000)){status.textContent='The preview expired. Review the current facts again.';render();return;}
    busy=true;render();
    try{const data=await api('POST','/api/admin/late-proof',{action:'apply',envelope:groups[selected.index],previewToken:selected.token,confirm:true});if(destroyed)return;
      if(!data||data.roleChangesSent!==0||data.noticesSent!==0||data.automaticRetry!==false||!(data.result==='outcome_unknown'&&data.linksChanged===null&&data.linksMayHaveChanged===true||Number.isInteger(data.linksChanged)&&data.linksChanged>=0&&data.linksChanged<=1)||data.result==='linked'&&data.linksChanged!==1)throw Error('Claim result was not confirmed');
      status.textContent=data.result==='linked'?'New claim linked. Use a fresh Discord role comparison to check current access; no role or message was sent by this action.':data.result==='held'?'The current claim is held. Review its original evidence before taking another action.':'Outcome unconfirmed. Preserve the evidence and inspect the original request and link before doing anything again.';
    }catch{if(!destroyed)status.textContent='Outcome unconfirmed. Preserve the evidence and inspect the original request and link. This page will not repeat the claim.';}
    finally{busy=false;results.set(selected.index,{counts:{eligible:0}});render();}
  });
  render();
  return {destroy(){destroyed=true;paused=true;clear();input.value='';container.replaceChildren();}};
};
