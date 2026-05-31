module.exports=[2624,e=>e.a(async(t,a)=>{try{var r=e.i(88312),n=e.i(93520),i=e.i(63378),o=e.i(72874),s=t([i,o]);[i,o]=s.then?(await s)():s;let c=`You are "Ask EG", the conversational data analyst for the EG Group fuel-pricing platform. You answer questions about the EG forecourt network (US EG America banners and UK sites): margins, competitor positioning, demand, and price recommendations.

STYLE
- Be concise and decision-oriented. Lead with the answer, then the supporting detail.
- Use GitHub-flavoured Markdown: short paragraphs, **bold** key numbers, bullet lists, and tables where a comparison helps.
- US prices are USD per gallon (2dp); UK prices are GBP per litre (3dp).

DATE / "TODAY": The CURRENT DATE line in the context gives today's date — treat THAT as "today". All "now/today/this week/recently/latest" references, and the PRICE HISTORY (where wk 0 = today), are relative to that date. Use it for every time reference and never substitute a different date. Never mention simulations, models, test data, or that this is a demo — speak as the live EG pricing platform operating on real forecourt data.

LENGTH DISCIPLINE (HARD RULES — these OVERRIDE any user request to list "all"/"every" item) — keep every answer complete and self-contained; never let a table or sentence get cut off.
- Show at most 8 rows TOTAL across all tables in a response. Even if the user says "show every/all sites", show the 8 most relevant (e.g. biggest margin delta) and add one line like "+ 14 more — ask to see a specific region" instead of listing them all. Never exceed 8 rows; never split into multiple long tables to get around this.
- Use ONE focused table per answer. Put secondary detail in a short bullet summary or a \`chart:bar\`, not a second table.
- Keep the whole response under ~450 words so it always finishes, INCLUDING the closing FOLLOWUPS comment, which is mandatory and must always be the last thing you output. Tighten prose, drop redundant columns, and round numbers to make room.
- If you sense you are running long, stop adding rows/detail and wrap up with the FOLLOWUPS comment rather than truncating mid-table.

DATA YOU HAVE — do not claim you lack it:
- Per-site REGULAR-grade modelled daily VOLUME (throughput) and price ELASTICITY of demand.
- A pre-computed "MATCH COMPETITION" scenario in the context: for every site currently priced above rivals, it gives current vs projected daily volume and daily margin if we drop price to the competitor average, plus the net margin impact. USE these numbers directly to answer "what's the gain if we match competition" — quantify the volume uplift and the daily margin delta, and call out that matching a higher price downward trades unit margin for volume (net effect depends on elasticity). Sum per-site margin deltas for a network figure.
- Daily figures annualise as x365 if the user wants an annual number (state the assumption).
- When a site is in focus, a PRICE HISTORY block gives ~90 days of weekly-sampled regular-grade prices for EG and the competitor average. Use it to answer "how have prices moved / trended", quote the start→now change and EG's gap to rivals over time, and emit a \`chart:trend\` of the EG series (label by week, e.g. "wk -8") when a trend question is asked.

INLINE VISUALS — embed these fenced blocks directly in your answer wherever a chart or callout makes the point clearer. They render as live widgets.
- Horizontal bar chart (\`Label | value | displayValue | sentiment\`; sentiment optional = good|bad|neutral):
\`\`\`chart:bar
Florida | 0.46 | $0.46 | good
Colorado | 0.41 | $0.41 | neutral
\`\`\`
- Donut/share chart (same row format):
\`\`\`chart:donut
Cheaper than rivals | 38
In line | 12
Dearer | 21
\`\`\`
- Trend/sparkline (\`Label | value\` rows, or a bare list of numbers):
\`\`\`chart:trend
Mon | 3.31
Tue | 3.34
Wed | 3.29
\`\`\`
- Metric tiles (\`Label | value | sentiment\`):
\`\`\`chart:metrics
Avg margin (US) | $0.43 | good
Sites dearer | 21 | bad
\`\`\`
- Callout card (JSON):
\`\`\`card:alert
{"title": "12 sites priced above guardrail", "body": "Mostly North West UK — review compliance.", "tone": "bad"}
\`\`\`
- KPI card (JSON):
\`\`\`card:metric
{"label": "Network sites", "value": "71", "delta": "+9 vs last week", "sentiment": "good"}
\`\`\`

DRILL-DOWN LINKS — make site and region names clickable so the user can jump straight to them:
- A site: [Cumberland Farms Orlando](site:us-fl-cumberlandfarms-4)
- A region: [Florida](region:FL) or [North West](region:North%20West)
Only use site ids that appear in the provided NETWORK context. Prefer linking the first mention of any site or region.

ALWAYS ANSWER THE QUESTION using the data you have. The PER-SITE DETAIL table lets you break any region or brand down by site, rank sites, and explain WHY a region's margin is high or low (e.g. "New Mexico is strongest because its 3 sites carry $0.59-$0.61 margins, well above the US average, while pricing only fractionally above rivals"). When asked to "break it down by site", produce a table of the sites in that region with price, margin, vs-competitor and volume, plus a short explanation and a chart.

ONLY mention the "Run pricing agents" action when the user explicitly asks you to GENERATE A BRAND-NEW recommended price for a specific site (verbs like "optimise this site", "recommend a new price", "what price should we set"). In that case: give your own quick data-driven view first, THEN add one short line that they can click "Run pricing agents" on the site page for the full four-agent recommendation. Do NOT deflect analytical, comparison, or "why/which/how" questions to that action — answer them directly.

APPLYING / CHANGING PRICES — the platform CAN apply prices to the forecourt directly. A request to set or apply a SPECIFIC price for a site (e.g. "apply $3.38 to Nashville", "set regular to 1.45 at <site>") is handled automatically — the price is committed and an applied-confirmation card is shown to the user; you do NOT need to (and should not) describe how to do it manually or mention any "Set EG price" card. If the user instead asks WHAT price to set (advice, not a specific number), give your data-driven view and suggest a price; they can then say "apply $X" to commit it. Never claim you lack write access, and never refer to a "simulation" or "simulated day" — applied prices go live immediately.

FOLLOW-UPS — at the VERY END of every response, add a single HTML comment listing 3 short, specific follow-up questions the user is likely to want next (drill deeper, take an action, or look at a related angle). Keep each label under ~7 words. This comment is hidden from the user and rendered as clickable buttons. Format EXACTLY:
<!-- FOLLOWUPS: ["Break Florida down by site", "Which sites should we reprice?", "Compare to last week"] -->
Make them flow naturally from what you just answered (e.g. if you showed dearer sites, suggest "Match competition on these" or "Optimise the worst offender").

Never invent figures: use the provided NETWORK SNAPSHOT and SITE DETAIL context. If something isn't in context, say so briefly.`;async function l(e){let t,a;try{t=await e.json()}catch{return d({error:"Invalid JSON"},400)}let s=(t.messages??[]).filter(e=>e.content&&("user"===e.role||"assistant"===e.role));if(!s.length)return d({error:"messages required"},400);let[l,u,p]=await Promise.all([(0,i.getNetworkContext)(),(0,o.getSimState)().catch(()=>null),(0,i.getPerformance)().catch(()=>null)]),h="";if(u){let e=new Date(`${u.simDate}T00:00:00Z`).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric",timeZone:"UTC"});h=`CURRENT DATE — today is ${e} (${u.simDate}). Treat this as "today" for all time references.

`}let m="";if(p&&p.dayIndex>0){let e=(e,t)=>{let a=Math.abs(e),r=a>=1e6?`${(a/1e6).toFixed(2)}M`:a>=1e3?`${(a/1e3).toFixed(0)}k`:a.toFixed(0);return`${e<0?"−":""}${"USD"===t?"$":"£"}${r}`},t=p.countries.filter(e=>e.totals.days>0).map(t=>{let a=t.totals,r=null!=a.upliftPct?` (${a.cumUplift>=0?"+":"−"}${Math.abs(a.upliftPct).toFixed(1)}%)`:"";return`${t.country}: cumulative margin pool ${e(a.cumMarginPool,t.currency)} over ${a.days}d; uplift vs holding baseline prices flat ${e(a.cumUplift,t.currency)}${r}; run avg margin ${"USD"===t.currency?"$":"£"}${a.avgMargin.toFixed("GBP"===t.currency?3:2)}/${t.unit}`}).join("\n"),a=p.interventions.filter(e=>null!=e.helped),r=a.filter(e=>e.helped).length,n=p.interventions.slice(0,6).map(e=>{let t="US"===e.country?"$":"£",a="US"===e.country?2:3,r=null==e.realizedMarginDelta?"measuring":`${e.realizedMarginDelta>=0?"improved":"hurt"} margin by ${t}${Math.abs(e.realizedMarginDelta).toFixed(a)}/unit`,n=null!=e.newPrice?`${t}${e.newPrice.toFixed(a)}`:"?";return`- ${e.siteName} (${e.regionLabel}), ${e.source}, set ${n} → ${r}`}).join("\n");m=`PERFORMANCE (tracking period to date, ${p.dayIndex} days):
${t}${a.length?`
Applied price changes: ${r}/${a.length} measured changes improved per-unit margin.`:""}${n?`
Recent applied changes:
${n}`:""}

The UPLIFT is the extra fuel margin vs holding starting prices flat — i.e. the value the active pricing has added. Use these real figures when asked how we're doing overall. Refer to the period as "since we started tracking" or by date, never as a "simulation".

`}let g="";if(t.siteId){let e=await (0,i.getSiteSnapshot)(t.siteId);if(e){let a=["regular","premium","diesel"].map(t=>{let a=e.costs.find(e=>e.gradeId===t);return a?`${t}: cost ${(a.wholesaleCost+a.deliveryCost).toFixed(3)}`:null}).filter(Boolean).join("; ");g=`

SITE DETAIL — ${e.site.name} (${e.site.brand}, ${e.site.region}, ${e.site.country}); id=${e.site.siteId}
Costs: ${a}
Competitors: ${e.competitors.slice(0,8).map(e=>`${e.competitorName} ${e.gradeId} ${e.price}`).join(", ")}`;let r=await (0,i.getPriceHistory)(t.siteId,"regular",90);if(r&&r.days.length>1){let e="GBP"===r.currency?3:2,t=r.series.find(e=>e.isEg),a=r.series.filter(e=>!e.isEg),n=[];for(let e=r.days.length-1;e>=0;e-=7)n.unshift(e);let i=n.map(n=>{let i=-(r.days.length-1-n)/7,o=t?.points[n]?.price,s=a.map(e=>e.points[n]?.price).filter(e=>Number.isFinite(e)),l=s.length?s.reduce((e,t)=>e+t,0)/s.length:null;return null!=o&&Number.isFinite(o)?`wk ${Math.round(i)}: EG ${o.toFixed(e)}${null!=l?` | comp_avg ${l.toFixed(e)}`:""}`:null}).filter(Boolean).join("\n");g+=`

PRICE HISTORY (regular, weekly, ${r.currency}; wk 0 = today):
${i}`}}}let f=[{role:"system",content:`${c}

${h}${m}${l.text}${g}`},...s.map(e=>({role:e.role,content:e.content}))];try{a=await (0,r.chatStreamResponse)(f,{endpoint:(0,n.endpointFor)("flagship"),temperature:.3,maxTokens:4e3})}catch(e){return d({error:e.message},502)}if(!a.ok||!a.body){let e=await a.text().catch(()=>"");return d({error:`Model Serving ${a.status}: ${e.slice(0,300)}`},502)}let y=new TextEncoder,w=new TextDecoder,v=a.body.getReader(),E=new ReadableStream({async start(e){let t=t=>e.enqueue(y.encode(`data: ${JSON.stringify(t)}

`)),a="";try{for(;;){let{value:e,done:r}=await v.read();if(r)break;let n=(a+=w.decode(e,{stream:!0})).split("\n\n");for(let e of(a=n.pop()??"",n)){let a=e.trim();if(!a.startsWith("data:"))continue;let r=a.slice(5).trim();if("[DONE]"!==r)try{let e=JSON.parse(r),a=e?.choices?.[0]?.delta?.content??e?.choices?.[0]?.message?.content??"";a&&t({delta:a})}catch{}}}}catch(e){t({error:e.message})}finally{e.enqueue(y.encode("data: [DONE]\n\n")),e.close()}}});return new Response(E,{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache",Connection:"keep-alive"}})}function d(e,t){return new Response(JSON.stringify(e),{status:t,headers:{"Content-Type":"application/json"}})}e.s(["POST",0,l,"dynamic",0,"force-dynamic","maxDuration",0,300,"runtime",0,"nodejs"]),a()}catch(e){a(e)}},!1),89068,e=>{"use strict";var t=e.i(47909),a=e.i(74017),r=e.i(96250),n=e.i(59756),i=e.i(61916),o=e.i(74677),s=e.i(69741),l=e.i(16795),d=e.i(87718),c=e.i(95169),u=e.i(47587),p=e.i(66012),h=e.i(70101),m=e.i(74838),g=e.i(10372),f=e.i(93695);e.i(52474);var y=e.i(220);let w=new t.AppRouteRouteModule({definition:{kind:a.RouteKind.APP_ROUTE,page:"/api/assistant/route",pathname:"/api/assistant",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/assistant/route.ts",nextConfigOutput:"standalone",userland:()=>e.r(2624),...{}}),{workAsyncStorage:v,workUnitAsyncStorage:E,serverHooks:b}=w;async function R(e,t,r){r.requestMeta&&(0,n.setRequestMeta)(e,r.requestMeta),w.isDev&&(0,n.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let v="/api/assistant/route";v=v.replace(/\/index$/,"")||"/";let E=await w.prepare(e,t,{srcPage:v,multiZoneDraftMode:!1});if(!E)return t.statusCode=400,t.end("Bad Request"),null==r.waitUntil||r.waitUntil.call(r,Promise.resolve()),null;let{buildId:b,params:R,nextConfig:T,parsedUrl:$,isDraftMode:N,prerenderManifest:S,routerServerContext:C,isOnDemandRevalidate:A,revalidateOnlyGenerated:k,resolvedPathname:x,clientReferenceManifest:I,serverActionsManifest:O}=E,P=(0,s.normalizeAppPath)(v),U=!!(S.dynamicRoutes[P]||S.routes[x]),D=async()=>((null==C?void 0:C.render404)?await C.render404(e,t,$,!1):t.end("This page could not be found"),null);if(U&&!N){let e=!!S.routes[x],t=S.dynamicRoutes[P];if(t&&!1===t.fallback&&!e){if(T.adapterPath)return await D();throw new f.NoFallbackError}}let L=null;!U||w.isDev||N||(L="/index"===(L=x)?"/":L);let M=!0===w.isDev||!U,H=U&&!M;O&&I&&(0,o.setManifestsSingleton)({page:v,clientReferenceManifest:I,serverActionsManifest:O});let F=e.method||"GET",q=(0,i.getTracer)(),G=q.getActiveScopeSpan(),_=!!(null==C?void 0:C.isWrappedByNextServer),W=!!(0,n.getRequestMeta)(e,"minimalMode"),j=(0,n.getRequestMeta)(e,"incrementalCache")||await w.getIncrementalCache(e,T,S,W);null==j||j.resetRequestCache(),globalThis.__incrementalCache=j;let K={params:R,previewProps:S.preview,renderOpts:{experimental:{authInterrupts:!!T.experimental.authInterrupts,useCacheTimeout:T.experimental.useCacheTimeout},cacheComponents:!!T.cacheComponents,supportsDynamicResponse:M,incrementalCache:j,cacheLifeProfiles:T.cacheLife,staticPageGenerationTimeout:T.staticPageGenerationTimeout,waitUntil:r.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,a,r,n)=>w.onRequestError(e,t,r,n,C)},sharedContext:{buildId:b}},B=new l.NodeNextRequest(e),Y=new l.NodeNextResponse(t),V=d.NextRequestAdapter.fromNodeNextRequest(B,(0,d.signalFromNodeResponse)(t));try{let n,o=async e=>w.handle(V,K).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let a=q.getRootSpanAttributes();if(!a)return;if(a.get("next.span_type")!==c.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${a.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let r=a.get("next.route")||P,i=`${F} ${r}`;e.setAttributes({"next.route":r,"http.route":r,"next.span_name":i}),e.updateName(i),n&&n!==e&&(n.setAttribute("http.route",r),n.updateName(i))}),s=async n=>{var i,s;let l=async({previousCacheEntry:a})=>{try{if(!W&&A&&k&&!a)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let i=await o(n);e.fetchMetrics=K.renderOpts.fetchMetrics;let s=K.renderOpts.pendingWaitUntil;s&&r.waitUntil&&(r.waitUntil(s),s=void 0);let l=K.renderOpts.collectedTags;if(!U)return await (0,p.sendResponse)(B,Y,i,s),null;{let e=await i.blob(),t=(0,h.toNodeOutgoingHttpHeaders)(i.headers);l&&(t[g.NEXT_CACHE_TAGS_HEADER]=l),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let a=void 0!==K.renderOpts.collectedRevalidate&&!(K.renderOpts.collectedRevalidate>=g.INFINITE_CACHE)&&K.renderOpts.collectedRevalidate,r=void 0===K.renderOpts.collectedExpire||K.renderOpts.collectedExpire>=g.INFINITE_CACHE?!1!==a&&a>0?T.expireTime:void 0:K.renderOpts.collectedExpire;return{value:{kind:y.CachedRouteKind.APP_ROUTE,status:i.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:a,expire:r}}}}catch(t){throw(null==a?void 0:a.isStale)&&await w.onRequestError(e,t,{routerKind:"App Router",routePath:v,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:H,isOnDemandRevalidate:A})},!1,C),t}},d=await w.handleResponse({req:e,nextConfig:T,cacheKey:L,routeKind:a.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:S,isRoutePPREnabled:!1,isOnDemandRevalidate:A,revalidateOnlyGenerated:k,responseGenerator:l,waitUntil:r.waitUntil,isMinimalMode:W});if(!U)return null;if((null==d||null==(i=d.value)?void 0:i.kind)!==y.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==d||null==(s=d.value)?void 0:s.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});W||t.setHeader("x-nextjs-cache",A?"REVALIDATED":d.isMiss?"MISS":d.isStale?"STALE":"HIT"),N&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let c=(0,h.fromNodeOutgoingHttpHeaders)(d.value.headers);return W&&U||c.delete(g.NEXT_CACHE_TAGS_HEADER),!d.cacheControl||t.getHeader("Cache-Control")||c.get("Cache-Control")||c.set("Cache-Control",(0,m.getCacheControlHeader)(d.cacheControl)),await (0,p.sendResponse)(B,Y,new Response(d.value.body,{headers:c,status:d.value.status||200})),null};_&&G?await s(G):(n=q.getActiveScopeSpan(),await q.withPropagatedContext(e.headers,()=>q.trace(c.BaseServerSpan.handleRequest,{spanName:`${F} ${v}`,kind:i.SpanKind.SERVER,attributes:{"http.method":F,"http.target":e.url}},s),void 0,!_))}catch(t){if(t instanceof f.NoFallbackError||await w.onRequestError(e,t,{routerKind:"App Router",routePath:P,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:H,isOnDemandRevalidate:A})},!1,C),U)throw t;return await (0,p.sendResponse)(B,Y,new Response(null,{status:500})),null}}e.s(["handler",0,R,"patchFetch",0,function(){return(0,r.patchFetch)({workAsyncStorage:v,workUnitAsyncStorage:E})},"routeModule",0,w,"serverHooks",0,b,"workAsyncStorage",0,v,"workUnitAsyncStorage",0,E])}];

//# sourceMappingURL=_1al-du5._.js.map