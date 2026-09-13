import assert from 'node:assert/strict';
import { citySendWindow } from '../lib/city-ads/send-window';
const check = (city:string, utc:string) => citySendWindow(city,new Date(utc));
assert.equal(check('dallas-tx','2026-09-13T06:30:00Z').allowed,false);
assert.equal(check('dallas-tx','2026-09-13T06:30:00Z').nextStart,'2026-09-13T13:00:00.000Z');
assert.equal(check('dallas-tx','2026-09-13T20:00:00Z').allowed,true); // after provider staffing ends
assert.equal(check('dallas-tx','2026-09-14T01:00:00Z').allowed,false);
assert.equal(check('charlotte-nc','2026-09-13T12:00:00Z').allowed,true);
assert.equal(check('charlotte-nc','2026-09-13T11:59:00Z').allowed,false);
assert.equal(check('dallas-tx','2026-11-01T05:00:00Z').nextStart,'2026-11-01T14:00:00.000Z');
assert.equal(check('dallas-tx','2026-03-08T06:00:00Z').nextStart,'2026-03-08T13:00:00.000Z');
assert.throws(()=>check('unknown-city','2026-09-13T12:00:00Z'));
console.log('City send windows: 9 checks passed');
