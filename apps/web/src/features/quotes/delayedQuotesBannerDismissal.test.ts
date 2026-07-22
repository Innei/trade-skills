// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  DELAYED_QUOTES_BANNER_DISMISSED_STORAGE_KEY,
  dismissDelayedQuotesBanner,
  getDelayedQuotesBannerDismissed,
  readDelayedQuotesBannerDismissed,
  resetDelayedQuotesBannerDismissedForTests,
  subscribeForTests,
} from './delayedQuotesBannerDismissal';

describe('readDelayedQuotesBannerDismissed', () => {
  it('defaults to not dismissed when no storage is available', () => {
    expect(readDelayedQuotesBannerDismissed(null)).toBe(false);
  });

  it('reads a dismissed flag from storage', () => {
    const storage = {
      getItem: (key: string) => (key === DELAYED_QUOTES_BANNER_DISMISSED_STORAGE_KEY ? '1' : null),
    };
    expect(readDelayedQuotesBannerDismissed(storage)).toBe(true);
  });

  it('treats anything other than "1" as not dismissed', () => {
    expect(readDelayedQuotesBannerDismissed({ getItem: () => 'true' })).toBe(false);
    expect(readDelayedQuotesBannerDismissed({ getItem: () => null })).toBe(false);
  });
});

describe('dismissDelayedQuotesBanner', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetDelayedQuotesBannerDismissedForTests();
  });

  afterEach(() => {
    window.localStorage.clear();
    resetDelayedQuotesBannerDismissedForTests();
  });

  it('flips the in-memory flag and persists it to localStorage', () => {
    expect(getDelayedQuotesBannerDismissed()).toBe(false);

    dismissDelayedQuotesBanner();

    expect(getDelayedQuotesBannerDismissed()).toBe(true);
    expect(window.localStorage.getItem(DELAYED_QUOTES_BANNER_DISMISSED_STORAGE_KEY)).toBe('1');
  });

  it('notifies subscribers once, and is a no-op once already dismissed', () => {
    let notified = 0;
    const unsubscribe = subscribeForTests(() => notified++);

    dismissDelayedQuotesBanner();
    expect(notified).toBe(1);

    dismissDelayedQuotesBanner();
    expect(notified).toBe(1);

    unsubscribe();
  });
});
