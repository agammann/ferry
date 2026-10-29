// Bounded, deliberately small RFC 5545 subset. All unsupported semantics block conclusions.
const known = new Set(['UID','DTSTART','DTEND','SUMMARY','DESCRIPTION','LOCATION','STATUS','RRULE','EXDATE','RECURRENCE-ID','DTSTAMP','LAST-MODIFIED','CREATED','SEQUENCE']);
const parts = (line) => { const i=line.indexOf(':'); if(i<0) throw Error('Malformed property'); const [name,...parameters]=line.slice(0,i).split(';'); return {name:name.toUpperCase(),parameters,value:line.slice(i+1)}; };
function instant(value, parameters) {
  if (!/^\d{8}T\d{6}Z?$/.test(value)) throw Error('Only second-resolution date-times are supported');
  const n=value.match(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)(Z?)$/); const target=Date.UTC(+n[1],+n[2]-1,+n[3],+n[4],+n[5],+n[6]);
  if(new Date(target).toISOString().slice(0,19).replace(/[-:]/g,'') !== value.slice(0,15)) throw Error('Invalid date-time');
  if(value.endsWith('Z')) { if(parameters.length) throw Error('UTC date-time has parameters'); return target; }
  if(parameters.length !== 1 || !parameters[0].startsWith('TZID=')) throw Error('Floating or unsupported date-time');
  const zone=parameters[0].slice(5); let fmt;
  try { fmt=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}); } catch { throw Error('Unknown time zone: '+zone); }
  const local = t => { const p=Object.fromEntries(fmt.formatToParts(new Date(t)).map(x=>[x.type,x.value])); return Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second); };
  const offsets=new Set(); for(let h=-36;h<=36;h+=6) { const t=target+h*3600000; offsets.add(local(t)-t); }
  const matches=[...offsets].map(o=>target-o).filter(t=>local(t)===target);
  if(matches.length!==1) throw Error('Ambiguous or nonexistent local time');
  return matches[0];
}
function parse(text) {
  const events=[]; let e=null, depth=0;
  for(const line of text.replace(/\r?\n[ \t]/g,'').split(/\r?\n/)) {
    if(line==='BEGIN:VEVENT') { if(e) throw Error('Nested event'); e=[]; continue; }
    if(!e) continue;
    if(line.startsWith('BEGIN:')) { depth++; e.push({name:'UNSUPPORTED-COMPONENT',value:line,parameters:[]}); continue; }
    if(line.startsWith('END:') && depth) { depth--; continue; }
    if(line==='END:VEVENT') { events.push(e); e=null; continue; }
    if(line) e.push(parts(line));
  }
  if(e) throw Error('Unterminated event'); return events;
}
const one=(e,name,required=false)=> { const p=e.filter(x=>x.name===name); if(p.length>1 || (required && p.length!==1)) throw Error('Invalid or repeated '+name); return p[0]; };
function time(p) { if(!p) throw Error('Missing date-time'); return instant(p.value,p.parameters); }
function shifted(p,days) { const match=p.value.match(/^(\d{8})T(\d{6})(Z?)$/); if(!match) throw Error('Unsupported date-time'); const d=new Date(Date.UTC(+match[1].slice(0,4),+match[1].slice(4,6)-1,+match[1].slice(6,8)+days)); return {...p,value:d.toISOString().slice(0,10).replace(/-/g,'')+'T'+match[2]+match[3]}; }
function expand(group, start, end) {
  if(group.some(e=>e.some(p=>!known.has(p.name)))) throw Error('Unsupported event property or component');
  const masters=group.filter(e=>!one(e,'RECURRENCE-ID')); if(masters.length!==1) throw Error('Missing or duplicate master');
  const master=masters[0], dt=one(master,'DTSTART',true), duration=one(master,'DTEND') ? time(one(master,'DTEND'))-time(dt) : null;
  if(duration!==null && duration<0) throw Error('Negative duration');
  const fields={}; for(const k of ['SUMMARY','DESCRIPTION','LOCATION']) { const p=one(master,k); if(p) { if(p.parameters.length) throw Error('Unsupported property parameters'); fields[k]=p.value; } }
  const status=one(master,'STATUS'); if(status && (status.parameters.length || !['CONFIRMED','TENTATIVE','CANCELLED'].includes(status.value))) throw Error('Unsupported status');
  const rr=one(master,'RRULE'); let count=1, step=1;
  if(rr) { if(rr.parameters.length) throw Error('Unsupported RRULE parameters'); const entries=rr.value.split(';').map(x=>x.split('=')); if(entries.some(x=>x.length!==2)) throw Error('Malformed RRULE'); const rule=Object.fromEntries(entries); if(entries.length!==Object.keys(rule).length || Object.keys(rule).some(k=>!['FREQ','COUNT','INTERVAL'].includes(k)) || !['DAILY','WEEKLY'].includes(rule.FREQ) || !/^\d+$/.test(rule.COUNT||'')) throw Error('Only DAILY/WEEKLY COUNT rules are supported'); count=+rule.COUNT; const interval=rule.INTERVAL||'1'; if(!/^[1-9]\d*$/.test(interval) || count<1 || count>10000) throw Error('Invalid recurrence bounds'); step=(rule.FREQ==='WEEKLY'?7:1)*+interval; }
  const excluded=new Set(); for(const p of master.filter(x=>x.name==='EXDATE')) for(const v of p.value.split(',')) excluded.add(time({...p,value:v}));
  const overrides=new Map(); for(const e of group.filter(x=>x!==master)) { if(e.some(p=>['RRULE','EXDATE'].includes(p.name))) throw Error('Unsupported recurrence on override'); const id=time(one(e,'RECURRENCE-ID',true)); if(overrides.has(id)) throw Error('Duplicate recurrence override'); overrides.set(id,e); }
  const found=new Set(), occurrences=[];
  for(let i=0;i<count;i++) { const original=time(shifted(dt,i*step)); const over=overrides.get(original); if(over) found.add(original); if(excluded.has(original) && over) throw Error('Conflicting exclusion and override'); if(excluded.has(original)) continue;
    let actual=original, f=fields, dur=one(master,'DTEND') ? time(shifted(one(master,'DTEND'),i*step))-original : null, state=status?.value;
    if(over) { const st=one(over,'STATUS'); if(st && (st.parameters.length || !['CONFIRMED','TENTATIVE','CANCELLED'].includes(st.value))) throw Error('Unsupported override status'); if(!st && status) throw Error('Override omits status while master specifies status; effective status is uncertain'); state=st?.value; if(state!=='CANCELLED') { actual=time(one(over,'DTSTART',true)); const finish=one(over,'DTEND'); dur=finish ? time(finish)-actual : duration; f={...fields}; for(const k of ['SUMMARY','DESCRIPTION','LOCATION']) { const p=one(over,k); if(p) { if(p.parameters.length) throw Error('Unsupported property parameters'); f[k]=p.value; } } } }
    if(state==='CANCELLED') continue; if(dur!==null && dur<0) throw Error('Negative duration'); if(actual>=start && actual<end) occurrences.push({original:new Date(original).toISOString(),start:new Date(actual).toISOString(),end:dur===null?null:new Date(actual+dur).toISOString(),status:state||null,fields:f});
  }
  if([...overrides.keys()].some(k=>!found.has(k))) throw Error('Orphan recurrence override');
  return occurrences.sort((a,b)=>a.original.localeCompare(b.original));
}
export function auditOccurrences(before,after,startDate,endDate) {
  if(!/^\d{4}-\d\d-\d\d$/.test(startDate)||!/^\d{4}-\d\d-\d\d$/.test(endDate)) throw Error('Window must use YYYY-MM-DD');
  const start=Date.parse(startDate+'T00:00:00Z'), end=Date.parse(endDate+'T00:00:00Z'); if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end||new Date(start).toISOString().slice(0,10)!==startDate||new Date(end).toISOString().slice(0,10)!==endDate) throw Error('Invalid window');
  if(/(?:^|\r?\n)BEGIN:VTIMEZONE(?:\r?\n|$)/.test(before+'\n'+after)) return {window:{start:startDate,endExclusive:endDate,timezone:'UTC'},findings:[{status:'unverifiable',reason:'Embedded VTIMEZONE definitions are not interpreted'}]};
  const group=text=> { const m=new Map(); for(const e of parse(text)) { const uid=one(e,'UID'); if(!uid || uid.parameters.length || !uid.value) { m.set(Symbol(),[e]); continue; } m.set(uid.value,[...(m.get(uid.value)||[]),e]); } return m; }; const a=group(before),b=group(after), findings=[];
  for(const uid of new Set([...a.keys(),...b.keys()])) { if(typeof uid!=='string'||!a.has(uid)||!b.has(uid)) { findings.push({uid:typeof uid==='string'?uid:null,status:'unverifiable',reason:'Unmatched or missing UID; rewritten identities require review'}); continue; }
    try { const left=expand(a.get(uid),start,end),right=expand(b.get(uid),start,end); findings.push({uid,status:JSON.stringify(left)===JSON.stringify(right)?'preserved':'changed',before:left,after:right}); } catch(e) { findings.push({uid,status:'unverifiable',reason:e.message}); }
  }
  return {window:{start:startDate,endExclusive:endDate,timezone:'UTC'},findings};
}
