/* Zorion CRM · Ads tab
   Batches of ads shown the way people see them: an Instagram or Facebook Reels feed.
   Browse mode = phone preview + batch grid. Scroll mode = full screen, like the real app.
   Media is data-driven: an item with `video` plays a video (muted, autoplay, neighbours preloaded);
   an item with only `img` shows a still. Swap the dummy images for real files in ADS_DATA. */
(function(){
'use strict';

/* ---------- data (assets/crm-ads-data.js) ---------- */
var ADS_DATA = (window.ZADS_DATA || []).filter(function(b){ return b.items && b.items.length; });
var CAPTION = 'Primary text goes here.';
var MQ = window.matchMedia('(max-width:860px)');

/* ---------- small helpers ---------- */
function $(s, r){ return (r || document).querySelector(s); }
function $$(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
function ls(k, v){ try{ if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); }catch(_){ return null; } }
function num(n){ return n >= 1e4 ? (n/1e3).toFixed(1).replace(/\.0$/, '') + 'K' : n.toLocaleString('en-US'); }
function seed(b, v, k){ var s = 0, t = b + v + k; for (var i = 0; i < t.length; i++) s = (s * 31 + t.charCodeAt(i)) % 9973; return s; }
var AV = '/assets/logo-zorion-life-avatar.png';

/* ---------- icons (generic shapes, no brand marks) ---------- */
var P = {
  heart:'<path d="M12 20.3s-7.6-4.6-9.2-9.3C1.7 7.6 3.9 4.5 7.2 4.5c2 0 3.5 1.1 4.8 2.8 1.3-1.7 2.8-2.8 4.8-2.8 3.3 0 5.5 3.1 4.4 6.5-1.6 4.7-9.2 9.3-9.2 9.3Z"/>',
  bubble:'<path d="M20.5 12a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1-4.4A8.5 8.5 0 1 1 20.5 12Z"/>',
  plane:'<path d="M21.5 3.5 10.6 13.4"/><path d="M21.5 3.5 15 20.5l-4.4-7.1-7.1-4.4Z"/>',
  repost:'<path d="M17 2.5 20.5 6 17 9.5"/><path d="M3.5 11V9.5A3.5 3.5 0 0 1 7 6h13.5"/><path d="M7 21.5 3.5 18 7 14.5"/><path d="M20.5 13v1.5A3.5 3.5 0 0 1 17 18H3.5"/>',
  dots:'<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  cam:'<path d="M3.5 8.5A2.5 2.5 0 0 1 6 6h1.6l1.6-2h5.6l1.6 2H18a2.5 2.5 0 0 1 2.5 2.5v9A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5Z"/><circle cx="12" cy="13" r="3.6"/>',
  thumb:'<path d="M7.5 10.5v9.5"/><path d="M3.5 11.5a1 1 0 0 1 1-1h3v9.5h-3a1 1 0 0 1-1-1Z"/><path d="M7.5 10.5 11 3.5c1.6 0 2.7 1.3 2.4 2.9l-.6 3.1h5.4a2.2 2.2 0 0 1 2.1 2.7l-1.5 6.2a2.2 2.2 0 0 1-2.1 1.6H7.5"/>',
  share:'<path d="M13.5 4.5 21 11.3l-7.5 6.7v-3.8C8.8 14.2 5.6 15.8 3 20c.7-6 3.9-10.4 10.5-11.4Z"/>',
  home:'<path d="M3.5 10.5 12 3.5l8.5 7V20a.5.5 0 0 1-.5.5h-5v-6h-6v6H4a.5.5 0 0 1-.5-.5Z"/>',
  reel:'<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M3.5 8.5h17M9 3.5l2.5 5M14.5 3.5l2.5 5"/><path d="m10.5 12 4 2.3-4 2.3Z" fill="currentColor"/>',
  search:'<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/>',
  person:'<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5c1-3.7 4-5.5 7.5-5.5s6.5 1.8 7.5 5.5"/>',
  people:'<circle cx="9" cy="9" r="3.5"/><path d="M2.5 19.5c.8-3.2 3.3-5 6.5-5s5.7 1.8 6.5 5"/><circle cx="17" cy="8" r="2.6"/><path d="M16.5 13.2c2.6 0 4.4 1.5 5 4.3"/>',
  store:'<path d="M4 9.5V20h16V9.5"/><path d="M3 9.5 5 4h14l2 5.5c0 1.5-1.2 2.5-2.6 2.5s-2.6-1-2.6-2.5c0 1.5-1.2 2.5-2.6 2.5S9.6 11 9.6 9.5C9.6 11 8.4 12 7 12S3 11 3 9.5Z"/><path d="M10 20v-5h4v5"/>',
  bell:'<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15Z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
  menu:'<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.5 3.6 8.5S14.5 17.9 12 20.5C9.5 17.9 8.4 15 8.4 12S9.5 6.1 12 3.5Z"/>',
  note:'<path d="M9 18V5.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  back:'<path d="m15 4.5-7.5 7.5 7.5 7.5"/>',
  down:'<path d="m6 9 6 6 6-6"/>',
  up:'<path d="m6 15 6-6 6 6"/>',
  right:'<path d="m9 5.5 6.5 6.5L9 18.5"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  expand:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  mute:'<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>',
  sound:'<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4Z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11"/>',
  check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  grid:'<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  restart:'<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/>'
};
function ic(n, cls){ return '<svg class="' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[n] + '</svg>'; }

/* ---------- styles ---------- */
var CSS = [
'.ads{flex:1;min-height:0;display:flex;flex-direction:column;gap:16px}',
'.ads-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
'.ads-bar .grow{flex:1}',
'.aseg{position:relative;display:inline-flex;padding:4px;border-radius:14px;background:var(--glass-hi);border:1px solid var(--glass-line);box-shadow:var(--shadow-1);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}',
'.aseg .apill{position:absolute;top:4px;left:0;height:calc(100% - 8px);border-radius:10px;background:linear-gradient(180deg,#4B92FF,#2F78F2);box-shadow:0 8px 18px -8px var(--blue-glow);transition:transform .45s var(--spring),width .45s var(--spring)}',
'.aseg.ink .apill{background:var(--ink);box-shadow:0 8px 18px -10px rgba(14,30,48,.6)}',
'.aseg button{position:relative;z-index:1;display:inline-flex;align-items:center;gap:7px;height:34px;padding:0 14px;border-radius:10px;font-weight:600;font-size:13px;color:var(--ink-2);transition:color .3s var(--ease);white-space:nowrap}',
'.aseg button.on{color:#fff}',
'.aseg button .n{font-size:11px;font-weight:700;color:var(--faint);transition:color .3s}',
'.aseg button.on .n{color:rgba(255,255,255,.75)}',
'.aseg .lv{width:6px;height:6px;border-radius:50%;background:#22C55E;box-shadow:0 0 0 3px rgba(34,197,94,.18)}',
'.ads-go{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 18px;border-radius:14px;font-weight:600;color:#fff;background:linear-gradient(180deg,#4B92FF,#2F78F2);box-shadow:0 12px 22px -12px var(--blue-glow);transition:transform .35s var(--spring),box-shadow .3s}',
'.ads-go:hover{transform:translateY(-1px);box-shadow:0 16px 28px -12px var(--blue-glow)}',
'.ads-go:active{transform:scale(.97)}',
'.ads-go svg{width:17px;height:17px}',
'.ads-main{flex:1;min-height:0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:28px}',
'.ads-stage{min-height:0;height:100%;display:flex;align-items:flex-start;justify-content:center;padding:0 0 4px}',
'.phone{position:relative;height:100%;max-height:860px;min-height:520px;aspect-ratio:9/19.2;border-radius:52px;padding:11px;background:linear-gradient(145deg,#2A3140,#0B0F16 55%,#1A202B);box-shadow:0 40px 80px -40px rgba(14,30,48,.55),0 0 0 1.5px rgba(255,255,255,.5) inset,0 2px 0 rgba(255,255,255,.12) inset}',
'.phone .scr{position:relative;width:100%;height:100%;border-radius:42px;overflow:hidden;background:#000;isolation:isolate}',
'.phone .island{position:absolute;z-index:6;top:10px;left:50%;width:31%;height:27px;margin-left:-15.5%;border-radius:20px;background:#000}',
'.ads-side{min-width:0;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:16px;padding:2px 4px 18px 2px;scrollbar-width:thin}',
'.ads-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}',
'.ads-head h2{margin:0;font:800 24px/1 var(--display);letter-spacing:-.02em}',
'.ads-head .st{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:99px;font-size:12px;font-weight:600}',
'.ads-head .st.live{background:var(--green-soft);color:var(--green)}',
'.ads-head .st.live i{width:6px;height:6px;border-radius:50%;background:currentColor;animation:pulse 1.4s ease-in-out infinite}',
'.ads-head .st.paused{background:rgba(14,30,48,.06);color:var(--muted)}',
'.ads-head .when{color:var(--muted);font-weight:500}',
'.agrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:12px;max-width:760px}',
'.athumb{position:relative;aspect-ratio:9/16;border-radius:16px;overflow:hidden;background:#0E1E30;box-shadow:var(--shadow-1);transition:transform .35s var(--spring),box-shadow .3s}',
'.athumb:hover{transform:translateY(-3px);box-shadow:var(--shadow-2)}',
'.athumb img,.athumb video{width:100%;height:100%;object-fit:cover;display:block;transition:transform .6s var(--ease)}',
'.athumb:hover img{transform:scale(1.04)}',
'.athumb::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 55%,rgba(0,0,0,.55));pointer-events:none}',
'.athumb b{position:absolute;z-index:1;left:10px;bottom:9px;color:#fff;font:700 14px/1 var(--display);letter-spacing:-.01em}',
'.athumb .eq{position:absolute;z-index:1;right:10px;bottom:10px;display:none;gap:2px;align-items:flex-end;height:12px}',
'.athumb .eq i{width:3px;background:#fff;border-radius:2px;animation:eq 0.9s ease-in-out infinite}',
'.athumb .eq i:nth-child(2){animation-delay:-.3s}.athumb .eq i:nth-child(3){animation-delay:-.6s}',
'@keyframes eq{0%,100%{height:3px}50%{height:12px}}',
'.athumb.on{box-shadow:0 0 0 3px var(--bg),0 0 0 5.5px var(--blue),var(--shadow-2)}',
'.athumb.on .eq{display:flex}',
'.akeys{display:flex;flex-wrap:wrap;gap:8px 16px;color:var(--muted);font-size:12px}',
'.akeys kbd{display:inline-block;min-width:20px;margin-right:5px;padding:1px 6px;border:1px solid var(--line-2);border-radius:6px;font:600 11px/16px var(--body);color:var(--ink-2);text-align:center;background:var(--glass-hi)}',

/* ---- the feed (shared by both platforms) ---- */
'.feed-wrap{position:absolute;inset:0;display:flex;flex-direction:column;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}',
'.feed-wrap.swap{animation:fswap .5s var(--ease)}',
'@keyframes fswap{from{opacity:0;transform:scale(.985)}to{opacity:1;transform:none}}',
'.sbar{flex:none;height:46px;display:flex;align-items:flex-end;justify-content:space-between;padding:0 26px 9px 30px;font:600 14px/1 -apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,sans-serif;position:absolute;top:0;left:0;right:0;z-index:5}',
'.sbar .sig{display:flex;gap:5px;align-items:center}',
'.sbar .sig i{display:block;width:3px;border-radius:1px;background:#fff}',
'.sbar .bat{width:23px;height:11px;border:1.5px solid rgba(255,255,255,.55);border-radius:3.5px;padding:1px;margin-left:3px}',
'.sbar .bat b{display:block;width:78%;height:100%;border-radius:1.5px;background:#fff}',
'.feed{flex:1;min-height:0;position:relative;overflow-y:auto;overflow-x:hidden;scroll-snap-type:y mandatory;overscroll-behavior:contain;scrollbar-width:none;-webkit-overflow-scrolling:touch}',
'.feed::-webkit-scrollbar{display:none}',
'.sl{position:relative;height:100%;scroll-snap-align:start;scroll-snap-stop:always;overflow:hidden;background:#111}',
'.sl .md{position:absolute;inset:0;background:#15171c}',
'.sl .md img,.sl .md video{width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .25s}',
'.sl .md .in{opacity:1}',
'.sl .md.fail{background:linear-gradient(160deg,#3A86FF,#0E1E30)}',
'.sl .sh{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.38) 0,rgba(0,0,0,0) 16%,rgba(0,0,0,0) 52%,rgba(0,0,0,.62) 100%)}',
'.rail{position:absolute;right:8px;display:flex;flex-direction:column;align-items:center;gap:18px;z-index:2}',
'.rb{display:flex;flex-direction:column;align-items:center;gap:4px;color:#fff;font-size:12px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.35)}',
'.rb svg{width:28px;height:28px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.35));transition:transform .3s var(--spring)}',
'.rb:active svg{transform:scale(.85)}',
'.rb.on svg{fill:currentColor}',
'.rb.lk.on{color:#FF3040}',
'.rb.lk.on span{color:#fff}',
'.rb.pop svg{animation:pop .45s var(--spring)}',
'@keyframes pop{0%{transform:scale(1)}40%{transform:scale(1.3)}100%{transform:scale(1)}}',
'.mt{position:absolute;left:14px;right:64px;z-index:2;display:flex;flex-direction:column;gap:8px;text-shadow:0 1px 3px rgba(0,0,0,.3)}',
'.who{display:flex;align-items:center;gap:9px;font-size:14px}',
'.who .av{width:32px;height:32px;border-radius:50%;object-fit:cover;background:#fff;flex:none;box-shadow:0 0 0 1px rgba(255,255,255,.25)}',
'.who b{font-weight:600}',
'.who .fl{height:28px;padding:0 12px;border-radius:9px;border:1px solid rgba(255,255,255,.65);display:inline-flex;align-items:center;font-size:13px;font-weight:600}',
'.who .fl.on{border-color:rgba(255,255,255,.25);color:rgba(255,255,255,.8)}',
'.sp{font-size:12.5px;opacity:.92;margin-top:-5px;display:flex;align-items:center;gap:4px}',
'.sp svg{width:12px;height:12px}',
'.cap{margin:0;font-size:13.5px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;cursor:pointer;white-space:pre-line;overflow-wrap:anywhere}',
'.cap.open{display:block;-webkit-line-clamp:unset;max-height:44vh;overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;padding-right:4px}',
'.cap.open::-webkit-scrollbar{display:none}',
'.sl.capo .sh{background:rgba(0,0,0,.62);transition:background .3s}',
'.sl .sh{transition:background .3s}',
'.hl{display:flex;flex-direction:column;gap:2px;font-size:13px;line-height:1.3}',
'.hl b{font-weight:700;font-size:14px}',
'.hl span{opacity:.85}',
'.prog{position:absolute;left:0;right:0;bottom:0;height:2px;z-index:3;background:rgba(255,255,255,.22)}',
'.prog i{display:block;height:100%;width:0;background:#fff;transition:width .25s linear}',
'.tbar .snd{display:none}',
'.tbar .snd.has{display:grid}',
'.tbar .snd svg{width:22px;height:22px}',
'.bmenu .bth{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:8px 6px 4px;border-top:1px solid rgba(255,255,255,.1);margin-top:4px}',
'.bmenu .bth button{position:relative;display:block;height:auto;aspect-ratio:9/16;padding:0;border-radius:9px;overflow:hidden;background:#222}',
'.bmenu .bth button.on{box-shadow:0 0 0 2px #4B92FF}',
'.bmenu .bth img{width:100%;height:100%;object-fit:cover;display:block}',
'.bmenu .bth b{position:absolute;left:6px;bottom:5px;font-size:12px;text-shadow:0 1px 3px rgba(0,0,0,.6)}',
'.adinfo{max-width:760px;display:flex;flex-direction:column;gap:12px;padding:16px 18px;border-radius:20px;background:var(--glass-hi);border:1px solid var(--glass-line);box-shadow:var(--shadow-1);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}',
'.adinfo h3{margin:0;font:700 17px/1.2 var(--display);letter-spacing:-.01em}',
'.adinfo h3 small{display:block;margin-top:4px;font:500 12px/1 var(--body);color:var(--muted);letter-spacing:0}',
'.adinfo .kv{display:grid;grid-template-columns:96px minmax(0,1fr);gap:6px 12px;font-size:13px}',
'.adinfo .kv span{color:var(--muted)}',
'.adinfo .kv b{font-weight:600}',
'.adinfo .pt{margin:0;font-size:13px;line-height:1.5;color:var(--ink-2);white-space:pre-line;max-height:260px;overflow-y:auto;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.6);border:1px solid var(--line)}',
'.adinfo .pth{display:flex;align-items:center;justify-content:space-between;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--faint)}',
'.adinfo .pth button{text-transform:none;letter-spacing:0;font-size:12px;font-weight:600;color:var(--blue-ink)}',
'.athumb small{position:absolute;z-index:1;left:10px;right:10px;bottom:27px;color:rgba(255,255,255,.9);font-size:11px;font-weight:600;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
'.cap .more{opacity:.7}',
'.mus{display:flex;align-items:center;gap:6px;font-size:12.5px;opacity:.95}',
'.mus svg{width:13px;height:13px;flex:none}',
'.mus span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}',
'.cta{display:flex;align-items:center;justify-content:space-between;height:40px;padding:0 12px 0 14px;border-radius:10px;font-size:14px;font-weight:600;color:#fff;background:rgba(255,255,255,.2);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);transition:background .6s var(--ease),color .6s var(--ease);text-shadow:none}',
'.cta svg{width:16px;height:16px}',
'.ig .sl.lit .cta{background:#fff;color:#0B0F16}',
'.fb .cta{justify-content:center;background:rgba(255,255,255,.22);border-radius:8px}',
'.fb .sl.lit .cta{background:rgba(255,255,255,.92);color:#0B0F16}',
'.burst{position:absolute;left:50%;top:50%;width:96px;height:96px;margin:-48px 0 0 -48px;z-index:4;color:#fff;pointer-events:none;animation:burst .8s var(--spring) forwards;filter:drop-shadow(0 4px 12px rgba(0,0,0,.35))}',
'.fb .burst{color:#fff}',
'.burst svg{width:100%;height:100%;fill:currentColor}',
'@keyframes burst{0%{opacity:0;transform:scale(.3) rotate(-12deg)}25%{opacity:1;transform:scale(1.1) rotate(-12deg)}45%{transform:scale(.95) rotate(-12deg)}80%{opacity:1;transform:scale(1) rotate(-12deg)}100%{opacity:0;transform:scale(1.1) translateY(-40px) rotate(-12deg)}}',
'.mutepill{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:rgba(0,0,0,.5);display:grid;place-items:center;z-index:4;pointer-events:none;animation:mfade 1s var(--ease) forwards}',
'.mutepill svg{width:28px;height:28px}',
'@keyframes mfade{0%{opacity:0;transform:scale(.8)}20%{opacity:1;transform:none}75%{opacity:1}100%{opacity:0}}',
'.endc{position:relative;height:100%;scroll-snap-align:start;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:30px;text-align:center;background:radial-gradient(120% 80% at 50% 0%,#1F3B66,#0B0F16 70%)}',
'.endc .ok{width:64px;height:64px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(135deg,#4B92FF,#22B573);box-shadow:0 12px 30px -10px rgba(75,146,255,.7)}',
'.endc .ok svg{width:30px;height:30px}',
'.endc b{font-size:19px}',
'.endc p{margin:0;font-size:14px;opacity:.75}',
'.endc .eb{display:flex;flex-direction:column;gap:9px;width:100%;max-width:230px;margin-top:8px}',
'.endc .eb button{height:42px;border-radius:12px;font-weight:600;font-size:14px;color:#fff;background:rgba(255,255,255,.14);display:flex;align-items:center;justify-content:center;gap:8px}',
'.endc .eb button.pri{background:#fff;color:#0B0F16}',
'.endc .eb svg{width:16px;height:16px}',

/* top bar of the app */
'.tbar{position:absolute;left:0;right:0;z-index:5;display:flex;align-items:center;gap:6px;padding:0 12px;height:50px;pointer-events:none}',
'.tbar > *{pointer-events:auto}',
'.tbar .tt{font-size:21px;font-weight:700;letter-spacing:-.01em;display:flex;align-items:center;gap:4px;text-shadow:0 1px 4px rgba(0,0,0,.3)}',
'.tbar .tt svg{width:16px;height:16px}',
'.tbar .grow{flex:1;pointer-events:none}',
'.tbar .ti{width:36px;height:36px;display:grid;place-items:center;border-radius:50%;color:#fff}',
'.tbar .ti svg{width:25px;height:25px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.3))}',
'.tbar .bt{display:none;align-items:center;gap:5px;height:30px;padding:0 10px 0 11px;border-radius:99px;font-size:13px;font-weight:700;background:rgba(255,255,255,.18);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);color:#fff}',
'.tbar .bt svg{width:14px;height:14px}',
'.tbar .pf{display:none;padding:3px;border-radius:99px;background:rgba(255,255,255,.16);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}',
'.tbar .pf button{height:26px;padding:0 10px;border-radius:99px;font-size:12px;font-weight:700;color:rgba(255,255,255,.8);transition:background .3s,color .3s}',
'.tbar .pf button.on{background:#fff;color:#0B0F16}',
'.fs .tbar .bt,.fs .tbar .pf{display:inline-flex}',
'.fs .tbar .deco{display:none}',
'.bmenu{position:absolute;z-index:8;top:54px;left:12px;min-width:220px;padding:6px;border-radius:16px;background:rgba(28,30,36,.92);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);box-shadow:0 20px 40px -12px rgba(0,0,0,.6);transform-origin:top left;animation:bm .3s var(--spring)}',
'@keyframes bm{from{opacity:0;transform:scale(.92) translateY(-6px)}to{opacity:1;transform:none}}',
'.bmenu button{display:flex;align-items:center;gap:10px;width:100%;height:44px;padding:0 12px;border-radius:11px;color:#fff;font-size:14px;font-weight:600;text-align:left}',
'.bmenu button:hover{background:rgba(255,255,255,.08)}',
'.bmenu button.on{background:rgba(75,146,255,.25)}',
'.bmenu small{margin-left:auto;font-size:12px;font-weight:500;opacity:.6}',
'.bmenu .lv{width:7px;height:7px;border-radius:50%;background:#22C55E}',
'.bmenu .pz{width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.3)}',

/* bottom nav of the app */
'.bnav{flex:none;position:relative;z-index:5;display:flex;justify-content:space-around;align-items:center;height:52px;padding:0 8px;background:#000;border-top:1px solid rgba(255,255,255,.08)}',
'.bnav span{width:44px;height:44px;display:grid;place-items:center;color:#fff;opacity:.92}',
'.bnav svg{width:26px;height:26px}',
'.bnav .on svg{stroke-width:2.4}',
'.bnav .me{width:27px;height:27px;border-radius:50%;background:#fff url(' + AV + ') center/cover;box-shadow:0 0 0 1.5px #fff}',
'.phone .bnav{height:auto;padding:4px 8px 22px}',
'.fb .bnav{background:#000}',
'.fb .bnav .on{color:#fff;position:relative}',
'.fb .bnav .on::after{content:"";position:absolute;left:8px;right:8px;top:-4px;height:3px;border-radius:0 0 3px 3px;background:#fff}',

/* positions inside the phone and in scroll mode */
'.phone .tbar{top:46px}',
'.phone .rail{bottom:18px}',
'.phone .mt{bottom:14px}',
'.fsov .tbar{top:env(safe-area-inset-top);top:max(6px,env(safe-area-inset-top))}',
'.fsov .rail{bottom:18px}',
'.fsov .mt{bottom:16px}',

/* scroll mode (full screen) */
'.fsov{position:fixed;inset:0;z-index:90;background:#000;display:flex;align-items:center;justify-content:center;animation:fsin .45s var(--ease)}',
'@keyframes fsin{from{opacity:0}to{opacity:1}}',
'.fsov.out{animation:fsout .3s var(--ease) forwards}',
'@keyframes fsout{to{opacity:0}}',
'.fsov .reel{position:relative;height:calc(100% - 28px);aspect-ratio:9/16;max-width:100%;border-radius:14px;overflow:hidden;background:#000;box-shadow:0 0 0 1px rgba(255,255,255,.06)}',
'.fsov .bnav{display:none}',
'.fsov .side-ctl{position:absolute;right:28px;top:50%;transform:translateY(-50%);display:flex;flex-direction:column;gap:12px}',
'.fsov .side-ctl button,.fsov .xbtn{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;color:#fff;background:rgba(255,255,255,.1);transition:background .2s,transform .3s var(--spring),opacity .2s}',
'.fsov .side-ctl button:hover,.fsov .xbtn:hover{background:rgba(255,255,255,.2)}',
'.fsov .side-ctl button:active{transform:scale(.92)}',
'.fsov .side-ctl button[disabled]{opacity:.25;pointer-events:none}',
'.fsov .side-ctl svg,.fsov .xbtn svg{width:24px;height:24px}',
'.fsov .xbtn{position:absolute;left:24px;top:24px}',
'.fsov .ctr{position:absolute;left:24px;bottom:24px;color:rgba(255,255,255,.55);font-size:12px;line-height:1.7}',
'.fsov .ctr kbd{display:inline-block;min-width:20px;margin-right:4px;padding:0 6px;border:1px solid rgba(255,255,255,.2);border-radius:6px;font:600 11px/16px var(--body);text-align:center;color:rgba(255,255,255,.8)}',
'.fsov .ctr b{display:block;color:#fff;font:700 15px/1.4 var(--display);margin-bottom:4px}',

/* phone-sized screens */
'@media (max-width:860px){',
'  .ads{gap:12px}',
'  .ads-bar{gap:8px}',
'  .ads-bar .aseg{max-width:100%;overflow-x:auto;scrollbar-width:none}',
'  .ads-bar .grow{display:none}',
'  .ads-go{width:100%;justify-content:center;height:50px;font-size:15px;border-radius:16px}',
'  .ads-main{display:flex;flex-direction:column;gap:18px}',
'  .ads-stage{height:auto;display:block;padding:0}',
'  .phone{height:min(64vh,560px);min-height:0;max-height:none;width:auto;margin:0 auto;aspect-ratio:9/16;padding:0;border-radius:24px;background:#000;box-shadow:var(--shadow-2)}',
'  .phone .scr{border-radius:24px}',
'  .phone .island,.phone .sbar,.phone .bnav{display:none}',
'  .phone .tbar{top:4px}',
'  .ads-side{overflow:visible;padding:0}',
'  .agrid{grid-template-columns:repeat(3,1fr);gap:10px}',
'  .akeys{display:none}',
'  .fsov .reel{height:100%;height:100dvh;width:100%;aspect-ratio:auto;border-radius:0;display:flex;flex-direction:column}',
'  .fsov .reel .feed-wrap{position:relative;flex:1}',
'  .fsov .bnav{display:flex;padding-bottom:max(4px,env(safe-area-inset-bottom))}',
'  .fsov .side-ctl,.fsov .xbtn,.fsov .ctr{display:none}',
'}'
].join('\n');

/* ---------- state ---------- */
var saved = {}; try{ saved = JSON.parse(ls('zcrm_ads') || '{}') || {}; }catch(_){}
var S = {
  b: ADS_DATA.some(function(x){ return x.k === saved.b; }) ? saved.b : ADS_DATA[0].k,
  p: saved.p === 'fb' ? 'fb' : 'ig',
  i: 0, fs: false, muted: true, likes: {}
};
var root, stageWrap, fsEl = null, mounted = false, io = null, ctaT = 0, lastTap = 0, tapT = 0, wheelLock = 0;
function hasVideo(){ return batch().items.some(function(x){ return x.video; }); }
function batch(){ return ADS_DATA.filter(function(x){ return x.k === S.b; })[0]; }
function save(){ ls('zcrm_ads', JSON.stringify({ b: S.b, p: S.p })); }
function feedEl(){ return S.fs && fsEl ? $('.feed', fsEl) : $('.feed', stageWrap); }

/* ---------- instant loading: warm the cache before the slide is on screen ---------- */
var WARM = {};
function warmUrl(u){
  if (!u || WARM[u]) return;
  var im = new Image(); im.decoding = 'async'; im.src = u;
  WARM[u] = (im.decode ? im.decode() : Promise.resolve()).catch(function(){});
}
function warmAround(b, i){
  var it = b.items;
  for (var j = i - 1; j <= i + 3; j++) if (it[j]) warmUrl(it[j].poster || it[j].img);
}
function warmAll(){ ADS_DATA.forEach(function(b){ b.items.slice(0, 3).forEach(function(x){ warmUrl(x.poster || x.img); }); }); }

/* ---------- markup ---------- */
function statusBar(){
  return '<div class="sbar"><span>9:41</span><span class="sig">'
    + '<span style="display:flex;gap:1.5px;align-items:flex-end"><i style="height:4px"></i><i style="height:6px"></i><i style="height:8px"></i><i style="height:10px"></i></span>'
    + '<span class="bat"><b></b></span></span></div>';
}
function topBar(){
  var b = batch(), n = b.items.length, cur = Math.min(S.i, n - 1) + 1;
  var ctl = '<button type="button" class="bt" data-a="bmenu">' + esc(b.label) + ' · ' + cur + '/' + n + ic('down') + '</button>'
    + '<span class="grow"></span>'
    + '<span class="pf"><button type="button" data-a="plat" data-p="ig" class="' + (S.p === 'ig' ? 'on' : '') + '">IG</button><button type="button" data-a="plat" data-p="fb" class="' + (S.p === 'fb' ? 'on' : '') + '">FB</button></span>'
    + '<button type="button" class="ti snd' + (hasVideo() ? ' has' : '') + '" data-a="snd" aria-label="Sound on or off">' + ic(S.muted ? 'mute' : 'sound') + '</button>';
  if (S.p === 'ig') return '<div class="tbar">'
    + '<button type="button" class="ti fsonly" data-a="exit" aria-label="Exit scroll mode" style="display:' + (S.fs ? 'grid' : 'none') + '">' + ic('back') + '</button>'
    + '<span class="tt">Reels' + (S.fs ? '' : ic('down')) + '</span>' + ctl
    + '<span class="ti deco">' + ic('cam') + '</span></div>';
  return '<div class="tbar">'
    + '<button type="button" class="ti" data-a="exit" aria-label="' + (S.fs ? 'Exit scroll mode' : 'Back') + '">' + ic('back') + '</button>'
    + '<span class="tt">Reels</span>' + ctl
    + '<span class="ti deco">' + ic('search') + '</span><span class="ti deco">' + ic('person') + '</span></div>';
}
function bottomNav(){
  if (S.p === 'ig') return '<div class="bnav"><span>' + ic('home') + '</span><span class="on">' + ic('reel') + '</span><span>' + ic('plane') + '</span><span>' + ic('search') + '</span><span><i class="me"></i></span></div>';
  return '<div class="bnav"><span>' + ic('home') + '</span><span class="on">' + ic('reel') + '</span><span>' + ic('people') + '</span><span>' + ic('store') + '</span><span>' + ic('bell') + '</span><span>' + ic('menu') + '</span></div>';
}
function media(b, it, j){
  var near = Math.abs(j - S.i) <= 2;
  if (it.video) return '<video playsinline muted loop preload="' + (near ? 'auto' : 'none') + '" poster="' + esc(it.poster || '') + '" src="' + esc(it.video) + '"></video>';
  return '<img alt="' + esc(b.label + ' V' + it.v) + '" src="' + esc(it.img) + '" decoding="async"' + (j === S.i ? ' fetchpriority="high"' : '') + (near ? '' : ' loading="lazy"') + '>';
}
function slide(b, it, j){
  var liked = !!S.likes[b.k + it.v];
  var L = 1200 + seed(b.k, it.v, 'l') * 3, C = 30 + seed(b.k, it.v, 'c') % 240, Sh = 12 + seed(b.k, it.v, 's') % 160, R = 5 + seed(b.k, it.v, 'r') % 60;
  var cap = esc(it.body || CAPTION), title = it.title ? '<div class="hl"><b>' + esc(it.title) + '</b>' + (it.desc ? '<span>' + esc(it.desc) + '</span>' : '') + '</div>' : '';
  var cta = esc(it.cta || 'Learn more');
  var h = '<div class="sl" data-j="' + j + '"><div class="md">' + media(b, it, j) + '</div><div class="sh"></div>' + (it.video ? '<div class="prog"><i></i></div>' : '');
  if (S.p === 'ig'){
    h += '<div class="rail">'
      + '<button type="button" class="rb lk' + (liked ? ' on' : '') + '" data-a="like">' + ic('heart') + '<span>' + num(L + (liked ? 1 : 0)) + '</span></button>'
      + '<button type="button" class="rb">' + ic('bubble') + '<span>' + num(C) + '</span></button>'
      + '<button type="button" class="rb">' + ic('repost') + '<span>' + num(R) + '</span></button>'
      + '<button type="button" class="rb">' + ic('plane') + '<span>' + num(Sh) + '</span></button>'
      + '<button type="button" class="rb">' + ic('dots') + '</button>'
      + '<img class="who av" src="' + AV + '" alt="" style="width:28px;height:28px;border-radius:7px;box-shadow:0 0 0 2px #fff">'
      + '</div>'
      + '<div class="mt"><div class="who"><img class="av" src="' + AV + '" alt=""><b>zorionlife</b><button type="button" class="fl" data-a="follow">Follow</button></div>'
      + '<div class="sp">Sponsored</div>'
      + '<p class="cap" data-a="cap">' + cap + '</p>'
      + '<div class="mus">' + ic('note') + '<span>zorionlife · Original audio</span></div>'
      + '<a class="cta" role="button" tabindex="0">' + cta + ic('right') + '</a></div>';
  } else {
    h += '<div class="rail">'
      + '<button type="button" class="rb lk' + (liked ? ' on' : '') + '" data-a="like">' + ic('thumb') + '<span>' + num(L + (liked ? 1 : 0)) + '</span></button>'
      + '<button type="button" class="rb">' + ic('bubble') + '<span>' + num(C) + '</span></button>'
      + '<button type="button" class="rb">' + ic('share') + '<span>' + num(Sh) + '</span></button>'
      + '<button type="button" class="rb">' + ic('dots') + '</button>'
      + '</div>'
      + '<div class="mt"><div class="who"><img class="av" src="' + AV + '" alt=""><b>Zorion</b><span style="opacity:.7">·</span><button type="button" class="fl" data-a="follow" style="border:0;padding:0;height:auto">Follow</button></div>'
      + '<div class="sp">Sponsored · ' + ic('globe') + '</div>'
      + '<p class="cap" data-a="cap">' + cap + '</p>'
      + '<div class="mus">' + ic('note') + '<span>Zorion · Original audio</span></div>'
      + title
      + '<a class="cta" role="button" tabindex="0">' + cta + '</a></div>';
  }
  return h + '</div>';
}
function endCard(){
  var idx = ADS_DATA.indexOf(batch()), nx = ADS_DATA[idx + 1] || ADS_DATA[0];
  return '<div class="endc" data-end="1"><span class="ok">' + ic('check') + '</span><b>That’s all of ' + esc(batch().label) + '</b>'
    + '<p>' + batch().items.length + ' ads · ' + esc(batch().when) + '</p>'
    + '<div class="eb"><button type="button" class="pri" data-a="batch" data-b="' + nx.k + '">Next: ' + esc(nx.label) + ic('right') + '</button>'
    + '<button type="button" data-a="restart">' + ic('restart') + 'Watch ' + esc(batch().label) + ' again</button></div></div>';
}
function feedHTML(withPhoneChrome){
  var b = batch();
  return '<div class="feed-wrap ' + S.p + '">' + (withPhoneChrome ? statusBar() : '') + topBar()
    + '<div class="feed" tabindex="-1">' + b.items.map(function(it, j){ return slide(b, it, j); }).join('') + endCard() + '</div>'
    + bottomNav() + '</div>';
}

/* ---------- render ---------- */
function segHTML(){
  return '<div class="aseg" id="adsBatches" role="tablist" aria-label="Batch"><span class="apill"></span>'
    + ADS_DATA.map(function(b){ return '<button type="button" role="tab" data-a="batch" data-b="' + b.k + '" class="' + (b.k === S.b ? 'on' : '') + '">'
      + (b.status === 'live' ? '<span class="lv"></span>' : '') + esc(b.label) + '<span class="n">' + b.items.length + '</span></button>'; }).join('')
    + '</div>'
    + '<div class="aseg ink" id="adsPlat" role="tablist" aria-label="Platform"><span class="apill"></span>'
    + '<button type="button" role="tab" data-a="plat" data-p="ig" class="' + (S.p === 'ig' ? 'on' : '') + '">Instagram</button>'
    + '<button type="button" role="tab" data-a="plat" data-p="fb" class="' + (S.p === 'fb' ? 'on' : '') + '">Facebook</button></div>';
}
function sideHTML(){
  var b = batch();
  return '<div class="ads-head"><h2>Batch ' + esc(b.label.slice(1)) + '</h2>'
    + (b.status === 'live' ? '<span class="st live"><i></i>Live</span>' : '<span class="st paused">Paused</span>')
    + '<span class="when">' + b.items.length + ' ads · ' + esc(b.when) + '</span></div>'
    + '<div class="agrid">' + b.items.map(function(it, j){
        return '<button type="button" class="athumb' + (j === S.i ? ' on' : '') + '" data-a="jump" data-j="' + j + '" aria-label="' + esc(b.label + ' V' + it.v) + '">'
          + (it.poster || it.img ? '<img src="' + esc(it.poster || it.img) + '" alt="" decoding="async">' : '<video muted playsinline preload="metadata" src="' + esc(it.video) + '#t=0.5"></video>') + (it.name ? '<small>' + esc(it.name) + '</small>' : '') + '<b>V' + it.v + '</b><span class="eq"><i></i><i></i><i></i></span></button>';
      }).join('') + '</div>'
    + '<div id="adInfo">' + infoHTML() + '</div>'
    + '<div class="akeys"><span><kbd>↑</kbd><kbd>↓</kbd>next ad</span><span><kbd>←</kbd><kbd>→</kbd>batch</span><span><kbd>P</kbd>Instagram / Facebook</span><span><kbd>F</kbd>scroll mode</span></div>';
}
function infoHTML(){
  var b = batch(), it = b.items[Math.min(S.i, b.items.length - 1)];
  if (!it.body && !it.title) return '';
  return '<div class="adinfo"><h3>' + esc(b.label + ' | V' + it.v + (it.name ? ' : ' + it.name : '')) + (it.ad ? '<small>Ad ID ' + esc(it.ad) + '</small>' : '') + '</h3>'
    + '<div class="kv"><span>Headline</span><b>' + esc(it.title || '—') + '</b><span>Description</span><b>' + esc(it.desc || '—') + '</b><span>Button</span><b>' + esc(it.cta || 'Learn more') + '</b></div>'
    + '<div class="pth">Primary text<button type="button" data-a="copy">Copy</button></div><p class="pt">' + esc(it.body || '') + '</p></div>';
}
function movePills(){
  $$('.aseg', root).forEach(function(seg){
    var on = $('button.on', seg), pl = $('.apill', seg); if (!on || !pl) return;
    pl.style.width = on.offsetWidth + 'px'; pl.style.transform = 'translateX(' + on.offsetLeft + 'px)';
  });
}
function mount(el){
  root = el;
  if (!$('#ads-css')){ var st = document.createElement('style'); st.id = 'ads-css'; st.textContent = CSS; document.head.appendChild(st); }
  root.innerHTML = '<div class="ads">'
    + '<div class="ads-bar" id="adsBar"></div>'
    + '<div class="ads-main"><div class="ads-stage"><div class="phone"><div class="scr" id="adsScr"></div><span class="island"></span></div></div>'
    + '<div class="ads-side" id="adsSide"></div></div></div>';
  stageWrap = $('#adsScr', root);
  root.addEventListener('click', onClick);
  mounted = true;
  warmAll();
}
function renderBar(){
  $('#adsBar', root).innerHTML = segHTML() + '<span class="grow"></span><button type="button" class="ads-go" data-a="fs">' + ic('expand') + 'Scroll mode</button>';
  movePills();
}
function renderFeed(anim){
  var host = S.fs ? $('.reel', fsEl) : stageWrap;
  host.innerHTML = feedHTML(!S.fs);
  var fw = $('.feed-wrap', host);
  if (anim){ fw.classList.add('swap'); }
  var f = $('.feed', host);
  f.scrollTop = S.i * f.clientHeight;
  wireFeed(f);
  requestAnimationFrame(function(){ f.scrollTop = S.i * f.clientHeight; activate(S.i, true); });
}
function render(anim){
  if (!mounted) return;
  if (MQ.matches){ if (!S.fs) enterFs(); return; }   // phones: straight into the app-style feed
  renderBar(); $('#adsSide', root).innerHTML = sideHTML(); renderFeed(anim);
}

/* ---------- feed behaviour ---------- */
function wireFeed(f){
  if (io) io.disconnect();
  io = new IntersectionObserver(function(es){
    es.forEach(function(e){
      if (e.isIntersecting && e.intersectionRatio >= 0.6){
        var j = e.target.dataset.end ? -1 : +e.target.dataset.j;
        if (j === -1){ setActiveSlide(null); return; }
        if (j !== S.i) activate(j);
      }
    });
  }, { root: f, threshold: [0.6] });
  $$('.sl, .endc', f).forEach(function(s){ io.observe(s); });
  $$('.md img, .md video', f).forEach(function(m){
    var done = function(){ m.classList.add('in'); };
    if (m.tagName === 'IMG'){ if (m.complete && m.naturalWidth) done(); else { m.addEventListener('load', done); m.addEventListener('error', function(){ m.parentNode.classList.add('fail'); }); } }
    else {
      m.addEventListener('loadeddata', done); if (m.readyState >= 2) done();
      var bar = $('.prog i', m.closest('.sl'));
      m.addEventListener('timeupdate', function(){ if (bar && m.duration) bar.style.width = (m.currentTime / m.duration * 100) + '%'; });
    }
  });
  f.addEventListener('click', onFeedTap);
}
function setActiveSlide(sl){
  var f = feedEl(); if (!f) return;
  $$('.sl.lit', f).forEach(function(x){ if (x !== sl) x.classList.remove('lit'); });
  clearTimeout(ctaT);
  if (sl) ctaT = setTimeout(function(){ sl.classList.add('lit'); }, 2200);
}
function activate(j, force){
  var b = batch(); if (j < 0 || j >= b.items.length) return;
  var changed = j !== S.i; S.i = j;
  var f = feedEl(); if (!f) return;
  var sls = $$('.sl', f);
  setActiveSlide(sls[j]);
  warmAround(b, j);
  // videos: play the one on screen, preload its neighbours, park the rest
  sls.forEach(function(sl, k){
    var v = $('video', sl); if (!v) return;
    if (Math.abs(k - j) <= 2 && v.preload !== 'auto'){ v.preload = 'auto'; v.load(); }
    if (k === j){ v.muted = S.muted; var p = v.play(); if (p && p.catch) p.catch(function(){}); }
    else { v.pause(); if (Math.abs(k - j) > 1) try{ v.currentTime = 0; }catch(_){} }
  });
  // lazy images near the new spot: load now
  sls.forEach(function(sl, k){ var im = $('img[loading="lazy"]', sl); if (im && Math.abs(k - j) <= 2) im.removeAttribute('loading'); });
  sls.forEach(function(sl, k){ if (k !== j){ sl.classList.remove('capo'); var c = $('.cap.open', sl); if (c) c.classList.remove('open'); } });
  if (changed || force){
    var ai = $('#adInfo', root); if (ai) ai.innerHTML = infoHTML();
    $$('.athumb', root).forEach(function(t){ t.classList.toggle('on', +t.dataset.j === j); });
    $$('.bt', document).forEach(function(bt){ bt.firstChild.nodeValue = b.label + ' · ' + (j + 1) + '/' + b.items.length; });
    if (fsEl){ var up = $('[data-a="up"]', fsEl), dn = $('[data-a="dn"]', fsEl); if (up) up.disabled = j === 0; if (dn) dn.disabled = false; var c = $('.ctr b', fsEl); if (c) c.textContent = b.label + ' · V' + b.items[j].v; }
  }
}
function go(j, smooth){
  var f = feedEl(), b = batch(); if (!f) return;
  j = Math.max(0, Math.min(j, b.items.length));            // index == length → the end card
  f.scrollTo({ top: j * f.clientHeight, behavior: smooth === false ? 'auto' : 'smooth' });
}
function step(d){
  var f = feedEl(); if (!f) return;
  var cur = Math.round(f.scrollTop / f.clientHeight);
  go(cur + d);
}
function setBatch(k){
  if (k === S.b){ go(0); return; }
  S.b = k; S.i = 0; save(); closeMenu();
  warmAround(batch(), 0);
  renderBar(); $('#adsSide', root).innerHTML = sideHTML(); renderFeed(true);
}
function shiftBatch(d){
  var i = ADS_DATA.indexOf(batch());
  setBatch(ADS_DATA[(i + d + ADS_DATA.length) % ADS_DATA.length].k);
}
function setPlat(p){
  if (p === S.p) return;
  S.p = p; save();
  renderBar(); renderFeed(true);
}
function like(sl, on){
  var b = batch(), it = b.items[+sl.dataset.j], key = b.k + it.v;
  S.likes[key] = on === undefined ? !S.likes[key] : on;
  var btn = $('[data-a="like"]', sl); btn.classList.toggle('on', S.likes[key]);
  btn.classList.remove('pop'); void btn.offsetWidth; if (S.likes[key]) btn.classList.add('pop');
  var L = 1200 + seed(b.k, it.v, 'l') * 3;
  $('span', btn).textContent = num(L + (S.likes[key] ? 1 : 0));
}
function burst(sl, x, y){
  var r = sl.getBoundingClientRect(), el = document.createElement('div');
  el.className = 'burst'; el.innerHTML = ic(S.p === 'ig' ? 'heart' : 'thumb');
  el.style.left = (x - r.left) + 'px'; el.style.top = (y - r.top) + 'px';
  sl.appendChild(el); setTimeout(function(){ el.remove(); }, 850);
}
function toggleSound(sl){
  S.muted = !S.muted;
  var f = feedEl(); if (f) $$('video', f).forEach(function(v){ v.muted = S.muted; });
  var cur = f && $$('.sl', f)[S.i], v = cur && $('video', cur);
  if (v && !S.muted && v.paused){ var p = v.play(); if (p && p.catch) p.catch(function(){}); }
  $$('.snd').forEach(function(b){ b.innerHTML = ic(S.muted ? 'mute' : 'sound'); });
  sl = sl || cur; if (!sl) return;
  var m = document.createElement('div'); m.className = 'mutepill'; m.innerHTML = ic(S.muted ? 'mute' : 'sound');
  sl.appendChild(m); setTimeout(function(){ m.remove(); }, 1000);
}
function onFeedTap(e){
  if (e.target.closest('button, a, .cap')) return;
  var sl = e.target.closest('.sl'); if (!sl) return;
  var t = Date.now();
  if (t - lastTap < 280){                      // double tap = like, like the real apps
    clearTimeout(tapT); lastTap = 0;
    like(sl, true); burst(sl, e.clientX, e.clientY); return;
  }
  lastTap = t;
  tapT = setTimeout(function(){                // single tap = sound on/off (videos only)
    if (!$('video', sl)) return;
    toggleSound(sl);
  }, 290);
}

/* ---------- batch menu (scroll mode) ---------- */
function closeMenu(){ var m = $('.bmenu'); if (m) m.remove(); }
function openMenu(anchor){
  closeMenu();
  var host = anchor.closest('.feed-wrap'); if (!host) return;
  var m = document.createElement('div'); m.className = 'bmenu';
  m.innerHTML = ADS_DATA.map(function(b){
    return '<button type="button" data-a="batch" data-b="' + b.k + '" class="' + (b.k === S.b ? 'on' : '') + '"><span class="' + (b.status === 'live' ? 'lv' : 'pz') + '"></span>Batch ' + esc(b.label.slice(1)) + '<small>' + b.items.length + ' ads · ' + (b.status === 'live' ? 'Live' : 'Paused') + '</small></button>';
  }).join('');
  var b = batch();
  m.innerHTML += '<div class="bth">' + b.items.map(function(it, j){
    return '<button type="button" data-a="jump" data-j="' + j + '" class="' + (j === S.i ? 'on' : '') + '"><img src="' + esc(it.poster || it.img) + '" alt=""><b>V' + it.v + '</b></button>';
  }).join('') + '</div>';
  host.appendChild(m);
}

/* ---------- scroll mode ---------- */
function enterFs(){
  if (S.fs) return;
  S.fs = true; closeMenu();
  fsEl = document.createElement('div'); fsEl.className = 'fsov fs'; fsEl.setAttribute('role', 'dialog'); fsEl.setAttribute('aria-label', 'Scroll mode');
  fsEl.innerHTML = '<button type="button" class="xbtn" data-a="exit" aria-label="Close">' + ic('x') + '</button>'
    + '<div class="reel"></div>'
    + '<div class="side-ctl"><button type="button" data-a="up" aria-label="Previous">' + ic('up') + '</button><button type="button" data-a="dn" aria-label="Next">' + ic('down') + '</button></div>'
    + '<div class="ctr"><b></b><span><kbd>↑</kbd><kbd>↓</kbd>next</span><br><span><kbd>←</kbd><kbd>→</kbd>batch</span><br><span><kbd>P</kbd>platform</span><br><span><kbd>Esc</kbd>exit</span></div>';
  document.body.appendChild(fsEl);
  document.documentElement.style.overflow = 'hidden';
  fsEl.addEventListener('click', onClick);
  fsEl.addEventListener('wheel', function(e){             // wheel on the black sides still moves the feed
    if (e.target.closest('.feed')) return;
    e.preventDefault(); var t = Date.now(); if (t - wheelLock < 550 || Math.abs(e.deltaY) < 8) return;
    wheelLock = t; step(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  stageWrap.innerHTML = '';
  renderFeed(false);
  var rq = fsEl.requestFullscreen || fsEl.webkitRequestFullscreen;
  if (rq && !matchMedia('(pointer:coarse)').matches){ try{ var p = rq.call(fsEl); if (p && p.catch) p.catch(function(){}); }catch(_){} }
  else if (rq){ try{ var p2 = rq.call(fsEl); if (p2 && p2.catch) p2.catch(function(){}); }catch(_){} }
}
function exitFs(silent){
  if (!S.fs) return;
  S.fs = false; closeMenu();
  var el = fsEl; fsEl = null;
  if (document.fullscreenElement || document.webkitFullscreenElement){ try{ (document.exitFullscreen || document.webkitExitFullscreen).call(document); }catch(_){} }
  el.classList.add('out'); setTimeout(function(){ el.remove(); }, 300);
  document.documentElement.style.overflow = '';
  if (!MQ.matches){ renderBar(); $('#adsSide', root).innerHTML = sideHTML(); renderFeed(false); }
  if (!silent && MQ.matches && typeof window.ZADS.onExit === 'function') window.ZADS.onExit();
}
document.addEventListener('fullscreenchange', function(){ if (!document.fullscreenElement && S.fs) exitFs(); });
document.addEventListener('webkitfullscreenchange', function(){ if (!document.webkitFullscreenElement && S.fs) exitFs(); });

/* ---------- clicks + keys ---------- */
function onClick(e){
  var a = e.target.closest('[data-a]');
  if (!a){ if (!e.target.closest('.bmenu')) closeMenu(); return; }
  var act = a.dataset.a;
  if (act !== 'bmenu' && !a.closest('.bmenu')) closeMenu();
  if (act === 'batch') setBatch(a.dataset.b);
  else if (act === 'plat') setPlat(a.dataset.p);
  else if (act === 'fs') enterFs();
  else if (act === 'exit'){ if (S.fs) exitFs(); }
  else if (act === 'jump'){ if (a.closest('.bmenu')) closeMenu(); go(+a.dataset.j, !a.closest('.bmenu')); }
  else if (act === 'up') step(-1);
  else if (act === 'dn') step(1);
  else if (act === 'restart') go(0);
  else if (act === 'bmenu'){ if ($('.bmenu')) closeMenu(); else openMenu(a); }
  else if (act === 'like') like(a.closest('.sl'));
  else if (act === 'follow'){ a.classList.toggle('on'); a.textContent = a.classList.contains('on') ? 'Following' : 'Follow'; }
  else if (act === 'cap'){ a.classList.toggle('open'); var sl = a.closest('.sl'); if (sl) sl.classList.toggle('capo', a.classList.contains('open')); }
  else if (act === 'snd') toggleSound();
  else if (act === 'copy'){
    var it = batch().items[S.i], t = it.body || '';
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function(){ a.textContent = 'Copied'; setTimeout(function(){ a.textContent = 'Copy'; }, 1400); }, function(){});
  }
  e.stopPropagation();
}
function key(e){
  if (!S.fs && !(root && root.offsetParent)) return false;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return false;
  if (e.metaKey || e.ctrlKey || e.altKey) return false;
  var k = e.key;
  if (k === 'ArrowDown' || k === 'j' || (S.fs && k === ' ')){ e.preventDefault(); step(1); return true; }
  if (k === 'ArrowUp' || k === 'k'){ e.preventDefault(); step(-1); return true; }
  if (k === 'ArrowRight'){ e.preventDefault(); shiftBatch(1); return true; }
  if (k === 'ArrowLeft'){ e.preventDefault(); shiftBatch(-1); return true; }
  if (k === 'p' || k === 'P'){ setPlat(S.p === 'ig' ? 'fb' : 'ig'); return true; }
  if (k === 'f' || k === 'F'){ S.fs ? exitFs() : enterFs(); return true; }
  if (k === 'Escape' && S.fs){ if ($('.bmenu')) closeMenu(); else exitFs(); return true; }
  return false;
}
window.addEventListener('resize', function(){
  if (!mounted) return; movePills();
  var f = feedEl(); if (f) f.scrollTop = S.i * f.clientHeight;
});

window.ZADS = {
  mount: mount,
  render: render,
  key: key,
  enterFs: enterFs,
  onExit: null,
  isOpen: function(){ return S.fs; },
  leave: function(){ if (S.fs) exitFs(true); var f = feedEl(); if (f) $$('video', f).forEach(function(v){ v.pause(); }); },
  data: ADS_DATA
};
})();
