// Actual standalone renderer, no Worker/member/Army admission substitution.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
class Element {
  constructor(tag) { this.tagName = tag; this.children = []; this.attrs = {}; this.textContent = ''; }
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(key, value) { this.attrs[key] = value; }
}
const context = {window: {}, document: {createElement: tag => new Element(tag)}};
for (const name of ['fetch', 'localStorage', 'sessionStorage', 'XMLHttpRequest']) Object.defineProperty(context, name, {get() { throw Error('Presentation must not access ' + name); }});
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/static/activity280.js'), 'utf8'), context);
const render = context.window.OlympusActivity280.render, all = root => root ? [root, ...root.children.flatMap(all)] : [];
const text = root => all(root).map(x => x.textContent).join('|');
const input = {asOf: 1794528000, roster: {day: {joined: 2, left: 0}, week: null}, applications: {day: {firstSaved: 'few', decided: 0}, week: {firstSaved: 17, decided: 'few'}}};
const original = JSON.stringify(input), result = render(input, () => { throw Error('The News frame owns the observation timestamp'); }), nodes = all(result);
assert.equal(JSON.stringify(input), original, 'the admitted DTO is never rewritten');
assert.equal(nodes.filter(x => x.tagName === 'tr').length, 5);
assert.equal(nodes.filter(x => x.tagName === 'th' && x.attrs.scope === 'row').length, 4);
assert.equal(nodes.filter(x => x.tagName === 'th' && x.attrs.scope === 'col').length, 3);
assert.equal(nodes.filter(x => x.tagName === 'meter').length, 4, 'only exact disclosed numbers get bars');
assert(nodes.filter(x => x.tagName === 'meter').every(x => x.attrs['aria-hidden'] === 'true' && x.attrs.tabindex === '-1'));
assert.equal(nodes.filter(x => x.tagName === 'span' && x.textContent === 'Fewer than 5').length, 2);
assert.equal(nodes.filter(x => x.tagName === 'span' && x.textContent === 'Unavailable').length, 2);
assert.equal(nodes.filter(x => x.tagName === 'h3').length, 1, 'the activity heading follows the News frame h2');
assert.equal(nodes.filter(x => x.tagName === 'h4').length, 0);
assert(text(result).includes('do not add the columns'));
assert(!nodes.some(x => x.tagName === 'meter' && x.value === 'few'));
const malformed = render({asOf: input.asOf, roster: {day: {joined: -1, left: 3.1}, week: {joined: '0', left: NaN}}, applications: {day: {firstSaved: 3, decided: '3'}, week: {firstSaved: Infinity, decided: -1}}}, String);
assert.equal(all(malformed).filter(x => x.tagName === 'meter').length, 0);
assert.equal(all(malformed).filter(x => x.tagName === 'span' && x.textContent === 'Unavailable').length, 8);
assert.equal(render(null, String), null);
assert.equal(render({...input, asOf: -1}, String), null);
assert.equal(render(input, null), null);
const zero = render({asOf: 0, roster: {day: {joined: 0, left: 0}, week: {joined: 0, left: 0}}, applications: {day: {firstSaved: 0, decided: 0}, week: {firstSaved: 0, decided: 0}}}, String);
assert.equal(all(zero).filter(x => x.tagName === 'meter').length, 8);
assert(all(zero).filter(x => x.tagName === 'meter').every(x => x.max === 1 && x.value === 0));
console.log('PASS activity280 actual renderer: dated observations, semantic table, disclosed-only bars, suppression, null/invalid/zero distinctions, immutable input and no I/O');
