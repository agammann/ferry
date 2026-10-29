import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, linkSync, symlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const cli=resolve('ferry.mjs');
const calendar='BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:a\nDTSTART:20270310T090000Z\nEND:VEVENT\nEND:VCALENDAR\n';
function setup(fn) { const dir=mkdtempSync(join(tmpdir(),'ferry-output-')); try { const a=join(dir,'a.ics'), b=join(dir,'b.ics'); writeFileSync(a,calendar); writeFileSync(b,calendar); fn({dir,a,b}); } finally { rmSync(dir,{recursive:true,force:true}); } }
const run=(a,b,out)=>spawnSync(process.execPath,[cli,a,b,out,'2027-01-01','2028-01-01'],{encoding:'utf8'});
test('JSON output cannot overwrite an input',()=>setup(({a,b})=>{const before=readFileSync(a); assert.notEqual(run(a,b,a).status,0); assert.deepEqual(readFileSync(a),before); assert.equal(existsSync(a+'.html'),false); }));
test('HTML output cannot overwrite an input and JSON reservation is removed',()=>setup(({dir,a,b})=>{const input=join(dir,'report.html'); writeFileSync(input,calendar); const before=readFileSync(input), out=join(dir,'report'); assert.notEqual(run(a,input,out).status,0); assert.deepEqual(readFileSync(input),before); assert.equal(existsSync(out),false); }));
test('existing JSON report remains untouched',()=>setup(({dir,a,b})=>{const out=join(dir,'out'); writeFileSync(out,'old json'); assert.notEqual(run(a,b,out).status,0); assert.equal(readFileSync(out,'utf8'),'old json'); assert.equal(existsSync(out+'.html'),false); }));
test('existing HTML report remains untouched and no JSON is left',()=>setup(({dir,a,b})=>{const out=join(dir,'out'); writeFileSync(out+'.html','old html'); assert.notEqual(run(a,b,out).status,0); assert.equal(readFileSync(out+'.html','utf8'),'old html'); assert.equal(existsSync(out),false); }));
test('normalized input path is never overwritten',()=>setup(({dir,a,b})=>{const before=readFileSync(a); assert.notEqual(run(a,b,join(dir,'.','a.ics')).status,0); assert.deepEqual(readFileSync(a),before); }));
test('hardlink alias to input is never overwritten',t=>setup(({dir,a,b})=>{const out=join(dir,'alias'); try { linkSync(a,out); } catch(e) { if(['EPERM','EACCES','ENOTSUP'].includes(e.code)) { t.skip('Filesystem does not permit hard links'); return; } throw e; } const before=readFileSync(a); assert.notEqual(run(a,b,out).status,0); assert.deepEqual(readFileSync(a),before); assert.deepEqual(readFileSync(out),before); }));
test('symlink alias to input is never overwritten',t=>setup(({dir,a,b})=>{const out=join(dir,'alias'); try { symlinkSync(a,out); } catch(e) { if(['EPERM','EACCES','ENOTSUP'].includes(e.code)) { t.skip('Filesystem does not permit symlinks'); return; } throw e; } const before=readFileSync(a); assert.notEqual(run(a,b,out).status,0); assert.deepEqual(readFileSync(a),before); }));
test('fresh output creates both reports',()=>setup(({dir,a,b})=>{const out=join(dir,'out'); assert.equal(run(a,b,out).status,0); assert.ok(existsSync(out)); assert.ok(existsSync(out+'.html')); }));
