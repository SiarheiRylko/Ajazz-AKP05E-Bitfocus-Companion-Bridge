// AKP05E -> Companion Bridge (quiet + perf tweaks)

// ===== Config =====
const deviceId = 'AKP05E-bridge-1';
var compHost = '127.0.0.1';
var compPort = 16623;

// Debug
var VERBOSE = false;          // тихий режим
var PING_INTERVAL_MS = 5000;

// Tile geometry
var KEY_IMG_W = 144;
var KEY_IMG_H = 144;

// Text render tuning
var PADDING_FRAC = 0.10;
var MAX_LINES = 3;
var FONT_FAMILY = 'sans-serif';

// Function-button paging
const FUNCTION_BUTTON_ID = '0/4';  // удерживаешь эту кнопку и крутишь 4-й энкодер
const TARGET_ENCODER_ID  = '3/3';  // 4-й энкодер (правый)
const PAGE_NEXT_ID = '0/5';        // служебная "Next page"
const PAGE_PREV_ID = '1/5';        // служебная "Prev page"
var FORWARD_FUNCTION_BUTTON = false; // пробрасывать ли 0/4 в Companion

// ===== State =====
var wsComp = null;
var added = false;
var addFallbackTimer = null;
var pingTimer = null;
var triedNoBitmap = false;
var triedSuperMinimal = false;
var currentWithBitmap = true;

var sdSocket = null;
var ctxById = {};
var lastImageSigById = {};
var lastBitmapB64ById = {};
var lastDataUrlById = {};

var functionButtonDown = false;

// Reusable canvases (perf)
var _textCanvas = null, _textCtx = null;
var _bmpCanvas = null, _bmpCtx = null, _bmpImgData = null;

// ===== Utils =====
function b64(obj) {
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(obj)))); }
  catch (e) { console.error('[Bridge] b64 error', e); return ''; }
}
function sendSat(line) {
  try { if (wsComp && wsComp.readyState === 1) wsComp.send(line + '\r\n'); }
  catch (e) { console.error('[Bridge] send error', e); }
}
function logv(){ if(VERBOSE){ try{ console.log.apply(console, arguments); }catch(e){} } }

const TRANSPARENT_PNG_DATAURL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Yt6WZcAAAAASUVORK5CYII=';

