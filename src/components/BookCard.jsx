import React from 'react';
import { Link } from 'react-router-dom';
import { Image } from '@/components/ui/image';

/**
 * Template card styled as a real open hardcover book:
 * parchment mat, teal cover edges peeking around the pages,
 * a visible center gutter/spine, soft floating shadow, and
 * the title + idea on the left page with the illustration on the right.
 */
export default function BookCard({ to, image, title, theme, idea }) {
  return (
    <Link to={to} className="group block">
      <div className="relative rounded-2xl bg-[#F7F0E3] p-4 transition-transform duration-300 group-hover:-translate-y-1.5">
        {/* floating shadow beneath the book */}
        <div className="pointer-events-none absolute -bottom-2 left-1/2 h-4 w-[78%] -translate-x-1/2 rounded-[50%] bg-[#CBBFA7] opacity-70 blur-lg" />

        {/* open book: teal hardback cover frame */}
        <div className="relative rounded-[10px] bg-[#2A7B85] p-1.5 shadow-[0_16px_30px_-14px_rgba(50,40,30,0.55)]">
          <div className="flex aspect-[3/2] overflow-hidden rounded-[5px] bg-[#FBF6EC]">
            {/* left page — title text */}
            <div className="relative flex-1 overflow-hidden bg-[#FBF6EC] p-3">
              <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-black/15 to-transparent" />
              <div className="relative flex h-full flex-col">
                <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-[#2C4A73]/70">
                  {theme}
                </span>
                <h3 className="mt-1.5 font-display text-base font-bold leading-tight text-[#2C4A73]">
                  {title}
                </h3>
                <p className="mt-2 line-clamp-4 text-[11px] leading-relaxed text-stone-500/90">
                  {idea}
                </p>
              </div>
            </div>

            {/* center gutter / spine */}
            <div className="w-2 bg-gradient-to-r from-black/20 via-black/35 to-black/20" />

            {/* right page — illustration */}
            <div className="relative flex-1 overflow-hidden bg-[#FBF6EC]">
              <Image
                src={image}
                alt={title}
                fittingType="fill"
                className="h-full w-full transition duration-500 group-hover:scale-105"
              />
              <div className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-black/15 to-transparent" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}