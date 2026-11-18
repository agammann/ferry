import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, html, parse } from '../ferry.mjs';
const event = s => `BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:one\n${s}\nEND:VEVENT\nEND:VCALENDAR`;
test('identical supported fields are preserved',()=>assert.equal(compare(event('SUMMARY:Hello'),event('SUMMARY:Hello')).findings[0].status,'preserved'));
test('dropped description is changed',()=>assert.deepEqual(compare(event('DESCRIPTION:hi'),event('SUMMARY:hi')).findings[0].changedFields,['SUMMARY','DESCRIPTION']));
test('recurrence is explicitly unverifiable',()=>assert.equal(compare(event('RRULE:FREQ=DAILY'),event('RRULE:FREQ=DAILY')).findings[0].status,'unverifiable'));
test('rewritten IDs are not silently paired',()=>assert.equal(compare(event('SUMMARY:X'),event('SUMMARY:X').replace('UID:one','UID:two')).findings.filter(x=>x.status==='unverifiable').length,2));
test('duplicate UIDs require review',()=>assert.match(compare(event('SUMMARY:X').replace('END:VCALENDAR','BEGIN:VEVENT\nUID:one\nEND:VEVENT\nEND:VCALENDAR'),event('SUMMARY:X')).findings[0].reason,/Duplicate/));
test('folded lines are joined',()=>assert.equal(parse(event('SUMMARY:hel\n lo'))[0].fields.SUMMARY[0],'SUMMARY:hello'));
test('html escapes event text',()=>assert.ok(!html(compare(event('SUMMARY:<script>'),event('SUMMARY:a'))).includes('<script>')));
test('unfinished events fail',()=>assert.throws(()=>parse('BEGIN:VEVENT\nUID:x')));

test('complete empty calendars have zero events', () => {
  assert.deepEqual(parse('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n'), []);
});

test('mixed-case component names and a UTF-8 BOM preserve the event', () => {
  const source = event('SUMMARY:Workshop');
  const mixed = '\uFEFF' + source.replace(/^(BEGIN|END):.*/gm, line => line.toLowerCase());
  const report = compare(source, mixed);
  assert.deepEqual(report.counts, { before: 1, after: 1 });
  assert.equal(report.findings[0].status, 'preserved');
});

test('mismatched component nesting fails clearly', () => {
  const source = event('BEGIN:VALARM\nDESCRIPTION:Reminder\nEND:VTODO');
  assert.throws(() => parse(source), /Mismatched calendar component delimiters/);
});
