import { globalStyle } from '@vanilla-extract/css';
import { vars } from './theme.css';

globalStyle('.chart-legend i.decision', { background: '#7c3aed' });

globalStyle('.process-panel', {
  borderTop: `1px solid ${vars.line}`,
  background: '#fafafa',
});

globalStyle('.process-head', {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '9px 10px',
  borderBottom: `1px solid ${vars.line}`,
});

globalStyle('.process-head > div:first-child strong, .process-head > div:first-child span', {
  display: 'block',
});

globalStyle('.process-head > div:first-child strong', {
  fontSize: '11px',
});

globalStyle('.process-head > div:first-child span', {
  marginTop: '1px',
  color: vars.muted,
  font: `9px ${vars.mono}`,
});

globalStyle('.process-head > div:last-child', {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
});

globalStyle('.process-score, .process-reset', {
  height: '25px',
  padding: '0 8px',
  border: `1px solid ${vars.lineStrong}`,
  borderRadius: '4px',
  background: '#fff',
  font: '9px inherit',
});

globalStyle('.process-score', {
  display: 'inline-flex',
  alignItems: 'center',
});

globalStyle('.process-score.pass', {
  color: vars.green,
  borderColor: '#a7d8c7',
  background: '#f0fdf8',
});

globalStyle('.process-score.fail', {
  color: vars.red,
  borderColor: '#efb4b4',
  background: '#fff5f5',
});

globalStyle('.process-reset', {
  cursor: 'pointer',
  color: vars.text,
});

globalStyle('.process-reset:hover', {
  background: vars.soft,
});

globalStyle('.process-rail', {
  display: 'flex',
  gap: '14px',
  padding: '10px',
  overflowX: 'auto',
  scrollbarWidth: 'thin',
});

globalStyle('.process-node', {
  position: 'relative',
  flex: '0 0 154px',
  minHeight: '94px',
  padding: '8px 9px',
  border: `1px solid ${vars.line}`,
  borderTop: '3px solid #a3a3a3',
  borderRadius: '5px',
  background: '#fff',
  color: vars.text,
  textAlign: 'left',
  cursor: 'pointer',
});

globalStyle('.process-node::after', {
  content: '""',
  position: 'absolute',
  top: '42px',
  left: 'calc(100% + 1px)',
  width: '14px',
  height: '1px',
  background: vars.lineStrong,
});

globalStyle('.process-node:last-child::after', {
  display: 'none',
});

globalStyle('.process-node:hover', {
  borderColor: '#a3a3a3',
  background: '#fafafa',
});

globalStyle('.process-node.active', {
  borderColor: '#7c3aed',
  boxShadow: '0 0 0 2px #ede9fe',
  background: '#faf9ff',
});

globalStyle('.process-node.data', { borderTopColor: '#2563eb' });
globalStyle('.process-node.observe', { borderTopColor: '#d97706' });
globalStyle('.process-node.decision', { borderTopColor: '#7c3aed' });
globalStyle('.process-node.manage', { borderTopColor: '#059669' });

globalStyle('.process-node.warning', {
  borderTopColor: '#dc2626',
  background: '#fffafa',
});

globalStyle('.process-node.warning .process-bar', {
  color: '#dc2626',
});

globalStyle('.process-node.error', {
  borderColor: vars.red,
  borderTopColor: vars.red,
});

globalStyle('.process-index', {
  position: 'absolute',
  top: '6px',
  right: '7px',
  color: '#a3a3a3',
  font: `8px ${vars.mono}`,
});

globalStyle('.process-bar', {
  display: 'block',
  color: '#7c3aed',
  font: `650 10px ${vars.mono}`,
});

globalStyle('.process-node strong, .process-node small, .process-node em', {
  display: 'block',
});

globalStyle('.process-node strong', {
  marginTop: '5px',
  fontSize: '10px',
});

globalStyle('.process-node small', {
  marginTop: '2px',
  color: vars.muted,
  fontSize: '8px',
  lineHeight: 1.3,
});

