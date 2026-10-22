// Concurrency / race-condition regression tests. Needs the local test server (tests/e2e/restart.sh) and the local test DB.
// Usage: node tests/e2e/concurrency.mjs        Exit code 1 if any check fails.
import {execSync} from 'child_process';
const B=process.env.BASE||'http://localhost:5799'; const R=Date.now(); const P1=Math.floor(Math.random()*200)+20, P2=Math.floor(Math.random()*200)+20; let k=0; const ip=()=>`10.${P1}.${P2}.${(k++)%250+1}`;
const db=q=>execSync(`PGPASSWORD=testpass psql -h 127.0.0.1 -p 55432 -U postgres -d darhub_test -At -c "${q.replace(/"/g,String.fromCharCode(92,34))}"`).toString().trim();
async function call(m,p,body,tok,form,extra={}){const h={'X-Forwarded-For':ip(),...extra};if(tok)h.Authorization='Bearer '+tok;if(body&&!form)h['Content-Type']='application/json';const r=await fetch(B+p,{method:m,headers:h,body:form?body:body?JSON.stringify(body):undefined});let j={};try{j=await r.json()}catch{};return{s:r.status,j,h:r.headers}}
async function reg(kind,tag,mob,extra){const email=`cc.${tag}.${R}@example.com`;let r=await call('POST','/api/otp/send-otp',{email,mobile_number:mob});const d=r.j.dev_otps;await call('POST','/api/otp/verify-otp',{email,mobile_number:mob,email_otp:d.email_otp,mobile_otp:d.mobile_otp});
 const f=new FormData();for(const[a,b]of Object.entries({first_name:'C',last_name:tag+R,email,mobile_number:mob,password:'Qa@12345',dob:'1988-04-04',...extra}))f.set(a,b);
 r=await call('POST',`/api/user/${kind}-registration`,f,null,true);return {tok:r.j.token,id:r.j.user_id}}
const pil={aadhar_number:'2'+String(R).slice(-11),pan_card_number:'ABCDE1234F',upi_id:'qa@ybl',bank_name:'SBI',acc_holder_name:'Z',acc_number:String(R).slice(-10),ifsc_code:'SBIN0001234',address:JSON.stringify([{state:'34',district:'103',block:'57',lane1:'a',village:'t',pincode:'833201',is_primary:true}])};
const m=n=>String(n).slice(-8);
const F1=await reg('farmer','1','7'+m(R)+'5'),F2=await reg('farmer','2','7'+m(R)+'6'),P=await reg('pilot','p','9'+m(R)+'7',pil);
const AD=(await call('POST','/admin/auth/login',{email:'superadmin@example.com',password:'Admin@12345'})).j.data.token;
const drone=db(`select d.id from "DRONE" d join "DRONE_ADDRESS" a on a.drone_id=d.id and a.is_active where a.block=57 and not exists (select 1 from "SPRAYING_DAILY_LOGS" l where l.drone_id=d.id and l.is_active and l.working_date::date=date '${new Date(Date.now()+5.5*3600e3).toISOString().slice(0,10)}') order by d.id desc limit 1`);
await call('PUT','/admin/update-drone/'+drone,{pilot_user_id:P.id},AD);
const today=new Date(Date.now()+5.5*3600e3).toISOString().slice(0,10);
const crop=(await call('GET','/order/crops/list',null,F1.tok)).j.data[0].id;
const mk=async F=>(await call('POST','/order/create-order',{start_date:today,crop_type_id:crop,land_in_acers:3,user_id:F.id,address:{state:'34',district:'103',block:'57',lane1:'x',village:'t',pincode:'833201'}},F.tok)).j.booking_id;
const res=[];const t=(n,ok,d)=>{res.push(ok);console.log((ok?'PASS ':'FAIL ')+n.padEnd(66)+d)};

