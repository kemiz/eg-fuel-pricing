module.exports=[65081,e=>{"use strict";function i(e){let i=e>>>0;return()=>{i|=0;let e=Math.imul((i=i+0x6d2b79f5|0)^i>>>15,1|i);return(((e=e+Math.imul(e^e>>>7,61|e)^e)^e>>>14)>>>0)/0x100000000}}function t(e){let i=0x811c9dc5;for(let t=0;t<e.length;t++)i^=e.charCodeAt(t),i=Math.imul(i,0x1000193);return i>>>0}let a=(e,i)=>Number(e.toFixed(i));function s(e,a,r,n,o,l=90){let d,c,_=(d=i(t("walk:"+a)),c=(e,i)=>e+d()*(i-e),a.startsWith("common:")?{vol:n?c(.016,.03):c(.01,.018),reversion:.045,trendSlope:c(-.006,.006),seasonalAmp:c(.04,.1),seasonalPeriod:c(40,75),seasonalPhase:d()*Math.PI*2}:{vol:n?c(.03,.05):c(.018,.03),reversion:c(.035,.07),trendSlope:c(-.006,.006),seasonalAmp:c(.03,.09),seasonalPeriod:c(22,60),seasonalPhase:d()*Math.PI*2}),u=i((t("walk:"+a)^(r+1)*0x9e3779b1)>>>0),p=(-_.vol+2*u()*_.vol)*o*3,m=_.seasonalAmp*o*Math.sin(_.seasonalPhase+r/_.seasonalPeriod*Math.PI*2),E=l/2,g=E*Math.tanh((r-E)/E),y=_.trendSlope*o*g;return e+_.reversion*(y+m-e)+p}e.s(["perfSnapshot",0,function(e){let i=new Map,t=e=>{let t=i.get(e);return t||i.set(e,t={sites:0,volume:0,revenue:0,marginPool:0,egPriceVol:0,compPriceVol:0,compVol:0,cheaper:0,inLine:0,dearer:0,cfVolume:0,cfMarginPool:0}),t};for(let i of e){var a,s,r;let e="US"===i.country?.05:.02,n=i.competitors.length>0?i.competitors.reduce((e,i)=>e+i.price,0)/i.competitors.length:i.egPrice,o=i.volume,l=(i.egPrice-i.unitCost)*o,d=i.egPrice-n,c=d<-e?"cheaper":d>e?"dearer":"inLine",_=i.baseEgMargin??Math.max(0,(i.baseEgPrice??i.egPrice)-i.unitCost),u=i.unitCost+_,p=(a=i,s=u,r=n,Math.max(50,(a.baseVolume??a.volume)*(1+a.elasticity*(r>0?(s-r)/r:0)*.4))),m=(u-i.unitCost)*p;for(let e of[i.country,"ALL"]){let a=t(e);a.sites+=1,a.volume+=o,a.revenue+=i.egPrice*o,a.marginPool+=l,a.egPriceVol+=i.egPrice*o,a.compPriceVol+=n*o,a.compVol+=o,a[c]+=1,a.cfVolume+=p,a.cfMarginPool+=m}}let n=[];for(let[e,t]of i)n.push({country:e,sites:t.sites,volume:t.volume,revenue:t.revenue,marginPool:t.marginPool,avgMargin:t.volume>0?t.marginPool/t.volume:0,avgEgPrice:t.volume>0?t.egPriceVol/t.volume:0,avgCompPrice:t.compVol>0?t.compPriceVol/t.compVol:null,cheaper:t.cheaper,inLine:t.inLine,dearer:t.dearer,cfVolume:t.cfVolume,cfMarginPool:t.cfMarginPool});return n},"stepDay",0,function(e,r,n={}){let o=i(r),l=[],d={...n},c=r-1,_=0;if(.07>o()){let e=.5>o(),i=.015+.015*o();_+=e?i:-i,l.push({scope:"network",kind:"crude_spike",headline:e?`Crude firms — wholesale up ${(100*i).toFixed(0)}\xa2 equivalent`:`Crude eases — wholesale down ${(100*i).toFixed(0)}\xa2 equivalent`,detail:e?"A spot-market move pushes wholesale costs up across the network. Expect pump prices to follow within a day or two.":"Spot wholesale costs fall back across the network, loosening cost pressure on pump prices.",tone:e?"bad":"good"})}let u=null;if(.1>o()&&e.length){let i=[...new Set(e.map(e=>e.region))];(u=i[Math.floor(o()*i.length)]??null)&&l.push({scope:"region",ref:u,kind:"price_war",headline:`Price war in ${u}`,detail:"Local competitors are cutting aggressively — rival prices drop and demand becomes more price-sensitive.",tone:"bad"})}let p=null;return .06>o()&&e.length&&(p=e[Math.floor(o()*e.length)]?.siteId??null),{sites:e.map(e=>{let n="US"===e.country,o=n?2:3,m=n?1:.42,E=i((r^t(e.siteId))>>>0),g=(e,i)=>e+E()*(i-e),y="basevol:"+e.siteId,P=e.baseVolume??d[y]??e.volume;d[y]=P;let h="common:"+e.siteId,S=d[h]??0,$=s(S,h,c,n,m);d[h]=$;let D=$-S,v=e.baseUnitCost??e.unitCost,A=e.unitCost+D+_*m+.04*(v-e.unitCost);if(e.siteId===p){let i=g(.04,.09)*m;A+=i,l.push({scope:"site",ref:e.siteId,kind:"outage",headline:"Local supply disruption",detail:"A delivery shortfall lifts this site's wholesale cost sharply for the day.",tone:"bad"})}A=Math.max(.2*m,A);let f=u&&e.region===u,T=e=>{let a,r,o,l=(a=i(t(e)),{commonWeight:(r=(e,i)=>e+a()*(i-e))((o=e.endsWith("|EG"))?.55:.3,.7),fastUp:o?r(.5,.78):r(.42,.85),slowDown:o?r(.12,.22):r(.1,.3)}),_="priv:"+e,u=s(d[_]??0,_,c,n,m);d[_]=u;let p=l.commonWeight*$+(1-l.commonWeight)*u,E="drive:"+e,g=d[E]??p;return d[E]=p,{drive:p,driveDelta:p-g,tr:l}},C=e.competitors.map(s=>{let n=e.siteId+"|"+s.name,l=i((r^t(e.siteId+s.name))>>>0),{driveDelta:d,tr:c}=T(n),_=s.baseMargin??Math.max(.02*m,s.price-A),u=d>0?c.fastUp:c.slowDown,p=s.price-(A+_),E=s.price+u*d+-(p>0?.22:.07)*p;return f&&(E-=(.01+.025*l())*m),E=Math.max(A+.005*m,E),{name:s.name,price:a(E,o),baseMargin:_}}),N=C.length>0?C.reduce((e,i)=>e+i.price,0)/C.length:e.egPrice,O=e.siteId+"|EG",R=e.baseEgMargin??Math.max(.02*m,e.egPrice-A),{driveDelta:L,tr:w}=T(O),b=L>0?w.fastUp:w.slowDown,M=e.egPrice-(A+R),I=e.egPrice+b*L+-(M>0?.22:.07)*M;I=a(I=Math.max(A+.02*m,I),o);let U=N>0?(I-N)/N:0,x=1+e.elasticity*U*(f?1.4:1)*.4,F="vol:"+e.siteId,W=.6*(d[F]??0)+g(-.018,.018);d[F]=W;let H=P*x*(1+W);if(H=Math.max(50,Math.round(H)),.03>E()){let i=g(-.18,.2);H=Math.max(50,Math.round(H*(1+i))),Math.abs(i)>.12&&l.push({scope:"site",ref:e.siteId,kind:"demand_swing",headline:i>0?"Demand surge":"Demand dip",detail:`Footfall ${i>0?"rose":"fell"} ~${Math.abs(Math.round(100*i))}% at this site today.`,tone:i>0?"good":"bad"})}return{...e,unitCost:a(A,o+1),egPrice:I,competitors:C,volume:H,baseVolume:P}}),events:l,crudeDelta:_,signal:d}}])},72874,e=>e.a(async(i,t)=>{try{var a=e.i(45095),s=e.i(69473),r=e.i(65081),n=i([a]);[a]=n.then?(await n)():n;let v=e=>e instanceof Date?new Date(Date.UTC(e.getFullYear(),e.getMonth(),e.getDate())).toISOString().slice(0,10):String(e).slice(0,10);function o(e,i){let[t,a,s]=e.split("-").map(Number),r=new Date(Date.UTC(t,a-1,s));return r.setUTCDate(r.getUTCDate()+i),r.toISOString().slice(0,10)}function l(e){let i=v(e.sim_date),t=Number(e.day_index);return{simDate:i,dayIndex:t,running:!!e.running,speedMs:Number(e.speed_ms),baselineDate:o(i,-t)}}async function d(){let e=await (0,a.pgQuery)(`SELECT sim_date, day_index, running, speed_ms FROM ${(0,s.APP)("sim_state")} WHERE id = 1`);if(!e.length){let e=await (0,a.pgQuery)(`SELECT COALESCE(max(day), CURRENT_DATE) AS d FROM ${(0,s.APP)("price_history")}`),i=v(e[0]?.d??new Date);return{simDate:i,dayIndex:0,running:!1,speedMs:3e3,baselineDate:i}}return l(e[0])}async function c(){let e=(await (0,a.pgQuery)(`SELECT count(*)::int AS days,
            COALESCE(sum(margin_pool), 0)    AS cum_margin_pool,
            COALESCE(sum(cf_margin_pool), 0) AS cum_cf_margin_pool
       FROM ${(0,s.APP)("sim_daily_perf")}
      WHERE country = 'ALL'`))[0]??{},i=Number(e.cum_margin_pool??0),t=Number(e.cum_cf_margin_pool??0),r=i-t;return{days:Number(e.days??0),cumMarginPool:i,cumUplift:r,upliftPct:t>0?r/t*100:null,currency:"USD"}}async function _(e=8){return(await (0,a.pgQuery)(`SELECT id, day, day_index, scope, ref, kind, headline, detail, tone
       FROM ${(0,s.APP)("sim_events")}
      ORDER BY day_index DESC, id DESC
      LIMIT $1`,[e])).map(e=>({id:Number(e.id),day:v(e.day),dayIndex:Number(e.day_index),scope:e.scope,ref:e.ref??void 0,kind:e.kind,headline:e.headline,detail:e.detail??void 0,tone:e.tone}))}async function u(e,i){let t=await e(`WITH reg_cost AS (
        SELECT site_id, wholesale_cost + delivery_cost AS unit_cost
          FROM ${(0,s.APP)("costs")} WHERE grade_id = 'regular'
     ),
     reg_dem AS (
        SELECT site_id, avg_daily_volume, base_avg_daily_volume, elasticity
          FROM ${(0,s.APP)("demand_signals")} WHERE grade_id = 'regular'
     ),
     latest_eg AS (
        SELECT DISTINCT ON (site_id) site_id, price
          FROM ${(0,s.APP)("price_history")} WHERE grade_id = 'regular' AND is_eg = true
         ORDER BY site_id, day DESC
     ),
     -- Baseline-day anchors (the seeded "today"): EG price + unit cost.
     base_eg AS (
        SELECT site_id, price FROM ${(0,s.APP)("price_history")}
         WHERE grade_id = 'regular' AND is_eg = true AND day = $1::date
     ),
     base_cost AS (
        SELECT site_id, price FROM ${(0,s.APP)("price_history")}
         WHERE grade_id = 'regular' AND series = '${s.COST_SERIES}' AND day = $1::date
     )
     SELECT s.site_id, s.country, s.region,
            rc.unit_cost, rd.avg_daily_volume, rd.base_avg_daily_volume,
            rd.elasticity, le.price AS eg_price,
            be.price AS base_eg_price, bc.price AS base_cost
       FROM ${(0,s.APP)("sites")} s
       LEFT JOIN reg_cost rc ON rc.site_id = s.site_id
       LEFT JOIN reg_dem  rd ON rd.site_id = s.site_id
       LEFT JOIN latest_eg le ON le.site_id = s.site_id
       LEFT JOIN base_eg be ON be.site_id = s.site_id
       LEFT JOIN base_cost bc ON bc.site_id = s.site_id`,[i]),a=await e(`WITH latest_comp AS (
        SELECT DISTINCT ON (site_id, series) site_id, series, price
          FROM ${(0,s.APP)("price_history")} WHERE grade_id = 'regular' AND is_eg = false
            AND series <> '${s.COST_SERIES}'
         ORDER BY site_id, series, day DESC
     ),
     base_comp AS (
        SELECT site_id, series, price
          FROM ${(0,s.APP)("price_history")}
         WHERE grade_id = 'regular' AND is_eg = false
           AND series <> '${s.COST_SERIES}' AND day = $1::date
     )
     SELECT cp.site_id, cp.competitor_name AS name,
            COALESCE(lc.price, cp.price) AS price,
            bcmp.price AS base_price
       FROM ${(0,s.APP)("competitor_prices")} cp
       LEFT JOIN latest_comp lc
         ON lc.site_id = cp.site_id AND lc.series = cp.competitor_name
       LEFT JOIN base_comp bcmp
         ON bcmp.site_id = cp.site_id AND bcmp.series = cp.competitor_name
      WHERE cp.grade_id = 'regular'`,[i]),r=new Map;for(let e of t)null!=e.base_cost?r.set(e.site_id,Number(e.base_cost)):null!=e.unit_cost&&r.set(e.site_id,Number(e.unit_cost));let n=new Map;for(let e of a){let i=e.site_id,t=n.get(i)??[],a=r.get(i),s=null==e.base_price?null:Number(e.base_price),o=null!=s&&null!=a?s-a:void 0;t.push({name:e.name,price:Number(e.price),baseMargin:o}),n.set(i,t)}return t.filter(e=>null!=e.unit_cost&&null!=e.eg_price).map(e=>{let i=Number(e.unit_cost),t=null==e.base_cost?i:Number(e.base_cost),a=null==e.base_eg_price?Number(e.eg_price):Number(e.base_eg_price);return{siteId:e.site_id,region:e.region,country:e.country,unitCost:i,baseUnitCost:t,egPrice:Number(e.eg_price),baseEgMargin:a-t,baseEgPrice:a,volume:null==e.avg_daily_volume?1500:Number(e.avg_daily_volume),baseVolume:null!=e.base_avg_daily_volume?Number(e.base_avg_daily_volume):null==e.avg_daily_volume?1500:Number(e.avg_daily_volume),elasticity:null==e.elasticity?-1.4:Number(e.elasticity),competitors:n.get(e.site_id)??[]}})}async function p(e,i,t,a,n){{let t=[],r=[],n=0,o=(e,a,s,o)=>{t.push(`($${++n},'regular',$${++n},$${++n},$${++n},$${++n})`),r.push(e,a,s,i,o)};for(let e of a){for(let i of(o(e.siteId,"EG",!0,e.egPrice),e.competitors))o(e.siteId,i.name,!1,i.price);o(e.siteId,s.COST_SERIES,!1,e.unitCost)}for(let i=0;i<t.length;i+=1e3){let a=t.slice(i,i+1e3),n=r.slice(5*i,(i+a.length)*5),o=0,l=a.map(()=>`($${++o},'regular',$${++o},$${++o},$${++o},$${++o})`).join(",");await e(`INSERT INTO ${(0,s.APP)("price_history")} (site_id, grade_id, series, is_eg, day, price)
         VALUES ${l}
         ON CONFLICT (site_id, grade_id, series, day) DO UPDATE SET price = EXCLUDED.price`,n)}}{let t=[],r=[],n=0;for(let e of a)t.push(`($${++n},$${++n}::numeric)`),r.push(e.siteId,e.unitCost);await e(`UPDATE ${(0,s.APP)("costs")} c
          SET wholesale_cost = GREATEST(0.05, v.unit_cost - c.delivery_cost),
              as_of = $${++n}::date
         FROM (VALUES ${t.join(",")}) AS v(site_id, unit_cost)
        WHERE c.site_id = v.site_id AND c.grade_id = 'regular'`,[...r,i])}{let t=[],r=[],n=0;for(let e of a)t.push(`($${++n},$${++n}::int)`),r.push(e.siteId,Math.round(e.volume));await e(`UPDATE ${(0,s.APP)("demand_signals")} d
          SET avg_daily_volume = v.vol, as_of = $${++n}::date
         FROM (VALUES ${t.join(",")}) AS v(site_id, vol)
        WHERE d.site_id = v.site_id AND d.grade_id = 'regular'`,[...r,i])}{let i=[],t=[],r=0;for(let e of a)for(let a of e.competitors)i.push(`($${++r},$${++r},$${++r}::numeric)`),t.push(e.siteId,a.name,a.price);i.length&&await e(`UPDATE ${(0,s.APP)("competitor_prices")} cp
            SET price = v.price, observed_at = now()
           FROM (VALUES ${i.join(",")}) AS v(site_id, name, price)
          WHERE cp.site_id = v.site_id AND cp.competitor_name = v.name
            AND cp.grade_id = 'regular'`,t)}{let n=(0,r.perfSnapshot)(a),o=[],l=[],d=0;for(let e of n){let a=[];for(let e=0;e<15;e++)a.push(`$${++d}`);o.push(`(${a.join(",")})`),l.push(t,i,e.country,e.sites,e.volume,e.revenue,e.marginPool,e.avgMargin,e.avgEgPrice,e.avgCompPrice,e.cheaper,e.inLine,e.dearer,e.cfVolume,e.cfMarginPool)}o.length&&await e(`INSERT INTO ${(0,s.APP)("sim_daily_perf")}
           (day_index, day, country, sites, volume, revenue, margin_pool,
            avg_margin, avg_eg_price, avg_comp_price, cheaper, in_line, dearer,
            cf_volume, cf_margin_pool)
         VALUES ${o.join(",")}
         ON CONFLICT (day_index, country) DO UPDATE SET
           day = EXCLUDED.day, sites = EXCLUDED.sites, volume = EXCLUDED.volume,
           revenue = EXCLUDED.revenue, margin_pool = EXCLUDED.margin_pool,
           avg_margin = EXCLUDED.avg_margin, avg_eg_price = EXCLUDED.avg_eg_price,
           avg_comp_price = EXCLUDED.avg_comp_price, cheaper = EXCLUDED.cheaper,
           in_line = EXCLUDED.in_line, dearer = EXCLUDED.dearer,
           cf_volume = EXCLUDED.cf_volume, cf_margin_pool = EXCLUDED.cf_margin_pool`,l)}if(n.length){let a=[],r=[],o=0;for(let e of n)a.push(`($${++o},$${++o},$${++o},$${++o},$${++o},$${++o},$${++o},$${++o})`),r.push(i,t,e.scope,e.ref??null,e.kind,e.headline,e.detail??null,e.tone);await e(`INSERT INTO ${(0,s.APP)("sim_events")} (day, day_index, scope, ref, kind, headline, detail, tone)
       VALUES ${a.join(",")}`,r)}}async function m(e,i){let t=await e(`SELECT day_index, levels FROM ${(0,s.APP)("sim_signal_state")} WHERE id = 1`);if(!t.length||Number(t[0].day_index)!==i)return{};let a=t[0].levels;return"string"==typeof a?JSON.parse(a):a}async function E(e,i,t){await e(`INSERT INTO ${(0,s.APP)("sim_signal_state")} (id, day_index, levels, updated_at)
     VALUES (1, $1, $2::jsonb, now())
     ON CONFLICT (id) DO UPDATE SET day_index = EXCLUDED.day_index,
                                    levels = EXCLUDED.levels,
                                    updated_at = now()`,[i,JSON.stringify(t)])}async function g(e,i,t){let a=o(i.simDate,-i.dayIndex),n=await u(e,a),l=i.simDate,d=i.dayIndex,c=await m(e,d);for(let i=0;i<t;i++){l=o(l,1),d+=1;let{sites:i,events:t,signal:a}=(0,r.stepDay)(n,d+1,c);await p(e,l,d,i,t),n=i,c=a}return await E(e,d,c),await e(`INSERT INTO ${(0,s.APP)("sim_state")} (id, sim_date, day_index, updated_at)
     VALUES (1, $1, $2, now())
     ON CONFLICT (id) DO UPDATE SET sim_date = EXCLUDED.sim_date,
                                    day_index = EXCLUDED.day_index,
                                    updated_at = now()`,[l,d]),{...i,simDate:l,dayIndex:d}}async function y(e){let i=await e(`SELECT sim_date, day_index, running, speed_ms FROM ${(0,s.APP)("sim_state")} WHERE id = 1 FOR UPDATE`),t=new Date().toISOString().slice(0,10);return i.length?l(i[0]):{simDate:t,dayIndex:0,running:!1,speedMs:3e3,baselineDate:t}}async function P(e=1){return(0,a.pgTransaction)(async i=>{await i("SELECT pg_advisory_xact_lock($1)",[918273]);let t=await y(i);return g(i,t,e)})}async function h(){return(0,a.pgTransaction)(async e=>{await e("SELECT pg_advisory_xact_lock($1)",[918273]);let i=await e(`SELECT sim_date, day_index, running, speed_ms,
              (now() - updated_at) >= (speed_ms * interval '1 millisecond') AS due
         FROM ${(0,s.APP)("sim_state")} WHERE id = 1 FOR UPDATE`);if(!i.length)return{state:await D(e),stepped:!1};let t=l(i[0]),a=!!i[0].due;return t.running&&a?{state:await g(e,t,1),stepped:!0}:{state:t,stepped:!1}})}async function S(e){let i=[],t=[],r=0;return null!=e.running&&(i.push(`running = $${++r}`),t.push(e.running)),null!=e.speedMs&&(i.push(`speed_ms = $${++r}`),t.push(Math.max(500,Math.min(6e5,Math.round(e.speedMs))))),i.length&&(i.push("updated_at = now()"),await (0,a.pgQuery)(`UPDATE ${(0,s.APP)("sim_state")} SET ${i.join(", ")} WHERE id = 1`,t)),d()}async function $(){return(0,a.pgTransaction)(async e=>{await e("SELECT pg_advisory_xact_lock($1)",[918273]);let i=await e(`SELECT sim_date, day_index FROM ${(0,s.APP)("sim_state")} WHERE id = 1 FOR UPDATE`);if(i.length){let t=Number(i[0].day_index),a=o(v(i[0].sim_date),-t);await e(`DELETE FROM ${(0,s.APP)("price_history")} WHERE day > $1`,[a]),await e(`DELETE FROM ${(0,s.APP)("sim_events")}`),await e(`DELETE FROM ${(0,s.APP)("sim_daily_perf")}`),await e(`DELETE FROM ${(0,s.APP)("sim_interventions")}`),await e(`DELETE FROM ${(0,s.APP)("price_recommendations")}
          WHERE sim_day_index IS NOT NULL AND sim_day_index > 0`),await e(`UPDATE ${(0,s.APP)("competitor_prices")} cp
            SET price = lc.price
           FROM (
             SELECT DISTINCT ON (site_id, series) site_id, series, price
               FROM ${(0,s.APP)("price_history")}
              WHERE grade_id = 'regular' AND is_eg = false
                AND series <> '${s.COST_SERIES}'
              ORDER BY site_id, series, day DESC
           ) lc
          WHERE cp.site_id = lc.site_id AND cp.competitor_name = lc.series
            AND cp.grade_id = 'regular'`),await e(`UPDATE ${(0,s.APP)("costs")} c
            SET wholesale_cost = GREATEST(0.05, lc.price - c.delivery_cost)
           FROM (
             SELECT DISTINCT ON (site_id) site_id, price
               FROM ${(0,s.APP)("price_history")}
              WHERE grade_id = 'regular' AND series = '${s.COST_SERIES}'
              ORDER BY site_id, day DESC
           ) lc
          WHERE c.site_id = lc.site_id AND c.grade_id = 'regular'`),await e(`UPDATE ${(0,s.APP)("demand_signals")}
            SET avg_daily_volume = base_avg_daily_volume
          WHERE base_avg_daily_volume IS NOT NULL`),await e(`UPDATE ${(0,s.APP)("sim_signal_state")}
            SET day_index = 0, levels = '{}'::jsonb, updated_at = now()
          WHERE id = 1`),await e(`UPDATE ${(0,s.APP)("sim_state")} SET sim_date = $1, day_index = 0,
                running = false, updated_at = now() WHERE id = 1`,[a])}return D(e)})}async function D(e){let i=await e(`SELECT sim_date, day_index, running, speed_ms FROM ${(0,s.APP)("sim_state")} WHERE id = 1`);return l(i[0])}e.s(["applyStep",0,P,"getPerfSummary",0,c,"getSimEvents",0,_,"getSimState",0,d,"resetSim",0,$,"setSimFlags",0,S,"tickIfDue",0,h]),t()}catch(e){t(e)}},!1)];

//# sourceMappingURL=src_lib_sim_0xszkfa._.js.map