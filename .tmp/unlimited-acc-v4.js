/* === GPTYAR unlimited subscription v4 === */
;(() => {
  const UNLIMITED_ID = 'newUserUnlimited';
  const UNLIMITED_ROW_ID = 'newUserUnlimitedRow';
  const UNLIMITED_EXPIRES_AT = '2099-12-31T23:59:59.999Z';
  const UNLIMITED_YEAR = 2099;

  const getExpiryElement = manager =>
    DOMManager.getElement(manager.ELEMENT_IDS.NEW_USER_EXPIRY);

  const getCalendarContainer = manager => {
    const calendar = DOMManager.getElement(manager.ELEMENT_IDS.NEW_USER_CALENDAR);
    return calendar ? calendar.closest('.subscriber-calendar-container') : null;
  };

  const isUnlimitedDate = value => {
    if (!value) return false;
    const date = value instanceof Date ? value : new Date(value);
    return !Number.isNaN(date.getTime()) &&
      date.getUTCFullYear() >= UNLIMITED_YEAR;
  };

  const isUnlimitedSelected = () => {
    const input = document.getElementById(UNLIMITED_ID);
    return Boolean(input && input.checked);
  };

  const extractApiMessage = error => {
    const raw = error && error.message
      ? String(error.message)
      : String(error || 'خطای نامشخص');

    const jsonMatch = raw.match(/(\{[\s\S]*\})\s*$/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        const msg = parsed.message || parsed.error || parsed.detail || parsed.errors;
        if (msg) return typeof msg === 'string' ? msg : JSON.stringify(msg);
      } catch (_) {}
    }

    return raw
      .replace(/^API request failed\s*\([^)]*\):?\s*/i, '')
      .trim();
  };

  const syncUnlimitedUI = manager => {
    const unlimited = isUnlimitedSelected();
    const expiry = getExpiryElement(manager);
    const calendarContainer = getCalendarContainer(manager);

    if (calendarContainer) {
      calendarContainer.classList.toggle('new-user-calendar-hidden', unlimited);
    }

    if (!expiry) return;

    expiry.classList.toggle('new-user-expiry-unlimited', unlimited);

    if (unlimited) {
      expiry.textContent = 'نامحدود';
      expiry.classList.add('selected');
    } else if (manager._newUserExpiryDate) {
      expiry.textContent = manager._formatPersianDate(manager._newUserExpiryDate);
      expiry.classList.add('selected');
    } else {
      expiry.textContent = 'انتخاب نشده';
      expiry.classList.remove('selected');
    }
  };

  const ensureUnlimitedControl = manager => {
    let input = document.getElementById(UNLIMITED_ID);
    if (input) return input;

    const expiry = getExpiryElement(manager);
    const expiryRow = expiry ? expiry.closest('.detail-row') : null;
    if (!expiryRow) return null;

    const row = document.createElement('div');
    row.id = UNLIMITED_ROW_ID;
    row.className = 'detail-row new-user-unlimited-row';
    row.innerHTML = `
      <div class="new-user-unlimited-copy">
        <span class="detail-label">اشتراک نامحدود</span>
        <span class="new-user-unlimited-hint">بدون تاریخ پایان</span>
      </div>
      <label class="new-user-unlimited-switch" title="فعال یا غیرفعال کردن اشتراک نامحدود">
        <input id="${UNLIMITED_ID}" type="checkbox" aria-label="اشتراک نامحدود">
        <span class="new-user-unlimited-slider">
          <span class="new-user-unlimited-knob"></span>
        </span>
      </label>
    `;

    expiryRow.insertAdjacentElement('afterend', row);
    input = document.getElementById(UNLIMITED_ID);

    if (input) {
      input.addEventListener('change', () => {
        syncUnlimitedUI(manager);
        manager._updateNewUserCreateButtonState();
      });
    }

    return input;
  };

  const createUnlimitedUser = async name => {
    const url = CONFIG.API_SERVER + '/accupdator/subscribers/create';
    return await AccupdatorAPI._request(url, 'POST', {
      name,
      expiresAt: UNLIMITED_EXPIRES_AT
    });
  };

  const originalSetup = AccupdatorManager._setupNewUserMenuEventListeners;
  AccupdatorManager._setupNewUserMenuEventListeners = function () {
    originalSetup.call(this);
    ensureUnlimitedControl(this);
    syncUnlimitedUI(this);
  };

  const originalReset = AccupdatorManager._resetNewUserForm;
  AccupdatorManager._resetNewUserForm = function () {
    originalReset.call(this);
    const input = ensureUnlimitedControl(this);
    if (input) input.checked = false;
    syncUnlimitedUI(this);
    this._updateNewUserCreateButtonState();
  };

  AccupdatorManager._updateNewUserCreateButtonState = function () {
    const nameInput = DOMManager.getElement(this.ELEMENT_IDS.NEW_USER_NAME_INPUT);
    const createButton = DOMManager.getElement(this.ELEMENT_IDS.NEW_USER_CREATE_BTN);
    if (!nameInput || !createButton) return;

    const hasName = nameInput.value.trim().length > 0;
    const hasExpiry = this._newUserExpiryDate !== null;

    createButton.disabled =
      !(hasName && (isUnlimitedSelected() || hasExpiry));
  };

  AccupdatorManager._handleCreateNewUser = async function () {
    const nameInput = DOMManager.getElement(this.ELEMENT_IDS.NEW_USER_NAME_INPUT);
    const createButton = DOMManager.getElement(this.ELEMENT_IDS.NEW_USER_CREATE_BTN);
    if (!nameInput) return;

    const name = nameInput.value.trim();
    if (!name) return;

    const unlimited = isUnlimitedSelected();
    if (!unlimited && !this._newUserExpiryDate) return;

    try {
      this._setButtonLoading(createButton, true);

      if (unlimited) {
        await createUnlimitedUser(name);
        NotificationManager.showSuccess('کاربر نامحدود با موفقیت ایجاد شد');
        this._hideNewUserMenu();
        await this._loadSubscribers();
        await this.refreshAccountInfo();
        return;
      }

      const createdUser = await this.createNewUser(
        name,
        this._newUserExpiryDate
      );

      NotificationManager.showSuccess('کاربر جدید با موفقیت ایجاد شد');

      const menu = DOMManager.getElement(this.ELEMENT_IDS.NEW_USER_MENU);
      if (menu) menu.classList.remove('active');

      this._showCreatedUserDetails(createdUser);
      await this._loadSubscribers();
      await this.refreshAccountInfo();
    } catch (error) {
      const message = extractApiMessage(error);

      globalThis.__GPTYAR_DEV_LOG__?.(
        '[AccupdatorManager] Error creating new user:',
        error
      );

      NotificationManager.showError(
        'خطا در ایجاد کاربر: ' +
        (message.length > 160 ? message.slice(0, 160) + '…' : message)
      );
    } finally {
      this._setButtonLoading(createButton, false);
      this._updateNewUserCreateButtonState();
    }
  };

  const originalFetchSubscribersList = AccupdatorManager.fetchSubscribersList;
  AccupdatorManager.fetchSubscribersList = async function () {
    const items = await originalFetchSubscribersList.call(this);
    return items.map(item => ({
      ...item,
      isUnlimited: isUnlimitedDate(item.expiryDate)
    }));
  };

  const originalGenerateSubscriberItemHTML =
    AccupdatorManager._generateSubscriberItemHTML;

  AccupdatorManager._generateSubscriberItemHTML = function (item) {
    const html = originalGenerateSubscriberItemHTML.call(this, item);
    if (!item?.isUnlimited) return html;

    return html.replace(
      String(item.remainingDays) + ' روز',
      'نامحدود'
    );
  };

  const originalFetchSubscriberDetails =
    AccupdatorManager.fetchSubscriberDetails;

  AccupdatorManager.fetchSubscriberDetails = async function (token) {
    const item = Array.isArray(this._subscribersList)
      ? this._subscribersList.find(entry => entry.token === token)
      : null;

    if (item && item.isUnlimited) {
      return { ...item };
    }

    return await originalFetchSubscriberDetails.call(this, token);
  };

  const originalUpdateSubscriberDetailsContent =
    AccupdatorManager._updateSubscriberDetailsContent;

  AccupdatorManager._updateSubscriberDetailsContent = function (item) {
    originalUpdateSubscriberDetailsContent.call(this, item);

    if (!item || !(item.isUnlimited || isUnlimitedDate(item.expiryDate))) {
      return;
    }

    const expiry = DOMManager.getElement(
      this.ELEMENT_IDS.SUBSCRIBER_DETAILS_EXPIRY
    );

    if (expiry) {
      expiry.textContent = 'نامحدود';
      expiry.classList.add('new-user-expiry-unlimited');
    }
  };
})();