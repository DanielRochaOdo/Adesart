package br.com.vendamais.shared

import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.UIKitInteropInteractionMode
import androidx.compose.ui.viewinterop.UIKitInteropProperties
import androidx.compose.ui.viewinterop.UIKitView
import kotlinx.cinterop.ExperimentalForeignApi
import platform.CoreGraphics.CGRectMake
import platform.Foundation.NSBundle
import platform.darwin.NSObject
import platform.Foundation.NSURL
import platform.Foundation.NSURLRequest
import platform.UIKit.UIAlertAction
import platform.UIKit.UIAlertActionStyleCancel
import platform.UIKit.UIAlertActionStyleDefault
import platform.UIKit.UIAlertController
import platform.UIKit.UIAlertControllerStyleAlert
import platform.UIKit.UIApplication
import platform.UIKit.UIViewController
import platform.WebKit.WKFrameInfo
import platform.WebKit.WKUIDelegateProtocol
import platform.WebKit.WKUserScript
import platform.WebKit.WKUserScriptInjectionTime
import platform.WebKit.WKWebView
import platform.WebKit.WKWebViewConfiguration
import platform.WebKit.WKWebsiteDataStore

private fun topViewController(): UIViewController? {
    var controller = UIApplication.sharedApplication.keyWindow?.rootViewController
    while (controller?.presentedViewController != null) {
        controller = controller?.presentedViewController
    }
    return controller
}

private class VendaMaisWebViewUiDelegate : NSObject(), WKUIDelegateProtocol {
    override fun webView(
        webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage: String,
        initiatedByFrame: WKFrameInfo,
        completionHandler: (Boolean) -> Unit,
    ) {
        val presenter = topViewController()
        if (presenter == null) {
            completionHandler(false)
            return
        }

        val alert = UIAlertController.alertControllerWithTitle(
            title = webView.URL?.host ?: "Venda+",
            message = runJavaScriptConfirmPanelWithMessage,
            preferredStyle = UIAlertControllerStyleAlert,
        )
        alert.addAction(
            UIAlertAction.actionWithTitle(
                title = "Cancelar",
                style = UIAlertActionStyleCancel,
            ) { _ ->
                completionHandler(false)
            },
        )
        alert.addAction(
            UIAlertAction.actionWithTitle(
                title = "OK",
                style = UIAlertActionStyleDefault,
            ) { _ ->
                completionHandler(true)
            },
        )

        presenter.presentViewController(
            alert,
            animated = true,
            completion = null,
        )
    }
}

