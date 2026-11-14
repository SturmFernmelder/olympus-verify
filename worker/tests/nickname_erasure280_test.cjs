// Current one-click Native erasure must not be blocked by its own redaction fence.
const { runNativeErasureFixture } = require('./helpers/registered_native_erasure_fixture.cjs');

runNativeErasureFixture(async function nicknameErasure() {
  for (const state of ['unknown', 'dispatching']) {
    const f = fixture();
    try {
      const cookie = await f.signIn(ID);
      await seedPersonal(f, { roles: 0 });
      const names = load('member-nickname-data233'), key = names.nicknameKey233(ID);
      const generation = f.raw('SELECT generation FROM privacy_subjects WHERE subject_id=?', ID)?.generation ?? null;
      const original = JSON.stringify({ v: 1, guild: GUILD, generation,
        previous: 'Original synthetic nickname', desired: 'Target <OLYMPUS PRIME>', expected: 'Original synthetic nickname',
        state, action: 'use', operation: '1550000000000000000', nonce: 'a'.repeat(32), createdAt: clock, updatedAt: clock });
      assert.ok(names.parseNicknameRecord233(original));
      await f.write('INSERT INTO site_settings(key,value,updated_at)VALUES(?,?,?)', key, original, clock);
      check(state+' original remains unresolved before the guarded redaction',
        f.raw('SELECT ('+names.nicknameErasureUnresolvedSql233('?1')+') AS n',ID).n===1);
      const response = await request(f, cookie), job = await finish(f);
      check(state+' one request completes automatic Native erasure',response.response.status===202&&job.state==='complete'
        &&!f.raw('SELECT 1 FROM site_users WHERE discord_id=?',ID)&&f.terminalCommitted);
      const marker = '{"v":1,"state":"erased_unknown"}';
      check(state+' exact fence retains no nickname text, keeps the unresolved-write predicate and permits erasure',
        f.raw('SELECT value FROM site_settings WHERE key=?',key)?.value===marker
        &&f.raw('SELECT ('+names.nicknameUnresolvedSql233('?1')+') AS n',ID).n===1
        &&f.raw('SELECT ('+names.nicknameErasureUnresolvedSql233('?1')+') AS n',ID).n===0);
      const late = await f.writer.prepare('UPDATE site_settings SET value=?3 WHERE key=?1 AND value=?2 RETURNING key')
        .bind(key,original,JSON.stringify({...JSON.parse(original),state:'acknowledged'})).all();
      check(state+' late original receipt cannot restore erased nickname data',late.results.length===0
        &&f.raw('SELECT value FROM site_settings WHERE key=?',key)?.value===marker
        &&f.http.every(row=>row.method!=='PATCH'));
      for(const value of ['{"state":"erased_unknown","v":1}','{"v":1,"state":"erased_unknown","extra":true}',
        '{"v":1,"state":"ERASED_UNKNOWN"}',' {"v":1,"state":"erased_unknown"}',
        '{"v":1,"state":"erased_unknown"} ','{"v":1, "state":"erased_unknown"}','not-json','null']){
        await f.write('UPDATE site_settings SET value=?2 WHERE key=?1',key,value);
        check(state+' nonexact marker remains an erasure ambiguity: '+value,
          f.raw('SELECT ('+names.nicknameErasureUnresolvedSql233('?1')+') AS n',ID).n===1);
      }
      await f.write('UPDATE site_settings SET value=?2 WHERE key=?1',key,marker);
    } finally { f.close(); }
  }
}).catch(e=>{console.error(e);process.exitCode=1;});
