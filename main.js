// === Setup UI ===
const term = document.getElementById('terminal');
const cmdIn = document.getElementById('commandInput');
function print(t='') { term.innerHTML += t + '\n'; term.scrollTop = term.scrollHeight; }
cmdIn.addEventListener('keypress', e => { if(e.key==='Enter'){ handle(cmdIn.value.trim()); cmdIn.value=''; } });

// === Dexie.js Setup ===
const db = new Dexie('ZXVWP');
db.version(1).stores({ users: 'tag' });

// === Global State ===
let current = null;
const users = {};
const adminTag = '000', adminPass = 'admin220700';
const bankZX = { balance:0, log:[] };

// === Data Tables ===
const itemsStore  = [{type:'pager', base:123},{type:'peach', base:13},{type:'box', base:7}];
const jobsList    = [{type:'coder', wage:7},{type:'chef', wage:9},{type:'farmer', wage:4}];
const bizList     = [{type:'store', price:2000, income:23},{type:'office', price:5000, income:93},{type:'factory', price:15000, income:277}];
const houseList   = [{type:'studio', price:1000, rent:103},{type:'detached', price:5500, rent:307},{type:'villa', price:20500, rent:677},{type:'mansion', price:173277, rent:1353}];
let pricesFluct = {};

// === Utility Functions ===
function genTag(){ let t; do{ t=''+(100+Math.floor(Math.random()*900)); }while(users[t]); return t; }
function nowSec(){ return Math.floor(Date.now()/1000); }
function mkUser(tag, pw, isAdmin=false){
  return {
    tag, pw, isAdmin,
    wallet:isAdmin?999999:0, bankBal:0,
    job:null, biz:null, bizLvl:0, house:null,
    inv:{}, role:isAdmin?'admin':null,
    claimed:false, tier:'A', xp:0,
    jailUntil:0, travel:null, travelUntil:0, itemCDUntil:0,
    _jobAt:0, _bizAt:0, lastTax:nowSec(), lastSub:nowSec()
  };
}

// === Load saved users ===
db.users.toArray().then(arr => { arr.forEach(u => users[u.tag] = u); print('📂 Loaded saved data'); });

// === Tier Locks ===
const tierLocks = {
  dice:'B', slots:'B', crime:'C', travel:'B',
  applyjob:'A', buybiz:'B', buyhouse:'A'
};
function checkTier(c){
  if(!tierLocks[c]) return true;
  if(current.tier < tierLocks[c]){ print(`🔒 Requires Tier ${tierLocks[c]}+`); return false; }
  return true;
}

// === Auto-Save ===
async function saveAll(){
  if(!current) return;
  users[current.tag] = current;
  await db.users.put(current);
  print('💾 Game saved');
}
setInterval(saveAll, 60000);

// === Economic Scheduler ===
function scheduleEconomy(u){
  const now = nowSec();
  if(now - u.lastTax >= 43200){
    const t = Math.floor(u.bankBal * 0.10);
    u.bankBal -= t; bankZX.balance += t;
    bankZX.log.push({time:now, tag:u.tag, type:'tax', amt:t});
    print(`🧾 Tax of Ɐ̶${t} deducted`);
    u.lastTax = now;
  }
  if(now - u.lastSub >= 86400){
    if(u.bankBal < 10007){
      const s = Math.min(150, Math.floor(u.bankBal * 0.03));
      u.bankBal += s; bankZX.balance -= s;
      bankZX.log.push({time:now, tag:u.tag, type:'subsidy', amt:s});
      print(`🎁 Subsidy of Ɐ̶${s} granted`);
    }
    u.lastSub = now;
  }
}

// === Tick Function ===
function tick(u){
  const n = nowSec();
  if(u.job && n - u._jobAt >= 3600){
    const w = jobsList.find(j=>j.type===u.job).wage;
    u.bankBal += w; bankZX.balance -= w; u._jobAt = n;
  }
  if(u.biz && n - u._bizAt >= 7200){
    const b = bizList.find(bz=>bz.type===u.biz);
    const inc = Math.floor(b.income * (1 + (u.bizLvl-1)*0.01));
    u.bankBal += inc; bankZX.balance -= inc; u._bizAt = n;
  }
  if(!tick._pfAt || n - tick._pfAt >= 300){
    itemsStore.forEach(it => {
      const rnd = 1 + (Math.random()*0.2 - 0.1);
      pricesFluct[it.type] = Math.max(1, Math.round(it.base * rnd));
    });
    tick._pfAt = n;
  }
}

// === Admin Guard ===
function adminOnly(fn){
  return current.isAdmin ? fn() : print('🔒 Admin only');
}

