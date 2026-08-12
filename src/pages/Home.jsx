import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, CirclePlay, Download, Globe, Heart, Info, Palette, PencilLine, RefreshCw, Sparkles, Users, Wand2 } from 'lucide-react';
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

const steps = [
  { n: '01', image: '/images/home/step-1-upload-photo.png', title: 'Create Their Character', description: 'Upload a photo and create a personalized storybook character.' },
  { n: '02', image: '/images/home/step-2-choose-imagine.png', title: 'Choose or Imagine', description: 'Choose a template or imagine an adventure of your own.' },
  { n: '03', image: '/images/home/step-3-ai-writes.png', title: 'AI Writes & Illustrates', description: 'MyStorybook AI writes and illustrates every page.' },
  { n: '04', image: '/images/home/step-4-edit-reimagine.png', title: 'Edit, Reimagine & Create', description: 'Edit text, reimagine illustrations, and create a custom cover.' },
];

export default function Home() {
  return (
    <div className="space-y-20">
      <section className="relative -mx-5 -mt-8 overflow-hidden border-b border-amber-100 bg-[radial-gradient(circle_at_78%_25%,rgba(186,230,227,0.55),transparent_32%),linear-gradient(135deg,#fffdf8_0%,#fff8ef_55%,#f8fcfa_100%)] px-5 py-12 sm:py-16 md:px-10 lg:px-14">
        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:gap-8">
          <div className="max-w-xl">
            <h1 className="font-display text-5xl font-semibold leading-[0.98] tracking-tight text-[#12304b] sm:text-6xl lg:text-7xl">
              Turn Your Child Into the Hero of <em className="not-italic text-[#ed6a5e]">Their Own Story</em>
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-stone-700 md:text-lg">
              Create personalized, beautifully illustrated storybooks starring your child. Upload a photo, choose an adventure and art style, and let AI bring their story to life.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button asChild size="lg" className="rounded-xl bg-[#087f7c] px-7 shadow-lg shadow-teal-900/10 hover:bg-[#066c69]">
                <Link to="/create"><Wand2 className="mr-2 h-4 w-4" /> Create Their Story</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-xl border-stone-300 bg-white/70 text-[#12304b]">
                <a href="#how-it-works"><CirclePlay className="mr-2 h-5 w-5" /> See How It Works</a>
              </Button>
            </div>
            <p className="mt-7 flex items-center gap-2 text-sm font-semibold text-[#087f7c]"><Sparkles className="h-4 w-4 text-[#ed6a5e]" /> Your child. Their adventure. Their storybook.</p>
          </div>

          <div className="mx-auto w-full max-w-3xl">
            <Image src="/images/home/hero-character-book.png" alt="A child photograph beside her illustrated storybook character meeting a friendly dragon" fittingType="fit" className="w-full drop-shadow-[0_24px_24px_rgba(58,39,22,0.18)]" />
            <Button asChild size="lg" className="mx-auto mt-5 flex w-fit rounded-full bg-[#ed6a5e] px-8 shadow-lg shadow-rose-900/10 hover:bg-[#df5c51]">
              <Link to="/characters"><Users className="mr-2 h-4 w-4" /> Create a Character <Sparkles className="ml-2 h-4 w-4" /></Link>
            </Button>
            <p className="mt-2 text-center text-sm text-stone-600">Upload a photo and create their reusable storybook character.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="how-it-works" className="scroll-mt-28">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ed6a5e]">How it works</p>
          <h2 id="how-it-works" className="mt-2 font-display text-3xl font-semibold tracking-tight text-[#12304b]">From a photo to a storybook they’ll cherish</h2>
        </div>
        <div className="relative mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
          {steps.map(({ n, image, title, description }) => (
            <div key={n} className="relative">
              <Image src={image} alt={`${title}. ${description}`} fittingType="fit" className="w-full rounded-3xl shadow-sm" />
              <h3 className="sr-only">{title}</h3>
              <p className="sr-only">{description}</p>
              {n !== '04' && <ArrowRight className="absolute -right-4 top-1/2 z-10 hidden h-5 w-5 text-[#087f7c] lg:block" aria-hidden="true" />}
            </div>
          ))}
        </div>
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-5 py-4 text-sm leading-6 text-stone-600">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
          <p><strong className="text-stone-800">AI can make mistakes.</strong> Occasionally an illustration may not perfectly match every story detail, especially in more complex scenes. You’re always in control—edit the text, add more detail, and reimagine an illustration until it fits your story.</p>
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
          <div className="flex items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm"><Globe className="h-5 w-5 text-stone-600" /></div><div><h2 className="font-display text-xl font-semibold tracking-tight md:text-2xl">Stories in 7 languages</h2><p className="mt-1 max-w-md text-sm text-stone-500">Translate a finished story with one tap—perfect for bilingual bedtimes and faraway family.</p></div></div>
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
