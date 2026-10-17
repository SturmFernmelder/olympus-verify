/** Private .162 guarded recovery successor mount. Missing or non-'true' PRIVACY_SUCCESSOR_CONTROL_ENABLED is OFF (404).
 * recover additionally requires PRIVACY_SUCCESSOR_RECOVER_ENABLED='true'. No base Floor root belongs to this service. */
import {handlePrivateSuccessorControl,type PrivateSuccessorControlEnv} from './privacy-successor-control';

export default {
 async fetch(request:Request,env:PrivateSuccessorControlEnv,ctx:ExecutionContext):Promise<Response>{
  const flag=Object.getOwnPropertyDescriptor(env,'PRIVACY_SUCCESSOR_CONTROL_ENABLED');
  if(!flag||!Object.hasOwn(flag,'value')||flag.value!=='true')return new Response('not found',{status:404,headers:{'Cache-Control':'no-store'}});
  return handlePrivateSuccessorControl(request,env,ctx);
 }
};
