module.exports=[90662,e=>{"use strict";let i={AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"};Object.fromEntries(Object.entries(i).map(([e,i])=>[i,e])),e.s(["regionLabel",0,function(e,t){return"US"===e?i[t]??t:t}])},63378,e=>e.a(async(i,t)=>{try{var r=e.i(47540),a=e.i(45095),n=e.i(69473),o=e.i(72874),l=e.i(90662),s=i([a,o]);function d(e){return{siteId:e.site_id,name:e.name,brand:e.brand,country:e.country,region:e.region,currency:e.currency,unit:e.unit,lat:Number(e.lat),lon:Number(e.lon)}}function c(e){return{gradeId:e.grade_id,label:e.label,sortOrder:Number(e.sort_order)}}function g(e){return{siteId:e.site_id,gradeId:e.grade_id,wholesaleCost:Number(e.wholesale_cost),deliveryCost:Number(e.delivery_cost),asOf:String(e.as_of)}}function u(e){return{id:Number(e.id),siteId:e.site_id,competitorName:e.competitor_name,gradeId:e.grade_id,price:Number(e.price),lat:Number(e.lat),lon:Number(e.lon)}}function m(e){return{siteId:e.site_id,gradeId:e.grade_id,avgDailyVolume:Number(e.avg_daily_volume),elasticity:Number(e.elasticity),trend:e.trend}}function p(e){return{id:Number(e.id),siteId:e.site_id,gradeId:e.grade_id,recommendedPrice:Number(e.recommended_price),rationale:e.rationale,projectedMargin:null==e.projected_margin?null:Number(e.projected_margin),projectedVolume:null==e.projected_volume?null:Number(e.projected_volume),confidence:null==e.confidence?null:Number(e.confidence),perAgentNotes:e.per_agent_notes??null,createdAt:String(e.created_at),simDayIndex:null==e.sim_day_index?null:Number(e.sim_day_index)}}[a,o]=s.then?(await s)():s;let h=(0,r.cache)(async()=>(await (0,a.pgQuery)(`SELECT grade_id, label, sort_order FROM ${(0,n.APP)("fuel_grades")} ORDER BY sort_order`)).map(c));(0,r.cache)(async e=>{let i=e?"WHERE country = $1":"";return(await (0,a.pgQuery)(`SELECT site_id, name, brand, country, region, currency, unit, lat, lon
       FROM ${(0,n.APP)("sites")} ${i}
       ORDER BY country, region, name`,e?[e]:[])).map(d)});let E=(0,r.cache)(async e=>{let i=await (0,a.pgQuery)(`SELECT site_id, name, brand, country, region, currency, unit, lat, lon
       FROM ${(0,n.APP)("sites")} WHERE site_id = $1`,[e]);return i.length?d(i[0]):null}),S=(0,r.cache)(async e=>{let i=await E(e);if(!i)return null;let[t,r,o,l,s,d]=await Promise.all([h(),(0,a.pgQuery)(`SELECT site_id, grade_id, wholesale_cost, delivery_cost, as_of
             FROM ${(0,n.APP)("costs")} WHERE site_id = $1`,[e]),(0,a.pgQuery)(`SELECT id, site_id, competitor_name, grade_id, price, lat, lon
             FROM ${(0,n.APP)("competitor_prices")} WHERE site_id = $1`,[e]),(0,a.pgQuery)(`SELECT site_id, grade_id, avg_daily_volume, elasticity, trend
             FROM ${(0,n.APP)("demand_signals")} WHERE site_id = $1`,[e]),(0,a.pgQuery)(`SELECT id, site_id, grade_id, recommended_price, rationale,
                  projected_margin, projected_volume, confidence,
                  per_agent_notes, created_at, sim_day_index
             FROM ${(0,n.APP)("price_recommendations")}
            WHERE site_id = $1
            ORDER BY created_at DESC
            LIMIT 12`,[e]),(0,a.pgQuery)(`SELECT DISTINCT ON (grade_id) grade_id, price
             FROM ${(0,n.APP)("price_history")}
            WHERE site_id = $1 AND is_eg = true AND series = 'EG'
            ORDER BY grade_id, day DESC`,[e])]),c={};for(let e of d)null!=e.price&&(c[e.grade_id]=Number(e.price));return{site:i,grades:t,costs:r.map(g),competitors:o.map(u),demand:l.map(m),latestRecommendations:s.map(p),egPrices:c}});(0,r.cache)(async e=>(await (0,a.pgQuery)(`SELECT id, site_id, grade_id, recommended_price, rationale,
              projected_margin, projected_volume, confidence,
              per_agent_notes, created_at, sim_day_index
         FROM ${(0,n.APP)("price_recommendations")}
        WHERE site_id = $1
        ORDER BY created_at DESC`,[e])).map(p));let v=(0,r.cache)(async(e,i="regular",t=90)=>{let r=await E(e);if(!r)return null;let o=await (0,a.pgQuery)(`WITH anchor AS (
         SELECT COALESCE(
                  (SELECT sim_date FROM ${(0,n.APP)("sim_state")} WHERE id = 1),
                  (SELECT max(day) FROM ${(0,n.APP)("price_history")}
                    WHERE site_id = $1 AND grade_id = $2),
                  now()::date
                ) AS d
       )
       SELECT ph.series, ph.is_eg, to_char(ph.day, 'YYYY-MM-DD') AS day, ph.price
         FROM ${(0,n.APP)("price_history")} ph, anchor a
        WHERE ph.site_id = $1 AND ph.grade_id = $2
          AND ph.series <> $4
          AND ph.day <= a.d
          AND ph.day > a.d - $3::int
        ORDER BY ph.day ASC`,[e,i,t,n.COST_SERIES]),l=new Set,s=new Map;for(let e of o){let i=e.series,t=e.day;l.add(t);let r=s.get(i);r||(r={isEg:!!e.is_eg,points:new Map},s.set(i,r)),r.points.set(t,Number(e.price))}let d=Array.from(l).sort(),c=Array.from(s.entries()).sort((e,i)=>e[1].isEg?-1:i[1].isEg?1:e[0].localeCompare(i[0])).map(([e,i])=>({series:e,isEg:i.isEg,points:d.map(e=>({day:e,price:i.points.get(e)??NaN}))}));return{siteId:e,gradeId:i,currency:r.currency,unit:r.unit,days:d,series:c}}),$=(0,r.cache)(async e=>{let i=await (0,a.pgQuery)(`WITH reg_cost AS (
        SELECT site_id, wholesale_cost + delivery_cost AS unit_cost
          FROM ${(0,n.APP)("costs")} WHERE grade_id = 'regular'
     ),
     reg_comp AS (
        SELECT site_id, avg(price) AS comp_avg
          FROM ${(0,n.APP)("competitor_prices")} WHERE grade_id = 'regular'
         GROUP BY site_id
     ),
     reg_dem AS (
        SELECT site_id, avg_daily_volume, elasticity
          FROM ${(0,n.APP)("demand_signals")} WHERE grade_id = 'regular'
     ),
     latest_rec AS (
        SELECT DISTINCT ON (site_id) site_id, recommended_price
          FROM ${(0,n.APP)("price_recommendations")} WHERE grade_id = 'regular'
         ORDER BY site_id, created_at DESC
     ),
     -- The simulation clock advances EG's own pump price by appending a new
     -- price_history row each day; the newest is_eg row is the live price.
     latest_eg AS (
        SELECT DISTINCT ON (site_id) site_id, price AS eg_price
          FROM ${(0,n.APP)("price_history")} WHERE grade_id = 'regular' AND is_eg = true
         ORDER BY site_id, day DESC
     )
     SELECT s.site_id, s.name, s.brand, s.country, s.region, s.currency, s.unit,
            s.lat, s.lon,
            rc.unit_cost,
            cmp.comp_avg,
            rd.avg_daily_volume,
            rd.elasticity,
            lr.recommended_price,
            le.eg_price
       FROM ${(0,n.APP)("sites")} s
       LEFT JOIN reg_cost  rc  ON rc.site_id  = s.site_id
       LEFT JOIN reg_comp  cmp ON cmp.site_id = s.site_id
       LEFT JOIN reg_dem   rd  ON rd.site_id  = s.site_id
       LEFT JOIN latest_rec lr ON lr.site_id  = s.site_id
       LEFT JOIN latest_eg le  ON le.site_id  = s.site_id
      WHERE s.country = $1
      ORDER BY s.region, s.name`,[e]),t="US"===e?.45:.18,r=i.map(e=>{let i=d(e),r=null==e.unit_cost?null:Number(e.unit_cost),a=null==e.comp_avg?null:Number(e.comp_avg),n=null==e.eg_price?null:Number(e.eg_price),o=null==e.recommended_price?null:Number(e.recommended_price),l=n??o??(null==r?null:Number((r+t).toFixed(3))),s=null!=l&&null!=a?Number((l-a).toFixed(3)):null,c=null!=l&&null!=r?Number((l-r).toFixed(3)):null,g=null==e.avg_daily_volume?null:Number(e.avg_daily_volume),u=null==e.elasticity?null:Number(e.elasticity);return{site:i,price:l,competitorAvg:a,delta:s,margin:c,unitCost:r,volume:g,elasticity:u}}),o=await (0,a.pgQuery)(`SELECT cp.id, cp.site_id, cp.competitor_name, cp.grade_id, cp.price, cp.lat, cp.lon
       FROM ${(0,n.APP)("competitor_prices")} cp
       JOIN ${(0,n.APP)("sites")} s ON s.site_id = cp.site_id
      WHERE s.country = $1 AND cp.grade_id = 'regular'`,[e]);return{country:e,sites:r,competitors:o.map(u)}}),N=(0,r.cache)(async()=>{let e=[];for(let i of["US","UK"]){let t=await $(i),r=new Map;for(let e of t.sites){let i=r.get(e.site.region)??[];i.push(e),r.set(e.site.region,i)}for(let[t,a]of r){let r=a.map(e=>e.margin).filter(e=>null!=e),n=a.map(e=>e.price).filter(e=>null!=e),o=a.map(e=>e.competitorAvg).filter(e=>null!=e),l=e=>e.length?e.reduce((e,i)=>e+i,0)/e.length:null;e.push({country:i,region:t,sites:a.length,avgMargin:l(r),avgPrice:l(n),avgCompetitor:l(o)})}}return e}),b=(0,r.cache)(async()=>{let e=await N(),[i,t]=await Promise.all([$("US"),$("UK")]),r=[...i.sites,...t.sites],a=(e,i)=>null==e?"n/a":`${"US"===i?"$":"£"}${e.toFixed("US"===i?2:3)}`,n=e.map(e=>`- ${e.region} (${e.country}): ${e.sites} sites, avg margin ${a(e.avgMargin,e.country)}, avg price ${a(e.avgPrice,e.country)}, avg competitor ${a(e.avgCompetitor,e.country)}`).join("\n"),o=e=>"US"===e?.05:.02,l=r.filter(e=>null!=e.delta&&e.delta<-o(e.site.country)),s=r.filter(e=>null!=e.delta&&e.delta>o(e.site.country)),d=e=>e.reduce((e,i)=>e+(i.volume??0),0),c=d(i.sites),g=d(t.sites),u=s.map(e=>{let i=null!=e.competitorAvg?function(e,i){if(null==e.price||null==e.unitCost||null==e.volume||null==e.elasticity||e.price<=0)return null;let t=(i-e.price)/e.price*100*e.elasticity,r=Math.max(0,Math.round(e.volume*(1+t/100))),a=(e.price-e.unitCost)*e.volume,n=(i-e.unitCost)*r;return{currentVolume:e.volume,projVolume:r,volumeDelta:r-e.volume,currentMargin:Number(a.toFixed(2)),projMargin:Number(n.toFixed(2)),marginDelta:Number((n-a).toFixed(2))}}(e,e.competitorAvg):null;return i?{s:e,impact:i}:null}).filter(e=>null!=e).sort((e,i)=>i.impact.marginDelta-e.impact.marginDelta),m=u.map(({s:e,impact:i})=>{let t=e.site.country,r="US"===t?"$":"£";return`- ${e.site.name} (${e.site.region}, ${t}) [id=${e.site.siteId}]: price ${a(e.price,t)} vs comp ${a(e.competitorAvg,t)} (gap +${a(e.delta,t)}); vol ${i.currentVolume}->${i.projVolume}/day (${i.volumeDelta>=0?"+":""}${i.volumeDelta}); daily margin ${r}${i.currentMargin}->${r}${i.projMargin} (${i.marginDelta>=0?"+":""}${r}${i.marginDelta})`}).join("\n"),p=u.reduce((e,i)=>e+i.impact.marginDelta,0),_=u.filter(e=>"US"===e.s.site.country).reduce((e,i)=>e+i.impact.marginDelta,0),y=u.filter(e=>"UK"===e.s.site.country).reduce((e,i)=>e+i.impact.marginDelta,0),h=r.map(e=>{let i=e.site.country;return`- ${e.site.name} | ${e.site.brand} | ${e.site.region} ${i} | id=${e.site.siteId} | price ${a(e.price,i)} | cost ${a(e.unitCost,i)} | margin ${a(e.margin,i)} | comp_avg ${a(e.competitorAvg,i)} | vs_comp ${null==e.delta?"n/a":(e.delta>=0?"+":"")+a(e.delta,i)} | vol ${e.volume??"n/a"} | elasticity ${e.elasticity??"n/a"}`}).join("\n");return{text:`NETWORK SNAPSHOT
- Total sites: ${r.length} (${i.sites.length} US, ${t.sites.length} UK)
- Sites cheaper than local rivals: ${l.length}; dearer: ${s.length}; in line: ${r.length-l.length-s.length}
- Total modelled daily volume on regular grade: ${c.toLocaleString()} gal (US) + ${g.toLocaleString()} L (UK)
- All per-site figures below are for REGULAR grade. Volumes are modelled avg daily throughput; margin = (price - unit cost) x volume; vs_comp = our price minus local competitor average (negative = we are cheaper).

REGION ROLLUPS:
${n}

PER-SITE DETAIL (use this to break a region/brand down by site, rank sites, or explain WHY a region's margin is high/low — e.g. group these rows by region):
${h}

"MATCH COMPETITION" SCENARIO — for the ${s.length} sites currently priced ABOVE local rivals, dropping price to the competitor average. Volume uplift uses each site's demand elasticity.
- Net daily margin impact if we match on all dearer sites: ${p>=0?"+":""}$${_.toFixed(2)} (US) and ${y>=0?"+":""}\xa3${y.toFixed(2)} (UK)
- Note: matching a higher price DOWN to rivals trades unit margin for volume; whether daily margin rises depends on elasticity. Per-site detail:
${m||"  (none currently dearer)"}`,sites:r.map(e=>({siteId:e.site.siteId,name:e.site.name,brand:e.site.brand,region:e.site.region,country:e.site.country}))}});async function _(e,i){return(await (0,a.pgQuery)(`WITH recent AS (
        SELECT DISTINCT day
          FROM ${(0,n.APP)("price_history")}
         WHERE grade_id = 'regular'
         ORDER BY day DESC
         LIMIT $2
     ),
     -- EG own price per site/day
     eg AS (
        SELECT ph.site_id, ph.day, ph.price
          FROM ${(0,n.APP)("price_history")} ph
          JOIN ${(0,n.APP)("sites")} s ON s.site_id = ph.site_id
         WHERE ph.grade_id = 'regular' AND ph.is_eg = true
           AND s.country = $1
           AND ph.day IN (SELECT day FROM recent)
     ),
     -- competitor average per site/day (exclude the hidden cost series)
     comp AS (
        SELECT ph.site_id, ph.day, avg(ph.price) AS comp_price
          FROM ${(0,n.APP)("price_history")} ph
          JOIN ${(0,n.APP)("sites")} s ON s.site_id = ph.site_id
         WHERE ph.grade_id = 'regular' AND ph.is_eg = false
           AND ph.series <> $3
           AND s.country = $1
           AND ph.day IN (SELECT day FROM recent)
         GROUP BY ph.site_id, ph.day
     ),
     -- per-day unit cost from the hidden cost series (same-day cost so margins
     -- are correct historically)
     daycost AS (
        SELECT ph.site_id, ph.day, ph.price AS unit_cost
          FROM ${(0,n.APP)("price_history")} ph
         WHERE ph.grade_id = 'regular' AND ph.series = $3
           AND ph.day IN (SELECT day FROM recent)
     ),
     -- current cost fallback for any legacy day with no cost series row
     cost AS (
        SELECT site_id, wholesale_cost + delivery_cost AS unit_cost
          FROM ${(0,n.APP)("costs")} WHERE grade_id = 'regular'
     ),
     vol AS (
        SELECT site_id, avg_daily_volume AS volume
          FROM ${(0,n.APP)("demand_signals")} WHERE grade_id = 'regular'
     )
     SELECT to_char(eg.day, 'YYYY-MM-DD') AS day,
            avg(eg.price)                          AS eg_price,
            avg(comp.comp_price)                   AS comp_price,
            avg(eg.price - COALESCE(dc.unit_cost, cost.unit_cost))  AS margin,
            sum((eg.price - COALESCE(dc.unit_cost, cost.unit_cost)) * COALESCE(vol.volume, 0)) AS margin_pool,
            sum(COALESCE(vol.volume, 0))           AS volume
       FROM eg
       LEFT JOIN comp ON comp.site_id = eg.site_id AND comp.day = eg.day
       LEFT JOIN daycost dc ON dc.site_id = eg.site_id AND dc.day = eg.day
       LEFT JOIN cost ON cost.site_id = eg.site_id
       LEFT JOIN vol  ON vol.site_id  = eg.site_id
      GROUP BY eg.day
      ORDER BY eg.day ASC`,[e,i,n.COST_SERIES])).map(e=>({day:String(e.day),egPrice:Number(e.eg_price),compPrice:null==e.comp_price?Number(e.eg_price):Number(e.comp_price),margin:Number(e.margin),marginPool:Number(e.margin_pool),volume:Number(e.volume)}))}function y(e,i,t){let r="US"===e?"USD":"GBP",a="US"===e?"/gal":"/L",n="US"===e?.05:.02,o=e=>e.filter(e=>null!=e),s=e=>{let i=o(e);return i.length?i.reduce((e,i)=>e+i,0)/i.length:null},d=e=>o(e).reduce((e,i)=>e+i,0),c=i.filter(e=>null!=e.delta&&e.delta<-n).length,g=i.filter(e=>null!=e.delta&&e.delta>n).length,u=i.length-c-g,m=i.reduce((e,i)=>e+(null!=i.margin&&null!=i.volume?i.margin*i.volume:0),0),p=t.at(-1),_=t.length>7?t[t.length-8]:t[0],y=p&&_&&_.marginPool?(p.marginPool-_.marginPool)/_.marginPool*100:null,h=p&&_?p.egPrice-_.egPrice:null,E=new Map;for(let e of i){let i=E.get(e.site.region)??[];i.push(e),E.set(e.site.region,i)}let S=Array.from(E.entries()).map(([i,t])=>{let r=s(t.map(e=>e.margin))??0,a=s(t.map(e=>e.price))??0,n=s(t.map(e=>e.competitorAvg))??0,o=d(t.map(e=>e.volume)),c=t.reduce((e,i)=>e+(null!=i.margin&&null!=i.volume?i.margin*i.volume:0),0);return{region:i,label:(0,l.regionLabel)(e,i),sites:t.length,avgMargin:r,avgPrice:a,avgCompetitor:n,delta:a-n,volume:o,marginPool:c}}).sort((e,i)=>i.marginPool-e.marginPool),v=new Map;for(let e of i){let i=v.get(e.site.brand)??[];i.push(e),v.set(e.site.brand,i)}let $=Array.from(v.entries()).map(([e,i])=>({brand:e,sites:i.length,avgMargin:s(i.map(e=>e.margin))??0,volume:d(i.map(e=>e.volume)),marginPool:i.reduce((e,i)=>e+(null!=i.margin&&null!=i.volume?i.margin*i.volume:0),0)})).sort((e,i)=>i.marginPool-e.marginPool),N=o(i.map(e=>e.margin)),b=(()=>{if(!N.length)return[];let e=Math.min(...N),i=(Math.max(...N)-e)/8||1,t="USD"===r?"$":"£",a="GBP"===r?3:2,n=Array.from({length:8},(r,n)=>{let o=e+n*i,l=o+i;return{from:o,to:l,label:`${t}${o.toFixed(a)}`,count:0}});for(let t of N){let r=Math.floor((t-e)/i);r>=8&&(r=7),r<0&&(r=0),n[r].count+=1}return n})(),A=i.filter(e=>null!=e.elasticity&&null!=e.margin&&null!=e.volume&&null!=e.delta).map(i=>({siteId:i.site.siteId,name:i.site.name,region:(0,l.regionLabel)(e,i.site.region),elasticity:i.elasticity,margin:i.margin,volume:i.volume,delta:i.delta})),w=i.filter(e=>null!=e.margin&&null!=e.volume&&null!=e.price&&null!=e.delta).map(i=>({siteId:i.site.siteId,name:i.site.name,brand:i.site.brand,region:i.site.region,regionLabel:(0,l.regionLabel)(e,i.site.region),margin:i.margin,price:i.price,delta:i.delta,volume:i.volume,elasticity:i.elasticity,marginPool:i.margin*i.volume})).sort((e,i)=>i.marginPool-e.marginPool),f=t.map(e=>e.marginPool);return{country:e,currency:r,unit:a,kpis:{sites:i.length,avgMargin:s(i.map(e=>e.margin)),avgPrice:s(i.map(e=>e.price)),avgDelta:s(i.map(e=>e.delta)),totalVolume:d(i.map(e=>e.volume)),marginPool:m,cheaper:c,inLine:u,dearer:g,marginPoolWowPct:y,priceWow:h},trend:t,marginPoolSpark:f,positioning:[{label:"Cheaper",value:c},{label:"In line",value:u},{label:"Dearer",value:g}],regions:S,brands:$,marginHistogram:b,elasticity:A,topSites:w.slice(0,8),bottomSites:w.slice(-8).reverse()}}(0,r.cache)(async(e=60)=>{let[i,t,r,o,s,d]=await Promise.all([$("US"),$("UK"),_("US",e),_("UK",e),(0,a.pgQuery)(`SELECT to_char(sim_date, 'YYYY-MM-DD') AS sim_date, day_index
         FROM ${(0,n.APP)("sim_state")} WHERE id = 1`),(0,a.pgQuery)(`SELECT id, to_char(day, 'YYYY-MM-DD') AS day, day_index,
              scope, ref, kind, headline, detail, tone
         FROM ${(0,n.APP)("sim_events")}
        ORDER BY day_index DESC, id DESC
        LIMIT 24`)]),c=s[0],g=d.map(e=>({id:Number(e.id),day:String(e.day),dayIndex:Number(e.day_index),scope:e.scope,ref:e.ref??void 0,kind:e.kind,headline:e.headline,detail:e.detail??void 0,tone:e.tone})),u={},m={};for(let e of[...i.sites,...t.sites])u[e.site.siteId]={siteId:e.site.siteId,name:e.site.name,brand:e.site.brand,region:e.site.region,regionLabel:(0,l.regionLabel)(e.site.country,e.site.region),country:e.site.country},m[e.site.region]=(0,l.regionLabel)(e.site.country,e.site.region);return{simDate:c?String(c.sim_date):new Date().toISOString().slice(0,10),dayIndex:c?Number(c.day_index):0,countries:[y("US",i.sites,r),y("UK",t.sites,o)],events:g,siteIndex:u,regionLabels:m}});let A=(0,r.cache)(async(e=21)=>{let i=await (0,a.pgQuery)(`WITH recent AS (
         SELECT DISTINCT day
           FROM ${(0,n.APP)("price_history")}
          WHERE grade_id = 'regular' AND is_eg = true
          ORDER BY day DESC
          LIMIT $1
       )
       SELECT to_char(ph.day, 'YYYY-MM-DD') AS day,
              s.country, s.region, ph.site_id, ph.price
         FROM ${(0,n.APP)("price_history")} ph
         JOIN ${(0,n.APP)("sites")} s ON s.site_id = ph.site_id
        WHERE ph.grade_id = 'regular' AND ph.is_eg = true
          AND ph.day IN (SELECT day FROM recent)
        ORDER BY ph.day ASC`,[e]),t=[],r=new Set,o=new Map,l=(e,i,t)=>{let r=o.get(e);r||(r=new Map,o.set(e,r));let a=r.get(i)??{sum:0,n:0};a.sum+=t,a.n+=1,r.set(i,a)};for(let e of i){let i=e.day;r.has(i)||(r.add(i),t.push(i));let a=Number(e.price);l("network",i,a),l(e.country,i,a),l(`region:${e.region}`,i,a),l(`site:${e.site_id}`,i,a)}let s=new Map;for(let[e,i]of o){let r=t.map(e=>{let t=i.get(e);return t&&t.n?t.sum/t.n:null}).filter(e=>null!=e);r.length>1&&s.set(e,r)}return s});(0,r.cache)(async()=>{let[e,i,t,r,a,n]=await Promise.all([$("US"),$("UK"),N(),A(21),(0,o.getSimEvents)(12).catch(()=>[]),(0,o.getSimState)().catch(()=>null)]),s=[...e.sites,...i.sites],d=e=>"US"===e?.05:.02,c=e=>{let i=e.filter(e=>null!=e);return i.length?i.reduce((e,i)=>e+i,0)/i.length:null},g=(e,i)=>null==e?"—":`${"US"===i?"$":"£"}${e.toFixed("US"===i?2:3)}`,u=s.filter(e=>null!=e.delta&&e.delta<-d(e.site.country)),m=s.filter(e=>null!=e.delta&&e.delta>d(e.site.country)),p=c(e.sites.map(e=>e.margin)),_=c(i.sites.map(e=>e.margin)),y=t.filter(e=>"US"===e.country&&null!=e.avgMargin).sort((e,i)=>(i.avgMargin??0)-(e.avgMargin??0)),h=y[0],E=y[y.length-1],S=[...m].sort((e,i)=>(i.delta??0)-(e.delta??0))[0],v=[{tone:m.length>u.length?"watch":"good",eyebrow:"Network",metric:String(s.length),label:"Forecourts live",detail:`${e.sites.length} US \xb7 ${i.sites.length} UK \xb7 ${u.length} cheaper, ${m.length} dearer than rivals`,prompt:"Give me a network health summary: margins, and how many sites are cheaper vs dearer than rivals, with a chart.",spark:r.get("network")},{tone:"info",eyebrow:"Margin · US",metric:`${g(p,"US")}/gal`,label:"Avg US margin",detail:"Average per-gallon margin on regular grade across EG America banners.",prompt:"Compare average margins across US regions and show the top and bottom performers in a bar chart.",spark:r.get("US")},{tone:"info",eyebrow:"Margin · UK",metric:`${g(_,"UK")}/L`,label:"Avg UK margin",detail:"Average per-litre margin on regular grade across UK forecourts.",prompt:"How do UK regions compare on margin? Show a ranked breakdown with a chart.",spark:r.get("UK")}],b=new Map(s.map(e=>[e.site.siteId,e])),w=n?.dayIndex??0,f=[],P={price_war:{eyebrow:"Price war",tone:"bad",base:70},outage:{eyebrow:"Supply shock",tone:"bad",base:60},crude_spike:{eyebrow:"Cost spike",tone:"watch",base:55},demand_swing:{eyebrow:"Demand move",tone:"watch",base:45}},M=new Set;for(let e of a){let i=P[e.kind];if(!i)continue;let t=w-e.dayIndex;if(t>10)continue;let a=`event:${e.kind}:${e.ref??"network"}`;if(M.has(a))continue;M.add(a);let n=r.get("network"),o=`What happened with the ${e.headline.toLowerCase()} and what should we do about it?`,s=e.headline;if("site"===e.scope&&e.ref){let i=b.get(e.ref);i&&(n=r.get(`site:${e.ref}`)??n,s=i.site.name,o=`${e.headline} at ${i.site.name} — what's the pricing and margin impact, and what should we do?`)}else"region"===e.scope&&e.ref&&(n=r.get(`region:${e.ref}`)??n,s=(0,l.regionLabel)("US",e.ref),o=`${e.headline} — how is it affecting our sites there and how should we respond?`);f.push({tone:i.tone,eyebrow:i.eyebrow,metric:"bad"===e.tone?"Alert":"Watch",label:s,detail:e.detail??e.headline,prompt:o,spark:n,dedupe:a,score:i.base-3*t})}if(m.length>0&&f.push({tone:"bad",eyebrow:"Pricing risk",metric:`${m.length} sites`,label:"Priced above local rivals",detail:"These sites risk losing volume. See the margin impact of matching competition.",prompt:"What is the gain or loss if we match competition on the sites we are currently priced above rivals? Quantify the volume and daily margin impact per site.",spark:r.get("network"),dedupe:"pricing-risk",score:30+Math.min(25,3*m.length)}),S&&null!=S.delta&&f.push({tone:"watch",eyebrow:"Site to review",metric:`+${g(S.delta,S.site.country)}`,label:S.site.name,detail:`Priced furthest above its local competitor set in ${(0,l.regionLabel)(S.site.country,S.site.region)}.`,prompt:`Optimise the regular price for ${S.site.name}`,spark:r.get(`site:${S.site.siteId}`),dedupe:`site:${S.site.siteId}`,score:28+Math.min(24,S.delta/d(S.site.country)*6)}),h&&f.push({tone:"good",eyebrow:"Strongest region",metric:`${g(h.avgMargin,"US")}/gal`,label:(0,l.regionLabel)("US",h.region),detail:`Best average margin of any US region across ${h.sites} site(s).`,prompt:`Why is ${(0,l.regionLabel)("US",h.region)} our strongest US region on margin? Break it down by site.`,spark:r.get(`region:${h.region}`),dedupe:`region:${h.region}`,score:22}),E&&E!==h){let e=h&&null!=E.avgMargin&&null!=h.avgMargin?h.avgMargin-E.avgMargin:0;f.push({tone:"watch",eyebrow:"Weakest region",metric:`${g(E.avgMargin,"US")}/gal`,label:(0,l.regionLabel)("US",E.region),detail:"Lowest average margin of any US region — worth a pricing review.",prompt:`${(0,l.regionLabel)("US",E.region)} has our weakest US margins — what's driving it and what should we do?`,spark:r.get(`region:${E.region}`),dedupe:`region:${E.region}`,score:26+Math.min(20,40*e)})}let O=s.filter(e=>{let i;return null!=e.margin&&e.margin<-(i=e.site.country,"US"===i?.03:.02)});if(O.length>0){let e=[...O].sort((e,i)=>(e.margin??0)-(i.margin??0))[0];f.push({tone:"bad",eyebrow:"Margin alert",metric:`${O.length} site${O.length>1?"s":""}`,label:"Selling below cost",detail:`${O.length} site(s) are priced under unit cost right now — led by ${e.site.name}. Immediate review.`,prompt:"Which sites are selling below unit cost and by how much? What price moves restore a positive margin without losing too much volume?",spark:r.get(`site:${e.site.siteId}`),dedupe:"below-cost",score:90})}let R=new Set,D=f.sort((e,i)=>i.score-e.score).filter(e=>!R.has(e.dedupe)&&(R.add(e.dedupe),!0)).slice(0,4).map(({score:e,dedupe:i,...t})=>t);return{snapshot:v,focus:D}});let w=(0,r.cache)(async()=>{let e=await (0,o.getSimState)(),[i,t,r]=await Promise.all([(0,a.pgQuery)(`SELECT day_index, to_char(day, 'YYYY-MM-DD') AS day, country,
              volume, revenue, margin_pool, avg_margin, avg_eg_price, avg_comp_price,
              cheaper, in_line, dearer, cf_volume, cf_margin_pool
         FROM ${(0,n.APP)("sim_daily_perf")}
        ORDER BY day_index ASC`),(0,a.pgQuery)(`SELECT id, day_index, to_char(day, 'YYYY-MM-DD') AS day, site_id, grade_id,
              source, old_price, new_price, unit_cost, projected_margin,
              projected_volume, confidence
         FROM ${(0,n.APP)("sim_interventions")}
        ORDER BY day_index DESC, id DESC
        LIMIT 60`),(0,a.pgQuery)(`SELECT site_id, name, brand, country, region FROM ${(0,n.APP)("sites")}`)]),s=new Map;for(let e of r)s.set(e.site_id,{name:e.name,brand:e.brand,country:e.country,regionLabel:(0,l.regionLabel)(e.country,e.region)});let d=new Map;for(let e of i){let i=e.country,t=d.get(i)??[],r=Number(e.margin_pool),a=Number(e.cf_margin_pool);t.push({dayIndex:Number(e.day_index),day:String(e.day),volume:Number(e.volume),revenue:Number(e.revenue),marginPool:r,avgMargin:Number(e.avg_margin),avgEgPrice:Number(e.avg_eg_price),avgCompPrice:null==e.avg_comp_price?null:Number(e.avg_comp_price),cheaper:Number(e.cheaper),inLine:Number(e.in_line),dearer:Number(e.dearer),cfVolume:Number(e.cf_volume),cfMarginPool:a,upliftMarginPool:r-a}),d.set(i,t)}let c=["US","UK"].map(e=>{let i,t,r,a,n,o,l=d.get(e)??[];return{country:e,currency:"US"===e?"USD":"GBP",unit:"US"===e?"gal":"L",totals:(i=l.reduce((e,i)=>e+i.marginPool,0),t=l.reduce((e,i)=>e+i.cfMarginPool,0),r=l.reduce((e,i)=>e+i.volume,0),a=l.reduce((e,i)=>e+i.revenue,0),n=i-t,o=l[l.length-1],{days:l.length,cumMarginPool:i,cumCfMarginPool:t,cumUplift:n,upliftPct:t>0?n/t*100:null,cumVolume:r,cumRevenue:a,avgMargin:r>0?i/r:0,cheaper:o?.cheaper??0,inLine:o?.inLine??0,dearer:o?.dearer??0}),trend:l}}),g=await Promise.all(t.map(async i=>{let t=i.site_id,r=i.grade_id,o=s.get(t),l=null==i.old_price?null:Number(i.old_price),d=null==i.new_price?null:Number(i.new_price),c=null==i.unit_cost?null:Number(i.unit_cost),g=Number(i.day_index),u=String(i.day),m=await (0,a.pgQuery)(`WITH eg AS (
            SELECT day, price FROM ${(0,n.APP)("price_history")}
             WHERE site_id = $1 AND grade_id = $2 AND is_eg = true AND series = 'EG'
               AND day BETWEEN $3::date - $5::int AND $3::date + $5::int
         ),
         dc AS (
            SELECT day, price AS unit_cost FROM ${(0,n.APP)("price_history")}
             WHERE site_id = $1 AND grade_id = $2 AND series = $4
               AND day BETWEEN $3::date - $5::int AND $3::date + $5::int
         )
         SELECT to_char(eg.day, 'YYYY-MM-DD') AS day,
                (eg.price - COALESCE(dc.unit_cost, 0)) AS margin,
                (dc.unit_cost IS NOT NULL) AS has_cost
           FROM eg LEFT JOIN dc ON dc.day = eg.day
          ORDER BY eg.day ASC`,[t,r,u,n.COST_SERIES,7]),p=0,_=0,y=0,h=0;for(let e of m){if(!e.has_cost)continue;let i=String(e.day),t=Number(e.margin);i<u?(p+=t,_+=1):i>u&&(y+=t,h+=1)}let E=_>0&&h>0?y/h-p/_:null,S=e.dayIndex-g;return{id:Number(i.id),dayIndex:g,day:u,siteId:t,siteName:o?.name??t,brand:o?.brand??"",regionLabel:o?.regionLabel??"",country:o?.country??"US",gradeId:r,source:i.source,oldPrice:l,newPrice:d,unitCost:c,projectedMargin:null==i.projected_margin?null:Number(i.projected_margin),appliedMargin:null!=d&&null!=c?d-c:null,realizedMarginDelta:E,priceDelta:null!=d&&null!=l?d-l:null,daysSince:S,helped:null==E?null:E>=0}}));return{dayIndex:e.dayIndex,baselineDate:e.baselineDate,countries:c,interventions:g}});e.s(["getMapData",0,$,"getNetworkContext",0,b,"getPerformance",0,w,"getPriceHistory",0,v,"getSiteSnapshot",0,S]),t()}catch(e){t(e)}},!1)];

//# sourceMappingURL=src_lib_0cl8jo6._.js.map