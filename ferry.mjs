#!/usr/bin/env node
// Research prototype: deliberately avoids interpreting unsupported calendar semantics.
import { readSync, writeFileSync, openSync, closeSync, fstatSync, lstatSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { auditOccurrences, checkCalendarSizes, MAX_INPUT_BYTES } from './occurrences.mjs';

function readCalendar(path, remaining) {
  const fd=openSync(path,'r');
  try {
    const bytes=Buffer.alloc(remaining+1); let used=0, n;
    while(used<bytes.length && (n=readSync(fd,bytes,used,bytes.length-used,null))>0) used+=n;
    if(used>remaining) throw Error('Calendar input budget exceeded');
    return {text:bytes.toString('utf8',0,used), bytes:used};
  } finally { closeSync(fd); }
}

const supported = new Set(['UID','SUMMARY','DESCRIPTION','LOCATION','DTSTART','DTEND','STATUS']);
const ignored = new Set(['DTSTAMP','LAST-MODIFIED','CREATED','SEQUENCE']);
export function parse(text) {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events = []; let event = null, depth = 0;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { if (event) throw Error('Nested VEVENT'); event = { fields: {}, unknown: [] }; depth = 0; continue; }
    if (!event) continue;
    if (line.startsWith('BEGIN:')) { depth++; event.unknown.push(line); continue; }
    if (line.startsWith('END:') && depth) { depth--; continue; }
    if (line === 'END:VEVENT') { events.push(event); event = null; continue; }
    const colon = line.indexOf(':'); if (colon < 1) { if (line) event.unknown.push(line); continue; }
    const key = line.slice(0, colon).split(';')[0].toUpperCase();
    if (depth || !supported.has(key)) { if (!ignored.has(key)) event.unknown.push(line); continue; }
    (event.fields[key] ??= []).push(line.slice(0, colon) + ':' + line.slice(colon + 1));
  }
  if (event) throw Error('Unterminated VEVENT');
  return events;
}
export function compare(before, after) {
  checkCalendarSizes(before, after);
  const left = parse(before), right = parse(after), findings = [];
  const index = events => { const m = new Map(); for (const e of events) { const uid = e.fields.UID?.[0]; if (uid) m.set(uid, [...(m.get(uid) || []), e]); else findings.push({status:'unverifiable', reason:'Event without UID'}); } return m; };
  const a = index(left), b = index(right);
  for (const uid of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(uid) || [], y = b.get(uid) || [];
    if (x.length > 1 || y.length > 1) { findings.push({status:'unverifiable', uid, reason:'Duplicate UID or recurrence exceptions require manual review'}); continue; }
    if (!x.length || !y.length) { findings.push({status:'unverifiable', uid, reason: x.length ? 'Only in before; UID may have changed' : 'Only in after; UID may have changed'}); continue; }
    const unknown = [...x[0].unknown, ...y[0].unknown];
    const changes = [...supported].filter(k => JSON.stringify(x[0].fields[k] || []) !== JSON.stringify(y[0].fields[k] || []));
    findings.push({status: changes.length ? 'changed' : unknown.length ? 'unverifiable' : 'preserved', uid, changedFields: changes, unknownProperties: unknown});
  }
  return {version:1, inputSha256: [before,after].map(s => createHash('sha256').update(s).digest('hex')), counts:{before:left.length,after:right.length}, findings, limitations:['Raw field comparison only; timezone representations are not normalized.', 'Recurrences, exceptions, alarms and unknown properties are not interpreted.', 'Two exports cannot prove source completeness.']};
}
export function html(report) { const escaped = JSON.stringify(report, null, 2).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); return `<!doctype html><meta charset="utf-8"><title>Ferry research report</title><h1>Ferry research report</h1><p>Review all uncertainty. This report does not establish migration completeness.</p><pre>${escaped}</pre>`; }
// Reserve both names exclusively before writing. Existing files, symlinks, hard links,
// and case-insensitive aliases all fail at the filesystem boundary without truncation.
export function writeReports(output, report) {
  const reserved=[];
  try {
    for (const path of [output, output + '.html']) {
      const fd=openSync(path,'wx');
      reserved.push({path,fd,identity:fstatSync(fd)});
    }
    writeFileSync(reserved[0].fd,JSON.stringify(report,null,2)+'\n');
    writeFileSync(reserved[1].fd,html(report));
  } catch (error) {
    for (const item of reserved) { closeSync(item.fd); item.fd=null; }
    for (const item of reserved) {
      // Do not unlink a path replaced by another process after our reservation.
      try { const current=lstatSync(item.path); if(current.isFile() && current.dev===item.identity.dev && current.ino===item.identity.ino) unlinkSync(item.path); } catch { /* best effort if concurrently removed */ }
    }
    throw error;
  } finally { for (const item of reserved) if(item.fd!==null) closeSync(item.fd); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [before, after, output, start, end] = process.argv.slice(2);
  if (!before || !after || !output || !start || !end) { console.error('Usage: node ferry.mjs BEFORE.ics AFTER.ics REPORT.json START_DATE END_EXCLUSIVE'); process.exitCode = 2; }
  else { try { const left=readCalendar(before,MAX_INPUT_BYTES), right=readCalendar(after,MAX_INPUT_BYTES-left.bytes), a=left.text, b=right.text; const report = compare(a,b); report.occurrenceAudit=auditOccurrences(a,b,start,end); writeReports(output,report); console.log(`Wrote ${output} and ${output}.html`); } catch (e) { console.error(e.message); process.exitCode = 1; } }
}
