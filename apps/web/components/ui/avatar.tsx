'use client';

/* eslint-disable @next/next/no-img-element */
import * as React from 'react';
import { cn } from '../../lib/utils';

const Avatar = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#1a1f2b]',
        className,
      )}
      {...props}
    />
  ),
);
Avatar.displayName = 'Avatar';

interface AvatarImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
}

const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, src, alt = '', onError, ...props }, ref) => {
    const [failedSrc, setFailedSrc] = React.useState<string | null>(null);

    if (!src || failedSrc === src) {
      return null;
    }

    return (
      <img
        ref={ref}
        src={src}
        alt={alt}
        loading="lazy"
        onError={(event) => {
          setFailedSrc(src);
          onError?.(event);
        }}
        className={cn('relative z-10 aspect-square h-full w-full object-cover', className)}
        {...props}
      />
    );
  },
);
AvatarImage.displayName = 'AvatarImage';

const AvatarFallback = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'absolute inset-0 flex h-full w-full items-center justify-center rounded-full bg-[#1b202c] text-xs font-medium text-zinc-200',
        className,
      )}
      {...props}
    />
  ),
);
AvatarFallback.displayName = 'AvatarFallback';

export { Avatar, AvatarImage, AvatarFallback };
