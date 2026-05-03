const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export const DESIGN_WIZARD_MODES = Object.freeze([
  choice("design-system-only", "Design system only", "Stops after approved project tokens, components, motion, and section evidence."),
  choice("design-system-plus-ux", "Design system + UX spec", "Adds IA, flow, states, component inventory, and copy scaffolding without building a prototype."),
  choice("full-prototype-pipeline", "Full pipeline to prototype preview", "Runs design system, spec, copy, native prototype, preview, reviews, and final approval gate."),
  choice("continue-approved-design-system", "Continue approved design system", "Reuses the approved system and asks only for missing extensions or target-surface deltas."),
]);

export const DESIGN_WIZARD_AXES = Object.freeze([
  axis({
    id: "visual_direction_tone",
    label: "Vision",
    prompt: "Which creative direction should anchor this design?",
    decisionUnlocked: ".supervibe/artifacts/brandbook/direction.md mood, risk, and product-fit rationale",
    defaultChoiceId: "operational-clarity",
    choices: [
      choice("operational-clarity", "Operational clarity", "Quiet, dense, and fast to scan; may feel less expressive."),
      choice("technical-command-center", "Technical command center", "Strong structure and expert cues; risks feeling heavy for casual users."),
      choice("premium-editorial", "Premium editorial", "Distinctive and polished; gives up some utilitarian density."),
      choice("warm-product-utility", "Warm product utility", "Approachable and humane; less sharp for high-risk admin tools."),
      choice("bold-launch-energy", "Bold launch energy", "Memorable first impression; higher risk of visual fatigue in daily workflows."),
    ],
  }),
  axis({
    id: "audience_trust_posture",
    label: "Audience and trust posture",
    prompt: "What trust posture should the interface signal first?",
    decisionUnlocked: "risk level, visual restraint, copy tone, and assurance cues",
    defaultChoiceId: "professional-calm",
    choices: [
      choice("professional-calm", "Professional calm", "Safe default for SaaS and operations; may feel conservative."),
      choice("expert-power", "Expert power", "Good for technical teams; increases cognitive load for newcomers."),
      choice("consumer-friendly", "Consumer friendly", "Reduces intimidation; may under-signal rigor."),
      choice("regulated-assurance", "Regulated assurance", "Strong compliance and audit cues; slower, more formal feel."),
    ],
  }),
  axis({
    id: "information_density",
    label: "Density",
    prompt: "How dense should the primary screens feel?",
    decisionUnlocked: "spacing scale, table/card sizing, control height, and dashboard rhythm",
    defaultChoiceId: "balanced",
    choices: [
      choice("balanced", "Balanced", "Good scan speed without crowding; safest for mixed audiences."),
      choice("compact", "Compact", "Shows more data per viewport; requires stronger hierarchy and accessibility care."),
      choice("comfortable", "Comfortable", "More breathing room and touch safety; reduces above-the-fold information."),
    ],
  }),
  axis({
    id: "typography_personality",
    label: "Typography",
    prompt: "Which typography personality fits the product?",
    decisionUnlocked: "font family stack, type scale, fallback chain, language coverage, and licensing path",
    defaultChoiceId: "system-native",
    choices: [
      choice("system-native", "System native", "Fast and platform-familiar; less brand distinctiveness."),
      choice("geometric", "Geometric", "Modern and precise; can feel cold at long reading lengths."),
      choice("humanist", "Humanist", "Readable and approachable; slightly softer expert posture."),
      choice("code-first", "Code first", "Developer-native with strong mono support; niche outside technical products."),
    ],
  }),
  axis({
    id: "palette_mood",
    label: "Palette",
    prompt: "Which palette direction should the system explore first?",
    decisionUnlocked: "color ramps, semantic aliases, contrast policy, and chart/accent behavior",
    defaultChoiceId: "graphite-cyan",
    choices: [
      choice("graphite-cyan", "Graphite + cyan", "Precise technical signal; can skew cool if overused."),
      choice("graphite-amber", "Graphite + amber", "Warm operational emphasis; higher risk of warning-color confusion."),
      choice("light-first", "Light first", "Best for daily productivity and readability; less cinematic impact."),
      choice("high-contrast", "High contrast", "Strong accessibility and command feel; must be softened for long sessions."),
    ],
  }),
  axis({
    id: "motion_intensity",
    label: "Motion",
    prompt: "How much motion should the system allow?",
    decisionUnlocked: "motion.css timing tiers, easing vocabulary, reduced-motion defaults, and transition budget",
    defaultChoiceId: "subtle",
    choices: [
      choice("subtle", "Subtle", "Clear feedback without spectacle; safe for productivity tools."),
      choice("strict", "Strict", "Minimal motion and fast state changes; can feel dry."),
      choice("expressive", "Expressive", "More delight and state storytelling; higher performance and fatigue risk."),
    ],
  }),
  axis({
    id: "component_feel",
    label: "Components",
    prompt: "Which component approach should the system optimize for?",
    decisionUnlocked: "component library bridge, ownership model, states/variants, and token adapter strategy",
    defaultChoiceId: "radix-headless",
    choices: [
      choice("radix-headless", "Radix/headless", "Accessible behavior with full visual ownership; needs more composition work."),
      choice("custom", "Custom", "Maximum control and host neutrality; longest implementation path."),
      choice("shadcn-adapter", "shadcn-style adapter", "Fast React handoff with source ownership; less host-neutral."),
      choice("platform-native", "Platform native", "Best for Tauri/Electron/native shells; fewer reusable web primitives."),
    ],
  }),
  axis({
    id: "reference_borrow_avoid",
    label: "Reference borrow/avoid",
    prompt: "How should references influence this design?",
    decisionUnlocked: "reference scope, borrow/avoid list, and old-artifact reuse boundary",
    defaultChoiceId: "functional-only",
    choices: [
      choice("functional-only", "Functional inventory only", "Preserves capabilities and flows while avoiding visual copying."),
      choice("ia-only", "Information architecture only", "Borrows navigation/grouping patterns; keeps visual system fresh."),
      choice("visual-inspiration", "Visual inspiration", "Allows mood/layout influence with explicit differences documented."),
      choice("authoritative-brand", "Authoritative brand source", "Use only when the source is a real brand/design source of truth."),
      choice("ignore-references", "Ignore references", "Fresh direction; may miss expected domain conventions."),
    ],
  }),
]);

