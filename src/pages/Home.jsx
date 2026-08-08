import React from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, Wand2, Users, ArrowRight, Globe } from 'lucide-react';
import { TEMPLATES, STORY_IDEAS } from '@/lib/templates';
import { Button } from '@/components/ui/button';
import { Image } from '@/components/ui/image';
import BookCard from '@/components/BookCard';
import { LANGUAGES } from '@/lib/storyStudio';

export default function Home() {
  return (
    <div className="space-y-20">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-stone-200 bg-gradient-to-br from-rose-50 via-amber-50 to-sky-50 px-6 py-16 md:px-14 md:py-24">
        <div className="relative z-10 grid items-center gap-10 md:grid-cols-2 md:gap-12">
          <div className="max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-stone-600 ring-1 ring-stone-200">
            <Sparkles className="h-3.5 w-3.5" /> AI-painted picture books
          </span>
          <h1 className="mt-5 font-display text-4xl font-semibold leading-tight tracking-tight text-stone-900 md:text-6xl">
            Weave bedtime stories<br />your child can <em className="not-italic text-rose-500">star in</em>.
          </h1>
          <p className="mt-5 max-w-lg text-base text-stone-600 md:text-lg">Pick a story idea, let the AI write the story, and create colorful full page images in whatever style you choose, and even drop your little one into the tale — painted as a soft storybook character from a single photo.


          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/create">
              <Button size="lg" className="rounded-full bg-stone-900 hover:bg-stone-800">
                <Wand2 className="mr-2 h-4 w-4" /> Create a story
              </Button>
            </Link>
          </div>
          </div>
          <div className="relative mx-auto w-full max-w-sm">
            <div className="pointer-events-none absolute -inset-6 rounded-full bg-rose-200/40 blur-3xl" />
            <Image
              src="/images/home/hero-child.webp"
              alt="A watercolor illustration of a child holding a daisy in a dreamy storybook garden"
              fittingType="fill"
              className="relative aspect-square w-full rounded-3xl shadow-xl ring-1 ring-white/60"
            />
            <Link to="/characters" className="mt-4 block">
              <Button size="lg" variant="outline" className="w-full rounded-full border-stone-300 bg-white/60">
                <Users className="mr-2 h-4 w-4" /> Make a character
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Story templates */}
      <section>
        <div className="flex items-end justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Story templates</h2>
            <p className="mt-1 text-sm text-stone-500">Watercolor worlds, ready to be told. Tap one to begin.</p>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 md:grid-cols-3">
          {TEMPLATES.map((t) =>
          <BookCard
            key={t.id}
            to={`/create?template=${t.id}`}
            image={t.image}
            title={t.title}
            theme={t.theme}
            idea={t.idea} />

          )}
        </div>
      </section>

      {/* Story ideas */}
      <section>
        <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Need a spark?</h2>
        <p className="mt-1 text-sm text-stone-500">Tap an idea to start a brand-new story.</p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          {STORY_IDEAS.map((idea) =>
          <Link
            key={idea}
            to={`/create?idea=${encodeURIComponent(idea)}`}
            className="group inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 transition hover:border-stone-400 hover:bg-stone-50">
            
              {idea}
              <ArrowRight className="h-3.5 w-3.5 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-stone-500" />
            </Link>
          )}
        </div>
      </section>

      {/* Languages */}
      <section className="overflow-hidden rounded-3xl border border-stone-200 bg-gradient-to-br from-amber-50 via-rose-50 to-violet-50 p-6 md:p-8">
        <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
              <Globe className="h-5 w-5 text-stone-600" />
            </div>
            <div>
              <h2 className="font-display text-xl font-semibold tracking-tight md:text-2xl">Stories in 7 languages</h2>
              <p className="mt-1 max-w-md text-sm text-stone-500">
                Write in English, then switch the whole book to another language with one tap — perfect for bilingual bedtimes and faraway grandparents.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {LANGUAGES.map((l) =>
            <span key={l.code} className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700">
                <span className="text-base leading-none">{l.flag}</span> {l.label}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="grid gap-4 md:grid-cols-3 md:gap-6">
        {[
        { n: '01', t: 'Star your child', d: 'Upload a photo to create a storybook character of your child.' },
        { n: '02', t: 'Choose or imagine', d: 'Pick a template or type your own idea — pirates, fairies, brave little otters.' },,
        { n: '03', t: 'AI paints the pages', d: 'The story is written and each page is illustrated in the style you choose, then edit the story to your liking.' }].
        map((s) =>
        <div key={s.n} className="rounded-2xl border border-stone-200 bg-white p-6">
            <span className="font-mono text-xs text-stone-400">{s.n}</span>
            <h3 className="mt-2 font-display text-lg font-semibold">{s.t}</h3>
            <p className="mt-1.5 text-sm text-stone-500">{s.d}</p>
          </div>
        )}
      </section>
    </div>);

}
