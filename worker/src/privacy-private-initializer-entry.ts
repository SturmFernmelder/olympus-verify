/** Private initializer only. The genuine handler captures the original request/binding/version
 * before awaits and refuses operator or public serving roots. Missing/default flag is OFF. */
import {handlePrivateProductionInitialization} from './privacy-production-initialization';
type Environment=Parameters<typeof handlePrivateProductionInitialization>[1];

export default {
 async fetch(request:Request,env:Environment):Promise<Response>{
  return handlePrivateProductionInitialization(request,env);
 }
};
