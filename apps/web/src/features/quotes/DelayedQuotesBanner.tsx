import { navigate } from '../../lib/router';
import { useDelayedMarkets } from './delayedDatasource';
import {
  dismissDelayedQuotesBanner,
  useDelayedQuotesBannerDismissed,
} from './delayedQuotesBannerDismissal';

export function DelayedQuotesBanner() {
  const delayedMarkets = useDelayedMarkets();
  const dismissed = useDelayedQuotesBannerDismissed();
  if (delayedMarkets.size === 0 || dismissed) return null;

  return (
    <div className="delayed-quotes-banner">
      <span>
        当前行情为轮询更新,可能有延迟,不是实时行情。接入长桥可获得实时行情;后续计划支持 IBKR
        等更多渠道。
      </span>
      <div className="delayed-quotes-banner-actions">
        <button className="delayed-quotes-banner-link" onClick={() => navigate('/settings')}>
          去设置
        </button>
        <button
          className="delayed-quotes-banner-dismiss"
          onClick={dismissDelayedQuotesBanner}
          aria-label="关闭"
        >
          ×
        </button>
      </div>
    </div>
  );
}