export const DESIGN_STYLEBOARD_REQUIRED_AXES = Object.freeze([
  "visual_direction_tone",
  "information_density",
  "palette_mood",
  "typography_personality",
  "component_feel",
  "motion_intensity",
  "reference_borrow_avoid",
]);

export const DESIGN_VIEWPORT_CHOICES = Object.freeze([
  choice("actual-window", "Current 1:1 window", "Best desktop fidelity; requires actual window size, OS scale, and min-resize policy."),
  choice("tauri-main", "1280x800 desktop", "Good Tauri main-window baseline; does not prove small-window behavior."),
  choice("tauri-min", "800x600 desktop", "Catches cramped desktop layouts; not representative of primary workspace."),
  choice("wide-desktop", "1920x1080 desktop", "Useful for large monitors; can hide density and alignment problems."),
  choice("web-default", "375 + 1440 web", "Best browser coverage; weak proxy for desktop app windows."),
  choice("custom", "Custom viewport", "Use when target hardware or embedded surface is known."),
]);

export function parseDesignBriefPreferences(brief = "") {
  const text = String(brief ?? "");
  const decisions = new Map();
  const conflicts = [];

  for (const axisDef of DESIGN_WIZARD_AXES) {
    const matches = detectAxisMatches(text, axisDef);
    if (matches.length === 1) {
      const match = matches[0];
      decisions.set(axisDef.id, decisionFromMatch(axisDef, match, text));
    } else if (matches.length > 1) {
      conflicts.push({
        axis: axisDef.id,
        choices: matches.map((item) => item.choiceId),
        snippets: matches.map((item) => snippetFor(text, item.index)),
      });
    }
  }

  const viewport = detectViewportPreference(text);
  if (viewport) {
    decisions.set("viewport", viewport);
  }

  const explicitDefaults = hasExplicitDefaultRequest(text);
  return {
    decisions: Object.fromEntries(decisions),
    conflicts,
    explicitDefaults,
    coveredAxes: [...decisions.keys()].filter((axisId) => DESIGN_WIZARD_AXES.some((axisDef) => axisDef.id === axisId)),
  };
}