private fun iosMobileNavigationScript(appVersion: String, buildNumber: String): String = """
(function () {
  if (window.__vendaMaisIosShellInstalled) return;
  window.__vendaMaisIosShellInstalled = true;

  var shellId = 'vm-ios-mobile-shell';
  var sheetId = 'vm-ios-mobile-sheet';
  var styleId = 'vm-ios-mobile-shell-style';
  var accountExperienceId = 'vm-ios-account-experience';
  var iosAppVersion = '$appVersion';
  var iosBuildNumber = '$buildNumber';

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
    if (!nav) return '';

    var roles = ['ADMINISTRADOR', 'ADMIN', 'GERENTE', 'SUPERVISOR', 'CADASTRO', 'VENDEDOR', 'ADESIONISTA', 'GESTOR'];
    var roleNodes = nav.querySelectorAll('.vm-meta-text');

    for (var nodeIndex = 0; nodeIndex < roleNodes.length; nodeIndex += 1) {
      var exactRole = (roleNodes[nodeIndex].textContent || '').trim().toUpperCase();
      if (roles.indexOf(exactRole) >= 0) return exactRole;
    }

    var text = (nav.textContent || '').toUpperCase();
    for (var i = 0; i < roles.length; i += 1) {
      var pattern = new RegExp('(^|\\\\s)' + roles[i] + '(\\\\s|$)');
      if (pattern.test(text)) return roles[i];
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

    if (['ADMINISTRADOR', 'ADMIN', 'GERENTE', 'SUPERVISOR', 'CADASTRO'].indexOf(role) >= 0) {
      people.push({ label: 'Usuários', path: routes.users });
    }
    if (['ADMINISTRADOR', 'ADMIN', 'GERENTE', 'SUPERVISOR', 'CADASTRO', 'VENDEDOR', 'ADESIONISTA'].indexOf(role) >= 0) {
      people.push({ label: 'Equipes', path: routes.teams });
    }

    if (role === 'ADMINISTRADOR' || role === 'ADMIN') {
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
        { label: 'Meu Perfil', path: routes.profile }
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

  function ensureAccountExperience() {
    var existing = document.getElementById(accountExperienceId);
    if (window.location.pathname !== routes.profile) {
      if (existing) existing.remove();
      return;
    }

    var main = document.querySelector('main');
    var profileRoot = main ? main.firstElementChild : null;
    if (!profileRoot) return;

    if (!existing) {
      existing = document.createElement('div');
      existing.id = accountExperienceId;
      existing.className = 'vm-ios-account-stack';
      existing.innerHTML = [
        '<section class="vm-ios-account-card">',
          '<div class="vm-ios-account-heading">Preferências</div>',
          '<div class="vm-ios-account-row">',
            '<div class="vm-ios-account-copy">',
              '<strong>Modo escuro</strong>',
              '<span>Ajusta o tema visual em todas as telas do app.</span>',
            '</div>',
            '<button type="button" class="vm-ios-theme-switch" role="switch" aria-label="Alternar modo escuro"><span></span></button>',
          '</div>',
        '</section>',
        '<section class="vm-ios-account-card">',
          '<div class="vm-ios-account-heading">Privacidade e dados</div>',
          '<p class="vm-ios-account-description">Consulte como a Odontoart trata dados pessoais e como solicitar exclusão de conta ou dados.</p>',
          '<button type="button" class="vm-ios-account-action" data-ios-account-action="privacy">Política de privacidade</button>',
          '<button type="button" class="vm-ios-account-action" data-ios-account-action="delete-data">Solicitar exclusão de conta e dados</button>',
        '</section>',
        '<section class="vm-ios-account-card">',
          '<div class="vm-ios-account-heading">Aplicativo</div>',
          '<div class="vm-ios-version-row">',
            '<span>Versão instalada</span>',
            '<strong>' + iosAppVersion + (iosBuildNumber ? ' (' + iosBuildNumber + ')' : '') + '</strong>',
          '</div>',
          '<button type="button" class="vm-ios-account-action" data-ios-account-action="refresh">Atualizar dados</button>',
          '<button type="button" class="vm-ios-account-action vm-ios-account-danger" data-ios-account-action="logout">Sair da conta</button>',
        '</section>'
      ].join('');

      profileRoot.appendChild(existing);

      var themeSwitch = existing.querySelector('.vm-ios-theme-switch');
      if (themeSwitch) {
        themeSwitch.addEventListener('click', function () {
          performAction('theme');
          window.setTimeout(updateAccountThemeState, 80);
        });
      }

      existing.querySelectorAll('[data-ios-account-action]').forEach(function (button) {
        button.addEventListener('click', function () {
          var action = button.getAttribute('data-ios-account-action');
          if (action === 'privacy') {
            window.location.href = 'https://odontoart.com/privacy-policy/';
          } else if (action === 'delete-data') {
            window.location.href = 'mailto:odontoart@odontoart.com?subject=Venda%2B%20-%20Solicitacao%20de%20exclusao%20de%20conta%20e%20dados';
          } else if (action === 'refresh') {
            window.location.reload();
          } else if (action === 'logout') {
            performAction('logout');
          }
        });
      });
    }

    updateAccountThemeState();
  }

  function updateAccountThemeState() {
    var root = document.getElementById(accountExperienceId);
    if (!root) return;
    var themeSwitch = root.querySelector('.vm-ios-theme-switch');
    if (!themeSwitch) return;
    var isDark = document.documentElement.classList.contains('dark');
    themeSwitch.setAttribute('aria-checked', isDark ? 'true' : 'false');
    themeSwitch.classList.toggle('is-on', isDark);
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
      '.vm-ios-sheet-close{display:block;margin:6px 0 0 auto;border:0;background:transparent;color:#059669;font:700 14px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:10px 4px;}',
      '.vm-ios-account-stack{display:grid;gap:16px;margin-top:16px;padding-bottom:6px;}',
      '.vm-ios-account-card{border-radius:20px;padding:16px;background:linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,.01)),rgba(239,246,242,.80);border:1px solid rgba(30,41,59,.14);box-shadow:inset 0 1px 0 rgba(255,255,255,.55),0 12px 30px rgba(15,23,42,.06);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      'html.dark .vm-ios-account-card{background:linear-gradient(180deg,rgba(255,255,255,.024),transparent),rgba(15,23,42,.66);border-color:rgba(255,255,255,.075);box-shadow:inset 0 1px 0 rgba(255,255,255,.025),0 16px 38px rgba(0,0,0,.20);}',
      '.vm-ios-account-heading{margin:0 0 14px;color:#162033;font:700 18px/1.25 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
      'html.dark .vm-ios-account-heading{color:#f4f7fb;}',
      '.vm-ios-account-row,.vm-ios-version-row{display:flex;align-items:center;justify-content:space-between;gap:16px;}',
      '.vm-ios-account-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:4px;}',
      '.vm-ios-account-copy strong,.vm-ios-version-row strong{color:#162033;font-size:15px;}',
      '.vm-ios-account-copy span,.vm-ios-version-row span,.vm-ios-account-description{color:#647388;font-size:13px;line-height:1.45;}',
      'html.dark .vm-ios-account-copy strong,html.dark .vm-ios-version-row strong{color:#f4f7fb;}',
      'html.dark .vm-ios-account-copy span,html.dark .vm-ios-version-row span,html.dark .vm-ios-account-description{color:#94a3b8;}',
      '.vm-ios-theme-switch{position:relative;flex:0 0 auto;width:51px;height:31px;border:0;border-radius:999px;padding:0;background:#cbd5e1;box-shadow:inset 0 1px 3px rgba(15,23,42,.14);transition:background .18s ease;}',
      '.vm-ios-theme-switch span{position:absolute;left:2px;top:2px;width:27px;height:27px;border-radius:50%;background:white;box-shadow:0 2px 7px rgba(15,23,42,.22);transition:transform .18s ease;}',
      '.vm-ios-theme-switch.is-on{background:#10b981;}',
      '.vm-ios-theme-switch.is-on span{transform:translateX(20px);}',
      '.vm-ios-account-description{margin:0 0 12px;}',
      '.vm-ios-account-action{display:block;width:100%;margin-top:9px;padding:12px 14px;border-radius:14px;border:1px solid rgba(30,41,59,.14);background:rgba(247,250,248,.82);color:#162033;text-align:center;font:650 14px/1.2 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:inset 0 1px 0 rgba(255,255,255,.52);}',
      'html.dark .vm-ios-account-action{background:rgba(30,41,59,.68);border-color:rgba(255,255,255,.10);color:#f4f7fb;box-shadow:inset 0 1px 0 rgba(255,255,255,.025);}',
      '.vm-ios-version-row{padding:2px 0 8px;}',
      '.vm-ios-account-danger{background:rgba(254,226,226,.76);border-color:rgba(185,28,28,.20);color:#b42318;}',
      'html.dark .vm-ios-account-danger{background:rgba(127,29,29,.25);border-color:rgba(248,113,113,.22);color:#fca5a5;}'
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

    var signature = groups.map(function (group) {
      var modules = group.modules.map(function (module) {
        return module.label + ':' + (module.path || module.action || '');
      }).join(',');
      return group.key + '[' + modules + ']';
    }).join('|');
    if (row.getAttribute('data-signature') !== signature) {
      closeSheet();
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
    ensureAccountExperience();
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
    val uiDelegate = remember { VendaMaisWebViewUiDelegate() }

    UIKitView(
        modifier = modifier,
        properties = UIKitInteropProperties(
            interactionMode = UIKitInteropInteractionMode.NonCooperative,
            isNativeAccessibilityEnabled = true,
        ),
        factory = {
            val appVersion = NSBundle.mainBundle
                .objectForInfoDictionaryKey("CFBundleShortVersionString") as? String ?: "-"
            val buildNumber = NSBundle.mainBundle
                .objectForInfoDictionaryKey("CFBundleVersion") as? String ?: ""

            val configuration = WKWebViewConfiguration().apply {
                websiteDataStore = WKWebsiteDataStore.defaultDataStore()
                userContentController.addUserScript(
                    WKUserScript(
                        source = iosMobileNavigationScript(appVersion, buildNumber),
                        injectionTime = WKUserScriptInjectionTime.WKUserScriptInjectionTimeAtDocumentEnd,
                        forMainFrameOnly = true,
                    ),
                )
            }

            WKWebView(
                frame = CGRectMake(0.0, 0.0, 0.0, 0.0),
                configuration = configuration,
            ).apply {
                UIDelegate = uiDelegate
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
