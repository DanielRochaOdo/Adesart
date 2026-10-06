package br.com.vendamais.shared

import androidx.compose.runtime.Composable
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.UIKitInteropInteractionMode
import androidx.compose.ui.viewinterop.UIKitInteropProperties
import androidx.compose.ui.viewinterop.UIKitView
import kotlinx.cinterop.ExperimentalForeignApi
import platform.CoreGraphics.CGRectMake
import platform.Foundation.NSURL
import platform.Foundation.NSURLRequest
import platform.WebKit.WKUserScript
import platform.WebKit.WKUserScriptInjectionTime
import platform.WebKit.WKWebView
import platform.WebKit.WKWebViewConfiguration
import platform.WebKit.WKWebsiteDataStore

private val iosMobileNavigationScript = """
(function () {
  if (window.__vendaMaisIosShellInstalled) return;
  window.__vendaMaisIosShellInstalled = true;

  var shellId = 'vm-ios-mobile-shell';
  var sheetId = 'vm-ios-mobile-sheet';
  var styleId = 'vm-ios-mobile-shell-style';

  var routes = {
    dashboard: '/dashboard',
    cadastro: '/cadastro',
    users: '/users',
    teams: '/teams',
    configuracoes: '/configuracoes',
    auditoria: '/auditoria-lemmit',
    fila: '/fila-upload-erp',
    excluidas: '/adesoes-excluidas',
    profile: '/profile'
  };

  function normalizeRole() {
    var nav = document.querySelector('nav.vm-glass-nav');
    var text = nav ? (nav.textContent || '').toUpperCase() : '';
    var roles = ['ADMINISTRADOR', 'GERENTE', 'SUPERVISOR', 'CADASTRO', 'VENDEDOR', 'ADESIONISTA', 'GESTOR'];
    for (var i = 0; i < roles.length; i += 1) {
      if (text.indexOf(roles[i]) >= 0) return roles[i];
    }
    return '';
  }

  function iconSvg(name) {
    var common = 'viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
    if (name === 'home') return '<svg ' + common + '><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>';
    if (name === 'file') return '<svg ' + common + '><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><path d="M14 2v6h6"></path><path d="M8 13h8"></path><path d="M8 17h5"></path></svg>';
    if (name === 'people') return '<svg ' + common + '><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';
    if (name === 'settings') return '<svg ' + common + '><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V22H9.6v-.9A1.7 1.7 0 0 0 8.5 19.5a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H1.5V9.6h.9A1.7 1.7 0 0 0 4 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.5 4.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V1.5h4v.9A1.7 1.7 0 0 0 15 4a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.5a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.9v4h-.9A1.7 1.7 0 0 0 19.4 15z"></path></svg>';
    if (name === 'account') return '<svg ' + common + '><circle cx="12" cy="8" r="4"></circle><path d="M4 22a8 8 0 0 1 16 0"></path></svg>';
    return '<svg ' + common + '><circle cx="12" cy="12" r="9"></circle></svg>';
  }

  function navigate(path) {
    closeSheet();
    if (window.location.pathname === path) return;
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.scrollTo(0, 0);
    window.setTimeout(syncShell, 50);
  }

  function availableGroups(role) {
    var people = [];
    var admin = [];

    if (['ADMINISTRADOR', 'GERENTE', 'SUPERVISOR', 'CADASTRO'].indexOf(role) >= 0) {
      people.push({ label: 'Usuários', path: routes.users });
    }
    if (['ADMINISTRADOR', 'GERENTE', 'SUPERVISOR', 'CADASTRO', 'VENDEDOR', 'ADESIONISTA'].indexOf(role) >= 0) {
      people.push({ label: 'Equipes', path: routes.teams });
    }

    if (role === 'ADMINISTRADOR') {
      admin.push({ label: 'Configurações', path: routes.configuracoes });
      admin.push({ label: 'Auditoria Lemmit', path: routes.auditoria });
      admin.push({ label: 'Fila Upload ERP', path: routes.fila });
      admin.push({ label: 'Adesões Excluídas', path: routes.excluidas });
    } else if (role === 'GERENTE' || role === 'CADASTRO') {
      admin.push({ label: 'Fila Upload ERP', path: routes.fila });
    }

    var groups = [
      { key: 'inicio', label: 'Início', icon: 'home', modules: [{ label: 'Dashboard', path: routes.dashboard }] },
      { key: 'cadastros', label: 'Cadastros', icon: 'file', modules: [{ label: 'Cadastros', path: routes.cadastro }] }
    ];

    if (people.length) groups.push({ key: 'pessoas', label: 'Pessoas', icon: 'people', modules: people });
    if (admin.length) groups.push({ key: 'admin', label: 'Admin', icon: 'settings', modules: admin });

    groups.push({
      key: 'conta',
      label: 'Conta',
      icon: 'account',
      modules: [
        { label: 'Meu Perfil', path: routes.profile },
        { label: 'Alternar tema', action: 'theme' },
        { label: 'Sair', action: 'logout' }
      ]
    });

    return groups.slice(0, 5);
  }

  function pathGroup(path) {
    if (path === routes.dashboard) return 'inicio';
    if (path === routes.cadastro) return 'cadastros';
    if (path === routes.users || path === routes.teams) return 'pessoas';
    if (path === routes.configuracoes || path === routes.auditoria || path.indexOf('/fila-upload-erp') === 0 || path === routes.excluidas) return 'admin';
    if (path === routes.profile) return 'conta';
    return '';
  }

  function performAction(action) {
    if (action === 'theme') {
      var themeButton = document.querySelector('nav.vm-glass-nav button[aria-label^="Ativar tema"]');
      if (themeButton) themeButton.click();
      closeSheet();
      return;
    }
    if (action === 'logout') {
      var logoutButton = document.querySelector('nav.vm-glass-nav button[aria-label="Sair"]');
      if (logoutButton) logoutButton.click();
      closeSheet();
    }
  }

  function closeSheet() {
    var existing = document.getElementById(sheetId);
    if (existing) existing.remove();
  }

  function openSheet(group) {
    closeSheet();

    var backdrop = document.createElement('div');
    backdrop.id = sheetId;
    backdrop.className = 'vm-ios-sheet-backdrop';

    var panel = document.createElement('div');
    panel.className = 'vm-ios-sheet-panel';

    var handle = document.createElement('div');
    handle.className = 'vm-ios-sheet-handle';
    panel.appendChild(handle);

    var title = document.createElement('div');
    title.className = 'vm-ios-sheet-title';
    title.textContent = group.label;
    panel.appendChild(title);

    group.modules.forEach(function (module) {
      var item = document.createElement('button');
      item.type = 'button';
      item.className = 'vm-ios-sheet-item';
      if (module.path && window.location.pathname === module.path) item.classList.add('is-active');
      item.textContent = module.label;
      item.addEventListener('click', function () {
        if (module.path) navigate(module.path);
        else if (module.action) performAction(module.action);
      });
      panel.appendChild(item);
    });

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'vm-ios-sheet-close';
    close.textContent = 'Fechar';
    close.addEventListener('click', closeSheet);
    panel.appendChild(close);

    backdrop.addEventListener('click', function (event) {
      if (event.target === backdrop) closeSheet();
    });

    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);
  }

  function ensureStyle() {
    if (document.getElementById(styleId)) return;
    var style = document.createElement('style');
    style.id = styleId;
    style.textContent = [
      'body.vm-ios-shell-active nav.vm-glass-nav{display:none!important;}',
      'body.vm-ios-shell-active main{padding-bottom:calc(7.2rem + env(safe-area-inset-bottom))!important;}',
      '#vm-ios-mobile-shell{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;padding:7px 6px calc(7px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.62);border-radius:22px 22px 0 0;background:linear-gradient(180deg,rgba(248,252,250,.94),rgba(221,235,228,.92));box-shadow:0 -12px 30px rgba(15,23,42,.14);backdrop-filter:blur(24px) saturate(1.35);-webkit-backdrop-filter:blur(24px) saturate(1.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      'html.dark #vm-ios-mobile-shell{background:linear-gradient(180deg,rgba(23,41,64,.94),rgba(8,19,33,.92));border-top-color:rgba(255,255,255,.13);box-shadow:0 -14px 34px rgba(0,0,0,.42);}',
      '.vm-ios-shell-row{display:flex;align-items:center;justify-content:space-between;width:100%;}',
      '.vm-ios-shell-item{appearance:none;-webkit-appearance:none;border:0;background:transparent;color:#64748b;flex:1;min-width:0;padding:3px 2px;display:flex;flex-direction:column;align-items:center;gap:3px;font:600 10px/1.15 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.vm-ios-shell-item .vm-ios-shell-icon{width:44px;height:32px;border-radius:16px;display:flex;align-items:center;justify-content:center;transition:transform .18s ease,background .18s ease;color:inherit;}',
      '.vm-ios-shell-item.is-active{color:#059669;font-weight:700;}',
      '.vm-ios-shell-item.is-active .vm-ios-shell-icon{background:rgba(16,185,129,.16);border:1px solid rgba(5,150,105,.20);box-shadow:0 5px 14px rgba(5,150,105,.12);}',
      'html.dark .vm-ios-shell-item{color:#94a3b8;}',
      'html.dark .vm-ios-shell-item.is-active{color:#34d399;}',
      'html.dark .vm-ios-shell-item.is-active .vm-ios-shell-icon{background:rgba(16,185,129,.18);border-color:rgba(52,211,153,.22);}',
      '.vm-ios-sheet-backdrop{position:fixed;inset:0;z-index:2147483100;background:rgba(2,6,23,.32);display:flex;align-items:flex-end;justify-content:center;padding:0;}',
      '.vm-ios-sheet-panel{width:100%;max-height:72vh;overflow:auto;border-radius:24px 24px 0 0;padding:10px 16px calc(16px + env(safe-area-inset-bottom));background:rgba(248,252,250,.97);box-shadow:0 -18px 48px rgba(15,23,42,.25);backdrop-filter:blur(26px);-webkit-backdrop-filter:blur(26px);}',
      'html.dark .vm-ios-sheet-panel{background:rgba(15,23,42,.97);color:#f8fafc;}',
      '.vm-ios-sheet-handle{width:40px;height:5px;border-radius:999px;background:rgba(100,116,139,.38);margin:0 auto 12px;}',
      '.vm-ios-sheet-title{font:700 20px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0 0 12px;color:#0f172a;}',
      'html.dark .vm-ios-sheet-title{color:#f8fafc;}',
      '.vm-ios-sheet-item{width:100%;border:1px solid rgba(148,163,184,.28);background:rgba(255,255,255,.68);border-radius:14px;padding:13px 14px;margin:0 0 9px;text-align:left;color:#0f172a;font:600 15px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      '.vm-ios-sheet-item.is-active{color:#047857;background:rgba(16,185,129,.13);border-color:rgba(5,150,105,.26);}',
      'html.dark .vm-ios-sheet-item{color:#e2e8f0;background:rgba(30,41,59,.78);border-color:rgba(255,255,255,.10);}',
      'html.dark .vm-ios-sheet-item.is-active{color:#6ee7b7;background:rgba(16,185,129,.16);border-color:rgba(52,211,153,.22);}',
      '.vm-ios-sheet-close{display:block;margin:6px 0 0 auto;border:0;background:transparent;color:#059669;font:700 14px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:10px 4px;}'
    ].join('');
    document.head.appendChild(style);
  }

  function renderShell(groups) {
    var shell = document.getElementById(shellId);
    if (!shell) {
      shell = document.createElement('div');
      shell.id = shellId;
      var row = document.createElement('div');
      row.className = 'vm-ios-shell-row';
      shell.appendChild(row);
      document.body.appendChild(shell);
    }

    var row = shell.querySelector('.vm-ios-shell-row');
    if (!row) return;

    var signature = groups.map(function (group) { return group.key; }).join('|');
    if (row.getAttribute('data-signature') !== signature) {
      row.setAttribute('data-signature', signature);
      row.innerHTML = '';

      groups.forEach(function (group) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'vm-ios-shell-item';
        button.setAttribute('data-group', group.key);
        button.setAttribute('aria-label', group.label);

        var icon = document.createElement('span');
        icon.className = 'vm-ios-shell-icon';
        icon.innerHTML = iconSvg(group.icon);

        var label = document.createElement('span');
        label.textContent = group.label;

        button.appendChild(icon);
        button.appendChild(label);
        button.addEventListener('click', function () {
          if (group.modules.length === 1 && group.modules[0].path) navigate(group.modules[0].path);
          else openSheet(group);
        });
        row.appendChild(button);
      });
    }

    var active = pathGroup(window.location.pathname);
    row.querySelectorAll('.vm-ios-shell-item').forEach(function (item) {
      item.classList.toggle('is-active', item.getAttribute('data-group') === active);
    });
  }

  function syncShell() {
    ensureStyle();

    var path = window.location.pathname || '/';
    var webNav = document.querySelector('nav.vm-glass-nav');
    var publicFlow = path === '/login' || path.indexOf('/adesao') === 0 || path.indexOf('/preview/') === 0;
    var shouldShow = Boolean(webNav) && !publicFlow;

    document.body.classList.toggle('vm-ios-shell-active', shouldShow);

    var shell = document.getElementById(shellId);
    if (!shouldShow) {
      if (shell) shell.style.display = 'none';
      closeSheet();
      return;
    }

    var groups = availableGroups(normalizeRole());
    renderShell(groups);
    shell = document.getElementById(shellId);
    if (shell) shell.style.display = 'block';
  }

  var originalPushState = window.history.pushState;
  window.history.pushState = function () {
    var result = originalPushState.apply(window.history, arguments);
    window.setTimeout(syncShell, 0);
    return result;
  };

  var originalReplaceState = window.history.replaceState;
  window.history.replaceState = function () {
    var result = originalReplaceState.apply(window.history, arguments);
    window.setTimeout(syncShell, 0);
    return result;
  };

  window.addEventListener('popstate', function () { window.setTimeout(syncShell, 0); });
  window.addEventListener('pageshow', function () { window.setTimeout(syncShell, 0); });

  var observer = new MutationObserver(function () {
    window.setTimeout(syncShell, 0);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  syncShell();
})();
""".trimIndent()

