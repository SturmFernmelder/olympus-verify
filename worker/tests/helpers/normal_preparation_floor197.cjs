'use strict';
const assert=require('node:assert/strict');
/** A failed original preparation may have no selected Floor diagnostic. A
 * successful preparation must retain that witness before the host can proceed.
 * Ring validation remains the caller's unchanged original validator. */
module.exports=function validatePreparationFloor(status,floor,validateRing){
  if(status===200)assert.notEqual(floor,null,'successful original preparation requires its selected Floor observer');
  if(floor!==null)validateRing(floor,true);
};
