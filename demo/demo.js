/* Playground wiring. All the effect logic lives in ../reactive-ascii.js —
 * this file only moves values between the DOM and portrait.set(). */
(async function(){
'use strict';

const D=ReactiveAscii.defaults;

/* scale = slider units per config unit, so percentages stay percentages in the UI. */
const CONTROLS=[
  {id:'radius',        label:'Pointer radius',       min:25,  max:180,  step:1,   scale:1,   format:v=>v+' px'},
  {id:'strength',      label:'Strength',             min:10,  max:100,  step:1,   scale:100, format:v=>v+'%'},
  {id:'recovery',      label:'Recovery',             min:400, max:6000, step:100, scale:1,   format:v=>(v/1000).toFixed(1)+' s'},
  {id:'memory',        label:'Motion memory',        min:300, max:3000, step:100, scale:1,   format:v=>(v/1000).toFixed(1)+' s'},
  {id:'limit',         label:'Stretch limit',        min:4,   max:48,   step:1,   scale:1,   format:v=>v+' px'},
  {id:'aberration',    label:'Chromatic aberration', min:0,   max:150,  step:5,   scale:100, format:v=>v+'%'},
  {id:'trail',         label:'Trail density',        min:0,   max:100,  step:5,   scale:100, format:v=>v+'%'},
  {id:'trailDuration', label:'Trail lifetime',       min:200, max:6000, step:100, scale:1,   format:v=>(v/1000).toFixed(1)+' s'}
];

/* background is the stage colour handed to the shader; page is what sits
 * behind it, which is what the browser chrome should match. */
const PALETTES={
  normal:{label:'Default',color:'#c4cdbb',background:'#191d19',page:'#EDEBE4'},
  moss:  {label:'Moss',   color:'#788070',background:'#191d19',page:'#EDEBE4'},
  light: {label:'Light',  color:'#1F2533',background:'#F6F4F1',page:'#E9E7E1'},
  dark:  {label:'Dark',   color:'#F6F4F1',background:'#1F2533',page:'#12161D'}
};

const SAMPLES=[
  {label:'Portrait',url:'samples/art.txt'},
  {label:'Text',url:'samples/hello.txt',inline:'fallback-art'}
];

const $=id=>document.getElementById(id);
const stage=$('stage'),status=$('status'),notice=$('notice');
const artInput=$('artInput'),artHint=$('artHint'),snippet=$('snippet');
const round=v=>Math.round(v*100)/100;

/* Settings live in the URL, so a tuned look can be shared as a plain link.
 * Values are stored in slider units — the same numbers the labels show. */
const params=new URLSearchParams(location.search);
const sliderDefault=c=>+(D[c.id]*c.scale).toFixed(4);
function startValue(c){
  const raw=params.get(c.id);
  if(raw===null)return sliderDefault(c);
  const value=+raw;
  if(!isFinite(value))return sliderDefault(c);
  return Math.min(c.max,Math.max(c.min,value));
}
let baseNotice='';

/* ---- sliders ---------------------------------------------------------- */

const sliders={},outputs={};
const toneControl=document.querySelector('.tone-control');
for(const c of CONTROLS){
  const wrap=document.createElement('div');
  wrap.className='control';
  wrap.innerHTML='<label for="'+c.id+'">'+c.label+' <output id="'+c.id+'Value"></output></label>'+
    '<input id="'+c.id+'" type="range" min="'+c.min+'" max="'+c.max+'" step="'+c.step+'">';
  $('controls').insertBefore(wrap,toneControl);
  sliders[c.id]=$(c.id);
  outputs[c.id]=$(c.id+'Value');
  sliders[c.id].value=String(startValue(c));
  showValue(c);
}

/* The raw number alone ("2000") tells a screen reader nothing — announce "2.0 s". */
function showValue(c){
  const text=c.format(+sliders[c.id].value);
  outputs[c.id].textContent=text;
  sliders[c.id].setAttribute('aria-valuetext',text);
}

function syncUrl(){
  const q=new URLSearchParams();
  for(const c of CONTROLS){
    const value=+sliders[c.id].value;
    if(value!==sliderDefault(c))q.set(c.id,String(value));
  }
  if(tone!=='dark')q.set('palette',tone);
  const query=q.toString();
  history.replaceState(null,'',location.pathname+(query?'?'+query:''));
}

function readSliders(){
  const o={};
  for(const c of CONTROLS)o[c.id]=+sliders[c.id].value/c.scale;
  return o;
}

/* ---- palette buttons -------------------------------------------------- */

let tone=PALETTES[params.get('palette')]?params.get('palette'):'dark';
const toneButtons={};
for(const name in PALETTES){
  const b=document.createElement('button');
  b.type='button';
  b.id='tone-'+name;
  b.setAttribute('aria-pressed',String(name===tone));
  b.innerHTML='<i class="swatch '+name+'" aria-hidden="true"></i>'+PALETTES[name].label;
  $('tones').appendChild(b);
  toneButtons[name]=b;
}

/* ---- art -------------------------------------------------------------- */

async function loadText(url){
  try{
    // no-cache still allows a 304, but never serves a stale copy — the whole
    // point of this demo is swapping art.txt and seeing the result.
    const response=await fetch(url,{cache:'no-cache'});
    if(!response.ok)throw Error(String(response.status));
    return await response.text();
  }catch(error){return null}
}

const builtIn=$('fallback-art').textContent.replace(/^\n/,'');
let art=await loadText('samples/art.txt');
const offline=art===null;
if(offline)art=builtIn;

/* ---- the portrait ----------------------------------------------------- */

const portrait=ReactiveAscii.create(Object.assign({
  canvas:'#portrait',
  art,
  color:PALETTES[tone].color,
  background:PALETTES[tone].background,
  // 24px inset + 24px label row + 12px breathing room, top and bottom.
  paddingY:120
},readSliders()));

artInput.value=art;
showDimensions();
updateSnippet();

/* Handy when poking at the effect from the browser console. */
window.portrait=portrait;

setTone(tone);

if(offline)artHint.textContent='samples/art.txt could not be loaded — opening this page straight from disk blocks it. Showing a built-in sample; run a local server, or just drop a .txt file on the canvas.';

const still=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if(!portrait.supported.webgl2){
  sliders.aberration.disabled=true;
  baseNotice='This browser has no WebGL2, so chromatic aberration is off. The deformation and the trail still work.';
}
if(still)baseNotice='Reduced motion is on in your system settings, so the effect is held still.';
notice.textContent=baseNotice;
status.textContent=baseNotice;

/* The effect is invisible until something moves, so show it once on arrival —
 * unless motion is off, or the visitor got there first. */
let touched=false;
$('portrait').addEventListener('pointerdown',()=>{touched=true},{once:true});
$('portrait').addEventListener('pointermove',()=>{touched=true},{once:true});
if(!still)setTimeout(()=>{if(!touched)portrait.play(2600)},700);

function showDimensions(){
  const d=portrait.dimensions;
  $('dimensions').textContent=d.cols+' COL × '+d.rows+' ROW / FIXED GRID';
}

function applyArt(text,message){
  art=text;
  artInput.value=text;
  portrait.setArt(text);
  showDimensions();
  artHint.textContent=message||'';
}

function readFile(file){
  const reader=new FileReader();
  reader.onload=()=>{applyArt(String(reader.result),'Loaded '+file.name+'.');markSample(null)};
  reader.onerror=()=>{artHint.textContent='Could not read '+file.name+'.'};
  reader.readAsText(file);
}

function updateSnippet(){
  const c=portrait.config;
  snippet.value='<canvas id="ascii" style="width:100%;height:520px;background:'+c.background+'"></canvas>\n'+
'<pre id="ascii-art" hidden>\nPASTE YOUR ASCII ART HERE\n</pre>\n'+
'\n<script src="chromatic.js"></script>\n<script src="reactive-ascii.js"></script>\n<script>\n'+
'  ReactiveAscii.create({\n'+
'    canvas: \'#ascii\',\n'+
'    art: \'#ascii-art\',\n'+
'    radius: '+c.radius+',\n'+
'    strength: '+round(c.strength)+',\n'+
'    recovery: '+c.recovery+',\n'+
'    memory: '+c.memory+',\n'+
'    limit: '+c.limit+',\n'+
'    aberration: '+round(c.aberration)+',\n'+
'    trail: '+round(c.trail)+',\n'+
'    trailDuration: '+c.trailDuration+',\n'+
'    color: \''+c.color+'\',\n'+
'    background: \''+c.background+'\'\n'+
'  });\n'+
'</script>';
}

/* ---- events ----------------------------------------------------------- */

let urlTimer=0;
const queueUrl=()=>{clearTimeout(urlTimer);urlTimer=setTimeout(syncUrl,400)};

for(const c of CONTROLS)sliders[c.id].addEventListener('input',()=>{
  showValue(c);
  portrait.set({[c.id]:+sliders[c.id].value/c.scale});
  updateSnippet();
  queueUrl();
});

function setTone(name){
  tone=name;
  stage.dataset.palette=name;
  document.body.dataset.palette=name;
  // Keeps native scrollbars and form controls from rendering light on a dark page.
  document.documentElement.style.colorScheme=name==='dark'?'dark':'light';
  document.querySelector('meta[name=theme-color]').setAttribute('content',PALETTES[name].page);
  for(const key in PALETTES)toneButtons[key].setAttribute('aria-pressed',String(key===name));
  portrait.set({color:PALETTES[name].color,background:PALETTES[name].background});
  updateSnippet();
  syncUrl();
}
for(const name in PALETTES)toneButtons[name].addEventListener('click',()=>setTone(name));

const sampleButtons=new Map();
/* null means the art came from a file or the textarea, so nothing is "current". */
function markSample(url){
  for(const [key,button] of sampleButtons)button.setAttribute('aria-pressed',String(key===url));
}

for(const sample of SAMPLES){
  const b=document.createElement('button');
  b.type='button';
  b.setAttribute('aria-pressed','false');
  b.textContent=sample.label;
  b.addEventListener('click',async()=>{
    const text=await loadText(sample.url);
    if(text!==null){applyArt(text,'Loaded '+sample.url+'.');markSample(sample.url)}
    else if(sample.inline){applyArt(builtIn,'Loaded the built-in sample.');markSample(sample.url)}
    else artHint.textContent=sample.url+' needs a local server. Drop the file on the canvas instead.';
  });
  sampleButtons.set(sample.url,b);
  $('samples').appendChild(b);
}
markSample(offline?null:'samples/art.txt');

$('file').addEventListener('change',event=>{
  const file=event.target.files&&event.target.files[0];
  if(file)readFile(file);
  event.target.value='';
});

let typing=0;
artInput.addEventListener('input',()=>{
  clearTimeout(typing);
  typing=setTimeout(()=>{
    portrait.setArt(artInput.value);
    showDimensions();
    artHint.textContent='';
    markSample(null);
  },250);
});

/* dragenter/dragleave also fire for the canvas inside, so count the depth. */
let depth=0;
stage.addEventListener('dragenter',event=>{event.preventDefault();depth++;stage.classList.add('dropping')});
stage.addEventListener('dragover',event=>{event.preventDefault()});
stage.addEventListener('dragleave',()=>{if(--depth<=0){depth=0;stage.classList.remove('dropping')}});
stage.addEventListener('drop',event=>{
  event.preventDefault();
  depth=0;
  stage.classList.remove('dropping');
  const file=event.dataTransfer&&event.dataTransfer.files[0];
  if(file)readFile(file);
});

$('demo').addEventListener('click',()=>{
  portrait.play(2600);
  status.textContent=window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ?'Animation is disabled by your system settings.'
    :'Deforming the portrait on a grid that stays still.';
});

$('reset').addEventListener('click',()=>{
  for(const c of CONTROLS){
    sliders[c.id].value=String(sliderDefault(c));
    showValue(c);
  }
  portrait.set(readSliders());
  setTone('dark');
  portrait.reset();
  status.textContent='Portrait restored.';
});

$('share').addEventListener('click',async()=>{
  syncUrl();
  try{
    await navigator.clipboard.writeText(location.href);
    notice.textContent='Link copied — it carries these settings.';
  }catch(error){
    notice.textContent='Clipboard is blocked here. Copy the address bar instead.';
  }
  setTimeout(()=>{notice.textContent=baseNotice},4000);
});

$('copy').addEventListener('click',async()=>{
  try{
    await navigator.clipboard.writeText(snippet.value);
    $('copyHint').textContent='Copied to clipboard.';
  }catch(error){
    snippet.focus();
    snippet.select();
    $('copyHint').textContent='Clipboard is blocked here — the code is selected, press Ctrl/⌘+C.';
  }
  setTimeout(()=>{$('copyHint').textContent=''},4000);
});

})();
