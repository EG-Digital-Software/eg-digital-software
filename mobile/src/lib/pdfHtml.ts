/**
 * The page the agreement viewer runs in a WebView: pdf.js renders the pages and,
 * in sign mode, each admin-placed field gets a box to type in or draw a signature.
 * On submit pdf-lib draws the values onto the PDF exactly like the web portal's
 * fill-and-sign dialog (Helvetica text, Times Italic typed signatures, images
 * fitted in their box, "Signed By … IP - …" in the last page's footer).
 *
 * Messages in:  {type:'load', pdf, mode, fields, signer}  · {type:'submit'}
 * Messages out: {type:'ready'} · {type:'loaded', pages} · {type:'count', filled, total}
 *               {type:'done', pdf, filled} · {type:'error', message}
 */
export const PDF_BASE_URL = 'https://cdnjs.cloudflare.com/';

export const PDF_HTML = `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=4">
<style>
  html,body{margin:0;background:#EEF1F5;font-family:-apple-system,Roboto,sans-serif;-webkit-tap-highlight-color:transparent}
  #pages{padding:12px 12px 40px}
  .page{position:relative;margin:0 auto 14px;background:#fff;box-shadow:0 2px 10px rgba(15,35,64,.18)}
  .page canvas{display:block;width:100%;height:100%}
  .f{position:absolute;box-sizing:border-box;border:1.5px solid rgba(23,138,99,.8);background:rgba(255,255,255,.88);border-radius:3px;display:flex;align-items:center;overflow:hidden}
  .f.sig{border-style:dashed;border-color:#178A63;background:rgba(232,247,240,.92)}
  .f.done{border-color:#2DB98A;background:rgba(255,255,255,.95)}
  .f.chk{justify-content:center;border-width:2px}
  .f.chk svg{width:85%;height:85%}
  .f input{flex:1;min-width:0;height:100%;border:0;background:transparent;padding:0 3px;font-size:13px;color:#000;outline:none}
  .f .tap{flex:1;text-align:center;font-size:11px;font-weight:600;color:#178A63;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 2px}
  .f img{flex:1;min-width:0;height:100%;object-fit:contain}
  .f .typed{flex:1;font-family:'Times New Roman',serif;font-style:italic;font-size:16px;color:#000;padding:0 3px;white-space:nowrap;overflow:hidden}
  #msg{padding:40px 20px;text-align:center;color:#4F5F75;font-size:15px}
  /* Signature pad */
  #pad{position:fixed;inset:0;background:rgba(15,35,64,.45);display:none;align-items:flex-end;z-index:10}
  #pad.on{display:flex}
  .sheet{background:#fff;width:100%;border-radius:22px 22px 0 0;padding:14px 16px 22px;box-sizing:border-box}
  .sheet h3{margin:0 0 4px;font-size:17px;color:#0F2340}
  .sheet p{margin:0 0 12px;font-size:13px;color:#4F5F75}
  #cv{width:100%;border:1.5px dashed #9FD9C2;border-radius:12px;background:#F3FBF7;touch-action:none;display:block}
  .tabs{display:flex;gap:8px;margin-bottom:12px}
  .tabs button{flex:1;height:38px;border-radius:8px;border:1px solid #E3E8EF;background:#fff;color:#4F5F75;font-weight:600;font-size:14px}
  .tabs button.on{background:#DDF3E9;border-color:#DDF3E9;color:#0B5E40}
  #typed{width:100%;box-sizing:border-box;height:56px;border:0;border-bottom:1.5px solid #8C99AB;border-radius:6px 6px 0 0;background:#F1F4F7;font-family:'Times New Roman',serif;font-style:italic;font-size:24px;padding:0 12px;outline:none}
  .row{display:flex;gap:10px;margin-top:14px}
  .row button{flex:1;height:48px;border-radius:999px;font-weight:600;font-size:15px}
  .b1{background:#fff;border:1px solid #E3E8EF;color:#0F2340}
  .b2{background:#0F2340;border:1px solid #0F2340;color:#fff}
</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"></script>
</head><body>
<div id="pages"><div id="msg">Loading document…</div></div>
<div id="pad"><div class="sheet">
  <h3 id="padTitle">Signature</h3>
  <p>Draw with your finger, or type your name.</p>
  <div class="tabs"><button id="tDraw" class="on">Draw</button><button id="tType">Type</button></div>
  <canvas id="cv"></canvas>
  <input id="typed" placeholder="Type your full name" style="display:none" autocomplete="off">
  <div class="row"><button class="b1" id="pClear">Clear</button><button class="b1" id="pCancel">Cancel</button><button class="b2" id="pDone">Done</button></div>
</div></div>
<script>
(function(){
  var post=function(o){ window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(o)); };
  window.onerror=function(m){ post({type:'error',message:String(m)}); };
  if(window.pdfjsLib){ pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; }

  var state={ bytes:null, fields:[], mode:'preview', signer:null, entries:{} };

  function b64ToBytes(b64){ var bin=atob(b64), out=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) out[i]=bin.charCodeAt(i); return out; }
  function filledIds(){ return state.fields.filter(function(f){ var e=state.entries[f.id]; return e && (e.mode==='check' ? e.checked : (e.mode==='image' || (e.text||'').trim())); }).map(function(f){ return f.id; }); }
  function count(){ post({type:'count', filled:filledIds().length, total:state.fields.length}); }
  function latin1(v){ return v.replace(/[^\\x20-\\x7E\\xA0-\\xFF]/g,'?'); }

  function renderField(box,f){
    box.innerHTML='';
    if(f.kind==='checkbox'){
      var on=!!(state.entries[f.id]&&state.entries[f.id].checked);
      box.className='f chk'+(on?' done':'');
      if(on) box.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
      box.onclick=function(){ state.entries[f.id]={mode:'check',checked:!on}; renderField(box,f); count(); };
      return;
    }
    var e=state.entries[f.id];
    var sig=f.kind==='signature';
    box.className='f'+(sig?' sig':'')+(e&&(e.mode==='image'||(e.text||'').trim())?' done':'');
    if(sig){
      if(e&&e.mode==='image'){ var im=document.createElement('img'); im.src=e.dataUrl; box.appendChild(im); }
      else if(e&&(e.text||'').trim()){ var t=document.createElement('div'); t.className='typed'; t.textContent=e.text; box.appendChild(t); }
      else { var tp=document.createElement('div'); tp.className='tap'; tp.textContent='Tap to sign'+(f.label?' · '+f.label:''); box.appendChild(tp); }
      box.onclick=function(){ openPad(f, box); };
    } else {
      var inp=document.createElement('input');
      inp.placeholder=f.label||'';
      inp.value=e&&e.mode==='text'?e.text:'';
      inp.oninput=function(){ state.entries[f.id]={mode:'text',text:inp.value}; box.className='f'+(inp.value.trim()?' done':''); count(); };
      box.appendChild(inp);
    }
  }

  // Android can report a 0px viewport until the WebView is laid out.
  function viewWidth(){ return document.documentElement.clientWidth||window.innerWidth||(window.screen&&window.screen.width)||360; }
  function waitForLayout(){ return new Promise(function(res){ var n=0; (function tick(){ if((document.documentElement.clientWidth||window.innerWidth)>50||n++>40) res(); else setTimeout(tick,50); })(); }); }
  var loading=false;
  async function load(msg){
    if(loading) return; loading=true;
    state.mode=msg.mode; state.fields=msg.fields||[]; state.signer=msg.signer||null; state.entries={};
    state.bytes=b64ToBytes(msg.pdf);
    await waitForLayout();
    var root=document.getElementById('pages'); root.innerHTML='';
    var doc=await pdfjsLib.getDocument({data:state.bytes.slice()}).promise;
    var width=Math.max(200, Math.min(viewWidth()-24, 900));
    var dpr=Math.min(window.devicePixelRatio||1, 3);
    for(var i=1;i<=doc.numPages;i++){
      var page=await doc.getPage(i);
      var vp1=page.getViewport({scale:1});
      var scale=width/vp1.width;
      var vp=page.getViewport({scale:scale*dpr});
      var wrap=document.createElement('div'); wrap.className='page';
      wrap.style.width=width+'px'; wrap.style.height=(vp1.height*scale)+'px';
      var cv=document.createElement('canvas'); cv.width=vp.width; cv.height=vp.height;
      wrap.appendChild(cv); root.appendChild(wrap);
      await page.render({canvasContext:cv.getContext('2d'), viewport:vp}).promise;
      if(state.mode==='sign'){
        var W=width, H=vp1.height*scale;
        state.fields.filter(function(f){ return f.page===i-1; }).forEach(function(f){
          var box=document.createElement('div');
          box.style.left=(f.xPct*W)+'px'; box.style.top=(f.yPct*H)+'px';
          box.style.width=(f.wPct*W)+'px'; box.style.height=(f.hPct*H)+'px';
          wrap.appendChild(box); renderField(box,f);
        });
      }
    }
    post({type:'loaded', pages:doc.numPages});
    if(state.mode==='sign') count();
  }

  // ── Signature pad ──
  var pad=document.getElementById('pad'), cv=document.getElementById('cv'), ctx=cv.getContext('2d'), typed=document.getElementById('typed');
  var cur=null, curBox=null, drawn=false, typing=false;
  function sizePad(f){
    var w=cv.clientWidth||window.innerWidth-32;
    var ratio=Math.max(2, Math.min(5, f.wPct/(f.hPct||0.05)*1.3));
    var h=Math.max(120, Math.min(220, w/ratio));
    var dpr=window.devicePixelRatio||1;
    cv.style.height=h+'px'; cv.width=w*dpr; cv.height=h*dpr;
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.lineWidth=2.4; ctx.lineCap='round'; ctx.lineJoin='round'; ctx.strokeStyle='#0B1526';
    ctx.clearRect(0,0,w,h); drawn=false;
  }
  function mode(t){ typing=t; document.getElementById('tDraw').className=t?'':'on'; document.getElementById('tType').className=t?'on':''; cv.style.display=t?'none':'block'; typed.style.display=t?'block':'none'; if(t) setTimeout(function(){ typed.focus(); },50); }
  function openPad(f, box){ cur=f; curBox=box; document.getElementById('padTitle').textContent=f.label||'Signature'; pad.className='on'; mode(false); sizePad(f); var e=state.entries[f.id]; typed.value=e&&e.mode==='text'?e.text:''; }
  document.getElementById('tDraw').onclick=function(){ mode(false); };
  document.getElementById('tType').onclick=function(){ mode(true); };
  document.getElementById('pClear').onclick=function(){ if(typing){ typed.value=''; } else { sizePad(cur); } };
  document.getElementById('pCancel').onclick=function(){ pad.className=''; };
  document.getElementById('pDone').onclick=function(){
    if(typing){ var v=typed.value.trim(); if(v) state.entries[cur.id]={mode:'text',text:v}; else delete state.entries[cur.id]; }
    else if(drawn){ state.entries[cur.id]={mode:'image',dataUrl:cv.toDataURL('image/png'),isPng:true}; }
    renderField(curBox,cur); pad.className=''; count();
  };
  var last=null;
  function pt(e){ var r=cv.getBoundingClientRect(); var t=e.touches?e.touches[0]:e; return {x:t.clientX-r.left,y:t.clientY-r.top}; }
  cv.addEventListener('pointerdown',function(e){ last=pt(e); cv.setPointerCapture(e.pointerId); e.preventDefault(); });
  cv.addEventListener('pointermove',function(e){ if(!last) return; var p=pt(e); ctx.beginPath(); ctx.moveTo(last.x,last.y); ctx.lineTo(p.x,p.y); ctx.stroke(); last=p; drawn=true; e.preventDefault(); });
  cv.addEventListener('pointerup',function(){ last=null; });
  cv.addEventListener('pointercancel',function(){ last=null; });

  // ── Build the filled PDF ──
  async function submit(){
    try{
      var ids=filledIds();
      if(!ids.length){ post({type:'error',message:'Fill at least one field before submitting.'}); return; }
      var L=PDFLib, out=await L.PDFDocument.load(state.bytes);
      var font=await out.embedFont(L.StandardFonts.Helvetica);
      var sigFont=await out.embedFont(L.StandardFonts.TimesRomanItalic);
      var pages=out.getPages();
      for(var k=0;k<state.fields.length;k++){
        var f=state.fields[k], e=state.entries[f.id]; if(!e) continue;
        var page=pages[f.page]||pages[0], sz=page.getSize(), pw=sz.width, ph=sz.height;
        var boxW=f.wPct*pw, boxH=f.hPct*ph, x=f.xPct*pw, yBottom=ph-f.yPct*ph-boxH;
        if(e.mode==='check'){
          if(!e.checked) continue;
          // A tick drawn as two strokes, centred in the box (same as the web portal).
          var sd=Math.min(boxW,boxH), cx=x+(boxW-sd)/2, cy=yBottom+(boxH-sd)/2, th=Math.max(1,sd*0.13), blk=L.rgb(0,0,0);
          page.drawLine({start:{x:cx+sd*0.18,y:cy+sd*0.52},end:{x:cx+sd*0.42,y:cy+sd*0.24},thickness:th,color:blk,lineCap:L.LineCapStyle.Round});
          page.drawLine({start:{x:cx+sd*0.42,y:cy+sd*0.24},end:{x:cx+sd*0.84,y:cy+sd*0.8},thickness:th,color:blk,lineCap:L.LineCapStyle.Round});
          continue;
        }
        if(e.mode==='text'){
          var v=latin1((e.text||'').trim()); if(!v) continue;
          var useFont=f.kind==='signature'?sigFont:font, max=f.kind==='signature'?20:13;
          var size=Math.min(max, boxH*0.9), w=useFont.widthOfTextAtSize(v,size);
          if(w>boxW-4) size=Math.max(6, size*((boxW-4)/w));
          page.drawText(v,{x:x+2,y:yBottom+(boxH-size)/2+size*0.12,size:size,font:useFont,color:L.rgb(0,0,0)});
          continue;
        }
        var img=await out.embedPng(b64ToBytes(e.dataUrl.split(',')[1]));
        var ratio=Math.min(boxW/img.width, boxH/img.height), iw=img.width*ratio, ih=img.height*ratio;
        page.drawImage(img,{x:x+(boxW-iw)/2,y:yBottom+(boxH-ih)/2,width:iw,height:ih});
      }
      if(state.signer){
        var lastPage=pages[pages.length-1];
        lastPage.drawText(latin1('Signed By '+state.signer.name+' IP - '+state.signer.ip),{x:36,y:22,size:8,font:font,color:L.rgb(0.25,0.25,0.25)});
      }
      var b64=await out.saveAsBase64();
      // Every checkbox counts as answered (left unticked is an answer too).
      var answered=ids.concat(state.fields.filter(function(f){ return f.kind==='checkbox' && ids.indexOf(f.id)<0; }).map(function(f){ return f.id; }));
      post({type:'done', pdf:b64, filled:answered});
    }catch(err){ post({type:'error',message:(err&&err.message)||'Could not save the document'}); }
  }

  function onMsg(ev){
    var m; try{ m=JSON.parse(ev.data); }catch(e){ return; }
    if(m.type==='load') load(m).catch(function(err){ loading=false; document.getElementById('pages').innerHTML='<div id="msg">Could not open this document.</div>'; post({type:'error',message:(err&&err.message)||'Could not open the PDF'}); });
    if(m.type==='submit') submit();
  }
  // Keep the box being typed in visible once the keyboard shrinks the view.
  function revealActive(){ var a=document.activeElement; if(a && a.tagName==='INPUT' && a.id!=='typed') a.scrollIntoView({block:'center',behavior:'smooth'}); }
  window.addEventListener('resize',function(){ setTimeout(revealActive,60); });
  document.addEventListener('focusin',function(){ setTimeout(revealActive,350); });

  document.addEventListener('message',onMsg);
  window.addEventListener('message',onMsg);
  post({type:'ready', libs: !!(window.pdfjsLib && window.PDFLib)});
})();
</script>
</body></html>`;
