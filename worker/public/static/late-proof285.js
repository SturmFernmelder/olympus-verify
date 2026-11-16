/* Private attended recovery. Inventory files contain proof data; keep them in
 * this page's memory only. Reading never automatically links or retries. */
window.mountLateProof285 = function mountLateProof285(container, {api}) {
  let destroyed=false,busy=false,paused=false,groups=[],next=0,reviewed=null,unconfirmedGroup=null;
  const results=new Map(),reasonCounts=new Map(),counts={eligible:0,held:0,unavailable:0};
  const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(tag==='button')node.className='btn';return node;};
  const root=el('section');root.className='card verification-recovery285';
  root.append(el('h2','Stored verification proofs'));
  root.append(el('p','Choose the private file prepared from the stored verification whispers and the preserved archive. This page checks each stored whisper and the member\'s original verification request against a fresh guild roster. It does not resend an old upload or change the record of earlier role changes. Codes that arrived by in-game mail stay on hold until the character can be proven to be the same one.'));
  root.append(el('p','Click Count stored proof groups first. Then review one eligible group and confirm it on its own. The file shows only the whispers it contains; other whispers may exist elsewhere. A matching name, or a Verify press, is not enough on its own to confirm a claim. This page sends no Discord messages or role requests. Normal role checks can pick up a confirmed link later.'));
  const input=el('input');input.type='file';input.accept='.json,application/json';input.setAttribute('aria-label','Private verification inventory');
  const count=el('button','Count stored proof groups'),pause=el('button','Pause counts'),choose=el('select'),review=el('button','Review selected group'),confirm=el('button','Confirm this new verification claim');
  const skip=el('button','Skip unconfirmed group');
  choose.setAttribute('aria-label','Eligible stored proof group');
  const actions=el('div');actions.className='btn-row';actions.append(input,count,pause,skip,choose,review,confirm);root.append(actions);
  const status=el('p','Choose the private inventory file. Nothing has been read yet.');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
  const summary=el('p'),reasons=el('p'),detail=el('div');root.append(status,summary,reasons,detail);container.replaceChildren(root);
  const explain={mail_requires_historical_guid_continuity:'This proof came by in-game mail. It stays on hold until the character can be proven to be the same one.',no_unconsumed_original_request:'No matching unused verification request was found for this proof.',original_request_unavailable:'The member\'s original verification request is missing or cannot be used.',native_guid_not_current:'A guild roster from the last ten minutes that includes this exact character is needed. Use Sync & reload in the addon, wait for the Watcher to send the roster, then count again.',native_identity_or_source_changed:'The current guild roster or this character\'s details could not be confirmed. Check the roster export and the character before trying again.',negative_observation_not_superseded:'This stored whisper says the character was not on the officer\'s guild roster at that time. This recovery page needs a newer guild roster to confirm membership afterward.',conflicting_signed_senders:'The signed whispers in this group disagree about the character. This page cannot confirm the group.',observation_signature_invalid:'The stored whisper\'s signature is not valid, so it cannot be used.',observation_scope_mismatch:'The guild or realm in this proof does not match the configured guild and realm.',observation_outside_age_or_cutoff:'The whisper\'s signed time is older than thirty days, before the launch cut-off, or too far ahead of the server clock.',code_not_valid_when_observed:'The code was not valid at the time the whisper was sent.',account_already_linked:'The account already has a character link.',character_identity_has_history:'This character already has a link record, so this page cannot confirm a new link. Review the record in Lookup.',account_unavailable:'Current account standing, membership or privacy controls prevent this claim.',ambiguous_original_request:'More than one original request matches.',request_history_truncated:'Too many verification requests match this proof for this page to check them. Review the request history before trying again.',configuration_held:'The site\'s verification settings are unavailable or unsupported, so this group cannot be checked.',configuration_changed:'The verification settings changed while this group was being read. Try this step again.',admin_admission_changed:'Your administrator access changed during this step. Reload the page to check your access before continuing.',late_proof_unavailable:'The stored proof or the site could not be checked just now. Try this group again later.'};
  const reason=data=>explain[data.reason]||'The stored proof, the verification request or the current character did not pass the checks. No link was changed.';
  function render(){
    if(destroyed)return;
    input.disabled=busy;count.disabled=busy||next>=groups.length;pause.disabled=!busy;
    skip.disabled=busy||unconfirmedGroup!==next||next>=groups.length;
    choose.disabled=busy||!choose.children.length;review.disabled=busy||!choose.value||results.get(Number(choose.value))?.counts.eligible!==1;
    confirm.disabled=busy||!reviewed||reviewed.expiresAt<=Math.floor(Date.now()/1000);
    summary.textContent=`${next}/${groups.length} submitted groups counted. Eligible: ${counts.eligible}; held: ${counts.held}; unavailable: ${counts.unavailable}. These are groups, not people or confirmed links.`;
    reasons.textContent=[...reasonCounts].map(([label,n])=>`${label} ${n}`).join(' · ');
    count.textContent=next?'Resume counts':'Count stored proof groups';
  }
  const zero=data=>data&&data.roleChangesSent===0&&data.noticesSent===0&&data.linksChanged===0;
  function tally(data){
    if(!zero(data)||!data.counts||data.inventoryScope!=='submitted-group-only'||!['eligible','held','unavailable'].every(k=>Number.isInteger(data.counts[k])&&data.counts[k]>=0&&data.counts[k]<=1)||Object.values(data.counts).reduce((a,b)=>a+b,0)!==1||data.candidate||data.previewToken)throw Error('This group\'s count could not be confirmed');
  }
  function clear(){groups=[];next=0;reviewed=null;unconfirmedGroup=null;results.clear();reasonCounts.clear();for(const k of Object.keys(counts))counts[k]=0;choose.replaceChildren();detail.replaceChildren();}
  input.addEventListener('change',async()=>{
    if(busy||destroyed)return;clear();busy=true;render();
    try{const file=input.files?.[0];if(!file||file.size>2*1024*1024)throw Error('Choose the inventory JSON file (no larger than 2 MiB)');
      let data;try{data=JSON.parse(await file.text());}catch{throw Error('The private inventory is not valid JSON.');}if(destroyed)return;
      if(!data||data.version!==285||data.kind!=='late-verification-inventory'||!Array.isArray(data.groups)||!data.groups.length||data.groups.length>1000||data.groups.some(g=>!g||g.version!==285||g.kind!=='late-verification-claim'||!Array.isArray(g.observations)||!g.observations.length||g.observations.length>32))throw Error('This inventory file is incomplete or in an unsupported format');
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
      next++;unconfirmedGroup=null;render();
    }
    if(!destroyed)status.textContent=next===groups.length?'Counting finished. Nothing has been linked. If a group is eligible, select it and click Review selected group before confirming it separately.':'Counting paused. Click Resume counts to continue.';
    }catch{if(!destroyed){unconfirmedGroup=next;status.textContent='Counting stopped because this group could not be read. It was not retried. Click Resume counts to try it again later, or Skip unconfirmed group to count it as unavailable.';}}
    finally{busy=false;render();}
  });
  pause.addEventListener('click',()=>{paused=true;pause.disabled=true;});
  skip.addEventListener('click',()=>{
    if(busy||destroyed||unconfirmedGroup!==next||next>=groups.length)return;
    results.set(next,{counts:{eligible:0,held:0,unavailable:1}});counts.unavailable++;next++;unconfirmedGroup=null;
    status.textContent='The unconfirmed group was counted as unavailable. Its evidence is unchanged; resume to read the remaining groups.';render();
  });
  choose.addEventListener('change',()=>{reviewed=null;detail.replaceChildren();render();});
  review.addEventListener('click',async()=>{
    if(busy||destroyed||!choose.value)return;const index=Number(choose.value);if(!Number.isSafeInteger(index)||results.get(index)?.counts.eligible!==1)return;
    reviewed=null;busy=true;detail.replaceChildren();render();
    try{const data=await api('POST','/api/admin/late-proof',{action:'preview',envelope:groups[index]});if(destroyed)return;
      if(!data.previewToken){status.textContent=reason(data);return;}
      const c=data.candidate;
      if(!zero(data)||!c||!['subject','character','guid'].every(k=>typeof c[k]==='string'&&c[k].length>0&&c[k].length<128)||!(Number.isSafeInteger(c.requestId)&&c.requestId>0||typeof c.requestId==='string'&&c.requestId.length>0&&c.requestId.length<128)||!['observedAt','snapshotId','snapshotAt'].every(k=>Number.isSafeInteger(c[k])&&c[k]>0)||typeof data.previewToken!=='string'||!Number.isSafeInteger(data.expiresAt)||data.expiresAt<=Math.floor(Date.now()/1000))throw Error('Fresh claim details were not confirmed');
      reviewed={index,token:data.previewToken,expiresAt:data.expiresAt};
      const facts=el('dl');for(const [label,value]of [['Discord account',c.subject],['Character',c.character],['Character GUID',c.guid],['Original request',c.requestId],['Signed whisper',new Date(c.observedAt*1000).toISOString()],['Current roster',c.snapshotId+' · '+new Date(c.snapshotAt*1000).toISOString()],['Confirmation expires',new Date(data.expiresAt*1000).toISOString()]])facts.append(el('dt',label),el('dd',value));
      detail.append(facts,el('p','Confirm requests a new link between this Discord account and this character, using only the matching original verification request. It does not confirm what an old upload did. This action sends no message and changes no role.'));
      status.textContent='Fresh private details loaded. Review them before the separate confirmation.';
    }catch{if(!destroyed)status.textContent='Preview unavailable. The current details were not confirmed; no claim was submitted.';}
    finally{busy=false;render();}
  });
  confirm.addEventListener('click',async()=>{
    if(busy||destroyed||!reviewed)return;const selected=reviewed;reviewed=null;
    if(selected.expiresAt<=Math.floor(Date.now()/1000)){status.textContent='The preview expired. Click Review selected group again.';render();return;}
    busy=true;render();
    try{const data=await api('POST','/api/admin/late-proof',{action:'apply',envelope:groups[selected.index],previewToken:selected.token,confirm:true});if(destroyed)return;
      if(!data||data.roleChangesSent!==0||data.noticesSent!==0||data.automaticRetry!==false||!(data.result==='outcome_unknown'&&data.linksChanged===null&&data.linksMayHaveChanged===true||Number.isInteger(data.linksChanged)&&data.linksChanged>=0&&data.linksChanged<=1)||data.result==='linked'&&data.linksChanged!==1)throw Error('Claim result was not confirmed');
      status.textContent=data.result==='linked'?'Linked. No role or message was sent by this action. To see the member\'s current Discord roles, open Discord role audit and run a new comparison.':data.result==='held'?'This claim is on hold. Check the stored proof and the member\'s verification request before another review.':'It is not known whether the link was made. Keep the inventory file. Check the account in Lookup and inspect its original verification request before taking another action.';
    }catch{if(!destroyed)status.textContent='It is not known whether the link was made. Keep the inventory file. Check the account in Lookup and inspect its original verification request. This page does not repeat the claim.';}
    finally{busy=false;results.set(selected.index,{counts:{eligible:0}});render();}
  });
  render();
  return {destroy(){destroyed=true;paused=true;clear();input.value='';container.replaceChildren();}};
};
