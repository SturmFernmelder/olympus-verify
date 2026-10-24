// Pure, finite appointment ID contract. No ordinal-derived authority and no side effects.
'use strict';
function assertOfficeKeys(terms, keys) {
  if (!Array.isArray(terms) || terms.length !== 95 || !Array.isArray(keys) || keys.length !== 95 ||
      keys.some(row => !row || typeof row !== 'object' || !/^office_[0-9]{2}$/.test(row.key) || typeof row.label !== 'string' || !row.label) ||
      new Set(keys.map(row => row.key)).size !== 95 || new Set(keys.map(row => row.label)).size !== 95) throw Error('governance_office_key_contract');
  const labels = new Map(keys.map(row => [row.key, row.label]));
  if (terms.some(term => !term || labels.get(term.officeKey) !== term.label) || new Set(terms.map(term => term.officeKey)).size !== 95 ||
      labels.get('office_12') !== 'Broadcaster' || labels.get('office_50') !== 'Lead Correspondent') throw Error('governance_office_key_label_drift');
}
module.exports = Object.freeze({ assertOfficeKeys });