@OptIn(ExperimentalForeignApi::class, ExperimentalComposeUiApi::class)
@Composable
actual fun PlatformWebView(url: String, modifier: Modifier) {
    UIKitView(
        modifier = modifier,
        properties = UIKitInteropProperties(
            interactionMode = UIKitInteropInteractionMode.NonCooperative,
            isNativeAccessibilityEnabled = true,
        ),
        factory = {
            val configuration = WKWebViewConfiguration().apply {
                websiteDataStore = WKWebsiteDataStore.defaultDataStore()
                userContentController.addUserScript(
                    WKUserScript(
                        source = iosMobileNavigationScript,
                        injectionTime = WKUserScriptInjectionTime.WKUserScriptInjectionTimeAtDocumentEnd,
                        forMainFrameOnly = true,
                    ),
                )
            }

            WKWebView(
                frame = CGRectMake(0.0, 0.0, 0.0, 0.0),
                configuration = configuration,
            ).apply {
                allowsBackForwardNavigationGestures = true
                val nsUrl = NSURL(string = url)
                if (nsUrl != null) {
                    loadRequest(NSURLRequest.requestWithURL(nsUrl))
                }
            }
        },
        update = { webView ->
            val current = webView.URL?.absoluteString
            if (current != url) {
                val nsUrl = NSURL(string = url)
                if (nsUrl != null) {
                    webView.loadRequest(NSURLRequest.requestWithURL(nsUrl))
                }
            }
        },
    )
}
