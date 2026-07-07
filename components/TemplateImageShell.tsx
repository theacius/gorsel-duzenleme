"use client";

import {
  forwardRef,
  type ReactNode,
  type HTMLAttributes,
} from "react";

export const TEMPLATE_IMG_CLASSES =
  "pointer-events-none block h-auto max-h-[85vh] w-auto max-w-full select-none align-top";

export const TEMPLATE_SHELL_LAYOUT_CLASSNAME =
  "max-w-full min-w-0 select-none";

type ShellProps = Omit<HTMLAttributes<HTMLDivElement>, "children" | "ref"> & {
  src: string;
  alt: string;
  children: ReactNode;
};

export const TemplateImageShell = forwardRef<HTMLDivElement, ShellProps>(
  function TemplateImageShell({ src, alt, children, className, ...rest }, ref) {
    return (
      <div
        ref={ref}
        className={`relative inline-block align-top leading-none ${TEMPLATE_SHELL_LAYOUT_CLASSNAME} ${className ?? ""}`}
        {...rest}
      >
        <img src={src} alt={alt} className={TEMPLATE_IMG_CLASSES} draggable={false} />
        <div className="pointer-events-none absolute inset-0 [&>*]:pointer-events-auto">
          {children}
        </div>
      </div>
    );
  },
);
