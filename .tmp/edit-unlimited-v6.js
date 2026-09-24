/* === GPTYAR edit subscriber unlimited robust v6 === */
;(() => {
  const ID = 'subscriberUnlimitedEdit';
  const ROW_ID = 'subscriberUnlimitedEditRow';
  const UNLIMITED_EXPIRES_AT = '2099-12-31T23:59:59.999Z';
  const UNLIMITED_YEAR = 2099;

  const isUnlimitedDate = value => {
    if (!value) return false;
    const date = value instanceof Date ? value : new Date(value);
    return !Number.isNaN(date.getTime()) &&
      date.getUTCFullYear() >= UNLIMITED_YEAR;
  };

  const currentIsUnlimited = manager => {
    const item = manager._selectedSubscriber;
    return Boolean(
      item &&
      (
        item.isUnlimited ||
        isUnlimitedDate(item.expiryDate)
      )
    );
  };

  const getExpiry = manager =>
    DOMManager.getElement(
      manager.ELEMENT_IDS.SUBSCRIBER_DETAILS_EXPIRY
    );

  const getCalendarContainer = manager => {
    const calendar = DOMManager.getElement(
      manager.ELEMENT_IDS.SUBSCRIBER_CALENDAR
    );
    return calendar
      ? calendar.closest('.subscriber-calendar-container')
      : null;
  };

  const getApplyButton = manager =>
    DOMManager.getElement(
      manager.ELEMENT_IDS.SUBSCRIBER_APPLY_BTN
    );

  const getCheckbox = () =>
    document.getElementById(ID);

  const extractApiMessage = error => {
    const raw = error && error.message
      ? String(error.message)
      : String(error || 'خطای نامشخص');

    const jsonMatch = raw.match(/(\{[\s\S]*\})\s*$/);

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        const msg =
          parsed.message ||
          parsed.error ||
          parsed.detail ||
          parsed.errors;

        if (msg) {
          return typeof msg === 'string'
            ? msg
            : JSON.stringify(msg);
        }
      } catch (_) {}
    }

    return raw
      .replace(/^API request failed\s*\([^)]*\):?\s*/i, '')
      .trim();
  };

  const sync = manager => {
    const checkbox = getCheckbox();
    if (!checkbox) return;

    const expiry = getExpiry(manager);
    const calendarContainer = getCalendarContainer(manager);
    const applyButton = getApplyButton(manager);
    const desiredUnlimited = checkbox.checked;
    const wasUnlimited = currentIsUnlimited(manager);

    if (calendarContainer) {
      calendarContainer.classList.toggle(
        'new-user-calendar-hidden',
        desiredUnlimited
      );
    }

    if (expiry) {
      expiry.classList.toggle(
        'new-user-expiry-unlimited',
        desiredUnlimited
      );

      if (desiredUnlimited) {
        expiry.textContent = 'نامحدود';
        expiry.classList.add('selected');
      } else if (manager._selectedNewDate) {
        expiry.textContent =
          manager._formatPersianDate(
            manager._selectedNewDate
          );
        expiry.classList.add('selected');
      } else if (wasUnlimited) {
        expiry.textContent = 'تاریخ جدید انتخاب نشده';
        expiry.classList.remove(
          'new-user-expiry-unlimited'
        );
      } else if (
        manager._selectedSubscriber &&
        manager._selectedSubscriber.expiryDate
      ) {
        expiry.textContent =
          manager._formatPersianDate(
            manager._selectedSubscriber.expiryDate
          );
      }
    }

    if (applyButton) {
      if (desiredUnlimited) {
        applyButton.disabled = wasUnlimited;
      } else {
        applyButton.disabled = !manager._selectedNewDate;
      }
    }
  };

  const ensure = manager => {
    let checkbox = getCheckbox();

    if (checkbox) {
      return checkbox;
    }

    const expiry = getExpiry(manager);
    const expiryRow =
      expiry ? expiry.closest('.detail-row') : null;

    if (!expiryRow) {
      return null;
    }

    const row = document.createElement('div');
    row.id = ROW_ID;
    row.className =
      'detail-row new-user-unlimited-row subscriber-unlimited-edit-row';

    row.innerHTML = `
      <div class="new-user-unlimited-copy">
        <span class="detail-label">اشتراک نامحدود</span>
        <span class="new-user-unlimited-hint">بدون تاریخ پایان</span>
      </div>

      <label
        class="new-user-unlimited-switch"
        title="فعال یا غیرفعال کردن اشتراک نامحدود"
      >
        <input
          id="${ID}"
          type="checkbox"
          aria-label="اشتراک نامحدود"
        >
        <span class="new-user-unlimited-slider">
          <span class="new-user-unlimited-knob"></span>
        </span>
      </label>
    `;

    expiryRow.insertAdjacentElement(
      'afterend',
      row
    );

    checkbox = getCheckbox();

    if (checkbox) {
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          manager._selectedNewDate = null;
        } else if (currentIsUnlimited(manager)) {
          manager._selectedNewDate = null;

          if (
            typeof manager._initializeCalendar ===
            'function'
          ) {
            manager._initializeCalendar(
              new Date()
            );
          }
        }

        sync(manager);
      });
    }

    return checkbox;
  };

  const refreshControl = manager => {
    const checkbox = ensure(manager);
    if (!checkbox) return;

    checkbox.checked =
      currentIsUnlimited(manager);

    sync(manager);
  };

  const previousOpen =
    AccupdatorManager._openSubscriberDetails;

  AccupdatorManager._openSubscriberDetails =
    async function (token) {
      const result =
        await previousOpen.call(this, token);

      requestAnimationFrame(() => {
        refreshControl(this);
      });

      setTimeout(() => {
        refreshControl(this);
      }, 0);

      return result;
    };

  const previousCreateDetails =
    AccupdatorManager._createSubscriberDetailsMenu;

  AccupdatorManager._createSubscriberDetailsMenu =
    function () {
      const result =
        previousCreateDetails.call(this);

      requestAnimationFrame(() => {
        ensure(this);
      });

      return result;
    };

  const previousSelectDate =
    AccupdatorManager._selectCalendarDate;

  AccupdatorManager._selectCalendarDate =
    function (year, month, day) {
      const checkbox = getCheckbox();

      if (checkbox && checkbox.checked) {
        checkbox.checked = false;
      }

      const result =
        previousSelectDate.call(
          this,
          year,
          month,
          day
        );

      sync(this);
      return result;
    };

  AccupdatorManager._handleApplyChanges =
    async function () {
      if (!this._selectedSubscriber) {
        return;
      }

      const checkbox = getCheckbox();
      const desiredUnlimited =
        Boolean(checkbox && checkbox.checked);
      const wasUnlimited =
        currentIsUnlimited(this);

      let targetDate = null;

      if (desiredUnlimited) {
        if (wasUnlimited) {
          return;
        }

        targetDate =
          new Date(UNLIMITED_EXPIRES_AT);
      } else {
        targetDate =
          this._selectedNewDate;

        if (!targetDate) {
          return;
        }
      }

      const applyButton =
        getApplyButton(this);

      try {
        this._setButtonLoading(
          applyButton,
          true
        );

        await this.updateSubscriberExpiry(
          this._selectedSubscriber.subscriptionId,
          targetDate
        );

        this._selectedSubscriber.expiryDate =
          targetDate;

        this._selectedSubscriber.isUnlimited =
          desiredUnlimited;

        this._selectedNewDate = null;

        NotificationManager.showSuccess(
          desiredUnlimited
            ? 'اشتراک با موفقیت نامحدود شد'
            : 'تاریخ انقضا با موفقیت به‌روزرسانی شد'
        );

        this._updateSubscriberDetailsContent(
          this._selectedSubscriber
        );

        await this._loadSubscribers();
        await this.refreshAccountInfo();

        if (checkbox) {
          checkbox.checked =
            desiredUnlimited;
        }

        sync(this);
      } catch (error) {
        const message =
          extractApiMessage(error);

        globalThis.__GPTYAR_DEV_LOG__?.(
          '[AccupdatorManager] Error updating subscription:',
          error
        );

        NotificationManager.showError(
          'خطا در به‌روزرسانی اشتراک: ' +
          (
            message.length > 160
              ? message.slice(0, 160) + '…'
              : message
          )
        );
      } finally {
        this._setButtonLoading(
          applyButton,
          false
        );

        sync(this);
      }
    };

  const observer = new MutationObserver(() => {
    const detailsMenu =
      DOMManager.getElement(
        AccupdatorManager.ELEMENT_IDS.SUBSCRIBER_DETAILS_MENU
      );

    if (!detailsMenu) {
      return;
    }

    ensure(AccupdatorManager);

    if (
      detailsMenu.classList.contains('active') &&
      AccupdatorManager._selectedSubscriber
    ) {
      refreshControl(AccupdatorManager);
    }
  });

  const startObserver = () => {
    if (!document.body) {
      setTimeout(startObserver, 50);
      return;
    }

    observer.observe(
      document.body,
      {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class']
      }
    );

    ensure(AccupdatorManager);
  };

  startObserver();
})();