// 1. race: two bookings, same drone+pilot+date, simultaneous assign
const [b1,b2]=await Promise.all([mk(F1),mk(F2)]);
// 0. the admin Assign modal must be offered the booking's own number of days (working-days rule), not acres/drone capacity
const nd=db(`select num_of_days from "SPRAYING_ORDER" where booking_id='${(await (async()=>b1)())}'`);
const cal=await call('POST','/order/calendar-availability',{booking_id:b1},AD);
t('Calendar estimated_days equals the booking\'s num_of_days (not acres/capacity)',cal.s===200&&Number(nd)>1&&cal.j.estimated_days===Number(nd),`booking num_of_days=${nd} estimated_days=${cal.j.estimated_days}`);
const rs=await Promise.all([b1,b2].map(b=>call('POST','/order/assign-work/'+b,{drone_id:Number(drone),working_date:[today]},AD)));
const act=db(`select count(*) from "SPRAYING_DAILY_LOGS" where drone_id=${drone} and working_date::date='${today}' and is_active`);
t('Two bookings race for same drone+date: exactly one wins',rs.filter(r=>r.s===200).length===1&&act==='1',`statuses=${rs.map(r=>r.s)} active_logs_for_drone_today=${act}`);
const win=rs[0].s===200?b1:b2, winF=rs[0].s===200?F1:F2;
// 2. duplicate create-order burst
const before=db(`select count(*) from "SPRAYING_ORDER" where user_id=${F1.id}`);
const order={start_date:today,crop_type_id:crop,land_in_acers:3,user_id:F1.id,address:{state:'34',district:'103',block:'57',lane1:'x',village:'t',pincode:'833201'}};
const key={'Idempotency-Key':'cc-'+R+'-create'};
const burst=await Promise.all(Array.from({length:5},()=>call('POST','/order/create-order',order,F1.tok,false,key)));
const afterBurst=db(`select count(*) from "SPRAYING_ORDER" where user_id=${F1.id}`);
await new Promise(r=>setTimeout(r,300));
const retry=await call('POST','/order/create-order',order,F1.tok,false,key);
const created=burst.find(r=>r.s===201);
t('5 simultaneous create-order with one Idempotency-Key: exactly 1 order',afterBurst-before===1&&burst.every(r=>[201,409].includes(r.s)),`statuses=${burst.map(r=>r.s)} new orders=${afterBurst-before}`);
t('Retry with the same key replays the same booking_id, no new order',retry.s===201&&retry.h.get('idempotent-replayed')==='true'&&retry.j.booking_id===created?.j.booking_id&&db(`select count(*) from "SPRAYING_ORDER" where user_id=${F1.id}`)==afterBurst,`replayed=${retry.h.get('idempotent-replayed')} same id=${retry.j.booking_id===created?.j.booking_id}`);
const reuse=await call('POST','/order/create-order',{...order,land_in_acers:4},F1.tok,false,key);
t('Same key with a different body -> 422 IDEMPOTENCY_KEY_REUSED',reuse.s===422&&reuse.j.code==='IDEMPOTENCY_KEY_REUSED',`status=${reuse.s} code=${reuse.j.code}`);
const stored=db(`select status||'/'||response_status from "IDEMPOTENCY_KEY" where idem_key='cc-${R}-create'`);
t('Key row stored as completed/201 (saved in the order transaction)',stored==='completed/201',stored);
const noKey=await Promise.all(Array.from({length:2},()=>call('POST','/order/create-order',order,F1.tok)));
t('Without a key requests still work (old app versions)',noKey.every(r=>r.s===201),`statuses=${noKey.map(r=>r.s)}`);
db(`update "SPRAYING_ORDER" set order_status='ORDER_CANCELLED' where booking_id in ('${created?.j.booking_id}','${noKey.map(r=>r.j.booking_id).join("','")}')`);
// 3. accept vs decline race, repeated: a day must never end up both confirmed AND stamped as declined
let badRounds=0, detail='';
for(let i=0;i<12;i++){
  const pair=i%2?[['confirm-assignment',{booking_id:win,accept_all:true}],['reject-assignment',{booking_id:win,reason:'race decline'}]]:[['reject-assignment',{booking_id:win,reason:'race decline'}],['confirm-assignment',{booking_id:win,accept_all:true}]];
  await Promise.all(pair.map(([ep,body])=>call('POST','/api/pilot/work/'+ep,body,P.tok)));
  const st=db(`select coalesce(is_pilot_confirmed::text,'null')||'/'||coalesce(verification_comment,'') from "SPRAYING_DAILY_LOGS" where spraying_work_id='${win}' and is_active`);
  const os=db(`select order_status from "SPRAYING_ORDER" where booking_id='${win}'`);
  const ok=(st.startsWith('true/')&&!st.includes('declined_at')&&os==='ORDER_ACCEPTED')||(st.startsWith('false/')&&st.includes('declined_at')&&os==='WAITING_FOR_CONFIRMATION');
  if(!ok){badRounds++;detail=`round ${i}: day=${st.slice(0,80)} order=${os}`}
}
t('Accept vs decline race x12 always leaves a consistent state',badRounds===0,badRounds?`${badRounds}/12 inconsistent, e.g. ${detail}`:'12/12 consistent');
await call('POST','/api/pilot/work/confirm-assignment',{booking_id:win,accept_all:true},P.tok);
// 4. parallel start-day
const sd=await Promise.all(Array.from({length:8},()=>call('POST','/api/pilot/work/start-day',{booking_id:win,working_date:today},P.tok)));
const tl=db(`select count(*) from "SPRAYING_ORDER_TIMELINE" where booking_id='${win}' and order_status='JOB_STARTED'`);
t('8 parallel start-day: one creates, rest idempotent, 1 timeline row',sd.filter(r=>r.s===201).length===1&&sd.every(r=>[200,201].includes(r.s))&&tl==='1',`statuses=${sd.map(r=>r.s)} JOB_STARTED rows=${tl}`);
// 5. parallel update-work then end-day
await Promise.all(Array.from({length:6},(_,i)=>call('POST','/api/pilot/work/update-work',{booking_id:win,working_date:today,completed_acres:i+1,water_used:10*i},P.tok)));
const ed=await Promise.all(Array.from({length:6},()=>call('POST','/api/pilot/work/end-day',{booking_id:win,working_date:today,completed_acres:3},P.tok)));
const tc=db(`select count(*) from "SPRAYING_ORDER_TIMELINE" where booking_id='${win}' and order_status='ORDER_COMPLETED'`);const fin=db(`select order_status from "SPRAYING_ORDER" where booking_id='${win}'`);
t('6 parallel end-day: completes once, 1 ORDER_COMPLETED row',tc==='1'&&fin==='ORDER_COMPLETED',`statuses=${ed.map(r=>r.s)} COMPLETED rows=${tc} order=${fin}`);
// 6. parallel cancel vs rate / double cancel on other booking
const lose=win===b1?b2:b1, loseF=win===b1?F2:F1;
const cc=await Promise.all(Array.from({length:4},()=>call('POST',`/api/farmer/bookings/${lose}/cancel`,{reason:'dup'},loseF.tok)));
const cn=db(`select count(*) from "SPRAYING_ORDER_TIMELINE" where booking_id='${lose}' and order_status='ORDER_CANCELLED'`);
t('4 parallel cancels: cancelled once',cn==='1',`statuses=${cc.map(r=>r.s)} CANCELLED rows=${cn}`);
// 7. cancelled order's drone slot released
t('Cancel releases nothing it never held (no stray active logs)',db(`select count(*) from "SPRAYING_DAILY_LOGS" where spraying_work_id='${lose}' and is_active`)==='0','');
// leave the drone free for the next run (local test DB only)
db(`update "SPRAYING_DAILY_LOGS" set is_active=false where spraying_work_id in ('${b1}','${b2}')`);
console.log(`\nRESULT ${res.filter(Boolean).length}/${res.length}`); process.exit(res.every(Boolean)?0:1);
