// Copyright (C) 2026 Goldie contributors. SPDX-License-Identifier: MIT
const {test}=require('node:test');const assert=require('node:assert/strict');
const {GoldieWorkspaceConnection}=require('../lib/browser/goldie/goldie-workspace-connection');
const {GoldieLessonController}=require('../lib/browser/goldie/goldie-lesson-controller');
const {goldieCodexPrompt}=require('../lib/browser/goldie/goldie-codex-policy');
const {createGoldieContext,parseGoldieContext}=require('../lib/browser/goldie/goldie-context');
const tick=()=>new Promise(r=>setImmediate(r));
const id='goldie-workspace-'+'a'.repeat(32);
function setup(saved){
 const store=saved??new Map();const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)};
 let value={projectId:id,name:'Team Tasks',kind:'ready',revision:1,fingerprint:'a'.repeat(64),handoff:'Task board plan'};
 let root='file:///project';let changed;let rootChanged;let inspections=0;const timers=new Map();let timerId=0;const offers=[];
 const service={inspectWorkspaceHandoff:async()=>{inspections++;return {...value};},offer:async request=>{offers.push(request);return {shouldOffer:true,offerId:'offer-'+offers.length,previewTopics:['API validation'],estimatedSeconds:30};}};
 const audio={subscribe:()=>()=>{},pause(){},clear(){},dispose(){},select(){},load(){},async play(){}};
 const lesson=new GoldieLessonController(service,audio,storage);
 const conn=new GoldieWorkspaceConnection(service,lesson,{roots:async()=>[root],onRootsChanged:cb=>{rootChanged=cb;return()=>{};},watch:(_,cb)=>{changed=cb;return()=>{changed=undefined;};},storage,schedule:(cb,ms)=>{assert.equal(ms,1000);timers.set(++timerId,cb);return timerId;},clear:key=>timers.delete(key)});
 return {conn,lesson,service,offers,store,set:v=>{value={...value,...v};},change:()=>changed?.(),root:uri=>{root=uri;rootChanged();},inspectCount:()=>inspections,async flush(){const callbacks=[...timers.values()];timers.clear();callbacks.forEach(cb=>cb());for(let n=0;n<5;n++)await tick();}};
}
test('connect is explicit; restored connection and duplicate saves do not evaluate again',async()=>{
 const x=setup();await x.conn.onStart();assert.equal(x.offers.length,0);await x.conn.connect();assert.equal(x.offers.length,1);assert.equal(x.offers[0].revision,1);assert.equal(x.offers[0].projectId,id);
 x.change();x.change();await x.flush();assert.equal(x.offers.length,1);x.conn.onStop();
 const restored=setup(x.store);await restored.conn.onStart();assert.equal(restored.conn.state.connected,true);assert.equal(restored.offers.length,0);restored.conn.onStop();
});
test('offered context is frozen and newer revisions wait for explicit learning',async()=>{
 const x=setup();await x.conn.onStart();await x.conn.connect();x.set({revision:2,fingerprint:'b'.repeat(64),handoff:'New cumulative plan'});x.change();await x.flush();
 assert.equal(x.offers.length,1);assert.equal(x.lesson.state.context.revision,1);assert.equal(x.conn.state.pendingRevision,2);
 x.lesson.declineOffer();assert.equal(x.offers.length,1);await x.conn.learnLatest();assert.equal(x.offers.length,2);assert.equal(x.lesson.state.context.revision,2);x.conn.onStop();
});
test('conflicting same-revision and backwards content is never uploaded',async()=>{
 const x=setup();await x.conn.onStart();await x.conn.connect();x.lesson.declineOffer();x.set({fingerprint:'b'.repeat(64)});x.change();await x.flush();assert.match(x.conn.state.error,/newer Revision/);assert.equal(x.offers.length,1);
 x.set({revision:2});x.change();await x.flush();assert.equal(x.offers.length,2);x.conn.onStop();
});
test('disconnect ignores an inspection response which arrives late',async()=>{
 const x=setup();await x.conn.onStart();await x.conn.connect();x.lesson.declineOffer();let resolve;x.service.inspectWorkspaceHandoff=()=>new Promise(r=>{resolve=r;});
 const pending=x.conn.learnLatest();await tick();x.conn.disconnect();resolve({projectId:id,name:'Team Tasks',kind:'ready',revision:9,fingerprint:'b'.repeat(64),handoff:'Late'});await pending;assert.equal(x.offers.length,1);assert.equal(x.conn.state.connected,false);x.conn.onStop();
});
test('disconnect and workspace navigation dismiss an already returned offer without accepting it',async()=>{
 for(const navigate of [false,true]){
  const x=setup();await x.conn.onStart();await x.conn.connect();assert.equal(x.lesson.state.view,'offer');
  if(navigate){x.set({projectId:'goldie-workspace-'+'b'.repeat(32)});x.root('file:///other');await tick();}
  else{x.conn.disconnect();}
  assert.equal(x.lesson.state.view,'idle');assert.equal(x.lesson.state.offer,undefined);assert.equal(x.offers.length,1);x.conn.onStop();
 }
});
test('a late learn-latest click from the old workspace cannot generate in a silently restored workspace',async()=>{
 const x=setup();await x.conn.onStart();await x.conn.connect();x.lesson.declineOffer();let resolve;
 const original=x.service.inspectWorkspaceHandoff;
 x.service.inspectWorkspaceHandoff=root=>root==='file:///project'?new Promise(r=>{resolve=r;}):original();
 const pending=x.conn.learnLatest();await tick();const nextId='goldie-workspace-'+'b'.repeat(32);
 x.store.set('goldie.workspace-connection.v1.'+nextId,JSON.stringify({enabled:true,revision:1,fingerprint:'b'.repeat(64)}));
 x.set({projectId:nextId,fingerprint:'b'.repeat(64),handoff:'Second project'});x.root('file:///other');
 for(let n=0;n<5;n++)await tick();assert.equal(x.conn.state.connected,true);assert.equal(x.offers.length,1);
 resolve({projectId:id,name:'Old project',kind:'ready',revision:2,fingerprint:'c'.repeat(64),handoff:'Old project update'});
 await pending;assert.equal(x.offers.length,1);assert.equal(x.lesson.state.view,'idle');x.conn.onStop();
});
test('Codex completion without an updated handoff is actionable and does not invent context',async()=>{
 const x=setup();await x.conn.onStart();await x.conn.connect();x.lesson.declineOffer();x.conn.promptStarted('file:///project');x.conn.promptFinished('file:///project');await x.flush();assert.match(x.conn.state.error,/without a newer handoff/);assert.equal(x.offers.length,1);x.conn.onStop();
});
test('workspace context uses authored revision, supports recovery and preserves revision on profile change',()=>{
 const snapshot=createGoldieContext('Plan','beginner',7,'Team Tasks',id);assert.deepEqual(parseGoldieContext(snapshot),snapshot);
 const x=setup();x.lesson.setWorkspaceContext(snapshot);x.lesson.setKnowledgeLevel('intermediate');assert.equal(x.lesson.state.context.revision,7);assert.equal(x.lesson.state.context.projectId,id);x.conn.onStop();
});
test('Codex policy preserves prompt and demands cumulative authored context without secrets or false verification',()=>{
 const text=goldieCodexPrompt('Build a task form','prompt-123',7);assert.ok(text.startsWith('Build a task form'));assert.match(text,/greater than both its saved revision and 7/);assert.match(text,/prompt-123/);assert.match(text,/never private chain-of-thought/);assert.match(text,/Do not claim work is implemented or verified/);assert.match(text,/Do not include credentials/);
});
test('new Codex revisions leave an accepted lesson and its roadmap unchanged',async()=>{
 const x=setup();await x.conn.onStart();await x.conn.connect();
 x.service.startSession=async()=>({sessionId:'s1',projectId:id,snapshotRevision:1,phases:[{id:'p1',title:'API',objective:'Validation',description:'Trust boundary'}],status:'learning',activePhaseId:'p1',completedIds:[],skippedIds:[],alreadyKnowIds:[],lastEvaluatedRevision:0,questionHistory:[]});
 x.service.teach=async()=>({explanation:'Validate on the server',groundingStatus:'conceptual',contentId:'c1'});x.service.speech=async()=>({mimeType:'audio/mpeg',dataBase64:'YQ=='});
 await x.lesson.acceptOffer();const before=x.lesson.state.session;x.set({revision:2,fingerprint:'b'.repeat(64),handoff:'More work'});x.change();await x.flush();
 assert.equal(x.lesson.state.session,before);assert.equal(x.lesson.state.context.revision,1);assert.equal(x.conn.state.pendingRevision,2);assert.equal(x.offers.length,1);x.conn.onStop();
});
test('missing canonical handoff clears pending context without generating or fabricating a plan',async()=>{
 const x=setup();x.set({kind:'missing',handoff:undefined,revision:undefined,fingerprint:undefined});await x.conn.onStart();await x.conn.connect();assert.equal(x.offers.length,0);assert.match(x.conn.state.status,/Waiting for Codex/);assert.equal(x.conn.state.pendingRevision,undefined);x.conn.onStop();
});
test('unsafe or unavailable handoff errors do not generate an offer',async()=>{
 const x=setup();await x.conn.onStart();await x.conn.connect();x.lesson.declineOffer();x.service.inspectWorkspaceHandoff=async()=>{throw new Error('Keep .goldie as a regular folder inside this workspace.');};x.change();await x.flush();assert.match(x.conn.state.error,/regular folder/);assert.equal(x.offers.length,1);x.conn.onStop();
});
