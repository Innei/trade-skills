// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('uses a custom link as the trigger without adding a wrapper', async () => {
    const { container } = render(
      <Tooltip
        content={'NVDA.US\n+1.25%'}
        renderTrigger={<a aria-label="NVDA.US +1.25%" href="/symbol/NVDA.US" />}
      >
        <span>NVDA</span>
      </Tooltip>,
    );

    const link = screen.getByRole('link', { name: 'NVDA.US +1.25%' });
    expect(container.firstElementChild).toBe(link);
    expect(link.getAttribute('href')).toBe('/symbol/NVDA.US');

    fireEvent.focus(link);
    expect(document.querySelector('.tooltip-panel')?.textContent).toBe('NVDA.US\n+1.25%');
  });
});
