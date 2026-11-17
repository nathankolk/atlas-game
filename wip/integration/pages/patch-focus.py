# Keeps the keyboard focus somewhere sensible when a sync step redraws the card that opened the dialog
p='/home/user/atlas-game/public/index.html'
s=open(p,encoding='utf-8').read()
def rep(a,b,n=1):
    global s
    assert s.count(a)==n,(a[:90],s.count(a))
    s=s.replace(a,b)
rep("""    const push = await syncPush();
    refreshView();
    syncCodeDialog(push.ok ? 'Your sync code is ready' : 'Your sync code is saved',""","""    const push = await syncPush();
    refreshView();
    // The button that opened this is gone with the set-up card: closing lands on Sync now
    dialog.opener = document.getElementById('sync-now-btn');
    syncCodeDialog(push.ok ? 'Your sync code is ready' : 'Your sync code is saved',""")
rep("""    await syncPush();
    closeDialog();
    refreshView();
    showNotice(pull.hadData ? 'This device is linked. Your progress has been merged.'""","""    await syncPush();
    closeDialog();
    refreshView();
    focusIfThere('sync-now-btn');
    showNotice(pull.hadData ? 'This device is linked. Your progress has been merged.'""")
rep("""      onConfirm: () => {
        syncClearToken();
        refreshView();
        showNotice('This device no longer syncs.');
      }""","""      onConfirm: () => {
        syncClearToken();
        refreshView();
        const start = document.querySelector('[data-action="sync-create"]');
        if (start) start.focus({ preventScroll: true });
        showNotice('This device no longer syncs.');
      }""")
rep("""    // A redraw replaced the button: put the focus on the one that took its place
    const current = document.getElementById('sync-now-btn');
    if (current && current !== button && document.activeElement === document.body) current.focus();
  }""","""    // A redraw replaced the button: put the focus on the one that took its place
    if (!document.contains(button) && document.activeElement === document.body) focusIfThere('sync-now-btn');
  }

  function focusIfThere(id) {
    const el = document.getElementById(id);
    if (el) el.focus({ preventScroll: true });
  }""")
open(p,'w',encoding='utf-8').write(s)
print('patched')
