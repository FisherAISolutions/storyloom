import React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Globe, Loader2 } from 'lucide-react';
import { LANGUAGES } from '@/lib/storyStudio';
import { cn } from '@/lib/utils';

export default function LanguagePicker({ value, onChange, translating }) {
  const current = LANGUAGES.find((l) => l.code === value) || LANGUAGES[0];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full border-stone-300 bg-white">
          <Globe className="mr-1.5 h-3.5 w-3.5" />
          {translating ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <span className="mr-1">{current.flag}</span>}
          {current.code.toUpperCase()}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-44 p-1" align="end">
        {LANGUAGES.map((l) => (
          <button
            key={l.code}
            onClick={() => onChange(l.code)}
            className={cn(
              'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-stone-100',
              value === l.code && 'bg-stone-100 font-medium text-stone-900'
            )}
          >
            <span className="text-base">{l.flag}</span>
            {l.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}