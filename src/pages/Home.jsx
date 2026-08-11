import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, Download, Globe, Heart, Palette, PencilLine, RefreshCw, Sparkles, Users, Wand2 } from 'lucide-react';
import { TEMPLATES, STORY_IDEAS } from '@/lib/templates';
import { Button } from '@/components/ui/button';
import { Image } from '@/components/ui/image';
import BookCard from '@/components/BookCard';
import { LANGUAGES } from '@/lib/storyStudio';

const benefits = [
  { icon: Users, title: 'Make them the hero', description: 'Turn a photo into a storybook character who can star in adventures made just for them.' },
  { icon: Palette, title: 'Choose every look', description: 'Match each adventure with the illustration style that feels right for your family.' },
  { icon: RefreshCw, title: 'Keep creating', description: 'Edit scenes, reimagine illustrations, add a custom cover, and continue favorite stories.' },
  { icon: Globe, title: 'Share in more languages', description: 'Translate completed books into seven supported languages for family near and far.' },
];

const features = [
  { icon: BookOpenCheck, label: '6 to 30-page storybooks' },
  { icon: PencilLine, label: 'Editable stories and illustrations' },
  { icon: Palette, label: 'Multiple illustration styles' },
  { icon: Download, label: 'Saved library and PDF download' },
];

