'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {assertOfficeKeys}=require('../../scripts/governance-office-keys.cjs');
const root=path.join(__dirname,'../..'),terms=JSON.parse(fs.readFileSync(path.join(root,'worker/public/static/governance/organization.json'),'utf8')).terms,keys=JSON.parse(fs.readFileSync(path.join(root,'docs/governance-office-keys.json'),'utf8'));
const copy=value=>JSON.parse(JSON.stringify(value));let checks=0;
assertOfficeKeys(terms,keys);checks++;
const reordered=copy(terms).reverse();assertOfficeKeys(reordered,keys);checks++;
for(const mutate of [rows=>{rows[11].label='Other office';},rows=>{rows[11].officeKey='office_50';},rows=>{rows.push(rows[0]);}]){const rows=copy(terms);mutate(rows);assert.throws(()=>assertOfficeKeys(rows,keys));checks++;}
for(const mutate of [rows=>{rows[11].label='Other office';},rows=>{rows[11].key=rows[49].key;},rows=>{rows[0].label=rows[1].label;}]){const rows=copy(keys);mutate(rows);assert.throws(()=>assertOfficeKeys(terms,rows));checks++;}
assert.equal(keys.find(row=>row.key==='office_12').label,'Broadcaster');assert.equal(keys.find(row=>row.key==='office_50').label,'Lead Correspondent');checks++;
console.log(checks+'/'+checks+' passed');
require('./role_rank199_test.cjs');
