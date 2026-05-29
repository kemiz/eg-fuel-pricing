module.exports=[2624,e=>e.a(async(t,a)=>{try{var r=e.i(88312),n=e.i(93520),i=e.i(63378),o=t([i]);[i]=o.then?(await o)():o;let d=`You are "Ask EG", the conversational data analyst for the EG Group fuel-pricing platform. You answer questions about the EG forecourt network (US EG America banners and UK sites): margins, competitor positioning, demand, and price recommendations.

STYLE
- Be concise and decision-oriented. Lead with the answer, then the supporting detail.
- Use GitHub-flavoured Markdown: short paragraphs, **bold** key numbers, bullet lists, and tables where a comparison helps.
- US prices are USD per gallon (2dp); UK prices are GBP per litre (3dp).

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

FOLLOW-UPS — at the VERY END of every response, add a single HTML comment listing 3 short, specific follow-up questions the user is likely to want next (drill deeper, take an action, or look at a related angle). Keep each label under ~7 words. This comment is hidden from the user and rendered as clickable buttons. Format EXACTLY:
<!-- FOLLOWUPS: ["Break Florida down by site", "Which sites should we reprice?", "Compare to last week"] -->
Make them flow naturally from what you just answered (e.g. if you showed dearer sites, suggest "Match competition on these" or "Optimise the worst offender").

Never invent figures: use the provided NETWORK SNAPSHOT and SITE DETAIL context. If something isn't in context, say so briefly.`;async function s(e){let t,a;try{t=await e.json()}catch{return l({error:"Invalid JSON"},400)}let o=(t.messages??[]).filter(e=>e.content&&("user"===e.role||"assistant"===e.role));if(!o.length)return l({error:"messages required"},400);let s=await (0,i.getNetworkContext)(),c="";if(t.siteId){let e=await (0,i.getSiteSnapshot)(t.siteId);if(e){let a=["regular","premium","diesel"].map(t=>{let a=e.costs.find(e=>e.gradeId===t);return a?`${t}: cost ${(a.wholesaleCost+a.deliveryCost).toFixed(3)}`:null}).filter(Boolean).join("; ");c=`

SITE DETAIL — ${e.site.name} (${e.site.brand}, ${e.site.region}, ${e.site.country}); id=${e.site.siteId}
Costs: ${a}
Competitors: ${e.competitors.slice(0,8).map(e=>`${e.competitorName} ${e.gradeId} ${e.price}`).join(", ")}`;let r=await (0,i.getPriceHistory)(t.siteId,"regular",90);if(r&&r.days.length>1){let e="GBP"===r.currency?3:2,t=r.series.find(e=>e.isEg),a=r.series.filter(e=>!e.isEg),n=[];for(let e=r.days.length-1;e>=0;e-=7)n.unshift(e);let i=n.map(n=>{let i=-(r.days.length-1-n)/7,o=t?.points[n]?.price,s=a.map(e=>e.points[n]?.price).filter(e=>Number.isFinite(e)),l=s.length?s.reduce((e,t)=>e+t,0)/s.length:null;return null!=o&&Number.isFinite(o)?`wk ${Math.round(i)}: EG ${o.toFixed(e)}${null!=l?` | comp_avg ${l.toFixed(e)}`:""}`:null}).filter(Boolean).join("\n");c+=`

PRICE HISTORY (regular, weekly, ${r.currency}; wk 0 = today):
${i}`}}}let u=[{role:"system",content:`${d}

${s.text}${c}`},...o.map(e=>({role:e.role,content:e.content}))];try{a=await (0,r.chatStreamResponse)(u,{endpoint:(0,n.endpointFor)("flagship"),temperature:.3,maxTokens:1600})}catch(e){return l({error:e.message},502)}if(!a.ok||!a.body){let e=await a.text().catch(()=>"");return l({error:`Model Serving ${a.status}: ${e.slice(0,300)}`},502)}let p=new TextEncoder,h=new TextDecoder,m=a.body.getReader(),g=new ReadableStream({async start(e){let t=t=>e.enqueue(p.encode(`data: ${JSON.stringify(t)}

`)),a="";try{for(;;){let{value:e,done:r}=await m.read();if(r)break;let n=(a+=h.decode(e,{stream:!0})).split("\n\n");for(let e of(a=n.pop()??"",n)){let a=e.trim();if(!a.startsWith("data:"))continue;let r=a.slice(5).trim();if("[DONE]"!==r)try{let e=JSON.parse(r),a=e?.choices?.[0]?.delta?.content??e?.choices?.[0]?.message?.content??"";a&&t({delta:a})}catch{}}}}catch(e){t({error:e.message})}finally{e.enqueue(p.encode("data: [DONE]\n\n")),e.close()}}});return new Response(g,{headers:{"Content-Type":"text/event-stream","Cache-Control":"no-cache",Connection:"keep-alive"}})}function l(e,t){return new Response(JSON.stringify(e),{status:t,headers:{"Content-Type":"application/json"}})}e.s(["POST",0,s,"dynamic",0,"force-dynamic","maxDuration",0,300,"runtime",0,"nodejs"]),a()}catch(e){a(e)}},!1),89068,e=>{"use strict";var t=e.i(47909),a=e.i(74017),r=e.i(96250),n=e.i(59756),i=e.i(61916),o=e.i(74677),s=e.i(69741),l=e.i(16795),d=e.i(87718),c=e.i(95169),u=e.i(47587),p=e.i(66012),h=e.i(70101),m=e.i(74838),g=e.i(10372),f=e.i(93695);e.i(52474);var w=e.i(220);let y=new t.AppRouteRouteModule({definition:{kind:a.RouteKind.APP_ROUTE,page:"/api/assistant/route",pathname:"/api/assistant",filename:"route",bundlePath:""},distDir:".next",relativeProjectDir:"",resolvedPagePath:"[project]/src/app/api/assistant/route.ts",nextConfigOutput:"standalone",userland:()=>e.r(2624),...{}}),{workAsyncStorage:v,workUnitAsyncStorage:E,serverHooks:R}=y;async function b(e,t,r){r.requestMeta&&(0,n.setRequestMeta)(e,r.requestMeta),y.isDev&&(0,n.addRequestMeta)(e,"devRequestTimingInternalsEnd",process.hrtime.bigint());let v="/api/assistant/route";v=v.replace(/\/index$/,"")||"/";let E=await y.prepare(e,t,{srcPage:v,multiZoneDraftMode:!1});if(!E)return t.statusCode=400,t.end("Bad Request"),null==r.waitUntil||r.waitUntil.call(r,Promise.resolve()),null;let{buildId:R,params:b,nextConfig:T,parsedUrl:C,isDraftMode:N,prerenderManifest:S,routerServerContext:k,isOnDemandRevalidate:A,revalidateOnlyGenerated:x,resolvedPathname:O,clientReferenceManifest:I,serverActionsManifest:P}=E,$=(0,s.normalizeAppPath)(v),U=!!(S.dynamicRoutes[$]||S.routes[O]),D=async()=>((null==k?void 0:k.render404)?await k.render404(e,t,C,!1):t.end("This page could not be found"),null);if(U&&!N){let e=!!S.routes[O],t=S.dynamicRoutes[$];if(t&&!1===t.fallback&&!e){if(T.adapterPath)return await D();throw new f.NoFallbackError}}let L=null;!U||y.isDev||N||(L="/index"===(L=O)?"/":L);let H=!0===y.isDev||!U,q=U&&!H;P&&I&&(0,o.setManifestsSingleton)({page:v,clientReferenceManifest:I,serverActionsManifest:P});let M=e.method||"GET",_=(0,i.getTracer)(),F=_.getActiveScopeSpan(),G=!!(null==k?void 0:k.isWrappedByNextServer),W=!!(0,n.getRequestMeta)(e,"minimalMode"),j=(0,n.getRequestMeta)(e,"incrementalCache")||await y.getIncrementalCache(e,T,S,W);null==j||j.resetRequestCache(),globalThis.__incrementalCache=j;let K={params:b,previewProps:S.preview,renderOpts:{experimental:{authInterrupts:!!T.experimental.authInterrupts,useCacheTimeout:T.experimental.useCacheTimeout},cacheComponents:!!T.cacheComponents,supportsDynamicResponse:H,incrementalCache:j,cacheLifeProfiles:T.cacheLife,staticPageGenerationTimeout:T.staticPageGenerationTimeout,waitUntil:r.waitUntil,onClose:e=>{t.on("close",e)},onAfterTaskError:void 0,onInstrumentationRequestError:(t,a,r,n)=>y.onRequestError(e,t,r,n,k)},sharedContext:{buildId:R}},B=new l.NodeNextRequest(e),Y=new l.NodeNextResponse(t),V=d.NextRequestAdapter.fromNodeNextRequest(B,(0,d.signalFromNodeResponse)(t));try{let n,o=async e=>y.handle(V,K).finally(()=>{if(!e)return;e.setAttributes({"http.status_code":t.statusCode,"next.rsc":!1});let a=_.getRootSpanAttributes();if(!a)return;if(a.get("next.span_type")!==c.BaseServerSpan.handleRequest)return void console.warn(`Unexpected root span type '${a.get("next.span_type")}'. Please report this Next.js issue https://github.com/vercel/next.js`);let r=a.get("next.route")||$,i=`${M} ${r}`;e.setAttributes({"next.route":r,"http.route":r,"next.span_name":i}),e.updateName(i),n&&n!==e&&(n.setAttribute("http.route",r),n.updateName(i))}),s=async n=>{var i,s;let l=async({previousCacheEntry:a})=>{try{if(!W&&A&&x&&!a)return t.statusCode=404,t.setHeader("x-nextjs-cache","REVALIDATED"),t.end("This page could not be found"),null;let i=await o(n);e.fetchMetrics=K.renderOpts.fetchMetrics;let s=K.renderOpts.pendingWaitUntil;s&&r.waitUntil&&(r.waitUntil(s),s=void 0);let l=K.renderOpts.collectedTags;if(!U)return await (0,p.sendResponse)(B,Y,i,s),null;{let e=await i.blob(),t=(0,h.toNodeOutgoingHttpHeaders)(i.headers);l&&(t[g.NEXT_CACHE_TAGS_HEADER]=l),!t["content-type"]&&e.type&&(t["content-type"]=e.type);let a=void 0!==K.renderOpts.collectedRevalidate&&!(K.renderOpts.collectedRevalidate>=g.INFINITE_CACHE)&&K.renderOpts.collectedRevalidate,r=void 0===K.renderOpts.collectedExpire||K.renderOpts.collectedExpire>=g.INFINITE_CACHE?!1!==a&&a>0?T.expireTime:void 0:K.renderOpts.collectedExpire;return{value:{kind:w.CachedRouteKind.APP_ROUTE,status:i.status,body:Buffer.from(await e.arrayBuffer()),headers:t},cacheControl:{revalidate:a,expire:r}}}}catch(t){throw(null==a?void 0:a.isStale)&&await y.onRequestError(e,t,{routerKind:"App Router",routePath:v,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:q,isOnDemandRevalidate:A})},!1,k),t}},d=await y.handleResponse({req:e,nextConfig:T,cacheKey:L,routeKind:a.RouteKind.APP_ROUTE,isFallback:!1,prerenderManifest:S,isRoutePPREnabled:!1,isOnDemandRevalidate:A,revalidateOnlyGenerated:x,responseGenerator:l,waitUntil:r.waitUntil,isMinimalMode:W});if(!U)return null;if((null==d||null==(i=d.value)?void 0:i.kind)!==w.CachedRouteKind.APP_ROUTE)throw Object.defineProperty(Error(`Invariant: app-route received invalid cache entry ${null==d||null==(s=d.value)?void 0:s.kind}`),"__NEXT_ERROR_CODE",{value:"E701",enumerable:!1,configurable:!0});W||t.setHeader("x-nextjs-cache",A?"REVALIDATED":d.isMiss?"MISS":d.isStale?"STALE":"HIT"),N&&t.setHeader("Cache-Control","private, no-cache, no-store, max-age=0, must-revalidate");let c=(0,h.fromNodeOutgoingHttpHeaders)(d.value.headers);return W&&U||c.delete(g.NEXT_CACHE_TAGS_HEADER),!d.cacheControl||t.getHeader("Cache-Control")||c.get("Cache-Control")||c.set("Cache-Control",(0,m.getCacheControlHeader)(d.cacheControl)),await (0,p.sendResponse)(B,Y,new Response(d.value.body,{headers:c,status:d.value.status||200})),null};G&&F?await s(F):(n=_.getActiveScopeSpan(),await _.withPropagatedContext(e.headers,()=>_.trace(c.BaseServerSpan.handleRequest,{spanName:`${M} ${v}`,kind:i.SpanKind.SERVER,attributes:{"http.method":M,"http.target":e.url}},s),void 0,!G))}catch(t){if(t instanceof f.NoFallbackError||await y.onRequestError(e,t,{routerKind:"App Router",routePath:$,routeType:"route",revalidateReason:(0,u.getRevalidateReason)({isStaticGeneration:q,isOnDemandRevalidate:A})},!1,k),U)throw t;return await (0,p.sendResponse)(B,Y,new Response(null,{status:500})),null}}e.s(["handler",0,b,"patchFetch",0,function(){return(0,r.patchFetch)({workAsyncStorage:v,workUnitAsyncStorage:E})},"routeModule",0,y,"serverHooks",0,R,"workAsyncStorage",0,v,"workUnitAsyncStorage",0,E])}];

//# sourceMappingURL=_1al-du5._.js.map