export function buildDesignWizardState({
  brief = "",
  target = "web",
  designSystemStatus = "missing",
  timestamp = new Date().toISOString(),
  mode = null,
  currentWindow = null,
  deviceScaleFactor = null,
  initialDecisions = {},
} = {}) {
  const parsed = parseDesignBriefPreferences(brief);
  const decisions = { ...parsed.decisions, ...initialDecisions };
  const explicitDefaults = parsed.explicitDefaults === true;

  if (explicitDefaults) {
    for (const axisDef of DESIGN_WIZARD_AXES) {
      if (!decisions[axisDef.id]) {
        decisions[axisDef.id] = explicitDefaultDecision(axisDef, timestamp);
      }
    }
  }

  const missingAxes = DESIGN_WIZARD_AXES
    .filter((axisDef) => !decisions[axisDef.id])
    .map((axisDef) => axisDef.id);
  const requiredAxes = designSystemStatus === "approved" ? [] : missingAxes;
  const questionQueue = [];

  if (!mode) {
    questionQueue.push(modeQuestion());
  }

  for (const axisId of requiredAxes) {
    questionQueue.push(axisQuestion(DESIGN_WIZARD_AXES.find((axisDef) => axisDef.id === axisId)));
  }

  questionQueue.push(viewportQuestion(resolveDesignViewportPolicy({ target, currentWindow, deviceScaleFactor })));

  const guidedDefaultsChecklist = explicitDefaults
    ? DESIGN_WIZARD_AXES.map((axisDef) => guidedDefaultChecklistItem(axisDef, decisions[axisDef.id]))
    : [];
  const styleboardReadiness = evaluateDesignStyleboardReadiness({ mode, target, decisions });

  return {
    schemaVersion: 1,
    mode: mode || null,
    target,
    designSystemStatus,
    decisions,
    coverage: {
      requiredAxes: DESIGN_WIZARD_AXES.map((axisDef) => axisDef.id),
      coveredAxes: DESIGN_WIZARD_AXES.filter((axisDef) => decisions[axisDef.id]).map((axisDef) => axisDef.id),
      missingAxes,
      conflicts: parsed.conflicts,
      score: `${DESIGN_WIZARD_AXES.length - missingAxes.length}/${DESIGN_WIZARD_AXES.length}`,
    },
    explicitDefaults,
    guidedDefaultsChecklist,
    questionQueue,
    styleboard: {
      phase: styleboardReadiness.pass ? "review-styleboard" : "diagnostic-scratch",
      requiredAxes: DESIGN_STYLEBOARD_REQUIRED_AXES,
      missingAxes: styleboardReadiness.missingAxes,
      allowedBeforePreferenceGate: "diagnostic-scratch-only",
      reviewStyleboardAllowed: styleboardReadiness.pass,
    },
    gates: {
      mandatoryQuestionsClosed: requiredAxes.length === 0 && Boolean(mode),
      tokensUnlocked: requiredAxes.length === 0 && parsed.conflicts.length === 0 && Boolean(mode),
      reviewStyleboardUnlocked: styleboardReadiness.pass,
      styleboardBlockedReason: styleboardReadiness.blockedReason,
      blockedReason: !mode
        ? "missing workflow mode"
        : requiredAxes.length > 0
        ? `missing wizard axes: ${requiredAxes.join(", ")}`
        : parsed.conflicts.length > 0
          ? `conflicting wizard axes: ${parsed.conflicts.map((item) => item.axis).join(", ")}`
          : null,
    },
  };
}

