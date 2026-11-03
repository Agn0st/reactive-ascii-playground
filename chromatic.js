/* Chromatic coverage sampling adapted from Agn0st/portfolio,
 * js/liquid-heading.js at 2b537057cc25c68a945654310b986e697250260e.
 * Fixed-grid image deformation and the random fading trail are supplied by the caller.
 * Here only RGB sampling and the five-tap directional smear are applied. */
function createChromaticRenderer(canvas){
  'use strict';
  const gl=canvas.getContext('webgl2',{premultipliedAlpha:true,alpha:true,antialias:false});
  if(!gl)return {ctx:canvas.getContext('2d'),source:canvas,resize(){},present(){},supported:false};
  const source=document.createElement('canvas'),ctx=source.getContext('2d');
  const vs=`#version 300 es
  in vec2 p;out vec2 uv;
  void main(){uv=p*.5+.5;uv.y=1.-uv.y;gl_Position=vec4(p,0.,1.);}`;
  const fs=`#version 300 es
  precision highp float;in vec2 uv;out vec4 o;
  uniform sampler2D uTex,uField;
  uniform vec2 uSize,uOrigin,uCell,uGrid;
  uniform float uAberr;
  uniform vec3 uBg;
  void main(){
    vec2 fieldUV=((uv*uSize-uOrigin)/uCell+.5)/uGrid;
    vec3 f=texture(uField,fieldUV).rgb;
    vec2 v=(f.xy*255.-128.)/127.*36./uSize*f.z;
    float len=length(v);v*=1./(1.+len*4.);len=length(v);
    vec2 dir=len>1e-5?v/len:vec2(0.);
    // Same channel split as portfolio: R at -ab, G at center, B at +ab.
    vec2 ab=dir*uAberr*.35*min(len*1.4,.15)*vec2(1.,uSize.x/uSize.y);
    vec2 smear=ab*.16;
    vec4 r=vec4(0.),g=vec4(0.),b=vec4(0.);
    for(int i=-2;i<=2;i++){
      vec2 s=uv+smear*float(i)*.5;
      r+=texture(uTex,s-ab);g+=texture(uTex,s);b+=texture(uTex,s+ab);
    }
    r*=.2;g*=.2;b*=.2;
    vec3 a3=vec3(r.a,g.a,b.a),c3=vec3(r.r,g.g,b.b);
    float A=max(max(a3.r,a3.g),a3.b);
    o=vec4(c3+uBg*(A-a3),A);
  }`;
  function shader(type,code){const sh=gl.createShader(type);gl.shaderSource(sh,code);gl.compileShader(sh);if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));return sh}
  let program,buffer,text,field,packed,lost=false;
  const u={};
  function texture(unit){const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,t);for(const param of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,param,gl.LINEAR);for(const param of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,param,gl.CLAMP_TO_EDGE);return t}
  /* Re-runnable, so a lost context can be rebuilt without reloading the host page. */
  function setup(){
    program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vs));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fs));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
    buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const position=gl.getAttribLocation(program,'p');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
    for(const name of ['uTex','uField','uSize','uOrigin','uCell','uGrid','uAberr','uBg'])u[name]=gl.getUniformLocation(program,name);
    text=texture(0);field=texture(1);gl.uniform1i(u.uTex,0);gl.uniform1i(u.uField,1);
  }
  setup();
  function resize(w,h){source.width=w;source.height=h;if(!lost)gl.viewport(0,0,w,h)}
  function present(cells,nx,ny,cw,ch,width,height,aberration,background=[25/255,29/255,25/255]){
    if(lost||!cells.length)return;
    if(!packed||packed.length!==nx*ny*4)packed=new Uint8Array(nx*ny*4);
    cells.forEach((c,i)=>{const k=i*4;packed[k]=Math.round(128+Math.max(-1,Math.min(1,c.dx/36))*127);packed[k+1]=Math.round(128+Math.max(-1,Math.min(1,c.dy/36))*127);packed[k+2]=Math.round(Math.min(1,Math.max(c.energy,Math.hypot(c.dx,c.dy)/24))*255);packed[k+3]=255});
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,text);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,field);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,nx,ny,0,gl.RGBA,gl.UNSIGNED_BYTE,packed);
    gl.uniform2f(u.uSize,width,height);gl.uniform2f(u.uOrigin,cells[0].x,cells[0].y);gl.uniform2f(u.uCell,cw,ch);gl.uniform2f(u.uGrid,nx,ny);gl.uniform1f(u.uAberr,aberration);gl.uniform3fv(u.uBg,background);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true});
  canvas.addEventListener('webglcontextrestored',()=>{packed=null;setup();gl.viewport(0,0,source.width,source.height);lost=false});
  return {ctx,source,resize,present,supported:true};
}
