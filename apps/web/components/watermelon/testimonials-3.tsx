'use client';

import React from 'react';
import { CheckCircle2, Heart, Repeat2 } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Card } from '../ui/card';

interface TestimonialItem {
  id: string;
  name: string;
  handle: string;
  initials: string;
  avatar: string;
  quote: string;
  date: string;
  likes: string;
  reposts: string;
}

const TESTIMONIALS: TestimonialItem[] = [
  {
    id: '1',
    name: 'Rohan Kulkarni',
    handle: '@rohank_cuts',
    initials: 'RK',
    avatar: 'https://github.com/gaearon.png',
    quote:
      'Zooming the timeline all the way to millisecond ticks made tightening punchline cuts and caption sync straightforward without guessing frame boundaries.',
    date: 'Nov 2026',
    likes: '184',
    reposts: '24',
  },
  {
    id: '2',
    name: 'Maya Lindstrom',
    handle: '@mayalind_edit',
    initials: 'ML',
    avatar: 'https://images.unsplash.com/photo-1541516160071-4bb0c5af65ba?auto=format&fit=crop&w=160&q=80',
    quote:
      'The 9:16 Clip Framer lets me drag Top and Bottom crop boxes over a two-person podcast camera once and render straight to portrait without rebuilding sequences.',
    date: 'Nov 2026',
    likes: '142',
    reposts: '19',
  },
  {
    id: '3',
    name: 'Devansh Sharma',
    handle: '@devansh_post',
    initials: 'DS',
    avatar: 'https://images.unsplash.com/photo-1600353068440-6361ef3a86e8?auto=format&fit=crop&w=160&q=80',
    quote:
      'Every overlay drag and property tweak records in the same Ctrl+Z undo stack, and native FFmpeg CFR export keeps long timelines locked to the exact duration.',
    date: 'Nov 2026',
    likes: '216',
    reposts: '31',
  },
  {
    id: '4',
    name: 'Elena Sato',
    handle: '@elenasato_fx',
    initials: 'ES',
    avatar: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?auto=format&fit=crop&w=160&q=80',
    quote:
      'Opening a project folder restores the JSON state, cached source clips, and color sliders right where I closed the desktop app.',
    date: 'Nov 2026',
    likes: '98',
    reposts: '12',
  },
  {
    id: '5',
    name: 'Marcus Vance',
    handle: '@mvance_media',
    initials: 'MV',
    avatar: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&w=160&q=80',
    quote:
      'Center X, Center Y, and spacing guides snap text captions into place inside the safe zone without eyeballing coordinates in an inspector.',
    date: 'Nov 2026',
    likes: '165',
    reposts: '21',
  },
  {
    id: '6',
    name: 'Nadia Patel',
    handle: '@nadiap_audio',
    initials: 'NP',
    avatar: 'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&w=160&q=80',
    quote:
      'Extracting camera dialogue onto a standalone audio track gives clean channel gain control and mute toggles while testing rough edits in Web Studio.',
    date: 'Nov 2026',
    likes: '129',
    reposts: '15',
  },
];

export function Testimonials3() {
  return (
    <section aria-labelledby="testimonials-heading" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <div className="max-w-2xl space-y-2">
        <h2
          id="testimonials-heading"
          className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl"
        >
          Built for daily timeline work
        </h2>
        <p className="text-sm text-zinc-400">
          Notes from editors using CineCraft Studio for multi-track cuts, 9:16 speaker splits, and local MP4 delivery.
        </p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {TESTIMONIALS.map((item) => (
          <Card
            key={item.id}
            className="flex flex-col justify-between gap-4 rounded-xl bg-[#12151c] p-5 shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.06),0px_1px_2px_-1px_rgba(0,0,0,0.4),0px_2px_4px_0px_rgba(0,0,0,0.3)] transition-shadow hover:shadow-[inset_0px_1px_0px_0px_rgba(255,255,255,0.09),0px_6px_14px_0px_rgba(0,0,0,0.5)]"
          >
            <div className="space-y-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={item.avatar} alt={item.name} />
                    <AvatarFallback>{item.initials}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-100">
                      <span>{item.name}</span>
                      <CheckCircle2 className="h-3.5 w-3.5 text-teal-400" aria-hidden="true" />
                    </div>
                    <div className="font-mono text-[11px] text-zinc-500">{item.handle}</div>
                  </div>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-zinc-300">{item.quote}</p>
            </div>

            <div className="flex items-center justify-between pt-2 font-mono text-[10px] text-zinc-500">
              <span>{item.date}</span>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-3 w-3" aria-hidden="true" />
                  {item.likes}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Repeat2 className="h-3 w-3" aria-hidden="true" />
                  {item.reposts}
                </span>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
