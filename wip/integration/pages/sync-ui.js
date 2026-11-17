  // ---- Where sync stands: the Settings card and the navigation light ----

  // 'never' (no key yet), 'ok', or 'error' (the last push or pull failed)
  function syncEntryState() {
    if (!syncGetToken()) return 'never';
    return syncGetMeta().lastError ? 'error' : 'ok';
  }

  // What a failed sync means, in words. Reasons are 'network' or
  // '<push|pull>_<http status>'.
  function syncErrorText(reason) {
    if (!reason) return '';
    const safe = ' Everything is still saved on this device.';
    if (reason === 'network') return 'Couldn’t reach the sync server.' + safe;
    if (reason === 'push_413') {
      return 'Your progress has grown too large to sync, so other devices won’t see what’s new.' + safe;
    }
    const parts = String(reason).split('_');
    return (parts[0] === 'pull' ? 'Couldn’t fetch your synced progress' : 'Couldn’t save your progress to sync') +
      ' (error ' + parts[1] + ').' + safe;
  }

  // "just now", "5 minutes ago", "3 hours ago", "on 12 Nov"
  function timeAgo(ms) {
    const mins = Math.floor((Date.now() - ms) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + (mins === 1 ? ' minute ago' : ' minutes ago');
    const hours = Math.floor(mins / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    return 'on ' + shortDate(new Date(ms));
  }

  // Sync's state in a line: the last failure, or when it last went through
  function syncStatusText() {
    const meta = syncGetMeta();
    if (meta.lastError) return syncErrorText(meta.lastError);
    return meta.lastSyncAt ? 'Up to date · last synced ' + timeAgo(meta.lastSyncAt) : 'Not synced yet';
  }

  // A sync code in groups of four; masked, only the last group shows
  function syncCodeMarkup(token, masked) {
    return token.match(/.{1,4}/g).map((part, i, all) =>
      '<span>' + (masked && i < all.length - 1 ? '••••' : part) + '</span>').join('');
  }

  function syncTitleMarkup(username) {
    return username ? 'Syncing as <em>' + escapeHtml(username) + '</em>' : 'Sync is on';
  }

  // Whether the Settings card shows the sync code in full
  let syncCodeShown = false;

  // The Sync card in Settings: the way in while sync is off, everything
  // about it once it is on
  function renderSettingsSync() {
    const card = document.getElementById('settings-sync');
    if (!card) return;
    const token = syncGetToken();
    if (!token) {
      syncCodeShown = false;
      card.innerHTML =
        '<div class="sync-setup">' +
          '<h3>Keep your atlas on every device</h3>' +
          '<p>Create a sync code here and enter it on your phone or laptop. No account, no password: the code is the key. The atlas keeps working offline either way.</p>' +
          '<div class="setting-actions">' +
            '<button type="button" class="btn btn--primary" data-action="sync-create">Create a sync code</button>' +
            '<button type="button" class="btn btn--secondary" data-action="sync-link">I have a code</button>' +
          '</div>' +
        '</div>';
      return;
    }
    // A field that is being typed in keeps its place; only the status moves
    if (card.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
      syncRefreshEntry();
      return;
    }
    card.innerHTML =
      '<div class="setting">' +
        '<div class="sync-id">' +
          '<span class="sync-avatar">' + icon('cloud', 'icon--lg') + '</span>' +
          '<div><strong id="sync-title">' + syncTitleMarkup(syncGetUsername()) + '</strong>' +
            '<span class="sync-status" id="sync-status-line" role="status"></span></div>' +
        '</div>' +
        '<button type="button" class="btn btn--secondary" id="sync-now-btn" data-action="sync-now">Sync now</button>' +
      '</div>' +
      '<div class="setting setting--wrap">' +
        '<div class="setting-text"><label for="sync-username-edit"><strong>Username</strong></label>' +
          '<span>A name for this set of devices. Optional.</span></div>' +
        '<input class="input" id="sync-username-edit" value="' + escapeHtml(syncGetUsername()) + '" placeholder="Cartographer" autocomplete="off" maxlength="40" />' +
      '</div>' +
      '<div class="setting setting--wrap">' +
        '<div class="setting-text"><strong>Sync code</strong>' +
          '<span>Enter this on another device to link it. Anyone with the code can read and change your progress.</span></div>' +
        '<div class="setting-actions">' +
          '<span class="code" id="sync-key-display">' + syncCodeMarkup(token, !syncCodeShown) + '</span>' +
          '<button type="button" class="btn btn--ghost" id="sync-key-show" data-action="sync-toggle-code" aria-pressed="' + syncCodeShown + '">' +
            (syncCodeShown ? 'Hide' : 'Show') + '</button>' +
          '<button type="button" class="icon-btn" id="sync-key-copy" data-action="sync-copy-code" aria-label="Copy sync code">' + icon('copy') + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="setting setting--wrap">' +
        '<div class="setting-text"><strong>Another device</strong>' +
          '<span>Open the atlas there, go to Settings, choose “I have a code” and enter your sync code.</span></div>' +
        '<button type="button" class="btn btn--secondary" data-action="sync-add-device">' + icon('device') + 'Link a device</button>' +
      '</div>' +
      '<div class="setting setting--wrap">' +
        '<div class="setting-text"><strong>This device</strong><span>Stop syncing here. Your progress stays on this device.</span></div>' +
        '<button type="button" class="btn btn--ghost" id="sync-disconnect-btn" data-action="sync-unlink">Unlink</button>' +
      '</div>';
    syncRefreshEntry();
  }

  // Bring the status line and the navigation's sync light in line with
  // the latest status, so a failed push shows at once
  function syncRefreshEntry() {
    const entryState = syncEntryState();
    const failed = entryState === 'error';
    const line = document.getElementById('sync-status-line');
    if (line) {
      line.className = 'sync-status' + (failed ? ' is-error' : '');
      line.innerHTML = '<i class="dot' + (failed ? ' is-error' : '') + '"></i><span>' + escapeHtml(syncStatusText()) + '</span>';
      line.parentNode.parentNode.querySelector('.sync-avatar').classList.toggle('is-error', failed);
    }
    document.querySelectorAll('[data-sync-dot]').forEach(dot => {
      dot.hidden = entryState === 'never';
      dot.classList.toggle('is-error', failed);
    });
  }

  // ---- Sync actions and their dialogs ----

  function syncCreateDialog() {
    openDialog(dialogContent('Create a sync code',
      '<p>A sync code links your devices. This device makes one, and you enter it on the others. There is no account and no password, so keep the code to yourself.</p>' +
      '<label class="field-label" for="sync-username-new">Username <span>(optional)</span></label>' +
      '<input class="input" id="sync-username-new" placeholder="Cartographer" autocomplete="off" maxlength="40" data-autofocus />',
      '<button type="button" class="btn btn--secondary" data-action="dialog-close">Cancel</button>' +
      '<button type="button" class="btn btn--primary" id="sync-create-btn" data-action="sync-create-go" data-submit>Create sync code</button>'));
  }

  async function syncCreate(button) {
    const username = document.getElementById('sync-username-new').value.trim();
    button.disabled = true;
    button.textContent = 'Creating…';
    syncSetToken(syncGenerateToken());
    if (username) syncSetUsername(username);
    const push = await syncPush();
    refreshView();
    syncCodeDialog(push.ok ? 'Your sync code is ready' : 'Your sync code is saved',
      push.ok ? '' : syncErrorText(push.reason) + ' It will be sent the next time sync gets through.');
  }

  // The code in full, with how to use it on another device
  function syncCodeDialog(title, note) {
    const token = syncGetToken();
    if (!token) return;
    openDialog(dialogContent(title || 'Link another device',
      (note ? '<p class="dialog-note is-error">' + escapeHtml(note) + '</p>' : '') +
      '<ol class="steps-list">' +
        '<li>Open Cartographer’s Atlas on the other device.</li>' +
        '<li>Go to Settings, find Sync and choose “I have a code”.</li>' +
        '<li>Enter this code. Spaces don’t matter.</li>' +
      '</ol>' +
      '<div class="code code--full" id="sync-code-full">' + syncCodeMarkup(token, false) + '</div>' +
      '<p class="dialog-fine">Anyone with the code can read and change your progress.</p>',
      '<button type="button" class="btn btn--secondary" data-action="sync-copy-code">' + icon('copy') + 'Copy code</button>' +
      '<button type="button" class="btn btn--primary" data-action="dialog-close" data-autofocus>Done</button>'));
  }

  function syncLinkDialog() {
    openDialog(dialogContent('Link this device',
      '<p>Enter the sync code from a device that already syncs. What this device has is kept and merged with it.</p>' +
      '<label class="field-label" for="sync-key-input">Sync code</label>' +
      '<input class="input input--code" id="sync-key-input" placeholder="32 letters and digits" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" data-autofocus />' +
      '<p class="dialog-note" id="sync-import-status" role="status"></p>',
      '<button type="button" class="btn btn--secondary" data-action="dialog-close">Cancel</button>' +
      '<button type="button" class="btn btn--primary" id="sync-import-btn" data-action="sync-link-go" data-submit>Link device</button>'));
  }

  async function syncLink(button) {
    const input = document.getElementById('sync-key-input');
    const status = document.getElementById('sync-import-status');
    const say = (text) => {
      status.textContent = text;
      status.classList.toggle('is-error', !!text);
    };
    const candidate = syncNormalizeToken(input.value);
    if (!candidate) {
      say('That isn’t a sync code. A code is 32 characters: the digits 0 to 9 and the letters a to f.');
      input.focus();
      return;
    }
    button.disabled = true;
    button.textContent = 'Linking…';
    say('');
    syncSetToken(candidate);
    const pull = await syncPull({ linking: true });
    if (!pull.ok) {
      syncClearToken();
      syncRefreshEntry();
      // The dialog may have been closed while the request was out
      if (document.contains(button)) {
        say(syncErrorText(pull.reason) + ' Nothing was linked. Check the code and try again.');
        button.disabled = false;
        button.textContent = 'Link device';
      }
      return;
    }
    await syncPush();
    closeDialog();
    refreshView();
    showNotice(pull.hadData ? 'This device is linked. Your progress has been merged.'
      : 'This device is linked. Nothing was stored under that code yet.');
  }

  // Manual sync: pull, merge, push
  async function syncNow(button) {
    button.disabled = true;
    button.textContent = 'Syncing…';
    const result = await syncFullSync();
    if (result.ok) refreshView();
    button.disabled = false;
    button.textContent = 'Sync now';
  }

  function syncToggleCode() {
    syncCodeShown = !syncCodeShown;
    document.getElementById('sync-key-display').innerHTML = syncCodeMarkup(syncGetToken(), !syncCodeShown);
    const button = document.getElementById('sync-key-show');
    button.textContent = syncCodeShown ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(syncCodeShown));
  }

  function confirmUnlink() {
    confirmDialog({
      title: 'Unlink this device?',
      body: '<p>Sync stops on this device. Your progress stays here, and your other devices keep theirs.</p>' +
        '<p>To link it again, enter the sync code from one of them. <b>If this is your only device, note the code down first</b>: it isn’t kept anywhere else.</p>',
      confirm: 'Unlink',
      danger: true,
      onConfirm: () => {
        syncClearToken();
        refreshView();
        showNotice('This device no longer syncs.');
      }
    });
  }

  // The username saves itself a moment after the typing stops
  let syncUsernameTimer;
  document.addEventListener('input', (e) => {
    const input = e.target;
    if (!input || input.id !== 'sync-username-edit') return;
    document.getElementById('sync-title').innerHTML = syncTitleMarkup(input.value.trim());
    clearTimeout(syncUsernameTimer);
    syncUsernameTimer = setTimeout(() => {
      syncSetUsername(input.value.trim());
      syncPush().catch(() => {});
    }, 600);
  });

