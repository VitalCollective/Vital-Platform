// Development-only static shell for the test entry served by Metro on 8091.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
const html = await readFile(new URL('./preview.html',import.meta.url));
const avatar = await readFile(new URL('../../apps/mobile/assets/brand/vital-mark.png',import.meta.url));
http.createServer((request,response)=>{
  if(request.url==='/qa-avatar.png'){response.writeHead(200,{'Content-Type':'image/png'});response.end(avatar);return;}
  if(request.url==='/qa-avatar-missing.png'){response.writeHead(404);response.end('Intentional unavailable-image QA fixture');return;}
  if (request.url.split('?')[0] !== '/') {
    const upstream=http.get({hostname:'localhost',port:8091,path:request.url},(asset)=>{
      response.writeHead(asset.statusCode??502,asset.headers);asset.pipe(response);
    });
    upstream.on('error',()=>{response.writeHead(502);response.end('Metro unavailable');});
    return;
  }
  response.writeHead(200, {'Content-Type':'text/html; charset=utf-8','Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'credentialless'});
  response.end(html);
}).listen(8092,'127.0.0.1',()=>console.log('Isolated QA shell: http://127.0.0.1:8092 (requires Metro on 8091)'));
