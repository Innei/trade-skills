import { globalStyle } from '@vanilla-extract/css';
import { vars } from './theme.css';

globalStyle('.reason-empty', {
  margin: 0,
  padding: '12px',
  color: vars.muted,
  fontSize: '10px',
});

globalStyle('.reason-table', {
  minWidth: '720px',
});

globalStyle('.decision-reason', {
  margin: '8px 0 0',
  paddingTop: '8px',
  borderTop: `1px solid ${vars.line}`,
  color: vars.muted,
  fontSize: '10px',
});

globalStyle('.decision-reason b, .trade-reason b', {
  display: 'inline-block',
  marginRight: '6px',
  color: '#7c3aed',
});

globalStyle('.trade-ledger li > div:first-child .trade-reason', {
  marginTop: '4px',
  color: vars.text,
  font: '9px/1.45 inherit',
});

globalStyle('.actions li', {
  gridTemplateColumns: '22px minmax(0,1fr)',
  gap: '6px',
  padding: '7px 0',
});

globalStyle('.actions li > div strong, .actions li > div small, .actions li > div em', {
  display: 'block',
});

globalStyle('.actions li > div strong', {
  fontSize: '9px',
});

globalStyle('.actions li > div small', {
  marginTop: '2px',
  color: vars.text,
  font: '9px/1.4 inherit',
});

globalStyle('.actions li > div em', {
  marginTop: '3px',
  color: vars.muted,
  font: `7px ${vars.mono}`,
  fontStyle: 'normal',
});

globalStyle('.ledger-hint', {
  margin: 0,
  padding: '0 12px 6px',
  color: vars.muted,
  fontSize: '8px',
});

globalStyle('li[data-trade-select], li[data-action-select]', {
  cursor: 'pointer',
  paddingLeft: '6px !important',
  marginLeft: '-6px',
  borderLeft: '2px solid transparent',
});

globalStyle('li[data-trade-select]:hover, li[data-action-select]:hover', {
  background: '#f5f3ff',
});

globalStyle('li[data-trade-select].active, li[data-action-select].active', {
  background: '#faf9ff',
  borderLeftColor: '#7c3aed',
});