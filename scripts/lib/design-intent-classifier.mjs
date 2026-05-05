const UNKNOWN_TARGETS = new Set(["", "unknown", "auto", "detect"]);

export function classifyDesignIntent({
  brief = "",
  target = "unknown",
  flowType = "",
} = {}) {
  const text = `${brief || ""} ${target || ""} ${flowType || ""}`.toLowerCase();
  const normalizedTarget = normalizeTarget(target);
  const signals = designIntentSignals(text);
  const resolvedTarget = UNKNOWN_TARGETS.has(normalizedTarget)
    ? inferTargetFromSignals(signals, normalizedTarget)
    : normalizedTarget;
  const normalizedFlow = normalizeFlowType(flowType);

  return {
    schemaVersion: 1,
    target: resolvedTarget,
    flowType: normalizedFlow || inferFlowTypeFromSignals(signals),
    signals,
  };
}

function designIntentSignals(text = "") {
  const haystack = String(text || "").toLowerCase();
  return {
    webSurface: hasAny(haystack, [
      "web",
      "website",
      "site",
      "homepage",
      "page",
      "browser",
      "\u0441\u0430\u0439\u0442",
      "\u0432\u0435\u0431",
      "\u0441\u0442\u0440\u0430\u043d\u0438\u0446",
      "\u0433\u043b\u0430\u0432\u043d\u0430\u044f",
    ]),
    landing: hasAny(haystack, [
      "landing",
      "marketing",
      "launch",
      "hero",
      "conversion",
      "cta",
      "campaign",
      "waitlist",
      "\u043b\u0435\u043d\u0434\u0438\u043d\u0433",
      "\u043c\u0430\u0440\u043a\u0435\u0442\u0438\u043d\u0433",
      "\u0437\u0430\u043f\u0443\u0441\u043a",
      "\u043a\u043e\u043d\u0432\u0435\u0440\u0441",
      "\u043f\u043e\u0441\u0430\u0434\u043e\u0447",
    ]),
    desktop: hasAny(haystack, [
      "tauri",
      "electron",
      "desktop",
      "desktop app",
      "native app",
      "app shell",
      "\u0434\u0435\u0441\u043a\u0442\u043e\u043f",
      "\u043d\u0430\u0441\u0442\u043e\u043b\u044c\u043d",
    ]),
    mobileNative: hasAny(haystack, [
      "mobile native",
      "native mobile",
      "ios",
      "android",
      "swiftui",
      "react native",
      "\u043c\u043e\u0431\u0438\u043b\u044c\u043d",
      "\u043d\u0430\u0442\u0438\u0432\u043d",
    ]),
    browserExtension: hasAny(haystack, [
      "chrome extension",
      "browser extension",
      "extension popup",
      "\u0440\u0430\u0441\u0448\u0438\u0440\u0435\u043d\u0438\u0435",
    ]),
    regulatedTrust: hasAny(haystack, [
      "compliance",
      "audit",
      "bank",
      "finance",
      "fintech",
      "medical",
      "healthcare",
      "security",
      "privacy",
      "risk",
      "regulated",
      "legal",
      "law firm",
      "lawyer",
      "attorney",
      "\u044e\u0440\u0438\u0434",
      "\u0430\u0434\u0432\u043e\u043a\u0430\u0442",
      "\u0437\u0430\u043a\u043e\u043d",
      "\u043f\u0440\u0430\u0432\u043e\u0432",
      "\u043a\u043e\u043c\u043f\u043b\u0430\u0435\u043d\u0441",
      "\u0430\u0443\u0434\u0438\u0442",
      "\u0431\u0430\u043d\u043a",
      "\u0444\u0438\u043d\u0430\u043d\u0441",
      "\u043c\u0435\u0434\u0438\u0446",
      "\u0431\u0435\u0437\u043e\u043f\u0430\u0441\u043d",
    ]),
    appWorkflow: hasAny(haystack, [
      "dashboard",
      "admin",
      "app",
      "tool",
      "workflow",
      "operator",
      "support",
      "\u0430\u0434\u043c\u0438\u043d",
      "\u043f\u0440\u0438\u043b\u043e\u0436",
      "\u0438\u043d\u0441\u0442\u0440\u0443\u043c\u0435\u043d\u0442",
    ]),
  };
}

function inferTargetFromSignals(signals = {}, fallback = "unknown") {
  if (signals.browserExtension) return "chrome-extension";
  if (signals.mobileNative) return "mobile-native";
  if (signals.desktop) return "tauri";
  if (signals.webSurface || signals.landing) return "web";
  return fallback || "unknown";
}

function inferFlowTypeFromSignals(signals = {}) {
  if (signals.landing) return "landing";
  if (signals.appWorkflow || signals.desktop || signals.mobileNative || signals.browserExtension) return "in-product";
  return "in-product";
}

function normalizeTarget(target = "") {
  const value = String(target || "").trim().toLowerCase();
  if (["desktop-app", "desktop", "app-shell"].includes(value)) return "tauri";
  if (["browser-extension", "extension"].includes(value)) return "chrome-extension";
  if (["mobile", "native-mobile"].includes(value)) return "mobile-native";
  if (["site", "website", "landing"].includes(value)) return "web";
  return value || "unknown";
}

function normalizeFlowType(flowType = "") {
  const value = String(flowType || "").trim().toLowerCase();
  if (!value || value === "unknown" || value === "auto") return "";
  if (["marketing", "marketing-landing", "landing-page"].includes(value)) return "landing";
  return value;
}

function hasAny(text = "", needles = []) {
  return needles.some((needle) => String(text || "").includes(String(needle).toLowerCase()));
}
