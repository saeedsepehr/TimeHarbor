import test from 'node:test';
import assert from 'node:assert/strict';
import { account, dayKey, defaultConfig, evaluate, freshState, normalizeHost, resolveRule, validateConfig } from '../src/core.ts';

test('domain normalization and boundary-safe longest match', () => {
  assert.equal(normalizeHost('https://www.YouTube.com/watch?v=1'), 'youtube.com');
  assert.throws(() => normalizeHost('javascript:alert(1)'));
  const c = defaultConfig();
  c.rules = [{ id:'yt',host:'youtube.com',mode:'limit',minutes:60,reset:'period',hours:6,profileId:'balanced' }];
  assert.equal(resolveRule(c, 'm.youtube.com')?.id, 'yt');
  assert.equal(resolveRule(c, 'notyoutube.com'), undefined);
});
test('first use anchors a six-hour window and enforces the exact budget', () => {
  const c=defaultConfig(); c.rules=[{id:'yt',host:'youtube.com',mode:'limit',minutes:1,reset:'period',hours:6,profileId:'balanced'}];
  const s=freshState(), start=Date.UTC(2026,0,1,10);
  account(c,s,'youtube.com',start,start+70_000,false);
  assert.equal(s.sites.yt?.usedMs,60_000);
  assert.equal(s.sites.yt?.windowStart,start);
  assert.equal(evaluate(c,s,'youtube.com',start+70_000).reason,'quota');
  assert.equal(evaluate(c,s,'youtube.com',start+6*3_600_000).blocked,false);
  account(c,s,'youtube.com',start+7*3_600_000,start+7*3_600_000+1000,false);
  assert.equal(s.sites.yt?.windowStart,start+7*3_600_000);
  assert.equal(s.sites.yt?.usedMs,1000);
});
test('daily accounting splits at local midnight',()=>{
  const c=defaultConfig(),s=freshState();c.reportScope='all';
  const start=new Date(2026,0,1,23,59,59).getTime();
  account(c,s,'example.com',start,start+2000,false);
  assert.equal(s.days[dayKey(start)]?.['example.com']?.usedMs,1000);
  assert.equal(s.days[dayKey(start+2000)]?.['example.com']?.usedMs,1000);
});
test('pause records usage without consuming quota and never bypasses manual blocks',()=>{
  const c=defaultConfig(),s=freshState();c.rules=[{id:'yt',host:'youtube.com',mode:'limit',minutes:1,reset:'period',hours:6,profileId:'balanced'},{id:'deny',host:'example.com',mode:'block',minutes:1,reset:'daily',hours:24,profileId:'balanced'}];
  const start=Date.UTC(2026,0,1,10);s.pauseUntil=start+300_000;
  account(c,s,'youtube.com',start,start+20_000,true);
  assert.equal(s.sites.yt?.usedMs??0,0);
  assert.equal(s.days[dayKey(start)]?.['youtube.com']?.pausedMs,20_000);
  assert.equal(evaluate(c,s,'example.com',start).reason,'manual');
});
test('required break remains blocked after countdown until acknowledged',()=>{
  const c=defaultConfig(),s=freshState();const p=c.profiles[0]!;p.breakEveryMinutes=1;p.breakMinutes=1;p.required=true;
  c.rules=[{id:'yt',host:'youtube.com',mode:'limit',minutes:60,reset:'period',hours:6,profileId:p.id}];
  const start=Date.UTC(2026,0,1,10);account(c,s,'youtube.com',start,start+65_000,false);
  assert.equal(s.sites.yt?.usedMs,60_000);
  assert.equal(evaluate(c,s,'youtube.com',start+130_000).reason,'break');
  assert.equal(evaluate(c,s,'youtube.com',start+130_000).needsChecklist,true);
});
test('configuration rejects malformed domains, orphan profiles and invalid timing',()=>{
  const c=defaultConfig();c.rules=[{id:'bad',host:'evil.com/path',mode:'limit',minutes:-1,reset:'daily',hours:0,profileId:'missing'}];
  assert.throws(()=>validateConfig(c));
});
