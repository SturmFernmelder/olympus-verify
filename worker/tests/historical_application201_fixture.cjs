'use strict';

// .201 closes new leadership applications. Privacy/board compatibility suites
// still need records written before that policy change. This fixture validates
// that old row shape through the real historical parser, then explicitly seeds
// it through the suite's admitted SQLite fixture writer. It never calls or
// substitutes for the current PUT route and supplies no authorization bypass.
async function historicalApplicationFixture201({ validate, run, previous, id, payload, time, appointed = {}, noVote = [], siteHost = 'guild.example' }) {
  const old = previous(id), oldAnswers = old ? JSON.parse(old.answers || '{}') : {};
  const body = { ...payload, answers: { ...(payload.answers || {}) } };
  if (!Object.hasOwn(body, 'applicationTrack') && !Object.hasOwn(body, 'targetOffice') && !Object.hasOwn(body.answers, 'applicationTrack') && !Object.hasOwn(body.answers, 'targetOffice') && oldAnswers.applicationTrack !== undefined) {
    body.applicationTrack = oldAnswers.applicationTrack;
    body.targetOffice = oldAnswers.targetOffice;
  }
  const a = validate(body, id, appointed, noVote, siteHost, typeof oldAnswers.talentBuild === 'string' ? oldAnswers.talentBuild : undefined, oldAnswers.talentBuilds);
  if ('error' in a) return { validation: a };
  await run(`INSERT INTO site_applications (discord_id,position,class_lead,backup1,backup2,fallback,character,char_key,class,role,region,avail,avail_tz,fit_na,fit_eu,board_at,answers,status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'submitted',?,?)
    ON CONFLICT(discord_id) DO UPDATE SET position=excluded.position,class_lead=excluded.class_lead,backup1=excluded.backup1,backup2=excluded.backup2,fallback=excluded.fallback,character=excluded.character,char_key=excluded.char_key,class=excluded.class,role=excluded.role,region=excluded.region,avail=excluded.avail,avail_tz=excluded.avail_tz,fit_na=excluded.fit_na,fit_eu=excluded.fit_eu,board_at=excluded.board_at,answers=excluded.answers,status='submitted',updated_at=excluded.updated_at`,
    id,a.position,a.class_lead,a.backup1,a.backup2,a.fallback,a.character,a.char_key,a.class,a.role,a.region,a.avail,a.avail_tz,a.fit_na,a.fit_eu,a.board ? old?.board_at ?? time : null,a.answers,old?.created_at ?? time,time);
  return { validation: a };
}

module.exports = { historicalApplicationFixture201 };
