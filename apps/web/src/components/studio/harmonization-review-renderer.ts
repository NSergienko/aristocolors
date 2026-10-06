import type { HarmonizationRefinements } from '@/lib/studio/harmonization-contract';

const vertex = `attribute vec2 position; varying vec2 uv;
void main(){uv=vec2((position.x+1.0)*0.5,(1.0-position.y)*0.5);gl_Position=vec4(position,0.0,1.0);}`;
const fragment = `precision highp float;
varying vec2 uv; uniform sampler2D afterImage, backgroundImage, foregroundMask;
uniform vec2 imageSize, shadowOffset; uniform float feather, warmth, shadowStrength;
float maskBlur(vec2 point,float radius){float value=0.0;
for(int y=-1;y<=1;y++){for(int x=-1;x<=1;x++){
vec2 p=point+vec2(float(x),float(y))*radius/imageSize;
if(p.x>=0.0&&p.x<=1.0&&p.y>=0.0&&p.y<=1.0)value+=texture2D(foregroundMask,p).a/9.0;
}}return value;}
void main(){vec4 after=texture2D(afterImage,uv);vec4 base=texture2D(backgroundImage,uv);
float coverage=texture2D(foregroundMask,uv).a;
float retain=1.0;if(feather>0.0&&coverage>0.001)retain=min(1.0,maskBlur(uv,feather*0.65)/coverage);
vec3 tinted=clamp(after.rgb+vec3(0.16,0.025,-0.14)*warmth*coverage,0.0,1.0);
vec3 color=mix(base.rgb,tinted,retain);
float shadow=maskBlur(uv-shadowOffset,imageSize.y*0.007)*shadowStrength*0.65*(1.0-coverage);
gl_FragColor=vec4(color*(1.0-shadow),after.a);}`;

export function createReviewRenderer(canvas: HTMLCanvasElement, images: { after: HTMLImageElement; background: HTMLImageElement; mask: HTMLImageElement }, azimuth: number | null | undefined) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('GPU review rendering is unavailable. Enable browser hardware acceleration and reload.');
  const width = images.after.naturalWidth, height = images.after.naturalHeight;
  if ([images.background, images.mask].some(image => image.naturalWidth !== width || image.naturalHeight !== height)) throw new Error('Review images have different dimensions.');
  const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  if (width > maxTexture || height > maxTexture) throw new Error('Review resolution exceeds this GPU’s image limit.');
  // Keep one full-resolution buffer for both preview and acceptance. CSS fits it
  // to the viewport; capture must not replace the visible frame with a redraw.
  canvas.width = width;
  canvas.height = height;
  if (gl.drawingBufferWidth !== width || gl.drawingBufferHeight !== height) {
    throw new Error('The GPU cannot allocate the full-resolution review buffer.');
  }
  const resources: { shaders: WebGLShader[]; textures: WebGLTexture[]; buffer?: WebGLBuffer; program?: WebGLProgram } = { shaders: [], textures: [] };
  const dispose = () => {
    resources.textures.forEach(texture => gl.deleteTexture(texture));
    resources.shaders.forEach(shader => gl.deleteShader(shader));
    if (resources.buffer) gl.deleteBuffer(resources.buffer);
    if (resources.program) gl.deleteProgram(resources.program);
  };
  try {
    const shader = (type: number, source: string) => {
      const object = gl.createShader(type); if (!object) throw new Error('Unable to create review shader.');
      resources.shaders.push(object); gl.shaderSource(object, source); gl.compileShader(object);
      if (!gl.getShaderParameter(object, gl.COMPILE_STATUS)) throw new Error('Unable to compile GPU review filters.');
      return object;
    };
    const program = gl.createProgram(); if (!program) throw new Error('Unable to create review renderer.'); resources.program = program;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('Unable to link GPU review filters.');
    gl.useProgram(program);
    const buffer = gl.createBuffer(); if (!buffer) throw new Error('Unable to create review surface.'); resources.buffer = buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    [images.after, images.background, images.mask].forEach((image, index) => {
      const texture = gl.createTexture(); if (!texture) throw new Error('Unable to upload review pixels.'); resources.textures.push(texture);
      gl.activeTexture(gl.TEXTURE0 + index); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.uniform1i(gl.getUniformLocation(program, ['afterImage','backgroundImage','foregroundMask'][index]), index);
    });
    gl.uniform2f(gl.getUniformLocation(program, 'imageSize'), width, height);
    const angle = (azimuth ?? 45) * Math.PI / 180;
    gl.uniform2f(gl.getUniformLocation(program, 'shadowOffset'), -Math.cos(angle) * 0.012 * height / width, Math.sin(angle) * 0.012);
    let settings: HarmonizationRefinements = { contactShadow: 0, edgeFeather: 0, warmth: 0 };
    const render = () => {
      if (gl.isContextLost()) throw new Error('GPU review context was lost. Reload to restore review rendering.');
      gl.useProgram(program); gl.viewport(0,0,canvas.width,canvas.height);
      gl.uniform1f(gl.getUniformLocation(program, 'feather'), settings.edgeFeather);
      gl.uniform1f(gl.getUniformLocation(program, 'warmth'), settings.warmth / 50);
      gl.uniform1f(gl.getUniformLocation(program, 'shadowStrength'), settings.contactShadow / 100);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    };
    return {
      draw(values: HarmonizationRefinements) {
        settings = { ...values };
        render();
      },
      capture() {
        if (gl.isContextLost()) throw new Error('GPU review context was lost before capture.');
        if (gl.drawingBufferWidth !== width || gl.drawingBufferHeight !== height) {
          throw new Error('The review drawing buffer changed before capture.');
        }
        gl.finish();
        return canvas.toDataURL('image/png');
      },
      dispose,
    };
  } catch (cause) { dispose(); throw cause; }
}
