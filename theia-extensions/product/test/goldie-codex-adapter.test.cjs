// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const {createRequire}=require('node:module');
function setup({connected=true,mode='workspace-write',root='file:///project',model='',reject=false}={}){
 const filename=path.join(__dirname,'../lib/browser/goldie/goldie-codex-frontend-service.js');const local=createRequire(filename);const exports={};const calls=[];
 class Base{async send(request){calls.push(request);if(reject)throw new Error('Codex failed');return {async *[Symbol.asyncIterator](){yield {type:'turn.completed'};}};}}
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),{exports,crypto:global.crypto,require:id=>{
  if(id==='@theia/core/shared/inversify')return {inject:()=>()=>{},injectable:()=>x=>x};if(id==='@theia/ai-codex/lib/browser/codex-frontend-service')return {CodexFrontendService:Base};return local(id);
 }},{filename});
 const service=new exports.GoldieCodexFrontendService();const events=[];service.workspaceService={roots:Promise.resolve([{resource:{toString:()=>root}}])};service.preferenceService={get:()=>model};service.goldie={connectedProjectId:'goldie-workspace-'+'a'.repeat(32),state:{connected,workspaceUri:'file:///project',revision:3},promptStarted:r=>events.push('start:'+r),promptFinished:r=>events.push('finish:'+r)};
 return {service,calls,events,request:{prompt:'Add validation',sessionId:'thread',sandboxMode:mode}};
}
test('connected native Codex receives policy and preserves streaming with a workspace-scoped thread',async()=>{
 const x=setup({model:'account-supported-model'});const stream=await x.service.send(x.request);assert.equal(x.calls[0].sessionId,'thread:goldie:goldie-workspace-'+'a'.repeat(32));assert.match(x.calls[0].prompt,/goldie_handoff_policy/);assert.equal(x.calls[0].options.model,'account-supported-model');
 const events=[];for await(const e of stream)events.push(e.type);assert.deepEqual(events,['turn.completed']);assert.deepEqual(x.events,['start:file:///project','finish:file:///project']);
});
test('connected request pins its directory rather than allowing the upstream second root read',async()=>{
 const x=setup();await x.service.send(x.request);assert.equal(x.calls[0].options.workingDirectory,'/project');
});
test('an explicit different working directory receives no connected-project policy',async()=>{
 const x=setup();const request={...x.request,options:{workingDirectory:'/other'}};
 await x.service.send(request);assert.equal(x.calls[0],request);assert.deepEqual(x.events,[]);
});
test('one native chat uses separate cached Codex threads for different connected workspaces',async()=>{
 const x=setup();await x.service.send(x.request);const first=x.calls[0].sessionId;
 x.service.workspaceService.roots=Promise.resolve([{resource:{toString:()=> 'file:///other'}}]);
 x.service.goldie.state={connected:true,workspaceUri:'file:///other',revision:1};
 x.service.goldie.connectedProjectId='goldie-workspace-'+'b'.repeat(32);
 await x.service.send(x.request);const second=x.calls[1].sessionId;
 assert.notEqual(first,second);await x.service.send(x.request);assert.equal(x.calls[2].sessionId,second);
 assert.equal(x.calls[1].options.workingDirectory,'/other');
});
for(const options of [{connected:false},{mode:'read-only'},{root:'file:///other'}])test('disconnected, read-only, and other-workspace requests pass through unchanged '+JSON.stringify(options),async()=>{
 const x=setup(options);await x.service.send(x.request);assert.equal(x.calls[0],x.request);assert.deepEqual(x.events,[]);
});
test('Codex transport failure remains an error and finishes handoff observation',async()=>{
 const x=setup({reject:true});await assert.rejects(x.service.send(x.request),/Codex failed/);assert.deepEqual(x.events,['start:file:///project','finish:file:///project']);
});
