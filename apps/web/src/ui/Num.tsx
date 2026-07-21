import type { HTMLAttributes } from 'react';
import { fmt } from '../lib/format';

type NumProps = {
  value: number;
  diff?: boolean;
  digits?: number;
  suffix?: string;
} & HTMLAttributes<HTMLSpanElement>;

export function Num({ value, diff, digits = 2, suffix, className, ...rest }: NumProps) {
  const tone = diff ? (value >= 0 ? ' up' : ' down') : '';
  const sign = diff && value >= 0 ? '+' : '';
  const cls = `num${tone}${className ? ` ${className}` : ''}`;

  return (
    <span className={cls} {...rest}>
      {sign}
      {fmt(value, digits)}
      {suffix}
    </span>
  );
}
