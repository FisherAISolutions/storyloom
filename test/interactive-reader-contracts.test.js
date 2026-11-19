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
  assert.match(reader,/stopNarration/);
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
