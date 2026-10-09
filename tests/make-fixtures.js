/* Builds synthetic backups (no real client data) that exercise every feature:
   invoices (lump sum + per scope), shared jobs, manhours, rework chains,
   holds, reassignments, holidays, leave, compensation days, upcoming jobs.
   Usage: node tests/make-fixtures.js */
const fs = require('fs'), path = require('path');
let seed = 42; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
const base = new Date(); base.setHours(0,0,0,0);
const ds = n => { const d = new Date(base); d.setDate(d.getDate() + n); return d.toISOString().slice(0,10); };
const persons = ['Asha R','Bilal K','Chen L','Divya M','Elan P','Farah S','Gopi N','Hana T'].map((name,i)=>({id:i+1,name,location:i%2?'COK':'HO',position:pick(['NA','MANAGER','MODELLER','ESTIMATOR']),created_at:'2025-01-01T00:00:00Z',updated_at:'2025-01-01T00:00:00Z'}));
const statuses = ['not planned','planned','ongoing','hold','complete','complete','complete','cancelled'];
const jobs = []; let id = 100;
for(let g = 0; g < 40; g++) {
  const jobNumber = 'TX' + (1000 + g), vessel = 'Vessel ' + String.fromCharCode(65 + g % 26) + g, client = 'Client ' + (g % 7);
  const scopes = 1 + Math.floor(rnd() * 3), lump = rnd() < .5;
  for(let s = 0; s < scopes; s++) {
    const st = pick(statuses), p = pick(persons), recv = -Math.floor(rnd() * 120);
    const j = { id: id++, jobNumber, clientName: client, vesselName: vessel, jobScope: pick(['Intact stability','Damage stability','Lightship estimation','Tank modelling','Freeboard calc']) + ' ' + s,
      location: p.location, receiptDate: ds(recv), targetDate: ds(recv + 5 + Math.floor(rnd()*40)), plannedStartDate: rnd()<.8 ? ds(recv + 2) : null,
      daysRequired: 1 + Math.floor(rnd()*6), personInCharge: p.name, status: st, priorityLevel: pick(['top urgent','urgent','medium','low']),
      completionPercentage: st==='complete'?100: st==='ongoing'? Math.floor(rnd()*90):0, qcDone: st==='complete' && rnd()<.7, qcDoneBy: st==='complete'?pick(persons).name:null,
      remark: rnd()<.2 ? 'Awaiting "client" docs & drawings' : null,
      estimatedManhours: rnd()<.8 ? Math.round(rnd()*40*2)/2 : null,
      invoiceAmount: (lump ? s===0 : true) && rnd()<.85 ? Math.round(rnd()*200000) : null, invoiceType: lump ? 'lump' : 'per',
      isRework:false, parentJobId:null, revisionNumber:null, reworkHistory:null, reworkCycles:null, reassignmentHistory:null, sharedWith:null, sharedJobDetails:null,
      startDate: st==='ongoing'||st==='complete' ? ds(recv+2) : null, actualDaysToComplete: st==='complete'?1+Math.floor(rnd()*6):null,
      completionDate: st==='complete'? ds(recv + 4 + Math.floor(rnd()*20)) : null, holdStartDate: st==='hold'?ds(-3):null, holdDays: st==='hold'&&rnd()<.5?5:null, daysElapsed:0 };
    if(st==='hold') j.holdReason = 'Waiting for drawings';
    if(st==='complete') { j.manhoursConsumed = Math.round(rnd()*50); j.manhourCost = Math.round(rnd()*30000); }
    if(rnd()<.2) { const o = pick(persons).name; j.sharedJobDetails=[{personName:o,startDate:ds(-2),endDate:ds(3)}]; j.sharedWith=[o]; }
    if(rnd()<.15) j.reassignmentHistory=[{from:pick(persons).name,to:p.name,reason:'workload',date:ds(-10),pctAtHandover:40}];
    jobs.push(j);
  }
}
// Rework chains
jobs.filter(j=>j.status==='complete').slice(0,6).forEach((orig,k)=>{
  const rw = { ...orig, id: id++, status: pick(['rework planned','rework ongoing','rework completed']), isRework:true, parentJobId:orig.id, revisionNumber:String(k%3+1),
    completionPercentage: 0, completionDate:null, invoiceAmount:null, reworkHistory:[{originalJobId:orig.id,completedDate:orig.completionDate,daysRequired:orig.daysRequired,actualDays:orig.actualDaysToComplete,personInCharge:orig.personInCharge}], plannedStartDate: ds(1), startDate:null };
  orig.reworkHistory = [{reworkJobId:rw.id,revisionNumber:rw.revisionNumber,createdDate:ds(-1),personInCharge:rw.personInCharge}];
  jobs.unshift(rw);
});
const full = { jobs, persons,
  upcomingJobs:[{id:900,jobNumber:'UP1',clientName:'Client U',vesselName:'Future Star',jobScope:'Addendum',receiptDate:ds(-1),targetDate:ds(12),plannedStartDate:ds(2),daysRequired:3,personInCharge:persons[0].name,location:'HO',status:'planned',priorityLevel:'urgent',notes:'Expected next week',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'}],
  holidays:[ds(4), ds(-20)], workingDays:[ds(6 - base.getDay() + 7)], personHolidays:{[persons[1].name]:[ds(1),ds(2)]}, compensationWorkingDays:{[persons[2].name]:[ds(5 - base.getDay() + 8)]},
  exportDate: new Date().toISOString() };
fs.writeFileSync(path.join(__dirname,'fixtures/sample-backup-v1.json'), JSON.stringify(full,null,2));
// "Early format": only jobs + persons, older fields missing
const early = { jobs: jobs.slice(0,30).map(j=>({id:j.id,jobNumber:j.jobNumber,clientName:j.clientName,vesselName:j.vesselName,jobScope:j.jobScope,receiptDate:j.receiptDate,targetDate:j.targetDate,plannedStartDate:j.plannedStartDate,daysRequired:j.daysRequired,personInCharge:j.personInCharge,location:j.location,status:j.status,priorityLevel:j.priorityLevel,completionPercentage:j.completionPercentage,qcDone:j.qcDone,qcDoneBy:j.qcDoneBy,remark:j.remark,isRework:j.isRework,parentJobId:j.parentJobId,revisionNumber:j.revisionNumber})), persons: persons.map(({id,name,location})=>({id,name,location})) };
fs.writeFileSync(path.join(__dirname,'fixtures/early-format-backup.json'), '﻿' + JSON.stringify(early));
console.log('fixtures written:', jobs.length, 'jobs');