// Decoding and normalization
function decodeText(s) {
  if (s == null) return '';
  var out = s;
  try {
    if (s.indexOf('%') >= 0) return decodeURIComponent(s);
    if (/^[A-Za-z0-9+/=]+$/.test(s) && (s.length % 4) === 0) {
      var bin = atob(s);
      return decodeURIComponent(escape(bin));
    }
  } catch (e) {}
  return out;
}
function normalizeTitle(s) {
  var t = String(s || '');
  t = t.replace(/\\n/g, ' ');
  t = t.replace(/[\r\n]+/g, ' ');
  t = t.replace(/\u00A0/g, ' ');
  t = t.replace(/\s{2,}/g, ' ');
  return t.trim();
}
function parseColorSpec(spec) {
  var def = { bg: '#000000', fg: '#FFFFFF' };
  if (!spec) return def;
  var s = String(spec).trim();
  function isHex(x){ return /^#?[0-9a-fA-F]{6}$/.test(x); }
  function norm(x){ var t=x||''; if (t.charAt(0) !== '#') t = '#' + t; return t.slice(0,7); }
  function autoFg(bg){
    var h=bg.replace('#','');
    var r=parseInt(h.substr(0,2),16), g=parseInt(h.substr(2,2),16), b=parseInt(h.substr(4,2),16);
    var yiq=((r*299)+(g*587)+(b*114))/1000;
    return yiq>=128 ? '#000000' : '#FFFFFF';
  }
  if (s.indexOf('=') >= 0) {
    var res = { bg: def.bg, fg: def.fg };
    s.split(/[,;|]/).forEach(function(p){
      var kv=p.split('=');
      if (kv.length===2) {
        var k=kv[0].trim().toLowerCase(), v=kv[1].trim();
        if (isHex(v)) {
          if (k==='bg' || k==='background') res.bg = norm(v);
          else if (k==='fg' || k==='color' || k==='text' || k==='font') res.fg = norm(v);
        }
      }
    });
    if (!res.fg) res.fg = autoFg(res.bg);
    return res;
  }
  if (/[\/,;|]/.test(s)) {
    var pp=s.split(/[\/,;|]/).map(function(t){return t.trim();}).filter(Boolean);
    if (pp.length>=2 && isHex(pp[0]) && isHex(pp[1])) return { bg: norm(pp[0]), fg: norm(pp[1]) };
  }
  if (isHex(s)) { var bg = norm(s); return { bg: bg, fg: autoFg(bg) }; }
  return def;
}
function isUiId(id){
  if (!id) return false;
  var parts = id.split('/');
  if (parts.length !== 2) return false;
  var r = parseInt(parts[0],10), c = parseInt(parts[1],10);
  if (isNaN(r) || isNaN(c)) return false;
  if (r === 0 || r === 1) return c >= 0 && c <= 4;
  if (r === 2) return c >= 0 && c <= 3;
  return false;
}
function mapKeyRowAjazzToComp(rIn) {
  if (rIn === 2) return 0;
  if (rIn === 1) return 1;
  if (rIn === 0) return 2;
  return rIn;
}

// ===== Reusable canvas helpers =====
function ensureTextCanvas(w,h){
  if (!_textCanvas){ _textCanvas = document.createElement('canvas'); _textCtx = _textCanvas.getContext('2d'); }
  if (_textCanvas.width !== w || _textCanvas.height !== h){ _textCanvas.width = w; _textCanvas.height = h; }
  return { canvas:_textCanvas, ctx:_textCtx };
}
function ensureBitmapCanvas(w,h){
  if (!_bmpCanvas){ _bmpCanvas = document.createElement('canvas'); _bmpCtx = _bmpCanvas.getContext('2d'); }
  if (_bmpCanvas.width !== w || _bmpCanvas.height !== h){ _bmpCanvas.width = w; _bmpCanvas.height = h; _bmpImgData = null; }
  if (!_bmpImgData || _bmpImgData.width!==w || _bmpImgData.height!==h){ _bmpImgData = _bmpCtx.createImageData(w,h); }
  return { canvas:_bmpCanvas, ctx:_bmpCtx, imgData:_bmpImgData };
}

// ===== Canvas renderer =====
function measureWrap(ctx, text, maxW, maxH, maxLines, baseSz){
  var words = String(text||'').split(/\s+/), minSize=10, maxSize=Math.max(16, baseSz||48);
  function trySize(sz){
    ctx.font = sz + 'px ' + FONT_FAMILY;
    var lines=[], line='', i;
    for (i=0;i<words.length;i++){
      var test = line ? (line + ' ' + words[i]) : words[i];
      if (ctx.measureText(test).width <= maxW) line = test;
      else {
        if (line) lines.push(line);
        line = words[i];
        if (lines.length >= maxLines-1) {
          var rest = words.slice(i+1).join(' ');
          if (rest) line = line + ' ' + rest;
          break;
        }
      }
    }
    if (line) lines.push(line);
    var lineH = sz*1.2, textH = lines.length*lineH, j, maxLineW=0;
    for (j=0;j<lines.length;j++){ var lw=ctx.measureText(lines[j]).width; if (lw>maxLineW) maxLineW=lw; }
    return { ok: (textH<=maxH && maxLineW<=maxW), lines: lines, size: sz, lineH: lineH };
  }
  var lo=minSize, hi=maxSize, ok=null;
  while (lo<=hi){ var mid=(lo+hi)>>1; var r=trySize(mid); if(r.ok){ ok=r; lo=mid+1; } else hi=mid-1; }
  return ok || trySize(minSize);
}
function renderTextImage(title, colorSpec){
  var W=KEY_IMG_W, H=KEY_IMG_H, pad=Math.floor(Math.min(W,H)*PADDING_FRAC), availW=W-pad*2, availH=H-pad*2;
  var env = ensureTextCanvas(W,H), canvas=env.canvas, ctx=env.ctx;
  var cs = parseColorSpec(colorSpec);
  ctx.fillStyle = cs.bg; ctx.fillRect(0,0,W,H);
  var meas = measureWrap(ctx, title||'', availW, availH, MAX_LINES, Math.floor(H*0.5));
  ctx.fillStyle = cs.fg; ctx.textAlign='center'; ctx.textBaseline='middle';
  var blockH = meas.lines.length*meas.lineH, y0=(H-blockH)/2 + meas.lineH/2, i;
  for (i=0;i<meas.lines.length;i++){ ctx.font = meas.size+'px '+FONT_FAMILY; ctx.fillText(meas.lines[i], W/2, y0 + i*meas.lineH); }
  try { return { dataUrl: canvas.toDataURL('image/png'), signature: 'txt:'+(title||'')+'|bg:'+cs.bg+'|fg:'+cs.fg+'|w:'+W+'|h:'+H }; } catch(e){ return null; }
}

// Convert BITMAP
function bitmapBase64ToDataUrl(w, h, base64Str) {
  try {
    if (/^iVBORw0KGgo/.test(base64Str)) return 'data:image/png;base64,' + base64Str;
    var bin = atob(base64Str);
    var expected = w * h * 3;
    if (bin.length < expected) { expected = bin.length - (bin.length % 3); }
    var env = ensureBitmapCanvas(w,h), ctx=env.ctx, imgData=env.imgData, dst=imgData.data, di=0;
    for (var i = 0; i < expected; i += 3) {
      var r = bin.charCodeAt(i)     & 255;
      var g = bin.charCodeAt(i + 1) & 255;
      var b = bin.charCodeAt(i + 2) & 255;
      dst[di++] = r; dst[di++] = g; dst[di++] = b; dst[di++] = 255;
    }
    ctx.putImageData(imgData, 0, 0);
    return env.canvas.toDataURL('image/png');
  } catch (e) {
    console.error('[Bridge] bitmapBase64ToDataUrl failed', e);
    return null;
  }
}

// ===== Ajazz helpers =====
function ajazzSend(obj){ try{ if(sdSocket && sdSocket.readyState===1) sdSocket.send(JSON.stringify(obj)); }catch(e){ console.error('[SDK-lite] send failed', e); } }
function ajazzClearTile(id){
  var ctx = ctxById[id]; if (!ctx) return;
  ajazzSend({ event:'setImage', context:ctx, payload:{ image: TRANSPARENT_PNG_DATAURL, target:0 } });
  lastImageSigById[id] = 'clear';
}
function ajazzSetImageDataUrl(id, dataUrl){
  var ctx = ctxById[id]; if (!ctx) return;
  ajazzSend({ event:'setImage', context:ctx, payload:{ image: dataUrl, target:0 } });
}

// ===== Device add =====
function buildLayout(opts){
  var withBitmap = !!(opts && opts.withBitmap);
  var minimal = !!(opts && opts.minimal);
  var layout = {
    stylePresets:{ "default":{ colors:"hex", text:true }, "encoder":{ colors:"hex" } },
    controls:{
      "0/0":{row:0,column:0},"0/1":{row:0,column:1},"0/2":{row:0,column:2},"0/3":{row:0,column:3},"0/4":{row:0,column:4},
      "1/0":{row:1,column:0},"1/1":{row:1,column:1},"1/2":{row:1,column:2},"1/3":{row:1,column:3},"1/4":{row:1,column:4},
      "2/0":{row:2,column:0},"2/1":{row:2,column:1},"2/2":{row:2,column:2},"2/3":{row:2,column:3},
      "3/0":{row:3,column:0,stylePreset:"encoder"},"3/1":{row:3,column:1,stylePreset:"encoder"},"3/2":{row:3,column:2,stylePreset:"encoder"},"3/3":{row:3,column:3,stylePreset:"encoder"},
      "0/5":{row:0,column:5},"1/5":{row:1,column:5}
    }
  };
  if (withBitmap) layout.stylePresets["default"].bitmap = { w: KEY_IMG_W, h: KEY_IMG_H };
  if (minimal) delete layout.stylePresets.encoder;
  return layout;
}
function addDevice(opts){
  currentWithBitmap = !!(opts && opts.withBitmap);
  var layout = buildLayout(opts);
  var cmd = 'ADD-DEVICE DEVICEID='+deviceId+' PRODUCT_NAME="Ajazz AKP05E Bridge" SERIAL="akp05e:363C" LAYOUT_MANIFEST="'+ b64(layout) +'"';
  logv('[Bridge] SEND ADD-DEVICE' + (opts && opts.minimal ? ' (minimal)' : '') + (currentWithBitmap ? ' +bitmap' : ' -bitmap'));
  sendSat(cmd);
}
function addDeviceOnce(){
  if (added) return;
  added = true;
  if (addFallbackTimer){ clearTimeout(addFallbackTimer); addFallbackTimer=null; }
  addDevice({ minimal:false, withBitmap:true });
}

// ===== Parser =====
function getParam(line,key){
  var pat=key+'=', i=line.indexOf(pat); if(i<0) return null;
  var j=i+pat.length;
  if (line.charAt(j)==='"'){ var k=line.indexOf('"', j+1); return k>j? line.substring(j+1,k) : null; }
  var end=line.indexOf(' ', j); if(end<0) end=line.length; return line.substring(j,end);
}

// ===== Incoming from Companion =====
function handleCompData(data){
  var lines=String(data).split('\n');
  for (var i=0;i<lines.length;i++){
    var line=lines[i]; if(line && line.charCodeAt(line.length-1)===13) line=line.substring(0,line.length-1);
    if (!line) continue;

    if (line.indexOf('KEY-STATE')===0){
      var cid = getParam(line,'CONTROLID') || getParam(line,'KEY') || null;
      var rawB = getParam(line,'BITMAP') || '';
      var textRaw = getParam(line,'TEXT');
      var title = normalizeTitle(decodeText(textRaw));
      var colorSpec = getParam(line,'COLOR') || '';

      if (isUiId(cid)){
        if (rawB.length > 0) {
          if (lastBitmapB64ById[cid] !== rawB) {
            var dataUrl = bitmapBase64ToDataUrl(KEY_IMG_W, KEY_IMG_H, rawB);
            if (dataUrl) {
              ajazzSetImageDataUrl(cid, dataUrl);
              lastBitmapB64ById[cid] = rawB;
              lastDataUrlById[cid] = dataUrl;
              lastImageSigById[cid] = 'bm:updated';
            }
          } else {
            logv('[Bridge] BITMAP unchanged', cid);
          }
        } else {
          var sig = 'local:' + (title||'') + '|' + (colorSpec||'');
          if (sig !== lastImageSigById[cid]) {
            var rend = renderTextImage(title||'', colorSpec||'');
            if (rend && rend.dataUrl) {
              ajazzSetImageDataUrl(cid, rend.dataUrl);
              lastDataUrlById[cid] = rend.dataUrl;
              lastBitmapB64ById[cid] = null;
              lastImageSigById[cid] = rend.signature;
            } else {
              ajazzSetImageDataUrl(cid, TRANSPARENT_PNG_DATAURL);
              lastDataUrlById[cid] = TRANSPARENT_PNG_DATAURL;
              lastBitmapB64ById[cid] = null;
              lastImageSigById[cid] = 'clear';
            }
          }
        }
      } else {
        logv('[Bridge] KEY-STATE (ignored UI):', line);
      }

      if (VERBOSE){
        var prs=getParam(line,'PRESSED');
        console.log('[Bridge] KEY-STATE id='+cid,'pressed='+prs,'textLen='+(title?title.length:0),'bitmapLen='+rawB.length,'color='+(colorSpec||''));
      }
      continue;
    }

    if (line.indexOf('PONG')===0) continue;
    logv('[Bridge] <=', line);

    if (line.indexOf('BEGIN')===0){
      addDeviceOnce();
    } else if (line.indexOf('PING')===0){
      var tail = line.length>=5 ? line.substring(5) : ''; sendSat('PONG '+tail);
    } else if (line.indexOf('CAPS')===0){
      logv('[Bridge] Satellite CAPS', line);
    } else if (line.indexOf('ADD-DEVICE ERROR')===0){
      var msg=getParam(line,'MESSAGE')||'';
      if (/Invalid LAYOUT_MANIFEST/i.test(msg)) {
        if (currentWithBitmap && !triedNoBitmap) {
          console.warn('[Bridge] Manifest invalid, retry without bitmap');
          triedNoBitmap = true;
          setTimeout(function(){ addDevice({ minimal:false, withBitmap:false }); }, 120);
        } else if (!triedSuperMinimal) {
          console.warn('[Bridge] Manifest invalid, retry minimal');
          triedSuperMinimal = true;
          setTimeout(function(){ addDevice({ minimal:true, withBitmap:false }); }, 120);
        } else {
          console.error('[Bridge] Manifest still invalid after fallbacks');
        }
      } else {
        console.error('[Bridge] Satellite ERROR', line);
      }
    } else if (line.indexOf('ERROR')===0){
      console.error('[Bridge] Satellite ERROR', line);
    }
  }
}

// ===== Trigger Companion controls (paging) =====
function triggerControlPress(controlId){
  sendCmdSatellite(['KEY-PRESS','DEVICEID="'+deviceId+'"','CONTROLID="'+controlId+'"','PRESSED=1']);
  setTimeout(function(){
    sendCmdSatellite(['KEY-PRESS','DEVICEID="'+deviceId+'"','CONTROLID="'+controlId+'"','PRESSED=0']);
  }, 50);
}
function sendCmdSatellite(parts){
  var line=parts.join(' ');
  logv('[Bridge] =>', line);
  sendSat(line);
}

// ===== Connect to Companion =====
function connectComp(){
  var url='ws://'+compHost+':'+compPort+'/';
  logv('[Bridge] Connecting to Companion WS:', url);
  try{
    wsComp=new WebSocket(url);
    wsComp.onopen=function(){
      logv('[Bridge] WS open'); added=false; triedNoBitmap=false; triedSuperMinimal=false;
      if(pingTimer) clearInterval(pingTimer);
      pingTimer=setInterval(function(){ sendSat('PING '+Date.now()); }, PING_INTERVAL_MS);
      if(addFallbackTimer) clearTimeout(addFallbackTimer);
      addFallbackTimer=setTimeout(function(){ if(!added){ console.warn('[Bridge] Fallback: sending ADD-DEVICE without BEGIN'); addDeviceOnce(); } }, 1200);
    };
    wsComp.onmessage=function(ev){ handleCompData(ev.data); };
    wsComp.onclose=function(){ console.warn('[Bridge] WS closed'); if(addFallbackTimer){clearTimeout(addFallbackTimer); addFallbackTimer=null;} if(pingTimer){clearInterval(pingTimer); pingTimer=null;} setTimeout(connectComp,2000); };
    wsComp.onerror=function(e){ console.error('[Bridge] WS error', e); try{ wsComp.close(); }catch(e2){} };
  }catch(e){ console.error('[Bridge] WS connect exception', e); }
}
connectComp();

// ===== SDK-lite (Ajazz) =====
if (typeof window.connectElgatoStreamDeckSocket !== 'function'){
  window.connectElgatoStreamDeckSocket = function (port, uuid, registerEvent, infoStr){
    logv('[SDK-lite] connect', { port:port, uuid:uuid, registerEvent:registerEvent });
    try{
      var s=new WebSocket('ws://127.0.0.1:'+port); sdSocket=s;

      s.onopen=function(){
        try{
          s.send(JSON.stringify({ event:registerEvent, uuid:uuid }));
          logv('[SDK-lite] registered');
        }catch(e){ console.error('[SDK-lite] register send failed', e); }
      };

      function keyIdMappedObj(coords){
        var rIn=(coords&&coords.row)|0, c=(coords&&coords.column)|0;
        var rOut=mapKeyRowAjazzToComp(rIn);
        return { in:rIn+'/'+c, out:rOut+'/'+c, rOut:rOut, c:c };
      }
      function encIdMappedObj(coords){
        var rIn=(coords&&coords.row)|0, c=(coords&&coords.column)|0;
        var idx=(rIn*2 + c); // 0..3
        return { in:'enc?('+rIn+','+c+')', out:'3/'+idx };
      }
      function sendCmd(parts){ var line=parts.join(' '); logv('[Bridge] =>', line); sendSat(line); }
      function sendPressByControlId(id,isDown,dbgIn){
        var v=isDown?1:0; logv('[SDK-lite] press', dbgIn, '->', id, 'down='+v);
        sendCmd(['KEY-PRESS','DEVICEID="'+deviceId+'"','CONTROLID="'+id+'"','PRESSED='+v]);
      }
      function sendRotate(id,dir,dbgIn){
        logv('[SDK-lite] rotate', dbgIn, '->', id, 'dir='+dir);
        sendCmd(['KEY-ROTATE','DEVICEID="'+deviceId+'"','CONTROLID="'+id+'"','DIRECTION='+dir]);
      }

      s.onmessage=function(ev){
        var msg; try{ msg=JSON.parse(String(ev.data)); }catch(e){ return; }
        if(!msg||!msg.event) return;
        var evn=msg.event, p=msg.payload||{}, coords=p.coordinates||{}, ctx=msg.context;

        if (evn==='willAppear'){
          var m=keyIdMappedObj(coords);
          if (isUiId(m.out)){
            ctxById[m.out]=ctx;
            if (lastDataUrlById[m.out]) { ajazzSetImageDataUrl(m.out, lastDataUrlById[m.out]); }
            else { ajazzClearTile(m.out); }
            logv('[SDK-lite] willAppear (UI)', m.in, '->', m.out, 'ctx=', ctx);
          } else {
            logv('[SDK-lite] willAppear (non-UI ignored)', m.in, '->', m.out, 'ctx=', ctx);
          }
          return;
        }

        if (evn==='willDisappear'){
          var m2=keyIdMappedObj(coords);
          if (isUiId(m2.out) && ctxById[m2.out]===ctx) delete ctxById[m2.out];
          logv('[SDK-lite] willDisappear', m2.in, '->', m2.out, 'ctx=', ctx);
          return;
        }

        if (evn==='keyDown'){
          var km=keyIdMappedObj(coords);
          if (km.out === FUNCTION_BUTTON_ID){
            functionButtonDown = true;
            if (FORWARD_FUNCTION_BUTTON) sendPressByControlId(km.out, true, km.in);
            return;
          }
          sendPressByControlId(km.out, true, km.in);
        } else if (evn==='keyUp'){
          var km2=keyIdMappedObj(coords);
          if (km2.out === FUNCTION_BUTTON_ID){
            functionButtonDown = false;
            if (FORWARD_FUNCTION_BUTTON) sendPressByControlId(km2.out, false, km2.in);
            return;
          }
          sendPressByControlId(km2.out, false, km2.in);
        } else if (evn==='dialRotate'){
          var t=(p.ticks|0);
          if (t!==0){
            var em=encIdMappedObj(coords);
            var dir = t>0?1:-1;

            if (functionButtonDown && em.out === TARGET_ENCODER_ID){
              if (dir > 0){ triggerControlPress(PAGE_NEXT_ID); }
              else { triggerControlPress(PAGE_PREV_ID); }
              return; // не пробрасываем штатное вращение в режиме "функции"
            }
            sendRotate(em.out, dir, em.in);
          }
        } else if (evn==='dialDown'){
          var em2=encIdMappedObj(coords); sendPressByControlId(em2.out, true, em2.in);
        } else if (evn==='dialUp'){
          var em3=encIdMappedObj(coords); sendPressByControlId(em3.out, false, em3.in);
        }
      };

      s.onclose=function(){ console.warn('[SDK-lite] socket closed'); sdSocket=null; };
      s.onerror=function(e){ console.error('[SDK-lite] socket error', e); };
    }catch(e){ console.error('[SDK-lite] connect failed', e); }
  };
  logv('[SDK-lite] installed');
} else {
  logv('[SDK-lite] native SDK already present');
}
