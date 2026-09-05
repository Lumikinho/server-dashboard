import type { CSSProperties, ReactNode } from 'react';

export function Panel({
  title,
  children,
  className,
  style,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={'panel' + (className ? ' ' + className : '')} style={style}>
      <h2>{title}</h2>
      {children}
    </div>
  );
}