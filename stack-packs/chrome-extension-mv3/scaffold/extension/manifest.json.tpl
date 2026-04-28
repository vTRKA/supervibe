{
  "manifest_version": 3,
  "name": "__MSG_extName__",
  "default_locale": "en",
  "version": "{{extension-version|0.1.0}}",
  "description": "__MSG_extDescription__",

  "icons": {
    "16":  "icons/icon-16.png",
    "32":  "icons/icon-32.png",
    "48":  "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },

  "action": {
    "default_title": "__MSG_extName__",
    "default_popup": "popup/index.html",
    "default_icon": {
      "16":  "icons/icon-16.png",
      "32":  "icons/icon-32.png",
      "48":  "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },

  "background": {
    "service_worker": "background/index.js",
    "type": "module"
  },

  "options_ui": {
    "page": "options/index.html",
    "open_in_tab": true
  },

  "side_panel": {
    "default_path": "sidepanel/index.html"
  },

  "permissions": [
    "{{permissions-required|storage}}"
  ],

  "host_permissions": [
    "{{host-permissions|}}"
  ],

  "content_scripts": [
    {
      "matches": ["{{content-scripts-matches|}}"],
      "js": ["content/index.js"],
      "run_at": "document_idle",
      "world": "ISOLATED"
    }
  ],

  "web_accessible_resources": [
    {
      "resources": ["{{web-accessible-resources|}}"],
      "matches":   ["{{content-scripts-matches|}}"]
    }
  ],

  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self'; base-uri 'self'; frame-ancestors 'none'"
  },

  "minimum_chrome_version": "116"
}