export function recordDesignWizardAnswer(state = {}, answer = {}) {
  const axisId = String(answer.axis || "").trim();
  const axisDef = DESIGN_WIZARD_AXES.find((item) => item.id === axisId);
  if (!axisDef && axisId !== "mode" && axisId !== "viewport") {
    throw new Error(`Unknown design wizard axis: ${axisId || "(missing)"}`);
  }

  const next = JSON.parse(JSON.stringify(state || {}));
  next.decisions ||= {};
  if (axisId === "mode") {
    next.mode = answer.choiceId || answer.value || null;
  } else {
    const choiceDef = axisDef?.choices.find((choiceItem) => choiceItem.id === answer.choiceId);
    next.decisions[axisId] = {
      axis: axisId,
      answer: answer.value || choiceDef?.label || answer.choiceId || "",
      choiceId: answer.choiceId || null,
      source: answer.source || "user",
      confidence: Number(answer.confidence ?? 1),
      quote: answer.quote || null,
      prompt: axisDef?.prompt || "Viewport target",
      decisionUnlocked: axisDef?.decisionUnlocked || "viewport capture policy",
      timestamp: answer.timestamp || new Date().toISOString(),
    };
  }

  const covered = DESIGN_WIZARD_AXES.filter((axisDefItem) => next.decisions[axisDefItem.id]).map((axisDefItem) => axisDefItem.id);
  const missing = DESIGN_WIZARD_AXES.filter((axisDefItem) => !next.decisions[axisDefItem.id]).map((axisDefItem) => axisDefItem.id);
  next.coverage = {
    ...(next.coverage || {}),
    coveredAxes: covered,
    missingAxes: missing,
    score: `${covered.length}/${DESIGN_WIZARD_AXES.length}`,
  };
  const styleboardReadiness = evaluateDesignStyleboardReadiness({
    mode: next.mode,
    target: next.target,
    decisions: next.decisions,
  });
  next.styleboard = {
    ...(next.styleboard || {}),
    phase: styleboardReadiness.pass ? "review-styleboard" : "diagnostic-scratch",
    requiredAxes: DESIGN_STYLEBOARD_REQUIRED_AXES,
    missingAxes: styleboardReadiness.missingAxes,
    allowedBeforePreferenceGate: "diagnostic-scratch-only",
    reviewStyleboardAllowed: styleboardReadiness.pass,
  };
  next.gates = {
    ...(next.gates || {}),
    mandatoryQuestionsClosed: missing.length === 0 && Boolean(next.mode),
    tokensUnlocked: missing.length === 0 && Boolean(next.mode),
    reviewStyleboardUnlocked: styleboardReadiness.pass,
    styleboardBlockedReason: styleboardReadiness.blockedReason,
    blockedReason: !next.mode
      ? "missing workflow mode"
      : missing.length > 0
        ? `missing wizard axes: ${missing.join(", ")}`
        : null,
  };
  next.questionQueue = (next.questionQueue || []).filter((question) => question.axis !== axisId);
  return next;
}

export function evaluateDesignStyleboardReadiness({ mode = null, target = null, decisions = {} } = {}) {
  const missingAxes = DESIGN_STYLEBOARD_REQUIRED_AXES.filter((axisId) => !decisions?.[axisId]);
  const missing = [];
  if (!mode) missing.push("mode");
  if (!target || String(target).toLowerCase() === "unknown") missing.push("target");
  missing.push(...missingAxes);
  return {
    pass: missing.length === 0,
    missing,
    missingAxes,
    blockedReason: missing.length > 0
      ? `review styleboard requires ${missing.join(", ")}`
      : null,
  };
}

export function resolveDesignViewportPolicy({ target = "web", currentWindow = null, deviceScaleFactor = null } = {}) {
  const normalized = String(target || "web").toLowerCase();
  const desktop = /tauri|electron|desktop|native-app|app-shell/.test(normalized);
  if (desktop) {
    return {
      target: normalized,
      defaultViewports: currentWindow
        ? [{ ...currentWindow, exactWindow: true, deviceScaleFactor: deviceScaleFactor ?? currentWindow.deviceScaleFactor ?? null }]
        : [
            { width: 1280, height: 800, exactWindow: false, role: "mainWindow" },
            { width: 800, height: 600, exactWindow: false, role: "minWindow" },
          ],
      requiredMetadata: ["exactWindow", "deviceScaleFactor", "minWindow", "mainWindow", "secondaryWindow", "largeWindow"],
      choices: DESIGN_VIEWPORT_CHOICES.filter((item) => item.id !== "web-default"),
      requiresActualWindowQuestion: true,
    };
  }
  return {
    target: normalized,
    defaultViewports: [
      { width: 375, height: null, role: "mobile" },
      { width: 1440, height: null, role: "desktop" },
    ],
    requiredMetadata: ["mobile", "desktop", "custom"],
    choices: DESIGN_VIEWPORT_CHOICES.filter((item) => ["web-default", "wide-desktop", "custom"].includes(item.id)),
    requiresActualWindowQuestion: false,
  };
}