// === Main Command Handler ===
async function handle(line){
  if(!line) return;
  const [c, ...args] = line.toLowerCase().split(' ');

  if(c==='signup') return cmdSignup(args[0]);
  if(c==='login') return cmdLogin(args[0], args[1]);
  if(c==='logout') return cmdLogout();
  if(!current) return print('⚠️ Please login/signup first');

  if(!checkTier(c)) return;
  tick(current); scheduleEconomy(current);

  switch(c){
    case 'save': return saveAll();
    case 'load': return db.users.toArray().then(arr=>{ arr.forEach(u=>users[u.tag]=u); print('📂 Data reloaded'); });
    case 'claim': return cmdClaim();
    case 'profile': case 'stats': return cmdProfile();
    case 'bank': return print(`🏦 Bank: Ɐ̶${current.bankBal}`);
    case 'deposit': return cmdBank(args[0],1);
    case 'withdraw': return cmdBank(args[0],-1);
    case 'bankview': return adminOnly(() => print(`ZX Bank Ɐ̶${bankZX.balance}`));
    case 'banklog': return adminOnly(() => print(JSON.stringify(bankZX.log,0,2)));
    case 'bankset': return adminOnly(() => { bankZX.balance = +args[0]; print('✅ Bank set'); });
    case 'charity': return cmdCharity(+args[0]);
    case 'joblist': return print(jobsList.map(j=>`${j.type}(${j.wage})`).join('; '));
    case 'applyjob': return cmdApplyJob(args[0]);
    case 'resign': return cmdResign();
    case 'bizlist': return print(bizList.map(b=>`${b.type}(${b.price},${b.income})`).join('; '));
    case 'buybiz': return cmdBiz('buy', args[0]);
    case 'sellbiz': return cmdBiz('sell');
    case 'upbiz': return cmdBiz('upgrade');
    case 'dice': return cmdDice(+args[0]);
    case 'slots': return cmdSlots(+args[0]);
    case 'houselist': return print(houseList.map(h=>`${h.type}(${h.price},rent${h.rent})`).join('; '));
    case 'buyhouse': return cmdHouse('buy', args[0]);
    case 'renthouse': return cmdHouse('rent', args[0], +args[1]);
    case 'sellhouse': return cmdHouse('sell');
    case 'itemlist': return cmdItemList();
    case 'buyitem': return cmdItem('buy', args[0], +args[1]);
    case 'sellitem': return cmdItem('sell', args[0], +args[1]);
    case 'inventory': return print(JSON.stringify(current.inv));
    case 'crime': return cmdCrime();
    case 'travel': return cmdTravel(args[0]);
    case 'return': return cmdReturn();
    default: return print('❓ Unknown command');
  }
}

