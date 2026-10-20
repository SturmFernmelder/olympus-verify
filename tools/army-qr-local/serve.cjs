'use strict';
// Explicit local-only Army process. Never imported by the Worker or production assets.
const {createWebsiteServer}=require('../shared-census-website/serve.cjs');
async function createArmyServer(options={}){return createWebsiteServer({...options,attendedArmy:true});}
if(require.main===module){
  const args=process.argv.slice(2);let port=0;
  if(args.length){if(args.length!==2||args[0]!=='--port'||!/^\d{4,5}$/.test(args[1])||+args[1]<1024||+args[1]>65535)throw Error('Use --port 1024..65535');port=+args[1];}
  createArmyServer({port}).then(app=>{
    console.log(JSON.stringify({kind:'attended-local-army-website',origin:app.origin(),pid:process.pid,inMemory:true,websiteIdentitiesSynthetic:true,productionConnection:false}));
    for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>app.close().then(()=>console.log('LOCAL_ARMY_WEBSITE_STOPPED')));
  }).catch(error=>{console.error(error.stack);process.exitCode=1;});
}
module.exports={createArmyServer};