export function formatDesignWizardQuestion(question = {}) {
  const lines = [
    `**Step ${question.step || "N"}/${question.total || "M"}: ${question.prompt || question.question || "Choose design direction"}**`,
    "",
    `Why: ${question.why || "This controls the next durable design artifact."}`,
    `Decision unlocked: ${question.decisionUnlocked || question.decision || "Saved wizard state"}`,
    `If skipped: ${question.ifSkipped || "Use the recommended safe default only when explicitly delegated by the user."}`,
    "",
  ];
  for (const item of question.choices || []) {
    const suffix = item.recommended ? " (recommended)" : "";
    lines.push(`- ${item.label}${suffix} - ${item.tradeoff}`);
  }
  lines.push("", `Free-form answer: ${question.freeFormPath || "Answer in your own words if none of these fit."}`);
  lines.push(`Stop condition: ${question.stopCondition || "Stop here - save state and make no hidden progress."}`);
  return lines.join("\n");
}

function axis(fields) {
  return Object.freeze({ ...fields, choices: Object.freeze(fields.choices || []) });
}

function choice(id, label, tradeoff) {
  return Object.freeze({ id, label, tradeoff });
}

function detectAxisMatches(text, axisDef) {
  const lower = text.toLowerCase();
  const out = [];
  for (const option of axisDef.choices) {
    const aliases = aliasesFor(option.id, option.label);
    for (const alias of aliases) {
      const index = lower.indexOf(alias.toLowerCase());
      if (index >= 0) {
        out.push({ axis: axisDef.id, choiceId: option.id, label: option.label, index });
        break;
      }
    }
  }
  return out;
}

function aliasesFor(id, label) {
  const base = [id, label, label.replace(/\s+/g, "-")];
  const extra = {
    "system-native": ["native font", "system font", "platform font"],
    geometric: ["geometric sans", "inter-like", "modern sans"],
    humanist: ["humanist sans", "friendly type"],
    "code-first": ["monospace", "developer typography", "code type"],
    compact: ["dense", "high density"],
    balanced: ["medium density"],
    comfortable: ["spacious", "airy"],
    subtle: ["light motion", "quiet motion"],
    strict: ["reduced motion", "no animation", "minimal motion"],
    expressive: ["animated", "playful motion"],
    custom: ["bespoke"],
    "shadcn-adapter": ["shadcn"],
    "radix-headless": ["radix", "headless"],
    "graphite-cyan": ["cyan", "blue accent"],
    "graphite-amber": ["amber", "yellow accent"],
    "light-first": ["light theme", "light mode"],
    "high-contrast": ["contrast", "wcag"],
    "visual-inspiration": ["visual inspiration", "style reference", "in the style of"],
    "functional-only": [
      "functional inventory",
      "functions only",
      "functionality only",
      "only functionality",
      "только функционал",
      "сохранить только функционал",
      "не скелет",
      "без скелета",
      "без визуального скелета",
      "не копировать скелет",
      "не брать визуал",
    ],
    "ia-only": ["information architecture", "navigation only"],
    "authoritative-brand": ["brand guide", "design source of truth"],
  };
  return [...new Set([...base, ...(extra[id] || [])])];
}

function decisionFromMatch(axisDef, match, text) {
  const option = axisDef.choices.find((item) => item.id === match.choiceId);
  return {
    axis: axisDef.id,
    answer: option?.label || match.label,
    choiceId: match.choiceId,
    source: "user",
    confidence: 0.72,
    quote: snippetFor(text, match.index),
    prompt: axisDef.prompt,
    decisionUnlocked: axisDef.decisionUnlocked,
    timestamp: DEFAULT_TIMESTAMP,
  };
}

function explicitDefaultDecision(axisDef, timestamp) {
  const option = axisDef.choices.find((item) => item.id === axisDef.defaultChoiceId) || axisDef.choices[0];
  return {
    axis: axisDef.id,
    answer: option.label,
    choiceId: option.id,
    source: "explicit-default",
    confidence: 0.9,
    quote: "User explicitly delegated defaults.",
    prompt: axisDef.prompt,
    decisionUnlocked: axisDef.decisionUnlocked,
    timestamp,
  };
}