export default function Home() {
  return (
    <div className="space-y-20">
      <section className="relative overflow-hidden rounded-3xl border border-stone-200 bg-gradient-to-br from-rose-50 via-amber-50 to-sky-50 px-6 py-14 md:px-14 md:py-20">
        <div className="relative z-10 grid items-center gap-10 md:grid-cols-2 md:gap-12">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-stone-600 ring-1 ring-stone-200">
              <Sparkles className="h-3.5 w-3.5" /> Your child. Their adventure. Their storybook.
            </span>
            <h1 className="mt-5 font-display text-4xl font-semibold leading-tight tracking-tight text-stone-900 md:text-6xl">
              Turn Your Child Into the <em className="not-italic text-rose-500">Hero</em> of Their Own Story
            </h1>
            <p className="mt-5 max-w-lg text-base text-stone-600 md:text-lg">
              Create personalized, beautifully illustrated storybooks starring your child. Upload a photo, choose an adventure and art style, and let AI bring their story to life.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-full bg-stone-900 hover:bg-stone-800">
                <Link to="/create"><Wand2 className="mr-2 h-4 w-4" /> Create Their Story</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-stone-300 bg-white/60">
                <Link to="/pricing">View Plans</Link>
              </Button>
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-sm">
            <div className="pointer-events-none absolute -inset-6 rounded-full bg-rose-200/40 blur-3xl" />
            <Image src="/images/home/hero-child.webp" alt="A child illustrated as the hero of a colorful storybook adventure" fittingType="fill" className="relative aspect-square w-full rounded-3xl shadow-xl ring-1 ring-white/60" />
            <Button asChild size="lg" variant="outline" className="mt-4 w-full rounded-full border-stone-300 bg-white/70">
              <Link to="/characters"><Users className="mr-2 h-4 w-4" /> Create Their Character</Link>
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="how-it-works">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-500">How it works</p>
          <h2 id="how-it-works" className="mt-2 font-display text-3xl font-semibold tracking-tight">From imagination to their own storybook</h2>
        </div>
        <div className="mt-8 grid gap-4 md:grid-cols-3 md:gap-6">
          {[
            { n: '01', t: 'Choose or imagine', d: 'Choose a story template or describe your own adventure — pirates, fairies, dragons, space explorers, magical forests, and more.' },
            { n: '02', t: 'AI brings it to life', d: 'MyStorybook AI writes the story and beautifully illustrates every page in the art style you choose.' },
            { n: '03', t: 'Make your child the star', d: 'Upload a photo to create their storybook character and place them inside personalized adventures they’ll love.' },
          ].map((step) => (
            <div key={step.n} className="rounded-2xl border border-stone-200 bg-white p-6">
              <span className="font-mono text-xs text-stone-400">STEP {step.n}</span>
              <h3 className="mt-2 font-display text-lg font-semibold">{step.t}</h3>
              <p className="mt-1.5 text-sm leading-6 text-stone-500">{step.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Choose an adventure</h2><p className="mt-1 text-sm text-stone-500">Start with an illustrated world or make the story entirely your own.</p></div>
          <Link to="/create" className="inline-flex items-center gap-1 text-sm font-medium text-stone-700 hover:text-stone-950">Create from scratch <ArrowRight className="h-4 w-4" /></Link>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 md:grid-cols-3">
          {TEMPLATES.map((template) => <BookCard key={template.id} to={`/create?template=${template.id}`} image={template.image} title={template.title} theme={template.theme} idea={template.idea} />)}
        </div>
      </section>

      <section className="rounded-3xl bg-stone-900 px-6 py-10 text-white md:px-10">
        <div className="max-w-2xl"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">Made to be theirs</p><h2 className="mt-2 font-display text-3xl font-semibold">Choose the perfect art style for every adventure.</h2><p className="mt-3 text-sm leading-6 text-stone-300">Create a short bedtime tale or a bigger adventure, then shape it with the tools already built into MyStorybook AI.</p></div>
        <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{features.map(({ icon: Icon, label }) => <div key={label} className="flex items-center gap-3 rounded-2xl bg-white/10 p-4 text-sm"><Icon className="h-5 w-5 shrink-0 text-rose-300" />{label}</div>)}</div>
      </section>

      <section>
        <div className="flex items-center gap-3"><Heart className="h-7 w-7 text-rose-500" /><h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Why parents love it</h2></div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{benefits.map(({ icon: Icon, title, description }) => <div key={title} className="rounded-2xl border border-stone-200 bg-white p-5"><Icon className="h-5 w-5 text-stone-500" /><h3 className="mt-3 font-display text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-stone-500">{description}</p></div>)}</div>
      </section>

      <section>
        <h2 className="font-display text-2xl font-semibold tracking-tight md:text-3xl">Need a spark?</h2>
        <p className="mt-1 text-sm text-stone-500">Tap an idea to start a brand-new story.</p>
        <div className="mt-6 flex flex-wrap gap-2.5">{STORY_IDEAS.map((idea) => <Link key={idea} to={`/create?idea=${encodeURIComponent(idea)}`} className="group inline-flex items-center gap-2 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 transition hover:border-stone-400 hover:bg-stone-50">{idea}<ArrowRight className="h-3.5 w-3.5 text-stone-300 transition group-hover:translate-x-0.5 group-hover:text-stone-500" /></Link>)}</div>
      </section>

      <section className="overflow-hidden rounded-3xl border border-stone-200 bg-gradient-to-br from-amber-50 via-rose-50 to-violet-50 p-6 md:p-8">
        <div className="flex flex-col items-start gap-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm"><Globe className="h-5 w-5 text-stone-600" /></div><div><h2 className="font-display text-xl font-semibold tracking-tight md:text-2xl">Stories in 7 languages</h2><p className="mt-1 max-w-md text-sm text-stone-500">Translate a finished story with one tap — perfect for bilingual bedtimes and faraway family.</p></div></div>
          <div className="flex flex-wrap gap-2">{LANGUAGES.map((language) => <span key={language.code} className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm text-stone-700"><span className="text-base leading-none">{language.flag}</span> {language.label}</span>)}</div>
        </div>
      </section>

      <section className="rounded-3xl border border-stone-200 bg-white px-6 py-10 text-center md:px-10">
        <h2 className="font-display text-3xl font-semibold">Ready to make them the hero?</h2><p className="mx-auto mt-3 max-w-xl text-stone-500">Create a personalized storybook they can return to again and again.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3"><Button asChild className="rounded-full"><Link to="/create">Create Their Story</Link></Button><Button asChild variant="outline" className="rounded-full"><Link to="/pricing">View Plans</Link></Button></div>
      </section>
    </div>
  );
}
