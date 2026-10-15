import { ViewTransition, type ReactNode } from 'react';

export default function Template({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-enter" exit="page-exit" default="none">
      <div className="route-content">{children}</div>
    </ViewTransition>
  );
}
