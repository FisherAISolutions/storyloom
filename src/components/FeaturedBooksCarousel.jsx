import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function relativePosition(index, active, count) {
  let offset = index - active;
  if (offset > count / 2) offset -= count;
  if (offset < -count / 2) offset += count;
  return offset;
}

export default function FeaturedBooksCarousel({ books, title = 'Featured adventures' }) {
  const [active, setActive] = useState(0);
  const touchStart = useRef(null);
  const visibleBooks = useMemo(() => books.slice(0, 7), [books]);
  const count = visibleBooks.length;

  useEffect(() => { if (active >= count) setActive(0); }, [active, count]);
  if (!count) return null;

  const move = (direction) => setActive((current) => (current + direction + count) % count);
  const onKeyDown = (event) => {
    if (event.key === 'ArrowLeft') { event.preventDefault(); move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); move(1); }
  };
  const finishSwipe = (clientX) => {
    if (touchStart.current === null) return;
    const distance = clientX - touchStart.current;
    if (Math.abs(distance) > 45) move(distance > 0 ? -1 : 1);
    touchStart.current = null;
  };

  return <section className="featured-books overflow-hidden rounded-[2.5rem] border border-amber-200/80 bg-[radial-gradient(circle_at_50%_110%,#f3c985_0%,#fff8ec_42%,#fffdf8_75%)] px-4 py-8 shadow-[0_24px_70px_-45px_rgba(54,36,18,.7)] md:px-8" aria-labelledby="featured-books-heading">
    <div className="text-center">
      <p className="flex items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[.24em] text-[#b4533f]"><Sparkles className="h-4 w-4"/> Handpicked for the shelf</p>
      <h2 id="featured-books-heading" className="mt-2 font-display text-3xl font-semibold text-[#12304b] md:text-4xl">{title}</h2>
    </div>
    <div className="relative mt-4">
      <div className="featured-books-stage" role="region" aria-roledescription="carousel" aria-label={title} tabIndex={0} onKeyDown={onKeyDown} onTouchStart={(event)=>{touchStart.current=event.touches[0].clientX;}} onTouchEnd={(event)=>finishSwipe(event.changedTouches[0].clientX)}>
        {visibleBooks.map((book,index)=>{
          const offset=relativePosition(index,active,count);
          const isVisible=Math.abs(offset)<=2;
          return <article key={book.slug} aria-hidden={!isVisible} className={cn('featured-book',`featured-book-${offset}`,!isVisible&&'featured-book-hidden')}>
            <button type="button" className="featured-book-select" onClick={()=>setActive(index)} tabIndex={offset===0?0:-1} aria-label={`Show ${book.title}`}>
              <span className="featured-book-cover">
                {book.cover_url?<img src={book.cover_url} alt="" className="h-full w-full object-cover"/>:<span className="flex h-full items-center justify-center bg-amber-50 font-display text-lg text-stone-400">MyStorybook AI</span>}
              </span>
            </button>
            {offset===0&&<div className="featured-book-caption" aria-live="polite">
              <h3 className="font-display text-xl font-semibold text-[#12304b]">{book.title}</h3>
              <p className="mt-1 text-sm text-stone-600">{book.attribution}</p>
              <Button asChild size="sm" className="mt-3 rounded-full bg-[#087f7c] hover:bg-[#066a68]"><Link to={`/community/${book.slug}`}>Explore this book</Link></Button>
            </div>}
          </article>;
        })}
      </div>
      {count>1&&<><Button type="button" size="icon" variant="outline" className="absolute left-0 top-[42%] z-30 rounded-full bg-white/90 shadow-md md:left-4" onClick={()=>move(-1)} aria-label="Previous featured book"><ChevronLeft/></Button><Button type="button" size="icon" variant="outline" className="absolute right-0 top-[42%] z-30 rounded-full bg-white/90 shadow-md md:right-4" onClick={()=>move(1)} aria-label="Next featured book"><ChevronRight/></Button></>}
    </div>
    {count>1&&<div className="mt-2 flex justify-center gap-2" aria-label="Choose featured book">{visibleBooks.map((book,index)=><button key={book.slug} type="button" onClick={()=>setActive(index)} className={cn('h-2 rounded-full transition-all',index===active?'w-7 bg-[#087f7c]':'w-2 bg-stone-300')} aria-label={`Show ${book.title}`} aria-current={index===active?'true':undefined}/>)}</div>}
  </section>;
}
