import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createBusServer} from '../server.mjs';

test('static responses cache fingerprinted assets and revalidate mutable files without downloading bodies',async()=>{
  const dist=await mkdtemp(path.join(tmpdir(),'bus-static-'));
  await mkdir(path.join(dist,'assets'));
  await writeFile(path.join(dist,'index.html'),'<h1>Bus Club</h1>');
  await writeFile(path.join(dist,'assets','app-abc123.js'),'console.log("bus")');
  await writeFile(path.join(dist,'model.glb'),'model data');
  const app=createBusServer({dist});
  try {
    app.server.listen(0,'127.0.0.1');await once(app.server,'listening');
    const base=`http://127.0.0.1:${app.server.address().port}`;
    const asset=await fetch(`${base}/assets/app-abc123.js`);
    assert.equal(asset.headers.get('cache-control'),'public, max-age=31536000, immutable');
    assert.equal(await asset.text(),'console.log("bus")');
    for(const pathname of ['/','/model.glb']) {
      const response=await fetch(base+pathname);
      assert.equal(response.status,200);
      assert.equal(response.headers.get('cache-control'),'no-cache');
      const etag=response.headers.get('etag');
      assert.ok(etag);
      const body=await response.text();
      const cached=await fetch(base+pathname,{headers:{'If-None-Match':`"older", ${etag}`}});
      assert.equal(cached.status,304);
      assert.equal(await cached.text(),'');
      const head=await fetch(base+pathname,{method:'HEAD'});
      assert.equal(head.headers.get('etag'),etag);
      assert.equal(Number(head.headers.get('content-length')),Buffer.byteLength(body));
      assert.equal(await head.text(),'');
    }
    await writeFile(path.join(dist,'model.glb'),'new model data');
    const changed=await fetch(`${base}/model.glb`,{headers:{'If-None-Match':asset.headers.get('etag')}});
    assert.equal(changed.status,200);
    assert.equal(await changed.text(),'new model data');
  } finally {await app.close();await rm(dist,{recursive:true,force:true});}
});
