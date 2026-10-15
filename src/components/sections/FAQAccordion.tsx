'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Minus, Plus } from 'lucide-react';
import { useId, useState } from 'react';
import type { FAQItem } from '@/data/faq';
import { useReducedMotionPreference } from '@/hooks/useReducedMotionPreference';
import { ScrollCollection } from '@/components/ui/ScrollCollection';

export function FAQAccordion({ items }: { items: FAQItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const accordionId = useId();
  const reduceMotion = useReducedMotionPreference();

  return (
    <ScrollCollection className="min-w-0 space-y-4" stretch={false}>
      {items.map((item, index) => {
        const isOpen = openIndex === index;
        const answer = (
          <div className="mx-4 mb-4 rounded-2xl border border-orange-100 bg-white px-5 py-5 shadow-[inset_0_2px_7px_rgba(255,102,0,0.04)] sm:mx-6 sm:mb-6 sm:px-6 sm:py-6">
            <p className="mb-3 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.18em] text-orange-700"><span aria-hidden="true" className="h-1 w-1 rounded-full bg-brand" />The answer</p>
            <p className="max-w-[65ch] break-words text-sm leading-7 text-black/75">{item.answer}</p>
          </div>
        );

        return (
          <div
            key={item.question}
            className={`premium-panel interactive-card group relative min-w-0 focus-within:border-orange-300 ${
              isOpen
                ? '!border-orange-300 !shadow-[0_12px_35px_-12px_rgba(255,102,0,0.19),inset_0_1px_0_#fff]'
                : 'hover:border-orange-200'
            }`}
          >
            {isOpen ? <span aria-hidden="true" className="absolute left-0 top-6 h-8 w-1 rounded-r-full bg-brand" /> : null}
            <button
              type="button"
              id={`${accordionId}-question-${index}`}
              aria-expanded={isOpen}
              aria-controls={`${accordionId}-answer-${index}`}
              onClick={() => setOpenIndex(isOpen ? null : index)}
              className="flex min-h-24 w-full min-w-0 items-center justify-between gap-4 rounded-[24px] px-5 py-5 text-left text-black outline-none focus-visible:ring-2 focus-visible:ring-orange-600 focus-visible:ring-offset-2 sm:gap-5 sm:px-7 sm:py-6"
            >
              <span className="min-w-0 break-words text-sm font-semibold leading-6 tracking-[-0.015em] sm:text-base">{item.question}</span>
              <span className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-orange-700 transition-colors ${isOpen ? 'border-orange-200 bg-gradient-to-br from-white to-orange-50 shadow-[0_3px_8px_rgba(255,102,0,0.08)]' : 'border-orange-100 bg-white'}`}>
                {isOpen ? <Minus className="h-5 w-5" aria-hidden="true" /> : <Plus className="h-5 w-5" aria-hidden="true" />}
              </span>
            </button>
            {reduceMotion ? (isOpen ? (
              <div id={`${accordionId}-answer-${index}`} role="region" aria-labelledby={`${accordionId}-question-${index}`} className="min-w-0">
                {answer}
              </div>
            ) : null) : <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  id={`${accordionId}-answer-${index}`}
                  role="region"
                  aria-labelledby={`${accordionId}-question-${index}`}
                  className="min-w-0 overflow-hidden"
                  initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
                >
                  {answer}
                </motion.div>
              ) : null}
            </AnimatePresence>}
          </div>
        );
      })}
    </ScrollCollection>
  );
}
