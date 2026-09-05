import type { CSSProperties } from 'react';
import { logoUrl } from './api';

export interface ServiceIconProps {
  logo: string;
  name?: string;
  accentBg?: string;
  dim?: boolean;
  className?: string;
  size?: number;
}

export function ServiceIcon({ logo, name, accentBg, dim, className, size }: ServiceIconProps) {
  return (
    <span
      className={'svc-icon' + (className ? ' ' + className : '')}
      style={
        {
          '--accent-bg': accentBg || 'rgba(128,128,128,.1)',
          ...(dim || (className && className.includes('maintenance'))
            ? { filter: 'grayscale(1)', opacity: 0.35 }
            : {}),
        } as CSSProperties
      }
    >
      <img
        src={logoUrl(logo)}
        alt={name || ''}
        style={size ? { width: size, height: size } : undefined}
      />
    </span>
  );
}

export function StatusDot({ cls }: { cls: string }) {
  return <span className={'dot ' + cls} />;
}

export function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={'svc-badge ' + tone}>{children}</span>;
}

export function Button({
  variant = 'ghost',
  className,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'danger' | 'ghost' | 'default' }) {
  const cls = 'btn ' + (variant === 'default' ? '' : variant) + (className ? ' ' + className : '');
  return <button className={cls} {...rest} />;
}