function guidedDefaultChecklistItem(axisDef, decision) {
  return {
    axis: axisDef.id,
    label: axisDef.label,
    defaultChoiceId: decision.choiceId,
    defaultAnswer: decision.answer,
    actions: [
      choice("accept-default", "Accept default", "Keeps the named default and records it as explicit-default."),
      choice("compare-alternatives", "Compare alternatives", "Shows the full choice set before writing tokens."),
      choice("customize", "Customize", "User provides a custom answer for this axis."),
    ],
  };
}

function modeQuestion() {
  return {
    id: "mode",
    axis: "mode",
    step: 1,
    total: "M",
    prompt: "Which design workflow mode should this run use?",
    why: "This prevents design-system-only work from silently stopping or accidentally continuing into prototype work.",
    decisionUnlocked: "config.json.executionMode, stageTriage, and continuation boundary",
    ifSkipped: "Use full pipeline only when the brief clearly asks for prototype delivery; otherwise stop and ask.",
    choices: DESIGN_WIZARD_MODES.map((item, index) => ({ ...item, recommended: index === 0 })),
    freeFormPath: "Name a custom boundary, for example: design system now, prototype after approval.",
    stopCondition: "Stop here - save the brief and do not write durable design artifacts.",
  };
}

function axisQuestion(axisDef) {
  return {
    id: axisDef.id,
    axis: axisDef.id,
    step: "N",
    total: "M",
    prompt: axisDef.prompt,
    why: `${axisDef.label} is not a blocker syntactically, but it materially changes the product feel.`,
    decisionUnlocked: axisDef.decisionUnlocked,
    ifSkipped: "Only use the recommended default when the user explicitly delegates this axis.",
    choices: axisDef.choices.map((item) => ({ ...item, recommended: item.id === axisDef.defaultChoiceId })),
    freeFormPath: "Answer with a different style, reference, or constraint if none of these options fit.",
    stopCondition: "Stop here - keep the wizard state draft and do not create tokens.",
    minChoices: Math.min(axisDef.choices.length, 3),
  };
}

function viewportQuestion(policy) {
  return {
    id: "viewport",
    axis: "viewport",
    step: "N",
    total: "M",
    prompt: policy.requiresActualWindowQuestion
      ? "Which desktop viewport should be the primary 1:1 review target?"
      : "Which viewport policy should be used for review?",
    why: "Viewport policy controls whether the design proves the actual surface or only a generic browser size.",
    decisionUnlocked: "config.json.viewports, review screenshots, and platform resize policy",
    ifSkipped: policy.requiresActualWindowQuestion
      ? "Use 1280x800 mainWindow plus 800x600 minWindow and record exactWindow=false."
      : "Use web defaults 375px and 1440px.",
    choices: policy.choices.map((item, index) => ({ ...item, recommended: index === 0 })),
    freeFormPath: "Provide width, height, OS scale, min window, secondary window, or monitor target.",
    stopCondition: "Stop here - no prototype preview until viewport policy is recorded.",
  };
}

function detectViewportPreference(text) {
  const sizeMatch = String(text).match(/\b(\d{3,4})\s*[xX]\s*(\d{3,4})\b/);
  if (!sizeMatch) return null;
  return {
    axis: "viewport",
    answer: `${sizeMatch[1]}x${sizeMatch[2]}`,
    choiceId: "custom",
    source: "user",
    confidence: 0.85,
    quote: sizeMatch[0],
    prompt: "Viewport policy",
    decisionUnlocked: "config.json.viewports",
    timestamp: DEFAULT_TIMESTAMP,
  };
}

function hasExplicitDefaultRequest(text) {
  return /\b(use|safe|recommended)\s+defaults?\b|\bno preference\b|\bdefault everything\b|\bпо умолчанию\b|\bдефолт/i.test(String(text || ""));
}

function snippetFor(text, index) {
  const value = String(text || "");
  const start = Math.max(0, Number(index || 0) - 48);
  const end = Math.min(value.length, Number(index || 0) + 88);
  return value.slice(start, end).replace(/\s+/g, " ").trim();
}
