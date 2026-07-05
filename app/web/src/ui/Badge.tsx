import type { HTMLAttributes } from "react";

type BadgeProps = {
  tone?: "up" | "down" | "accent" | "solid";
} & HTMLAttributes<HTMLSpanElement>;

export function Badge({ tone, className, children, ...rest }: BadgeProps) {
  const cls = `badge${tone ? ` badge--${tone}` : ""}${className ? ` ${className}` : ""}`;

  return (
    <span className={cls} {...rest}>
      {children}
    </span>
  );
}