// === Command Implementations ===
function cmdSignup(pw){
  if(!pw||pw.length<6) return print('❌ Password >=6 chars');
  const t = genTag();
  current = mkUser(t, pw);
  users[t] = current;
  db.users.put(current);
  print(`✅ Signed up! Tag: ${t}`);
}
function cmdLogin(t, pw){
  if(t === adminTag && pw === adminPass){
    current = mkUser(t, pw, true);
    return print('👑 Admin logged in');
  }
  if(users[t] && users[t].pw === pw){ current = users[t]; return print(`✅ Welcome back ${t}`); }
  print('❌ Invalid login');
}
function cmdLogout(){ current = null; print('🔓 Logged out'); }
function cmdClaim(){
  if(current.claimed) return print('❌ Already claimed');
  current.claimed = true; current.wallet += 50; current.house = 'shack'; current.role = 'homeless';
  print('🎁 Starter pack claimed!');
}
function cmdProfile(){
  const u = current;
  print(`🪪${u.tag} | 💵${u.wallet} | 🏦${u.bankBal}`);
  print(`Job:${u.job||'-'} Biz:${u.biz||'-'} Lvl:${u.bizLvl||'-'}`);
  print(`House:${u.house||'-'} Inv:${JSON.stringify(u.inv)}`);
  print(`Jail:${nowSec()<u.jailUntil?'Yes':''} Travel:${u.travel||'-'}`);
  print(`Tier:${u.tier}`);
}
function cmdBank(am, dir){
  const fix = Math.abs(+am);
  if(!fix||current.wallet*dir < fix) return print('❌');
  if(dir>0){ current.bankBal += fix; current.wallet -= fix; } 
  else { current.wallet += fix; current.bankBal -= fix; }
  print('✅');
}
function cmdCharity(amt){
  if(!amt||current.wallet<amt) return print('❌');
  current.wallet -= amt; bankZX.balance += amt;
  bankZX.log.push({time: nowSec(), tag: current.tag, type:'charity', amt});
  if(amt>303007){
    const bonus = Math.floor(amt*0.01); current.wallet += bonus;
    return print(`🙏 Thanks + bonus Ɐ̶${bonus}`);
  }
  print('🙏 Thanks');
}
function cmdApplyJob(type){
  if(!jobsList.find(j=>j.type===type)) return print('❌');
  current.job = type; print('✅ Job applied');
}
function cmdResign(){ current.job = null; print('✅ Resigned'); }
function cmdBiz(act, type){
  const bz = bizList.find(b=>b.type===type);
  if(act==='buy'){
    if(!bz||current.wallet<bz.price) return print('❌');
    current.biz = type; current.bizLvl = 1; current.wallet -= bz.price; return print('✅');
  }
  if(act==='sell'){
    if(!current.biz) return print('❌');
    const orig = bizList.find(b=>b.type===current.biz);
    current.wallet += Math.floor(orig.price * 0.5);
    current.biz = null; current.bizLvl = 0; return print('✅');
  }
  if(act==='upgrade'){
    if(!current.biz) return print('❌');
    const orig = bizList.find(b=>b.type===current.biz);
    const cost = Math.floor(orig.price * 0.8);
    if(current.bizLvl >=10 || current.wallet < cost) return print('❌');
    current.wallet -= cost; current.bizLvl++;
    return print(`✅ Business level ${current.bizLvl}`);
  }
}
function cmdDice(bet){
  if(!bet||bet<5||current.wallet<bet) return print('❌');
  if(Math.random()<0.5){ current.wallet += bet; print(`🎉 Win +${bet}`); }
  else { current.wallet -= bet; print(`😭 Lose ${bet}`); }
}
function cmdSlots(bet){
  if(!bet||bet<5||current.wallet<bet) return print('❌');
  if(Math.random()<0.7){ current.wallet += bet; print(`🎉 Win +${bet}`); }
  else { current.wallet -= bet; print(`😭 Lose ${bet}`); }
}
function cmdHouse(act, type, days){
  const h = houseList.find(h=>h.type===type);
  if(act==='buy'){
    if(!h||current.wallet<h.price) return print('❌');
    current.wallet -= h.price; current.house = type; return print('✅');
  }
  if(act==='rent'){
    if(!h||!days||current.wallet<h.rent*days) return print('❌');
    current.wallet -= h.rent * days; return print('✅');
  }
  if(act==='sell'){
    if(!current.house) return print('❌');
    const hh = houseList.find(h=>h.type===current.house);
    current.wallet += Math.floor(hh.price*0.5); current.house = null; return print('✅');
  }
}
function cmdItemList(){
  const out = itemsStore.map(it=>{
    const p = pricesFluct[it.type] || it.base;
    const df = (((p-it.base)/it.base)*100).toFixed(1);
    return `${it.type}(${p}, ${df}%)`;
  });
  print(out.join('; '));
}
function cmdItem(act, type, qty){
  const m = itemsStore.find(it=>it.type===type);
  if(!m||!qty) return print('❌');
  const price = Math.floor((pricesFluct[type]||m.base) * qty);
  if(act==='buy'){
    if(current.wallet < price) return print('❌');
    current.wallet -= price; current.inv[type]=(current.inv[type]||0)+qty;
    return print('✅ Bought');
  }
  if(act==='sell'){
    if((current.inv[type]||0) < qty) return print('❌');
    current.inv[type] -= qty;
    current.wallet += Math.floor(m.base * 0.6 * qty);
    return print('✅ Sold');
  }
}
function cmdCrime(){
  if(nowSec() < current.jailUntil) return print('⛓️ In Jail');
  if(Math.random()<0.35){
    const loot = Math.floor(Math.random()*100);
    current.wallet += loot; return print(`🎉 Crime success +${loot}`);
  } else {
    current.jailUntil = nowSec() + 600;
    return print('🚔 Crime failed — jailed 10min');
  }
}
function cmdTravel(city){
  if(!city) return print('❌ Usage: travel [city]');
  if(current.travel) return print('❌ Already traveling');
  if(current.wallet < 777) return print('❌ Insufficient funds');
  current.wallet -= 777;
  current.travel = city; current.travelUntil = nowSec() + 3600;
  print(`🚂 Traveling to ${city}...`);
}
function cmdReturn(){
  if(!current.travel) return print('❌ Not traveling');
  if(nowSec() < current.travelUntil) return print('⌛ Still traveling...');
  current.travel = null; return print('🏡 Returned home');
}
