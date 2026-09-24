/* === GPTYAR edit subscriber unlimited v5 === */
;(() => {
  const EDIT_UNLIMITED_ID = 'subscriberUnlimitedEdit';
  const EDIT_UNLIMITED_ROW_ID = 'subscriberUnlimitedEditRow';
  const UNLIMITED_EXPIRES_AT = '2099-12-31T23:59:59.999Z';
  const UNLIMITED_YEAR = 2099;

  const isUnlimitedDate = value => {
    if (!value) return false;

    const date =
      value instanceof Date
        ? value
        : new Date(value);

    return (
      !Number.isNaN(date.getTime()) &&
      date.getUTCFullYear() >= UNLIMITED_YEAR
    );
  };

  const isCurrentSubscriberUnlimited = manager => {
    const subscriber = manager._selectedSubscriber;

    return Boolean(
      subscriber &&
      (
        subscriber.isUnlimited ||
        isUnlimitedDate(subscriber.expiryDate)
      )
    );
  };

  const getEditUnlimitedCheckbox = () =>
    document.getElementById(EDIT_UNLIMITED_ID);

  const getDetailsExpiryElement = manager =>
    DOMManager.getElement(
      manager.ELEMENT_IDS.SUBSCRIBER_DETAILS_EXPIRY
    );

  const getDetailsCalendarContainer = manager => {
    const calendar =
      DOMManager.getElement(
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

  const extractApiMessage = error => {
    const raw =
      error && error.message
        ? String(error.message)
        : String(error || 'خطای نامشخص');

    const jsonMatch =
      raw.match(/(\{[\s\S]*\})\s*$/);

    if (jsonMatch) {
      try {
        const parsed =
          JSON.parse(jsonMatch[1]);

        const message =
          parsed.message ||
          parsed.error ||
          parsed.detail ||
          parsed.errors;

        if (message) {
          return typeof message === 'string'
            ? message
            : JSON.stringify(message);
        }
      } catch (_) {}
    }

    return raw
      .replace(
        /^API request failed\s*\([^)]*\):?\s*/i,
        ''
      )
      .trim();
  };

  const syncEditUnlimitedUI = manager => {
    const checkbox =
      getEditUnlimitedCheckbox();

    const expiry =
      getDetailsExpiryElement(manager);

    const calendarContainer =
      getDetailsCalendarContainer(manager);

    const applyButton =
      getApplyButton(manager);

    if (!checkbox) return;

    const desiredUnlimited =
      checkbox.checked;

    const currentUnlimited =
      isCurrentSubscriberUnlimited(manager);

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
      } else if (manager._selectedNewDate) {
        expiry.textContent =
          manager._formatPersianDate(
            manager._selectedNewDate
          );
      } else if (currentUnlimited) {
        expiry.textContent =
          'تاریخ جدید انتخاب نشده';

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
        applyButton.disabled =
          currentUnlimited;
      } else if (currentUnlimited) {
        applyButton.disabled =
          !manager._selectedNewDate;
      }
    }
  };

  const ensureEditUnlimitedControl = manager => {
    let checkbox =
      getEditUnlimitedCheckbox();

    if (checkbox) {
      return checkbox;
    }

    const expiry =
      getDetailsExpiryElement(manager);

    const expiryRow =
      expiry
        ? expiry.closest('.detail-row')
        : null;

    if (!expiryRow) {
      return null;
    }

    const row =
      document.createElement('div');

    row.id =
      EDIT_UNLIMITED_ROW_ID;

    row.className =
      'detail-row new-user-unlimited-row subscriber-unlimited-edit-row';

    row.innerHTML = `
      <div class="new-user-unlimited-copy">
        <span class="detail-label">
          اشتراک نامحدود
        </span>

        <span class="new-user-unlimited-hint">
          بدون تاریخ پایان
        </span>
      </div>

      <label
        class="new-user-unlimited-switch"
        title="تغییر اشتراک به حالت نامحدود"
      >
        <input
          id="${EDIT_UNLIMITED_ID}"
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

    checkbox =
      getEditUnlimitedCheckbox();

    if (checkbox) {
      checkbox.addEventListener(
        'change',
        () => {
          const currentUnlimited =
            isCurrentSubscriberUnlimited(
              manager
            );

          if (checkbox.checked) {
            manager._selectedNewDate = null;
          } else if (currentUnlimited) {
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

          syncEditUnlimitedUI(manager);
        }
      );
    }

    return checkbox;
  };

  const originalDetailsSetup =
    AccupdatorManager
      ._setupSubscriberDetailsEventListeners;

  AccupdatorManager
    ._setupSubscriberDetailsEventListeners =
    function () {

      originalDetailsSetup.call(this);

      ensureEditUnlimitedControl(this);
    };

  const originalOpenDetails =
    AccupdatorManager
      ._openSubscriberDetails;

  AccupdatorManager
    ._openSubscriberDetails =
    async function (token) {

      const result =
        await originalOpenDetails.call(
          this,
          token
        );

      const checkbox =
        ensureEditUnlimitedControl(this);

      if (checkbox) {
        checkbox.checked =
          isCurrentSubscriberUnlimited(
            this
          );
      }

      syncEditUnlimitedUI(this);

      return result;
    };

  const originalSelectCalendarDate =
    AccupdatorManager
      ._selectCalendarDate;

  AccupdatorManager
    ._selectCalendarDate =
    function (year, month, day) {

      const checkbox =
        getEditUnlimitedCheckbox();

      if (
        checkbox &&
        checkbox.checked
      ) {
        checkbox.checked = false;
      }

      const result =
        originalSelectCalendarDate.call(
          this,
          year,
          month,
          day
        );

      syncEditUnlimitedUI(this);

      return result;
    };

  AccupdatorManager
    ._handleApplyChanges =
    async function () {

      if (!this._selectedSubscriber) {
        return;
      }

      const checkbox =
        getEditUnlimitedCheckbox();

      const desiredUnlimited =
        Boolean(
          checkbox &&
          checkbox.checked
        );

      const currentUnlimited =
        isCurrentSubscriberUnlimited(
          this
        );

      let targetDate = null;

      if (desiredUnlimited) {
        if (currentUnlimited) {
          return;
        }

        targetDate =
          new Date(
            UNLIMITED_EXPIRES_AT
          );
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

        if (
          !desiredUnlimited &&
          typeof this._initializeCalendar ===
            'function'
        ) {
          this._initializeCalendar(
            targetDate
          );
        }

        await this._loadSubscribers();
        await this.refreshAccountInfo();

        if (checkbox) {
          checkbox.checked =
            desiredUnlimited;
        }

        syncEditUnlimitedUI(this);

      } catch (error) {
        const message =
          extractApiMessage(error);

        globalThis
          .__GPTYAR_DEV_LOG__?.(
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

        syncEditUnlimitedUI(this);
      }
    };
})();