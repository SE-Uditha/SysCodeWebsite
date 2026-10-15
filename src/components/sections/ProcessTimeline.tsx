import { AnimatedSection } from '@/components/ui/AnimatedSection';
import { ScrollCollection } from '@/components/ui/ScrollCollection';

const processSteps = [
  { step: '01', title: 'Consultation', description: 'We discuss your business goals and website requirements.' },
  { step: '02', title: 'Planning', description: 'We prepare the website structure and development approach.' },
  { step: '03', title: 'UI/UX Design', description: 'We design a modern and user-friendly interface.' },
  { step: '04', title: 'Development', description: 'We develop and test your website using modern technologies.' },
  { step: '05', title: 'Launch', description: 'We deploy your website and provide handover guidance.' },
];

export function ProcessTimeline() {
  return (
    <ScrollCollection as="ol" className="mt-10 grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {processSteps.map((step, index) => (
        <AnimatedSection key={step.step} delay={Math.min(index * 0.03, 0.12)} className="h-full min-w-0">
          <div className="premium-panel flex h-full min-w-0 flex-col p-6 sm:p-7 xl:px-6">
            <div className="flex items-center gap-4" aria-hidden="true">
              <span className="premium-icon inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold tabular-nums">{step.step}</span>
              <span className="h-px flex-1 bg-gradient-to-r from-orange-200 to-white" />
            </div>
            <div className="mt-7 min-w-0">
              <h3 className="break-words text-lg font-semibold tracking-[-0.025em] text-black">{step.title}</h3>
              <p className="mt-3 break-words text-sm leading-7 text-black/75">{step.description}</p>
            </div>
          </div>
        </AnimatedSection>
      ))}
    </ScrollCollection>
  );
}

