import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read=(path)=>readFileSync(path,'utf8');
const reader=read('src/components/storybook/InteractiveStorybookReader.jsx');
const readerPage=read('src/pages/StoryReader.jsx');
const publicStory=read('src/pages/PublicStory.jsx');
const app=read('src/App.jsx');
const publicFunction=read('supabase/functions/community-public/index.ts');
const styles=read('src/index.css');
const pageMedia=read('src/components/storybook/StoryPageMedia.jsx');
const mediaModel=read('src/lib/storyMedia.js');

test('owner reader remains behind authentication and owner-scoped services',()=>{
  assert.match(app,/<Route element={<ProtectedRoute \/>}>[\s\S]*\/story\/:id\/read/);
  assert.match(readerPage,/storiesService\.get\(id\)/);
  assert.match(readerPage,/storyPagesService\.listByStory\(id\)/);
  assert.match(readerPage,/coverPath={story\.cover_image_path}/);
});

test('marketplace reader consumes only server-authorized public pages',()=>{
  assert.match(publicStory,/pages={story\.pages}/);
  assert.doesNotMatch(publicStory,/storyPagesService|from\(['"]story_pages/);
  assert.match(publicFunction,/if\(!fullAccess\) pageQuery=pageQuery\.limit\(share\.preview_page_count\)/);
  assert.match(publicFunction,/buyer_user_id.*status','active'/s);
});

test('reader supports manual navigation, swipe, keyboard, fullscreen, and saved progress',()=>{
  assert.match(reader,/ArrowLeft/);
  assert.match(reader,/ArrowRight/);
  assert.match(reader,/onTouchStart/);
  assert.match(reader,/requestFullscreen/);
  assert.match(reader,/localStorage\.setItem/);
  assert.match(reader,/localStorage\.getItem/);
  assert.match(reader,/reader-two-page/);
  assert.match(reader,/reader-single-page/);
});

test('browser narration has controls, sentence highlighting, fallback, and auto advancement',()=>{
  assert.match(reader,/SpeechSynthesisUtterance/);
  assert.match(reader,/speechSynthesis\.pause/);
  assert.match(reader,/speechSynthesis\.resume/);
  assert.match(reader,/cancelNarration/);
  assert.match(reader,/Narration speed/);
  assert.match(reader,/reader-sentence-active/);
  assert.match(reader,/const next=pageIndex\+1/);
  assert.match(reader,/Read to Me is unavailable/);
});

test('reader animations respect reduced-motion preferences',()=>{
  assert.match(styles,/reader-cover-arrive/);
  assert.match(styles,/reader-flip-next/);
  assert.match(styles,/prefers-reduced-motion: reduce/);
  assert.match(styles,/\.reader-book-opening,[\s\S]*animation: none/);
});

test('rapid navigation and narration cancellation are serialized',()=>{
  assert.match(reader,/navigationLocked/);
  assert.match(reader,/playbackToken\.current\+=1/);
  assert.match(reader,/token!==playbackToken\.current/);
  assert.match(reader,/disabled={atEnd\|\|transitioning}/);
  assert.match(reader,/pauseVisibleAnimation/);
});

test('nearby preloading stays within the already-authorized page collection',()=>{
  assert.match(reader,/\[current-2,current-1,current,current\+1,current\+2,current\+3\]\.filter\(\(index\)=>pages\[index\]\)/);
  assert.match(reader,/getStoryImageUrl\(page\.image_path\)/);
  assert.doesNotMatch(reader,/animationUrl.*new window\.Image/s);
});

test('optional narration metadata is backward compatible and server-delivered',async()=>{
  const {getPageNarration}=await import('../src/lib/storyMedia.js');
  assert.deepEqual(getPageNarration({text:'Static page'}),{audioUrl:null,durationMs:null,timings:[],voiceId:null});
  assert.deepEqual(getPageNarration({narration:{audio_url:'https://media.example/page.mp3',duration_ms:3200,voice_id:'warm',timings:[{start_ms:0,end_ms:1500,sentence_index:0}]}}),{audioUrl:'https://media.example/page.mp3',durationMs:3200,timings:[{start_ms:0,end_ms:1500,sentence_index:0}],voiceId:'warm'});
  assert.match(mediaModel,/server-authoritative/);
  assert.doesNotMatch(mediaModel,/stripe|price_cents/i);
});

test('optional animated pages load only when visible and fall back to static media',()=>{
  assert.match(pageMedia,/getPageAnimation/);
  assert.match(pageMedia,/preload="metadata"/);
  assert.match(pageMedia,/onError=\{\(\)=>setAnimationFailed\(true\)\}/);
  assert.match(pageMedia,/return <StaticPageImage/);
  assert.match(pageMedia,/!reducedMotion/);
  assert.doesNotMatch(reader,/OPTIONAL_MEDIA_OPERATIONS/);
});
