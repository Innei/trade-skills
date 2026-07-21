import { createGlobalTheme, globalStyle } from '@vanilla-extract/css';

export const vars = createGlobalTheme(':root', {
  bg: '#f5f5f5',
  panel: '#ffffff',
  line: '#e5e5e5',
  lineStrong: '#d4d4d4',
  text: '#171717',
  muted: '#737373',
  green: '#059669',
  red: '#dc2626',
  blue: '#2563eb',
  soft: '#fafafa',
  mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
});

globalStyle(':root', {
  colorScheme: 'light',
});

globalStyle('*', {
  boxSizing: 'border-box',
});

globalStyle('html', {
  scrollBehavior: 'smooth',
});

globalStyle('body', {
  margin: 0,
  background: vars.bg,
  color: vars.text,
  font: '13px/1.45 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
});

globalStyle('a', {
  color: 'inherit',
});

globalStyle('.mono', {
  fontFamily: vars.mono,
});

globalStyle('.positive', {
  color: `${vars.green} !important`,
});

globalStyle('.negative', {
  color: `${vars.red} !important`,
});

globalStyle('.neutral', {
  color: vars.text,
});

globalStyle('.entry-text', {
  color: vars.blue,
});
