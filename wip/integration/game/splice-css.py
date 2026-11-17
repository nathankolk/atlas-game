import sys
F='/home/user/atlas-game/public/index.html'
s=open(F).read()
def must(cond,msg):
    if not cond: sys.exit('FAIL: '+msg)

# 1. tokens
a="    --bad-solid: #a0311e;\n    --on-bad-solid: #ffffff;\n"
must(a in s,'light solid'); s=s.replace(a,a.replace("    --bad-solid","    --good-solid: #4a6b3c;\n    --on-good-solid: #ffffff;\n    --bad-solid"),1)
a="    --bad-solid: #e58a73;\n    --on-bad-solid: #2b1008;\n"
must(a in s,'dark solid'); s=s.replace(a,a.replace("    --bad-solid","    --good-solid: #5f9a55;\n    --on-good-solid: #0d1f0a;\n    --bad-solid"),1)

# 2. surfaces that stay dark
a="  .daily, .toast, .app-notice, .new-record-banner, .zoom-controls {"
must(a in s,'dark list'); s=s.replace(a,"  .daily, .app-notice {",1)

# 3. main block
i=s.index("  /* ---------- GAME SCREEN ---------- */")
j=s.index("  /* Loading overlay for lazy-loaded datasets */")
must(i<j,'order')
s=s[:i]+open('css-game.css').read()+s[j:]

# 4. narrow-window block
i=s.index("  /* Game and results on narrow windows */")
j=s.index("  /* ===== Tablet and small laptop ===== */")
must(i<j and j-i<2500,'narrow block')
s=s[:i]+s[j:]

# 5. tablet
a="    .settings-group { grid-template-columns: 1fr; gap: 16px; }\n  }\n"
must(s.count(a)==1,'tablet anchor'); s=s.replace(a,"    .settings-group { grid-template-columns: 1fr; gap: 16px; }\n    .results { grid-template-columns: minmax(0, 1fr); gap: 40px; max-width: 680px; }\n  }\n",1)

# 6. phone
a="    .app-notice { bottom: calc(var(--tab-h) + env(safe-area-inset-bottom, 0px) + 16px); }\n"
must(s.count(a)==1,'phone anchor'); s=s.replace(a,open('css-phone.css').read()+a,1)

# 7. tail
a="\n  /* Touch: every control gets a 44px target, even where the visible shape is smaller */"
must(s.count(a)==1,'touch anchor'); s=s.replace(a,open('css-tail.css').read()+a,1)
open(F,'w').write(s)
print('ok',len(s))
