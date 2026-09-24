/* === GPTYAR unlimited display v4 === */
;(() => {
  const UNLIMITED_YEAR = 2099;

  const isUnlimitedExpiry = value => {
    if (!value) return false;
    const date = value instanceof Date ? value : new Date(value);
    return !Number.isNaN(date.getTime()) &&
      date.getUTCFullYear() >= UNLIMITED_YEAR;
  };

  const normalizeSubscription = value => {
    if (!value || typeof value !== 'object') return value;

    if (isUnlimitedExpiry(value.expiresAt)) {
      return {
        ...value,
        expiresAt: null
      };
    }

    return value;
  };

  const normalizeAccount = account => {
    if (!account || typeof account !== 'object') return account;

    const clone = {
      ...account
    };

    for (const key of Object.keys(clone)) {
      if (Array.isArray(clone[key])) {
        clone[key] = clone[key].map(normalizeSubscription);
      }
    }

    return normalizeSubscription(clone);
  };

  if (
    typeof SubscriptionManager !== 'undefined' &&
    SubscriptionManager.updateRemainingTimeDisplay
  ) {
    const originalRemaining =
      SubscriptionManager.updateRemainingTimeDisplay;

    SubscriptionManager.updateRemainingTimeDisplay = function (
      subscription,
      account
    ) {
      return originalRemaining.call(
        this,
        subscription,
        normalizeSubscription(account)
      );
    };
  }

  if (
    typeof SubscriptionManager !== 'undefined' &&
    SubscriptionManager.displaySubscriptionsForAgent
  ) {
    const originalDisplay =
      SubscriptionManager.displaySubscriptionsForAgent;

    SubscriptionManager.displaySubscriptionsForAgent = function (account) {
      return originalDisplay.call(
        this,
        normalizeAccount(account)
      );
    };
  }
})();