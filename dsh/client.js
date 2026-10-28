// Browser half of the dsh-screenshot plugin.
//
// Adds two hotkeys that ask the host to capture the desktop (PowerShell
// CopyFromScreen, no consent picker) and then drop the image path into the
// composer, the same trigger shape paste-to-path uses. Ctrl+Alt+S = region
// selection, Ctrl+Shift+Alt+S = full screen. (Ctrl+Shift+S is Edge's
// web-capture shortcut, so region lives on Ctrl+Alt+S.) The host route is
// loopback-only.
//
// Hand-written in the lazy-CJS bundle protocol (window.__ModuleLoader__.load
// with a factory returning cordis-plugin exports), so no build step and no
// imports from dsh client packages - the same zero-dependency stance as the
// host half.
window.__ModuleLoader__.load({
  id: 'dsh-screenshot-pro',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports

    // The composer element that was focused the moment the hotkey fired. Captured
    // here because the screenshot overlay (PowerShell, a separate foreground
    // window) steals focus; by the time the fetch resolves, document.activeElement
    // is no longer the input. This reference is the robust way to find "the input
    // bar" across DSH UI versions regardless of its DOM attributes.
    var lastComposerEl = null

    // True for a textarea, input, or contenteditable element we can type into.
    function isEditable(el) {
      if (!el) return false
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return true
      if (el.isContentEditable) return true
      var ce = el.getAttribute && el.getAttribute('contenteditable')
      return ce === 'true' || ce === '' || ce === 'plaintext-only'
    }

    function insertText(target, text) {
      var el = target && isEditable(target) ? target : (isEditable(document.activeElement) ? document.activeElement : null)
      if (!el) return
      el.focus()
      // execCommand fires the input event React's controlled textarea needs;
      // the prototype-setter dance is the fallback for engines dropping it.
      var inserted = false
      if (el.isContentEditable) {
        try {
          inserted = document.execCommand('insertText', false, text)
        } catch {
          inserted = false
        }
        if (!inserted) {
          // Crude but safe fallback for contenteditable: append as a text node.
          el.appendChild(document.createTextNode(text))
          el.dispatchEvent(new Event('input', { bubbles: true }))
        }
        return
      }
      try {
        inserted = document.execCommand('insertText', false, text)
      } catch {
        inserted = false
      }
      if (!inserted) {
        var proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
        var setter = Object.getOwnPropertyDescriptor(proto, 'value').set
        setter.call(el, el.value + text)
        el.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }

    // The composer textarea (the input bar's real element). Prefer the
    // data-composer-card / data-phase scopes (older dsh-ui bundles), then fall
    // back to a structural guess so a UI-version change can't break insertion.
    function composerTextarea() {
      var el = document.querySelector('[data-composer-card] textarea')
      if (isEditable(el)) return el
      el = document.querySelector('textarea[data-phase]')
      if (isEditable(el)) return el
      return bestComposerGuess()
    }

    // Score a container by class/id keywords that hint at a chat composer.
    function containerScore(el) {
      var s = ''
      var p = el
      for (var i = 0; i < 5 && p; i++) {
        if (p.className && p.className.toString) s += p.className.toString().toLowerCase() + ' '
        if (p.id) s += p.id.toLowerCase() + ' '
        p = p.parentElement
      }
      if (/composer|chat.?input|message.?input|input.?bar|prompt|editor/.test(s)) return 2
      if (/chat|message|input|conversation/.test(s)) return 1
      return 0
    }

    // Last-resort: pick the most composer-like editable element among visible
    // textareas / inputs / contenteditables. Prefers composer-named containers,
    // then the largest on-screen editable (the message box dominates the layout).
    function bestComposerGuess() {
      var nodes = document.querySelectorAll('textarea, input, [contenteditable="true"]')
      var visible = []
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i]
        if (!isEditable(el)) continue
        var r = el.getBoundingClientRect()
        if (r.width < 50 || r.height < 24) continue
        if (el.offsetParent === null && r.width === 0 && r.height === 0) continue
        visible.push(el)
      }
      if (!visible.length) return null
      visible.sort(function (a, b) {
        var sa = containerScore(a), sb = containerScore(b)
        if (sa !== sb) return sb - sa
        var ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
        return (rb.width * rb.height) - (ra.width * ra.height)
      })
      return visible[0]
    }

    // Two short label sets, mirroring the modlens client convention: prefer
    // the document lang (dsh sets it from the profile), fall back to the
    // browser language, then en. No locale framework - just the strings the
    // toast can actually show.
    var TEXT = {
      en: {
        regionInserted: 'Region screenshot path inserted',
        fullInserted: 'Full-screen screenshot path inserted',
        hostRouteNotLoaded: 'Screenshot unavailable: restart the dsh service and refresh (host route not loaded)',
        failed: 'Screenshot failed: ',
      },
      zh: {
        regionInserted: '区域截图路径已插入输入框',
        fullInserted: '全屏截图路径已插入输入框',
        hostRouteNotLoaded: '截图功能未生效：请重启 dsh 服务后刷新页面（host 端路由未加载）',
        failed: '截图失败：',
      },
    }

    function labels() {
      var lang = (document.documentElement.lang || navigator.language || 'en').toLowerCase()
      return lang.indexOf('zh') === 0 ? TEXT.zh : TEXT.en
    }

    // Minimal transient toast for capture feedback; styled inline so the
    // plugin stays dependency-free (no CSS module, no React).
    function toast(message, isError) {
      var div = document.createElement('div')
      div.textContent = message
      div.style.cssText =
        'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;' +
        'padding:12px 20px;border-radius:12px;font:16px/1.5 system-ui,sans-serif;color:#fff;' +
        'background:' +
        (isError ? 'rgba(200,50,50,.95)' : 'rgba(45,45,45,.85)') +
        ';border:1px solid rgba(120,120,120,.8);' +
        'box-shadow:0 2px 12px rgba(0,0,0,.35);pointer-events:none;'
      document.body.appendChild(div)
      setTimeout(() => {
        if (div.parentNode) div.parentNode.removeChild(div)
      }, 3500)
    }

    function triggerScreenshot(mode, direct) {
      fetch(`/dsh-screenshot/screenshot?mode=${encodeURIComponent(mode)}${direct ? '&direct=1' : ''}`)
        .then((res) => {
          if (!res.ok) {
            return res
              .json()
              .catch(() => ({}))
              .then((body) => {
                var error = new Error(body.error || `screenshot failed (${res.status})`)
                error.status = res.status
                throw error
              })
          }
          return res.json()
        })
        .then((body) => {
          if (!body || body.cancelled) return
          if (body.path) {
            // Prefer the element focused at hotkey time (survives the overlay's
            // focus steal), then the structural lookup, then whatever is active.
            var target = lastComposerEl && isEditable(lastComposerEl) ? lastComposerEl : (composerTextarea() || document.activeElement)
            insertText(target, `${body.path} `)
            var t = labels()
            toast(mode === 'region' ? t.regionInserted : t.fullInserted)
          }
        })
        .catch((error) => {
          console.error('[dsh-screenshot] screenshot failed:', error?.message ?? error)
          var t = labels()
          if (error && error.status === 404) {
            toast(t.hostRouteNotLoaded, true)
          } else {
            toast(t.failed + (error?.message ?? error), true)
          }
        })
    }

    function onScreenshotKeyDown(event) {
      var key = (event.key || '').toLowerCase()
      if (key !== 's') return
      var ctrl = event.ctrlKey || event.metaKey
      // Ctrl+Alt+S = region, Ctrl+Shift+Alt+S = full (Ctrl+Shift+S is the
      // browser's own web-capture shortcut in Edge, so region moved off it)
      if (!ctrl || !event.altKey) return
      // Capture the focused element now - it is the input bar the user is typing
      // in. The capture overlay (PowerShell foreground window) will steal focus,
      // so remember it to insert the path back where the user expects.
      if (isEditable(document.activeElement)) lastComposerEl = document.activeElement
      event.preventDefault()
      event.stopImmediatePropagation()
      triggerScreenshot(event.shiftKey ? 'full' : 'region')
    }

    var __shotButtonMounted = false
    function __shotButton(svg, title, mode, bottom) {
      var btn = document.createElement('button')
      btn.type = 'button'
      btn.title = title
      btn.setAttribute('aria-label', title)
      btn.setAttribute('data-shot-mode', mode)
      btn.style.cssText = 'position:fixed;right:18px;bottom:' + bottom + 'px;width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.35);background:rgba(24,24,28,.62);color:#fff;cursor:pointer;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:0;backdrop-filter:blur(8px);box-shadow:0 2px 10px rgba(0,0,0,.35)'
      btn.innerHTML = svg
      btn.addEventListener('click', function (ev) {
        ev.preventDefault()
        ev.stopPropagation()
        if (isEditable(document.activeElement)) lastComposerEl = document.activeElement
        try { triggerScreenshot(mode, mode === 'region') } catch (e) { console.error('[dsh-screenshot] button failed:', e) }
      })
      document.body.appendChild(btn)
      return btn
    }
    function mountCameraButton() {
      if (__shotButtonMounted || !document.body) return
      __shotButtonMounted = true
      var camSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.2"/></svg>'
      var cropSvg = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M16 4h3a1 1 0 0 1 1 1v3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1v-3"/><rect x="8" y="8" width="8" height="8" rx="1"/></svg>'
      __shotButton(camSvg, 'Full screen - one click', 'full', 132)
      __shotButton(cropSvg, 'Select area - drag right away (Ctrl+Alt+S)', 'region', 182)
    }

    function apply(ctx) {
      document.addEventListener('keydown', onScreenshotKeyDown, true)
      if (document.body) mountCameraButton()
      else document.addEventListener('DOMContentLoaded', mountCameraButton, { once: true })
      // cordis effect: unregister on plugin disposal (HMR, profile reload).
      if (typeof ctx.effect === 'function') {
        ctx.effect(
          () => () => {
            document.removeEventListener('keydown', onScreenshotKeyDown, true)
            document.querySelectorAll('button[data-shot-mode]').forEach(function (b) { b.remove() })
            __shotButtonMounted = false
          },
          '@paicat1/dsh-screenshot: hotkey listener',
        )
      }
    }

    exports.apply = apply
    exports.inject = []
    return module.exports
  },
})
