// Regression test for the 23:59 cron (closeStartedDays): closes started days, also stale ones, atomically, idempotently.
// Needs the local test server + DB (tests/e2e/run.sh). Exit code 1 if any check fails.
import {execSync} from 'child_process'; import path from 'path'; import {fileURLToPath} from 'url';
const HERE=path.dirname(fileURLToPath(import.meta.url));
process.env.ENV_FILE=path.join(HERE,'.env.test');
const {default:env}=await import('../../config/env.js');
if(env.DB_HOST!=='127.0.0.1'||String(env.DB_PORT)!=='55432'){console.error(`ABORT: this test only runs against the local test DB (got ${env.DB_HOST}:${env.DB_PORT})`);process.exit(2)}
const {closeStartedDays}=await import('../../cron/jobs.js'); const {default:db}=await import('../../models/index.js');

const B=process.env.BASE||'http://localhost:5799'; const R=Date.now();
const P1=Math.floor(Math.random()*200)+20,P2=Math.floor(Math.random()*200)+20; let k=0; const ip=()=>`10.${P1}.${P2}.${(k++)%250+1}`;
const sql=q=>execSync(`PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -At -c "${q.replace(/"/g,String.fromCharCode(92,34))}"`).toString().trim();
async function call(m,p,body,tok,form){const h={'X-Forwarded-For':ip()};if(tok)h.Authorization='Bearer '+tok;if(body&&!form)h['Content-Type']='application/json';const r=await fetch(B+p,{method:m,headers:h,body:form?body:body?JSON.stringify(body):undefined});let j={};try{j=await r.json()}catch{};return{s:r.status,j}}
async function reg(kind,tag,mob,extra){const email=`cr.${tag}.${R}@example.com`;let r=await call('POST','/api/otp/send-otp',{email,mobile_number:mob});const d=r.j.dev_otps;await call('POST','/api/otp/verify-otp',{email,mobile_number:mob,email_otp:d.email_otp,mobile_otp:d.mobile_otp});
 const f=new FormData();for(const[a,b]of Object.entries({first_name:'K',last_name:tag+R,email,mobile_number:mob,password:'Qa@12345',dob:'1988-04-04',...extra}))f.set(a,b);
 r=await call('POST',`/api/user/${kind}-registration`,f,null,true);return{tok:r.j.token,id:r.j.user_id}}
const today=new Date(Date.now()+5.5*3600e3).toISOString().slice(0,10);
sql(`update "SPRAYING_DAILY_LOGS" set is_active=false where working_date::date=date '${today}'`);   // local test DB only: free today's drones
const AD=(await call('POST','/admin/auth/login',{email:'superadmin@example.com',password:'Admin@12345'})).j.data.token;
const F=await reg('farmer','f','7'+String(R).slice(-8)+'1'); const crop=(await call('GET','/order/crops/list',null,F.tok)).j.data[0].id;
const drones=sql(`select d.id from "DRONE" d join "DRONE_ADDRESS" a on a.drone_id=d.id and a.is_active where a.block=57 order by d.id`).split('\n');
const made=[]; let n=0;
async function startedDay(){ // farmer books -> admin assigns -> pilot accepts -> pilot starts: a day left "started"
  n++; const drone=drones[n-1]; const P=await reg('pilot','p'+n,'9'+String(R).slice(-8)+n,{aadhar_number:'2'+String(R+n).slice(-11),pan_card_number:'ABCDE1234F',upi_id:'qa@ybl',bank_name:'SBI',acc_holder_name:'Z',acc_number:String(R+n).slice(-10),ifsc_code:'SBIN0001234',address:JSON.stringify([{state:'34',district:'103',block:'57',lane1:'a',village:'t',pincode:'833201',is_primary:true}])});
  await call('PUT','/admin/update-drone/'+drone,{pilot_user_id:P.id},AD);
  const bk=(await call('POST','/order/create-order',{start_date:today,crop_type_id:crop,land_in_acers:3,user_id:F.id,address:{state:'34',district:'103',block:'57',lane1:'x',village:'t',pincode:'833201'}},F.tok)).j.booking_id;
  await call('POST','/order/assign-work/'+bk,{drone_id:Number(drone),working_date:[today]},AD);
  await call('POST','/api/pilot/work/confirm-assignment',{booking_id:bk,accept_all:true},P.tok);
  const s=await call('POST','/api/pilot/work/start-day',{booking_id:bk,working_date:today},P.tok); if(s.s!==201)throw new Error('setup start-day failed '+s.s);
  made.push(bk); return bk;
}
const res=[]; const t=(name,ok,d='')=>{res.push(ok);console.log((ok?'PASS ':'FAIL ')+name.padEnd(70)+d)};
const dayState=bk=>sql(`select coalesce(verification_comment,'') from "SPRAYING_DAILY_LOGS" where spraying_work_id='${bk}' and is_active`);
const ostat=bk=>sql(`select order_status from "SPRAYING_ORDER" where booking_id='${bk}'`);
const cnt=(bk,st)=>sql(`select count(*) from "SPRAYING_ORDER_TIMELINE" where booking_id='${bk}' and order_status='${st}'`);

const b1=await startedDay(), b2=await startedDay(), b3=await startedDay();
// stale: b2's day belongs to yesterday (a run was missed)
sql(`update "SPRAYING_DAILY_LOGS" set working_date=working_date - interval '1 day' where spraying_work_id='${b2}'`);
// b3: make the order update fail once, to prove the day is rolled back with it
const origCreate=db.SprayingOrderTimeline.create; let failed=0;
db.SprayingOrderTimeline.create=async function(row,...rest){ if(row?.booking_id===b3&&failed===0){failed++;throw new Error('injected failure')} return origCreate.call(this,row,...rest) };
const logErr=console.error; console.error=()=>{};
const c1=await closeStartedDays(); console.error=logErr;
t('Run 1 closes the started day (today)',dayState(b1).includes('"day_status":"completed"')&&ostat(b1)==='ORDER_COMPLETED',`day=completed order=${ostat(b1)} timeline rows=${cnt(b1,'ORDER_COMPLETED')}`);
t('Run 1 also closes a STALE day left from an earlier date',dayState(b2).includes('"day_status":"completed"')&&ostat(b2)==='ORDER_COMPLETED',`order=${ostat(b2)}`);
t('Failure while closing rolls the day back (stays started, order JOB_STARTED)',failed===1&&dayState(b3).includes('"day_status":"started"')&&ostat(b3)==='JOB_STARTED',`injected failures=${failed} day=${dayState(b3).includes('started')?'started':'?'} order=${ostat(b3)}`);
t('One failing day did not stop the others',c1>=2,`closed in run 1 = ${c1}`);
const c2=await closeStartedDays();
t('Run 2 retries and closes the previously failed day',dayState(b3).includes('"day_status":"completed"')&&ostat(b3)==='ORDER_COMPLETED',`order=${ostat(b3)} closed=${c2}`);
const c3=await closeStartedDays();
t('Run 3 is idempotent: closes nothing, no duplicate timeline rows',c3===0&&[b1,b2,b3].every(b=>cnt(b,'ORDER_COMPLETED')==='1'),`closed=${c3} rows=${[b1,b2,b3].map(b=>cnt(b,'ORDER_COMPLETED'))}`);
db.SprayingOrderTimeline.create=origCreate;
sql(`update "SPRAYING_DAILY_LOGS" set is_active=false where spraying_work_id in ('${made.join("','")}')`);   // leave drones free
console.log(`\nRESULT ${res.filter(Boolean).length}/${res.length}`); await db.sequelize.close(); process.exit(res.every(Boolean)?0:1);
