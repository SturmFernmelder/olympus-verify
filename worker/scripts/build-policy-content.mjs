#!/usr/bin/env node
// Reviewed finite successor; executes only the isolated/canonical generator, never providers.
import { run } from './build-policy-content.v116.mjs';
console.log(JSON.stringify(run(process.argv.includes('--check'))));
