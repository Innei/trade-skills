import type { HTMLAttributes } from "react";

type NumProps = {
  value: number;
  diff?: boolean;
  digits?: number;
} & HTMLAttributes<HTMLSpanElement>;

export function Num({ value, diff, digits = 2, className, ...rest }: NumProps) {
  const tone = diff ? (value >= 0 ? " up" : " down") : "";
  const sign = diff && value >= 0 ? "+" : "";
  const cls = `num${tone}${className ? ` ${className}` : ""}`;

  return (
    <span className={cls} {...rest}>
      {sign}
      {value.toFixed(digits)}
    </span>
  );
}