globalStyle('.process-node em', {
  marginTop: '6px',
  color: '#a3a3a3',
  font: `7px ${vars.mono}`,
  fontStyle: 'normal',
});

globalStyle('.process-checks', {
  display: 'flex',
  alignItems: 'center',
  gap: '14px',
  minHeight: '31px',
  padding: '6px 10px',
  borderTop: `1px solid ${vars.line}`,
  background: '#fff',
  overflowX: 'auto',
});

globalStyle('.process-checks > span', {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  whiteSpace: 'nowrap',
  fontSize: '8px',
  color: vars.muted,
});

globalStyle('.process-checks i', {
  display: 'grid',
  placeItems: 'center',
  width: '14px',
  height: '14px',
  borderRadius: '50%',
  fontStyle: 'normal',
});

globalStyle('.process-checks .pass i', {
  color: vars.green,
  background: '#e9f9f2',
});

globalStyle('.process-checks .fail i', {
  color: vars.red,
  background: '#fff0f0',
});

globalStyle('.process-checks small', {
  font: `7px ${vars.mono}`,
  color: '#a3a3a3',
});

globalStyle('.process-empty', {
  margin: 0,
  padding: '12px',
  color: vars.muted,
  fontSize: '10px',
});

globalStyle('.trade-ledger', {
  padding: '0 !important',
  borderBottom: `1px solid ${vars.line}`,
});

globalStyle('.trade-ledger > h4, .trade-ledger > p', {
  margin: 0,
  padding: '9px 12px',
});

globalStyle('.trade-ledger > p', {
  paddingTop: 0,
  color: vars.muted,
  fontSize: '9px',
});

globalStyle('.trade-ledger > summary', {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '9px 12px',
  cursor: 'pointer',
  fontSize: '10px',
  fontWeight: 650,
});

globalStyle('.trade-ledger > summary span', {
  color: vars.muted,
});

globalStyle('.trade-ledger ol', {
  listStyle: 'none',
  margin: 0,
  padding: '0 12px 8px',
});

globalStyle('.trade-ledger li', {
  display: 'grid',
  gridTemplateColumns: 'minmax(0,1fr) auto',
  gap: '5px 8px',
  padding: '7px 0',
  borderTop: `1px solid ${vars.line}`,
});

globalStyle('.trade-ledger li > div:first-child strong, .trade-ledger li > div:first-child small', {
  display: 'block',
});

globalStyle('.trade-ledger li > div:first-child strong', {
  fontSize: '9px',
});

globalStyle('.trade-ledger li > div:first-child small', {
  color: vars.muted,
  font: `7px ${vars.mono}`,
});

globalStyle('.trade-prices', {
  gridColumn: '1/-1',
  display: 'flex',
  gap: '7px',
  color: vars.muted,
  font: `7px ${vars.mono}`,
  whiteSpace: 'nowrap',
});

globalStyle('.trade-ledger li > strong', {
  gridColumn: 2,
  gridRow: 1,
  font: `650 10px ${vars.mono}`,
});

globalStyle('.process-head', {
  '@media': {
    '(max-width:680px)': { alignItems: 'flex-start', flexDirection: 'column' },
  },
});

globalStyle('.process-head > div:last-child', {
  '@media': {
    '(max-width:680px)': { width: '100%', justifyContent: 'space-between' },
  },
});

globalStyle('.process-node', {
  '@media': {
    '(max-width:680px)': { flexBasis: '146px' },
    print: { flexBasis: '140px' },
  },
});

globalStyle('.process-checks', {
  '@media': {
    '(max-width:680px)': { gap: '10px' },
  },
});

globalStyle('.process-checks small', {
  '@media': {
    '(max-width:680px)': { display: 'none' },
  },
});

globalStyle('.process-reset', {
  '@media': {
    print: { display: 'none' },
  },
});

globalStyle('.process-rail', {
  '@media': {
    print: { flexWrap: 'wrap', overflow: 'visible' },
  },
});