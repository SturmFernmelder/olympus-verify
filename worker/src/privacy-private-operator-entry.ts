/** Authenticated private operator mount. Installation and opening consume the original same-close chain.
 * No initializer/public serving root is supplied to this separate service. */
import {handlePrivateProductionControl,type PrivateProductionControlEnv} from './privacy-production-control-origin';

export default {
 async fetch(request:Request,env:PrivateProductionControlEnv,ctx:ExecutionContext):Promise<Response>{
  const flag=Object.getOwnPropertyDescriptor(env,'PRIVACY_PRODUCTION_CONTROL_ENABLED');
  if(!flag&&!('PRIVACY_PRODUCTION_CONTROL_ENABLED'in env)||flag&&Object.hasOwn(flag,'value')&&flag.value==='false'){
   return new Response('not found',{status:404,headers:{'Cache-Control':'no-store'}});
  }
  return handlePrivateProductionControl(request,env,ctx);
 }
};
