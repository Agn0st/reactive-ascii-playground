/* reactive-ascii.js — interactive ASCII art on a grid that never moves.
 *
 * Every cell keeps its position for good. What changes is where the cell READS
 * from: it draws the glyph it finds at a shifted spot in the source art, so
 * features stretch under the pointer and settle back. No glyph ever travels.
 *
 * chromatic.js is optional. Load it before this file for the WebGL2 aberration
 * pass; without it the deformation and the trail still run on plain Canvas 2D.
 *
 * MIT — https://github.com/Agn0st/reactive-ascii-playground
 */
(function(global){
'use strict';

const defaults={
  radius:80,            // px — pointer reach
  strength:.7,          // 0..1 — how hard the pointer pulls
  recovery:2000,        // ms — time to settle back
  memory:1200,          // ms — how fast old strokes are forgotten
  limit:24,             // px — hard cap on displacement
  aberration:.5,        // 0..1.5 — RGB split, needs chromatic.js + WebGL2
  trail:.6,             // 0..1 — density of the random trail
  trailDuration:1800,   // ms — trail lifetime
  color:'#F6F4F1',      // glyph colour
  background:'#1F2533', // must match the element behind the canvas
  glyphs:'.:;-=+*#%@/\\!?01',
  fontSize:12,          // px at scale 1
  cellWidth:7.2,        // px at scale 1 — monospace advance
  cellHeight:12,        // px at scale 1 — line height
  paddingX:32,          // px kept free left+right when fitting the art
  paddingY:80,          // px kept free top+bottom when fitting the art
  respectReducedMotion:true
};

const numeric=['radius','strength','recovery','memory','limit','aberration','trail',
  'trailDuration','fontSize','cellWidth','cellHeight','paddingX','paddingY'];
const relayout=['cellWidth','cellHeight','paddingX','paddingY'];

function rgb(hex){
  const m=/^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(String(hex).trim());
  return m?[parseInt(m[1],16)/255,parseInt(m[2],16)/255,parseInt(m[3],16)/255]:[0,0,0];
}

/* A string with a newline is art. A bare "#id" / ".class" is where the art lives. */
function resolveArt(art){
  if(art instanceof Element)return art.textContent;
  if(Array.isArray(art))return art.join('\n');
  const text=String(art==null?'':art);
  if(!text.includes('\n')&&/^[#.[]/.test(text.trim())){
    const el=document.querySelector(text.trim());
    if(el)return el.textContent;
  }
  return text;
}

function toLines(art){
  const lines=resolveArt(art).replace(/\t/g,'    ').split('\n');
  while(lines.length&&!lines[0].trim())lines.shift();
  while(lines.length&&!lines[lines.length-1].trim())lines.pop();
  return lines.length?lines:[' '];
}

function plainRenderer(canvas){
  return {ctx:canvas.getContext('2d'),source:canvas,resize(){},present(){},supported:false};
}

function create(options){
  const cfg=Object.assign({},defaults,options);
  const canvas=typeof cfg.canvas==='string'?document.querySelector(cfg.canvas):cfg.canvas;
  if(!canvas)throw Error('ReactiveAscii: canvas not found');

  const renderer=typeof global.createChromaticRenderer==='function'
    ?global.createChromaticRenderer(canvas):plainRenderer(canvas);
  const ctx=renderer.ctx;
  const motion=window.matchMedia('(prefers-reduced-motion: reduce)');

  let lines=toLines(cfg.art),rows=lines.length,cols=Math.max(1,...lines.map(l=>l.length));
  let background=rgb(cfg.background);
  let width=0,height=0,scale=1,cw=0,ch=0,ox=0,oy=0,grid=[],nx=0,ny=0;
  let raf=0,last=0,autoStart=0,autoLength=2600,ptr=null,inFrame=false,dead=false;

  const reduced=()=>cfg.respectReducedMotion&&motion.matches;
  const sourceChar=(ax,ay)=>(lines[ay]&&lines[ay][ax])||' ';

  /* Pick a trail glyph that differs from what is under it and from the last one.
   * Bounded, because cfg.glyphs may be short enough to make that impossible. */
  function pickGlyph(under,previous){
    const g=cfg.glyphs;
    if(!g.length)return ' ';
    let glyph=g[0];
    for(let i=0;i<8;i++){
      glyph=g[Math.floor(Math.random()*g.length)];
      if(glyph!==under&&glyph!==previous)break;
    }
    return glyph;
  }

  function draw(now){
    if(now===undefined)now=performance.now();
    ctx.clearRect(0,0,width,height);
    ctx.font=(cfg.fontSize*scale)+'px monospace';
    ctx.textBaseline='top';
    ctx.fillStyle=cfg.color;
    ctx.globalAlpha=1;
    for(const c of grid){
      // The warped original stays intact beneath a separate, predominantly empty-cell trail.
      const char=(c.dx||c.dy)?sourceChar(Math.round(c.ax-c.dx/cw),Math.round(c.ay-c.dy/ch)):c.char;
      // Hold briefly, then smoothly fade deposited symbols over the rest of their independent lifetime.
      const life=cfg.trailDuration*c.noiseLife;
      const age=c.noiseBirth===null?Infinity:now-c.noiseBirth;
      const alive=c.noiseBirth!==null&&age<life;
      ctx.globalAlpha=1;
      if(alive&&cfg.trail>0&&(char===' '||c.noiseAllowFilled)){
        if(now>=c.nextNoise){
          c.noiseGlyph=pickGlyph(char,c.noiseGlyph);
          c.nextNoise=now+85+Math.random()*65;
        }
        const progress=Math.max(0,Math.min(1,(age/life-.25)/.75));
        const opacity=1-progress*progress*(3-2*progress);
        if(char!==' '&&opacity<.999){ctx.globalAlpha=1-opacity;ctx.fillText(char,c.x,c.y)}
        if(opacity>.001){ctx.globalAlpha=opacity;ctx.fillText(c.noiseGlyph,c.x,c.y)}
      }else if(char!==' ')ctx.fillText(char,c.x,c.y);
    }
    ctx.globalAlpha=1;
    renderer.present(grid,nx,ny,cw,ch,width,height,reduced()?0:cfg.aberration,background);
  }

  function size(){
    if(dead)return;
    const r=canvas.getBoundingClientRect();
    width=r.width;height=r.height;
    // A hidden or zero-sized canvas would drive cw to 0 and the grid loop to Infinity.
    if(!(width>0&&height>0))return;
    const dpr=Math.min(window.devicePixelRatio||1,2);
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
    renderer.resize(canvas.width,canvas.height);
    ctx.setTransform(dpr,0,0,dpr,0,0);
    scale=Math.min((width-cfg.paddingX)/(cols*cfg.cellWidth),(height-cfg.paddingY)/(rows*cfg.cellHeight));
    if(!(scale>.01))scale=.01;
    cw=cfg.cellWidth*scale;ch=cfg.cellHeight*scale;
    ox=(width-cols*cw)/2;oy=(height-rows*ch)/2;
    const gx=Math.ceil(ox/cw),gy=Math.ceil(oy/ch);
    nx=cols+gx*2;ny=rows+gy*2;
    grid=[];
    for(let ay=-gy;ay<rows+gy;ay++)for(let ax=-gx;ax<cols+gx;ax++)grid.push({
      ax,ay,x:ox+ax*cw,y:oy+ay*ch,char:sourceChar(ax,ay),
      dx:0,dy:0,tx:0,ty:0,energy:0,
      noiseGlyph:' ',nextNoise:0,noiseBirth:null,noiseLife:1,noiseAllowFilled:false,
      paintRoll:1,emittedThisPass:false,lastPaint:-Infinity,touched:-Infinity
    });
    ptr=null;draw();
  }

  function drag(x,y,dx,dy,now){
    const r=cfg.radius,power=cfg.strength,limit=Math.min(cfg.limit,r*.5);
    for(const c of grid){
      const d2=((c.x+cw*.5-x)**2+(c.y+ch*.5-y)**2)/(r*r);
      if(d2>3)continue;
      const influence=Math.exp(-3.2*d2)*power*.9;
      const paintEnergy=Math.exp(-4.5*d2)*power;
      c.energy=Math.max(c.energy,paintEnergy);
      if(now-c.lastPaint>180){c.paintRoll=Math.random();c.emittedThisPass=false}
      c.lastPaint=now;
      const occupied=sourceChar(Math.round(c.ax-c.dx/cw),Math.round(c.ay-c.dy/ch))!==' ';
      const chance=Math.pow(paintEnergy,1.35)*(occupied?.025:.45)*cfg.trail;
      if(!c.emittedThisPass&&c.paintRoll<chance){
        c.emittedThisPass=true;
        c.noiseBirth=now;
        c.noiseLife=.65+Math.random()*.35;
        c.noiseAllowFilled=occupied||Math.random()<(.025/.45);
        c.noiseGlyph=pickGlyph(' ',' ');
        c.nextNoise=now+85+Math.random()*65;
      }
      c.tx+=dx*influence;c.ty+=dy*influence;
      const length=Math.hypot(c.tx,c.ty);
      if(length>limit){c.tx*=limit/length;c.ty*=limit/length}
      c.touched=now;
    }
  }

  function move(x,y,now){
    if(now===undefined)now=performance.now();
    if(!ptr)ptr={x,y,tx:x,ty:y,at:now};else{ptr.tx=x;ptr.ty=y;ptr.at=now}
    start();
  }

  function frame(now){
    raf=0;inFrame=true;
    const dt=Math.min(now-last||16,40);last=now;
    if(autoStart){
      const t=(now-autoStart)/autoLength;
      if(t<1)move(ox+cols*cw*(.3+.86*t),oy+rows*ch*(.46+.06*Math.sin(t*5)),now);
      else autoStart=0;
    }
    // Forget old strokes EVERY frame, even while the cursor is still drawing circles.
    const memoryDecay=Math.exp(-dt*3/cfg.memory);
    for(const c of grid){
      c.tx*=memoryDecay;c.ty*=memoryDecay;c.energy*=memoryDecay;
      if(c.energy<.003)c.energy=0;
    }
    let pointerActive=false;
    if(ptr&&!reduced()){
      const oldX=ptr.x,oldY=ptr.y,a=1-Math.exp(-dt/95);
      ptr.x+=(ptr.tx-ptr.x)*a;ptr.y+=(ptr.ty-ptr.y)*a;
      const dx=ptr.x-oldX,dy=ptr.y-oldY,d=Math.hypot(dx,dy);
      if(d>.025&&now-ptr.at<650){
        const segments=Math.max(1,Math.min(12,Math.ceil(d/8)));
        for(let i=1;i<=segments;i++)drag(oldX+dx*i/segments,oldY+dy*i/segments,dx/segments,dy/segments,now);
        pointerActive=true;
      }else if(now-ptr.at>=650)ptr=null;
    }
    let active=false;
    const returnTau=cfg.recovery/3.5,limit=Math.min(cfg.limit,cfg.radius*.5);
    for(const c of grid){
      const hot=now-c.touched<110;
      const targetLength=Math.hypot(c.tx,c.ty);
      if(targetLength>limit){c.tx*=limit/targetLength;c.ty*=limit/targetLength}
      const follow=1-Math.exp(-dt/(hot?120:Math.max(120,returnTau*.5)));
      c.dx+=(c.tx-c.dx)*follow;c.dy+=(c.ty-c.dy)*follow;
      const outputLength=Math.hypot(c.dx,c.dy);
      if(outputLength>limit){c.dx*=limit/outputLength;c.dy*=limit/outputLength}
      if(!hot&&Math.abs(c.tx)+Math.abs(c.ty)+Math.abs(c.dx)+Math.abs(c.dy)<.04)c.dx=c.dy=c.tx=c.ty=0;
      if(c.noiseBirth!==null&&now-c.noiseBirth>=cfg.trailDuration*c.noiseLife)c.noiseBirth=null;
      if(c.dx||c.dy||c.tx||c.ty||c.energy||c.noiseBirth!==null)active=true;
    }
    draw(now);
    inFrame=false;
    if(active||pointerActive||autoStart)start();else last=0;
  }

  function start(){
    if(dead||raf||inFrame)return;
    if(!last)last=performance.now();
    raf=requestAnimationFrame(frame);
  }

  const onMove=e=>{const r=canvas.getBoundingClientRect();move(e.clientX-r.left,e.clientY-r.top)};
  const onDown=e=>{ptr=null;onMove(e)};
  const onLeave=()=>{if(ptr)ptr.at=performance.now()-300};
  const onCancel=()=>{ptr=null};
  canvas.addEventListener('pointermove',onMove);
  canvas.addEventListener('pointerdown',onDown);
  canvas.addEventListener('pointerleave',onLeave);
  canvas.addEventListener('pointercancel',onCancel);

  const observer=new ResizeObserver(size);
  observer.observe(canvas);
  size();

  return {
    canvas,
    get config(){return Object.assign({},cfg)},
    supported:{webgl2:!!renderer.supported},

    /* Live tuning. Only geometry keys rebuild the grid. */
    set(patch){
      let rebuild=false;
      for(const key in patch){
        if(!(key in defaults))continue;
        const value=numeric.indexOf(key)>=0?+patch[key]:patch[key];
        if(numeric.indexOf(key)>=0&&!isFinite(value))continue;
        if(cfg[key]===value)continue;
        cfg[key]=value;
        if(relayout.indexOf(key)>=0)rebuild=true;
        if(key==='background')background=rgb(value);
      }
      if(rebuild)size();else draw();
      start();
      return this;
    },

    setArt(art){
      lines=toLines(art);
      rows=lines.length;
      cols=Math.max(1,...lines.map(l=>l.length));
      size();
      return this;
    },

    get dimensions(){return {rows,cols}},

    /* Scripted sweep, for a "show me" button on a touch screen. */
    play(duration){
      this.reset();
      if(reduced())return this;
      autoLength=duration>0?+duration:2600;
      autoStart=performance.now();
      start();
      return this;
    },

    /* Drop every deformation and trail glyph, keep the settings. */
    reset(){
      autoStart=0;ptr=null;
      for(const c of grid){
        c.dx=c.dy=c.tx=c.ty=c.energy=0;
        c.noiseBirth=null;c.noiseGlyph=' ';c.nextNoise=0;
        c.emittedThisPass=false;c.paintRoll=1;
        c.lastPaint=-Infinity;c.touched=-Infinity;
      }
      draw();
      return this;
    },

    destroy(){
      dead=true;
      if(raf)cancelAnimationFrame(raf);
      raf=0;
      observer.disconnect();
      canvas.removeEventListener('pointermove',onMove);
      canvas.removeEventListener('pointerdown',onDown);
      canvas.removeEventListener('pointerleave',onLeave);
      canvas.removeEventListener('pointercancel',onCancel);
      grid=[];
    }
  };
}

/* <canvas data-reactive-ascii data-art="#my-art" data-radius="100"> needs no JS. */
function fromDataset(el){
  const options={canvas:el};
  for(const key in defaults){
    const raw=el.dataset[key];
    if(raw===undefined)continue;
    options[key]=numeric.indexOf(key)>=0?+raw:raw;
  }
  if(el.dataset.art!==undefined)options.art=el.dataset.art;
  return options;
}

function autoInit(root){
  const found=[];
  for(const el of (root||document).querySelectorAll('canvas[data-reactive-ascii]')){
    if(el.dataset.reactiveAsciiReady)continue;
    el.dataset.reactiveAsciiReady='1';
    found.push(create(fromDataset(el)));
  }
  return found;
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>autoInit());
else autoInit();

global.ReactiveAscii={create,autoInit,defaults};
})(typeof window!=='undefined'?window:globalThis);
