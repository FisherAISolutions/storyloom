import React, { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, User } from 'lucide-react';

/**
 * Multi-character picker — up to `max` slots.
 * Each slot is either a saved character ({ type:'saved', character_id, name, description })
 * or a quick unnamed character ({ type:'quick', quick_description }).
 */
export default function CharacterSlots({ value = [], onChange, savedCharacters = [], max = 3 }) {
  const slots = [...value];
  while (slots.length < max) slots.push(null);

  function update(i, val) {
    const next = [...slots];
    next[i] = val;
    onChange(next.filter(Boolean));
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {slots.map((slot, i) => (
        <SlotCard
          key={i}
          slot={slot}
          savedCharacters={savedCharacters}
          onSet={(val) => update(i, val)}
          onClear={() => update(i, null)}
        />
      ))}
    </div>
  );
}

function SlotCard({ slot, savedCharacters, onSet, onClear }) {
  const [mode, setMode] = useState(null);
  const [quick, setQuick] = useState('');

  function reset() {
    setMode(null);
    setQuick('');
  }

  if (slot) {
    return (
      <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100">
            <User className="h-4 w-4 text-stone-500" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-stone-800">
              {slot.type === 'saved' ? slot.name : 'Quick character'}
            </p>
            <p className="truncate text-xs text-stone-400">
              {slot.type === 'saved' ? 'From your library' : slot.quick_description}
            </p>
          </div>
        </div>
        <button onClick={onClear} className="ml-2 shrink-0 rounded-full p-1 text-stone-300 hover:bg-stone-100 hover:text-stone-600">
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <Popover onOpenChange={(open) => !open && reset()}>
      <PopoverTrigger asChild>
        <button className="flex min-h-[72px] w-full flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-stone-300 bg-stone-50/60 p-3 text-stone-500 transition hover:border-stone-400 hover:bg-stone-50">
          <Plus className="h-4 w-4" />
          <span className="text-xs font-medium">Add character</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        {!mode && (
          <div className="space-y-1">
            <button
              onClick={() => setMode('saved')}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100"
            >
              Pick from library
            </button>
            <button
              onClick={() => setMode('quick')}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100"
            >
              Quick character (describe role)
            </button>
            {savedCharacters.length === 0 && (
              <p className="px-3 pt-1 text-xs text-stone-400">No saved characters yet — create one on the Characters page.</p>
            )}
          </div>
        )}
        {mode === 'saved' && (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-xs font-medium text-stone-500">Your characters</span>
              <button onClick={reset} className="text-xs text-stone-400 hover:text-stone-600">back</button>
            </div>
            {savedCharacters.length === 0 && <p className="px-1 text-xs text-stone-400">No saved characters.</p>}
            {savedCharacters.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onSet({ type: 'saved', character_id: c.id, name: c.name, description: c.description });
                  reset();
                }}
                className="w-full rounded-lg px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100"
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
        {mode === 'quick' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-stone-500">Describe the role</span>
              <button onClick={reset} className="text-xs text-stone-400 hover:text-stone-600">back</button>
            </div>
            <Input
              autoFocus
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && quick.trim()) {
                  onSet({ type: 'quick', quick_description: quick.trim() });
                  reset();
                }
              }}
              placeholder="a baby sister, a friendly dragon…"
            />
            <Button
              size="sm"
              className="w-full"
              disabled={!quick.trim()}
              onClick={() => {
                onSet({ type: 'quick', quick_description: quick.trim() });
                reset();
              }}
            >
              Add character
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}