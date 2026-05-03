const DEFAULT_TIMESTAMP = "1970-01-01T00:00:00.000Z";

export const DESIGN_WIZARD_MODES = Object.freeze([
  choice("design-system-only", "Design system only", "Stops after approved project tokens, components, motion, and section evidence."),
  choice("design-system-plus-ux", "Design system + UX spec", "Adds IA, flow, states, component inventory, and copy scaffolding without building a prototype."),
  choice("full-prototype-pipeline", "Full pipeline to prototype preview", "Runs design system, spec, copy, native prototype, preview, reviews, and final approval gate."),
  choice("continue-approved-design-system", "Continue approved design system", "Reuses the approved system and asks only for missing extensions or target-surface deltas."),
]);

export const DESIGN_WIZARD_AXES = Object.freeze([
  axis({
    id: "creative_alternatives",
    label: "Creative alternatives",
    prompt: "Which creative alternatives should be compared before tokens are written?",
    decisionUnlocked: ".supervibe/artifacts/brandbook/direction.md alternatives, selected direction, and rejected rationale",
    defaultChoiceId: "three-directions",
    choices: [
      choice("three-directions", "3 distinct directions", "Best for new products; takes longer but prevents a single safe default from becoming the brand."),
      choice("two-directions", "2 focused directions", "Faster comparison for narrower briefs; less coverage of unusual options."),
      choice("single-locked-direction", "One locked direction", "Use only when the user already supplied a clear approved direction and evidence."),
    ],
  }),
  axis({
    id: "anti_generic_guardrail",
    label: "Anti-generic guardrail",
    prompt: "What must the design avoid so it does not become a generic admin interface?",
    decisionUnlocked: "anti-generic checklist, old-shell avoidance notes, and critique gate criteria",
    defaultChoiceId: "avoid-generic-admin",
    choices: [
      choice("avoid-generic-admin", "Avoid generic SaaS admin", "Blocks safe blue/gray cards, default sidebars, and anonymous dashboards unless explicitly requested."),
      choice("avoid-old-shell-repaint", "Avoid repainting old shells", "Forces a new composition or interaction pattern instead of recoloring prior prototypes."),
      choice("brand-distinct-but-usable", "Distinctive but still usable", "Allows memorable visual moves while keeping repeat-work ergonomics and accessibility."),
      choice("system-native-locked", "System-native locked", "Use only when the user explicitly wants platform-default UI over brand distinctiveness."),
    ],
  }),
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
  "creative_alternatives",
  "anti_generic_guardrail",
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

const WIZARD_LABELS = Object.freeze({
  en: {
    step: "Step",
    why: "Why",
    decision: "Decision unlocked",
    ifSkipped: "If skipped",
    freeForm: "Free-form answer",
    stop: "Stop condition",
    recommended: "recommended",
    noTradeoff: "No tradeoff provided.",
  },
  ru: {
    step: "Шаг",
    why: "Зачем",
    decision: "Что изменится",
    ifSkipped: "Если пропустить",
    freeForm: "Свободный ответ",
    stop: "Остановиться",
    recommended: "рекомендуется",
    noTradeoff: "Компромисс не указан.",
  },
});

const RU_AXIS_COPY = Object.freeze({
  creative_alternatives: {
    prompt: "Какие творческие направления сравнить до записи токенов?",
    label: "Творческие варианты",
    decisionUnlocked: "альтернативы в direction.md, выбранное направление и причины отклонения остальных",
    choices: {
      "three-directions": ["3 разных направления", "Лучше для нового продукта: дольше, зато один безопасный дефолт не станет брендом случайно."],
      "two-directions": ["2 сфокусированных направления", "Быстрее для узкого запроса, но меньше шанс найти необычное решение."],
      "single-locked-direction": ["Одно уже выбранное направление", "Только если пользователь уже дал четкое утвержденное направление и доказательства."],
    },
  },
  anti_generic_guardrail: {
    prompt: "Чего дизайн должен избегать, чтобы не стать обычной админкой?",
    label: "Защита от шаблонности",
    decisionUnlocked: "anti-generic checklist, отличие от старого shell и критерии critique gate",
    choices: {
      "avoid-generic-admin": ["Не generic SaaS admin", "Блокирует безопасные сине-серые карточки, дефолтный sidebar и безликие dashboard-экраны."],
      "avoid-old-shell-repaint": ["Не перекрашивать старый shell", "Требует новую композицию или взаимодействие, а не только новую палитру."],
      "brand-distinct-but-usable": ["Уникально, но удобно", "Разрешает запоминаемые ходы, сохраняя эргономику, сканирование и доступность."],
      "system-native-locked": ["Строго system-native", "Только если пользователь явно хочет платформенный UI вместо брендовой выразительности."],
    },
  },
  visual_direction_tone: {
    prompt: "Какое визуальное направление должно держать дизайн?",
    label: "Видение",
    decisionUnlocked: "настроение, риск, продуктовый fit и причины выбора в direction.md",
    choices: {
      "operational-clarity": ["Операционная ясность", "Тихо, плотно и быстро сканируется; может быть менее выразительно."],
      "technical-command-center": ["Технический командный центр", "Сильная структура и экспертные сигналы; может быть тяжеловато новичкам."],
      "premium-editorial": ["Премиальная редакторская подача", "Отличается и выглядит отполированно; уступает часть утилитарной плотности."],
      "warm-product-utility": ["Теплая продуктовая утилитарность", "Дружелюбно и человечно; меньше жесткости для рискованных админок."],
      "bold-launch-energy": ["Смелая энергия запуска", "Запоминается с первого экрана; выше риск усталости при ежедневной работе."],
    },
  },
  audience_trust_posture: {
    prompt: "Какое доверие интерфейс должен показать первым?",
    label: "Аудитория и доверие",
    decisionUnlocked: "уровень риска, визуальная сдержанность, тон текста и подсказки надежности",
    choices: {
      "professional-calm": ["Спокойный профессиональный", "Безопасно для SaaS и операций; может быть консервативно."],
      "expert-power": ["Экспертная мощность", "Хорошо для технических команд; тяжелее для новичков."],
      "consumer-friendly": ["Понятно как обычный продукт", "Снижает страх входа; может слабее показывать строгость."],
      "regulated-assurance": ["Регулируемая надежность", "Сильные compliance/audit сигналы; медленнее и формальнее."],
    },
  },
  information_density: {
    prompt: "Насколько плотными должны быть основные экраны?",
    label: "Плотность",
    decisionUnlocked: "spacing scale, размеры таблиц/карточек, высота контролов и ритм dashboard",
    choices: {
      balanced: ["Сбалансировано", "Хорошая скорость сканирования без тесноты; безопасно для смешанной аудитории."],
      compact: ["Компактно", "Больше данных на экране; нужна сильная иерархия и контроль доступности."],
      comfortable: ["Свободно", "Больше воздуха и удобнее touch; меньше информации над сгибом."],
    },
  },
  typography_personality: {
    prompt: "Какой характер типографики подходит продукту?",
    label: "Типографика",
    decisionUnlocked: "семейства шрифтов, шкала, fallback, языковое покрытие и лицензии",
    choices: {
      "system-native": ["Системная", "Быстро и привычно платформе; меньше индивидуальности."],
      geometric: ["Геометрическая", "Современно и точно; может быть холодной в длинном чтении."],
      humanist: ["Гуманистическая", "Читаемо и дружелюбно; немного мягче экспертной подачи."],
      "code-first": ["Code-first", "Разработческая подача с сильной моноширинной опорой; нишево вне tech-продуктов."],
    },
  },
  palette_mood: {
    prompt: "Какую палитру исследуем первой?",
    label: "Палитра",
    decisionUnlocked: "цветовые ramp, semantic aliases, contrast policy и chart/accent поведение",
    choices: {
      "graphite-cyan": ["Графит + cyan", "Точный технический сигнал; может стать слишком холодным."],
      "graphite-amber": ["Графит + amber", "Теплый операционный акцент; риск путаницы с warning-цветом."],
      "light-first": ["Сначала светлая", "Лучше для ежедневной продуктивности и чтения; меньше кинематографичности."],
      "high-contrast": ["Высокий контраст", "Сильная доступность и command-feel; надо смягчить для долгих сессий."],
    },
  },
  motion_intensity: {
    prompt: "Сколько движения разрешаем системе?",
    label: "Анимация",
    decisionUnlocked: "motion.css timings, easing, reduced-motion defaults и transition budget",
    choices: {
      subtle: ["Тонко", "Понятная обратная связь без шоу; безопасно для рабочих интерфейсов."],
      strict: ["Строго", "Минимум движения и быстрые смены состояния; может быть сухо."],
      expressive: ["Выразительно", "Больше delight и истории состояния; выше риск усталости и нагрузки."],
    },
  },
  component_feel: {
    prompt: "Под какой подход к компонентам оптимизируем систему?",
    label: "Компоненты",
    decisionUnlocked: "component library bridge, ownership model, states/variants и token adapter",
    choices: {
      "radix-headless": ["Radix/headless", "Доступное поведение и полный визуальный контроль; больше композиционной работы."],
      custom: ["Свои компоненты", "Максимальный контроль и host-neutral; самый длинный путь."],
      "shadcn-adapter": ["shadcn-style adapter", "Быстрый React handoff с source ownership; менее host-neutral."],
      "platform-native": ["Платформенно", "Лучше для Tauri/Electron/native shells; меньше переиспользуемых web primitives."],
    },
  },
  reference_borrow_avoid: {
    prompt: "Как референсы должны влиять на дизайн?",
    label: "Референсы: взять/избежать",
    decisionUnlocked: "reference scope, borrow/avoid list и граница переиспользования старых артефактов",
    choices: {
      "functional-only": ["Только функциональный состав", "Сохраняет возможности и flow, но избегает визуального копирования."],
      "ia-only": ["Только информационная архитектура", "Берет навигацию/группировку, но оставляет визуальную систему свежей."],
      "visual-inspiration": ["Визуальное вдохновение", "Разрешает настроение/layout влияние с явными отличиями."],
      "authoritative-brand": ["Источник бренда", "Использовать только если это реальный brand/design source of truth."],
      "ignore-references": ["Игнорировать референсы", "Свежий путь; можно пропустить ожидаемые доменные паттерны."],
    },
  },
});

const RU_MODE_COPY = Object.freeze({
  "design-system-only": ["Только дизайн-система", "Остановимся после утвержденных токенов, компонентов, motion и evidence по секциям."],
  "design-system-plus-ux": ["Дизайн-система + UX spec", "Добавим IA, flow, states, inventory компонентов и черновик текста без прототипа."],
  "full-prototype-pipeline": ["Полный путь до prototype preview", "Дизайн-система, spec, copy, native prototype, preview, reviews и финальный approval gate."],
  "continue-approved-design-system": ["Продолжить утвержденную дизайн-систему", "Переиспользуем утвержденную систему и спросим только про missing extensions или surface deltas."],
});

const RU_VIEWPORT_COPY = Object.freeze({
  "actual-window": ["Текущее окно 1:1", "Лучшая desktop-точность; нужны фактический размер окна, OS scale и min-resize policy."],
  "tauri-main": ["1280x800 desktop", "Хороший baseline main-window для Tauri; не доказывает поведение маленького окна."],
  "tauri-min": ["800x600 desktop", "Ловит тесные desktop layouts; не главный рабочий сценарий."],
  "wide-desktop": ["1920x1080 desktop", "Полезно для больших мониторов; может скрыть проблемы плотности и выравнивания."],
  "web-default": ["375 + 1440 web", "Хорошее покрытие браузера; слабый proxy для desktop app windows."],
  custom: ["Свой viewport", "Использовать, когда известно железо, embedded surface или точное окно."],
});

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
  locale = null,
} = {}) {
  const resolvedLocale = normalizeLocale(locale || detectDesignLocale(brief));
  const parsed = parseDesignBriefPreferences(brief);
  const decisions = { ...parsed.decisions, ...initialDecisions };
  const explicitDefaults = parsed.explicitDefaults === true;
  const viewportPolicy = resolveDesignViewportPolicy({ target, currentWindow, deviceScaleFactor });

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
    questionQueue.push(modeQuestion(resolvedLocale));
  }

  if (needsViewportQuestion(decisions.viewport, viewportPolicy)) {
    questionQueue.push(viewportQuestion(viewportPolicy, resolvedLocale));
  }

  for (const axisId of requiredAxes) {
    questionQueue.push(axisQuestion(DESIGN_WIZARD_AXES.find((axisDef) => axisDef.id === axisId), resolvedLocale));
  }
  numberQuestionQueue(questionQueue, {
    completedCount: mode
      ? 1 + Number(!needsViewportQuestion(decisions.viewport, viewportPolicy)) + (DESIGN_WIZARD_AXES.length - missingAxes.length)
      : 0,
  });

  const guidedDefaultsChecklist = explicitDefaults
    ? DESIGN_WIZARD_AXES.map((axisDef) => guidedDefaultChecklistItem(axisDef, decisions[axisDef.id], resolvedLocale))
    : [];
  const styleboardReadiness = evaluateDesignStyleboardReadiness({ mode, target, decisions });
  const viewportPolicyRecorded = !needsViewportQuestion(decisions.viewport, viewportPolicy);

  const state = {
    schemaVersion: 1,
    locale: resolvedLocale,
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
    reviewChecks: buildDesignReviewCheckPlan({ target, viewportDecision: decisions.viewport, viewportPolicy }),
    styleboard: {
      phase: styleboardReadiness.pass ? "review-styleboard" : "diagnostic-scratch",
      requiredAxes: DESIGN_STYLEBOARD_REQUIRED_AXES,
      missingAxes: styleboardReadiness.missingAxes,
      allowedBeforePreferenceGate: "diagnostic-scratch-only",
      reviewStyleboardAllowed: styleboardReadiness.pass,
    },
    gates: {
      mandatoryQuestionsClosed: requiredAxes.length === 0 && viewportPolicyRecorded && Boolean(mode),
      tokensUnlocked: requiredAxes.length === 0 && parsed.conflicts.length === 0 && Boolean(mode),
      reviewStyleboardUnlocked: styleboardReadiness.pass,
      viewportPolicyRecorded,
      styleboardBlockedReason: styleboardReadiness.blockedReason,
      blockedReason: !mode
        ? "missing workflow mode"
        : !viewportPolicyRecorded
        ? "missing viewport policy"
        : requiredAxes.length > 0
        ? `missing wizard axes: ${requiredAxes.join(", ")}`
        : parsed.conflicts.length > 0
          ? `conflicting wizard axes: ${parsed.conflicts.map((item) => item.axis).join(", ")}`
          : null,
    },
  };
  return attachDesignWizardRuntime(state);
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
  } else if (axisId === "viewport") {
    next.decisions[axisId] = {
      axis: axisId,
      answer: answer.value || answer.choiceId || "",
      choiceId: answer.choiceId || "custom",
      source: answer.source || "user",
      confidence: Number(answer.confidence ?? 1),
      quote: answer.quote || null,
      prompt: "Viewport policy",
      decisionUnlocked: "config.json.viewports, review screenshots, and platform resize policy",
      timestamp: answer.timestamp || new Date().toISOString(),
    };
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
  const viewportPolicy = resolveDesignViewportPolicy({ target: next.target });
  const viewportPolicyRecorded = !needsViewportQuestion(next.decisions.viewport, viewportPolicy);
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
    mandatoryQuestionsClosed: missing.length === 0 && viewportPolicyRecorded && Boolean(next.mode),
    tokensUnlocked: missing.length === 0 && Boolean(next.mode),
    reviewStyleboardUnlocked: styleboardReadiness.pass,
    viewportPolicyRecorded,
    styleboardBlockedReason: styleboardReadiness.blockedReason,
    blockedReason: !next.mode
      ? "missing workflow mode"
      : !viewportPolicyRecorded
        ? "missing viewport policy"
      : missing.length > 0
        ? `missing wizard axes: ${missing.join(", ")}`
        : null,
  };
  next.questionQueue = (next.questionQueue || []).filter((question) => question.axis !== axisId);
  return attachDesignWizardRuntime(next);
}

export function transitionDesignWizardState(state = {}, event = {}) {
  const type = String(event.type || "answer").toLowerCase();
  if (type !== "answer") {
    throw new Error(`Unsupported design wizard transition: ${event.type || "(missing)"}`);
  }
  const axis = event.axis || event.answer?.axis || state.questionQueue?.[0]?.axis;
  if (!axis) throw new Error("design wizard transition requires an axis or a queued question");
  return recordDesignWizardAnswer(state, {
    ...(event.answer || {}),
    axis,
    choiceId: event.choiceId || event.answer?.choiceId,
    value: event.value || event.answer?.value,
    source: event.source || event.answer?.source || "user",
    timestamp: event.timestamp || event.answer?.timestamp,
  });
}

function buildDesignWizardRuntimeStatus(state = {}) {
  const missing = state.coverage?.missingAxes || [];
  const answered = state.coverage?.coveredAxes || [];
  const queue = state.questionQueue || [];
  const blockedReasons = [];
  if (!state.mode) blockedReasons.push("mode");
  if (state.gates?.viewportPolicyRecorded === false) blockedReasons.push("viewport");
  blockedReasons.push(...missing);
  if (state.coverage?.conflicts?.length) {
    blockedReasons.push(...state.coverage.conflicts.map((item) => `conflict:${item.axis}`));
  }
  const nextQuestion = queue[0] || null;
  return {
    schemaVersion: 1,
    answered: answered.length,
    missing: missing.length,
    queued: queue.length,
    progress: `${answered.length}/${DESIGN_WIZARD_AXES.length}`,
    mode: state.mode || null,
    target: state.target || "unknown",
    nextQuestionAxis: nextQuestion?.axis || null,
    blockedReasons,
    gates: state.gates || {},
    unlocked: {
      tokens: state.gates?.tokensUnlocked === true,
      styleboard: state.gates?.reviewStyleboardUnlocked === true,
      prototype: state.mode === "full-prototype-pipeline" && state.gates?.reviewStyleboardUnlocked === true,
    },
    resumeToken: buildDesignWizardResumeToken(state),
  };
}

export function formatDesignWizardStatus(state = {}) {
  const status = state.runtimeStatus || buildDesignWizardRuntimeStatus(state);
  return [
    "SUPERVIBE_DESIGN_WIZARD_STATUS",
    `PROGRESS: ${status.progress}`,
    `ANSWERED: ${status.answered}`,
    `MISSING: ${status.missing}`,
    `QUEUED: ${status.queued}`,
    `NEXT: ${status.nextQuestionAxis || "none"}`,
    `TOKENS_UNLOCKED: ${status.unlocked.tokens}`,
    `STYLEBOARD_UNLOCKED: ${status.unlocked.styleboard}`,
    `PROTOTYPE_UNLOCKED: ${status.unlocked.prototype}`,
    `BLOCKED: ${status.blockedReasons.join(",") || "none"}`,
    `RESUME_TOKEN: ${status.resumeToken}`,
  ].join("\n");
}

export function evaluateDesignStyleboardReadiness({ mode = null, target = null, decisions = {} } = {}) {
  const missingAxes = DESIGN_STYLEBOARD_REQUIRED_AXES.filter((axisId) => !decisions?.[axisId]);
  const missing = [];
  if (!mode) missing.push("mode");
  if (!target || String(target).toLowerCase() === "unknown") missing.push("target");
  if (!decisions?.viewport) missing.push("viewport");
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
            { width: 1920, height: 1080, exactWindow: false, role: "largeWindow" },
            { width: 1440, height: 900, exactWindow: false, role: "reviewWindow" },
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
  const locale = normalizeLocale(question.locale || detectDesignLocale(`${question.prompt || ""} ${question.why || ""}`));
  const labels = WIZARD_LABELS[locale];
  const lines = [
    `**${labels.step} ${question.step || "N"}/${question.total || "M"}: ${question.prompt || question.question || "Choose design direction"}**`,
    "",
    `${labels.why}: ${question.why || (locale === "ru" ? "Этот ответ влияет на следующий дизайн-артефакт." : "This controls the next durable design artifact.")}`,
    `${labels.decision}: ${question.decisionUnlocked || question.decision || (locale === "ru" ? "Сохраненное состояние wizard." : "Saved wizard state")}`,
    `${labels.ifSkipped}: ${question.ifSkipped || (locale === "ru" ? "Использовать безопасный дефолт только если пользователь явно делегировал выбор." : "Use the recommended safe default only when explicitly delegated by the user.")}`,
    "",
  ];
  for (const item of question.choices || []) {
    const suffix = item.recommended ? ` (${labels.recommended})` : "";
    lines.push(`- ${item.label}${suffix} - ${item.tradeoff || labels.noTradeoff}`);
  }
  lines.push("", `${labels.freeForm}: ${question.freeFormPath || (locale === "ru" ? "Ответьте своими словами, если варианты не подходят." : "Answer in your own words if none of these fit.")}`);
  lines.push(`${labels.stop}: ${question.stopCondition || (locale === "ru" ? "Остановиться: сохранить состояние и не продолжать скрыто." : "Stop here - save state and make no hidden progress.")}`);
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
    "three-directions": ["3 directions", "three directions", "2-3 alternatives", "2-3 variants"],
    "two-directions": ["2 directions", "two directions", "two variants"],
    "single-locked-direction": ["approved direction", "locked direction"],
    "system-native-locked": ["system native locked", "strict native"],
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

function localizedAxisCopy(axisDef, locale = "en") {
  const normalized = normalizeLocale(locale);
  if (normalized !== "ru") {
    return {
      label: axisDef.label,
      prompt: axisDef.prompt,
      decisionUnlocked: axisDef.decisionUnlocked,
    };
  }
  const copy = RU_AXIS_COPY[axisDef.id] || {};
  return {
    label: copy.label || axisDef.label,
    prompt: copy.prompt || axisDef.prompt,
    decisionUnlocked: copy.decisionUnlocked || axisDef.decisionUnlocked,
  };
}

function localizedChoice(choiceDef, locale = "en", scope = "") {
  const normalized = normalizeLocale(locale);
  if (normalized !== "ru") return choiceDef;
  const map = scope === "mode"
    ? RU_MODE_COPY
    : scope === "viewport"
      ? RU_VIEWPORT_COPY
      : RU_AXIS_COPY[scope]?.choices;
  const translated = map?.[choiceDef.id];
  if (!translated) return choiceDef;
  return {
    ...choiceDef,
    label: translated[0],
    tradeoff: translated[1],
  };
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

function modeQuestion(locale = "en") {
  const normalized = normalizeLocale(locale);
  return {
    id: "mode",
    axis: "mode",
    step: 1,
    total: "M",
    locale: normalized,
    prompt: normalized === "ru" ? "Какой режим дизайн-workflow запускаем?" : "Which design workflow mode should this run use?",
    why: normalized === "ru"
      ? "Так мы не остановимся слишком рано и не уйдем в прототип без вашего решения."
      : "This prevents design-system-only work from silently stopping or accidentally continuing into prototype work.",
    decisionUnlocked: "config.json.executionMode, stageTriage, and continuation boundary",
    ifSkipped: normalized === "ru"
      ? "Полный pipeline выбирается только когда brief явно просит prototype delivery; иначе лучше остановиться и спросить."
      : "Use full pipeline only when the brief clearly asks for prototype delivery; otherwise stop and ask.",
    choices: DESIGN_WIZARD_MODES.map((item, index) => ({ ...localizedChoice(item, normalized, "mode"), recommended: index === 0 })),
    freeFormPath: normalized === "ru"
      ? "Можно ответить своими словами, например: дизайн-система сейчас, прототип после approval."
      : "Name a custom boundary, for example: design system now, prototype after approval.",
    stopCondition: normalized === "ru"
      ? "Остановиться: сохранить brief и не писать durable design artifacts."
      : "Stop here - save the brief and do not write durable design artifacts.",
  };
}

function axisQuestion(axisDef, locale = "en") {
  const normalized = normalizeLocale(locale);
  const axisCopy = localizedAxisCopy(axisDef, normalized);
  return {
    id: axisDef.id,
    axis: axisDef.id,
    step: "N",
    total: "M",
    locale: normalized,
    prompt: axisCopy.prompt,
    why: normalized === "ru"
      ? `${axisCopy.label} сильно меняет ощущение продукта, даже если технически можно идти дальше.`
      : `${axisCopy.label} is not a blocker syntactically, but it materially changes the product feel.`,
    decisionUnlocked: axisCopy.decisionUnlocked,
    ifSkipped: normalized === "ru"
      ? "Рекомендованный дефолт можно использовать только если пользователь явно делегировал этот выбор."
      : "Only use the recommended default when the user explicitly delegates this axis.",
    choices: axisDef.choices.map((item) => ({ ...localizedChoice(item, normalized, axisDef.id), recommended: item.id === axisDef.defaultChoiceId })),
    freeFormPath: normalized === "ru"
      ? "Можно написать свой стиль, референс или ограничение, если варианты не подходят."
      : "Answer with a different style, reference, or constraint if none of these options fit.",
    stopCondition: normalized === "ru"
      ? "Остановиться: оставить wizard в draft и не создавать tokens."
      : "Stop here - keep the wizard state draft and do not create tokens.",
    minChoices: Math.min(axisDef.choices.length, 3),
  };
}

function viewportQuestion(policy, locale = "en") {
  const normalized = normalizeLocale(locale);
  return {
    id: "viewport",
    axis: "viewport",
    step: "N",
    total: "M",
    locale: normalized,
    prompt: policy.requiresActualWindowQuestion
      ? (normalized === "ru" ? "Какой desktop viewport будет главным 1:1 review target?" : "Which desktop viewport should be the primary 1:1 review target?")
      : (normalized === "ru" ? "Какую viewport policy используем для review?" : "Which viewport policy should be used for review?"),
    why: normalized === "ru"
      ? "Viewport policy решает, проверяем ли реальную поверхность или только общий browser size."
      : "Viewport policy controls whether the design proves the actual surface or only a generic browser size.",
    decisionUnlocked: "config.json.viewports, review screenshots, and platform resize policy",
    ifSkipped: policy.requiresActualWindowQuestion
      ? (normalized === "ru" ? "Использовать 1920x1080, 1440x900, 1280x800 и 800x600, записав exactWindow=false." : "Use 1920x1080, 1440x900, 1280x800, and 800x600, then record exactWindow=false.")
      : (normalized === "ru" ? "Использовать web defaults 375px и 1440px." : "Use web defaults 375px and 1440px."),
    choices: policy.choices.map((item, index) => ({ ...localizedChoice(item, normalized, "viewport"), recommended: index === 0 })),
    freeFormPath: normalized === "ru"
      ? "Укажите width, height, OS scale, min window, secondary window или target monitor."
      : "Provide width, height, OS scale, min window, secondary window, or monitor target.",
    stopCondition: normalized === "ru"
      ? "Остановиться: без recorded viewport policy prototype preview не запускается."
      : "Stop here - no prototype preview until viewport policy is recorded.",
  };
}

function detectViewportPreference(text) {
  const sizeMatch = String(text).match(/\b(\d{3,4})\s*[xX]\s*(\d{3,4})\b/);
  if (!sizeMatch && !/\bfull\s*hd\b|\bfullhd\b|фулл\s*hd|фуллхд|полный\s*hd/i.test(String(text || ""))) return null;
  const width = sizeMatch?.[1] || "1920";
  const height = sizeMatch?.[2] || "1080";
  return {
    axis: "viewport",
    answer: `${width}x${height}`,
    choiceId: "custom",
    source: "user",
    confidence: 0.85,
    quote: sizeMatch?.[0] || "FullHD",
    prompt: "Viewport policy",
    decisionUnlocked: "config.json.viewports",
    timestamp: DEFAULT_TIMESTAMP,
  };
}

export function buildDesignReviewCheckPlan({
  target = "web",
  viewportDecision = null,
  viewportPolicy = null,
} = {}) {
  const normalized = String(target || "web").toLowerCase();
  const desktop = /tauri|electron|desktop|native-app|app-shell/.test(normalized);
  const decisionViewport = viewportFromDecision(viewportDecision);
  const policyViewports = Array.isArray(viewportPolicy?.defaultViewports) ? viewportPolicy.defaultViewports : [];
  const screenshotViewports = desktop
    ? dedupeViewports([
        decisionViewport,
        { width: 1920, height: 1080, role: "fullHd" },
        { width: 1440, height: 900, role: "desktopReview" },
        { width: 1280, height: 800, role: "mainWindow" },
        ...policyViewports,
      ])
    : dedupeViewports([
        decisionViewport,
        { width: 375, height: 812, role: "mobile" },
        { width: 1440, height: 900, role: "desktop" },
        { width: 1920, height: 1080, role: "wideDesktop" },
        ...policyViewports,
      ]);
  return {
    schemaVersion: 1,
    target: normalized,
    screenshotViewports,
    checks: [
      "screenshot-render",
      "canvas-nonblank",
      "dom-overflow",
      "text-overlap",
      "contrast-audit",
      "focus-visible",
      "reduced-motion",
      ...(desktop ? ["tauri-webview-smoke"] : []),
    ],
  };
}

function needsViewportQuestion(viewportDecision, policy) {
  if (!viewportDecision) return true;
  if (!policy?.requiresActualWindowQuestion) return false;
  return !viewportFromDecision(viewportDecision);
}

function viewportFromDecision(viewportDecision) {
  const answer = String(viewportDecision?.answer || viewportDecision?.value || "");
  const match = answer.match(/\b(\d{3,4})\s*[xX]\s*(\d{3,4})\b/);
  if (!match) return null;
  return {
    width: Number(match[1]),
    height: Number(match[2]),
    role: "primary",
    source: viewportDecision.source || "user",
  };
}

function dedupeViewports(viewports) {
  const seen = new Set();
  const out = [];
  for (const viewport of viewports || []) {
    if (!viewport?.width || !viewport?.height) continue;
    const key = `${viewport.width}x${viewport.height}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(viewport);
  }
  return out;
}

function numberQuestionQueue(questionQueue, { completedCount = 0, totalCount = null } = {}) {
  const total = totalCount || questionQueue.length + completedCount;
  for (const [index, question] of questionQueue.entries()) {
    question.step = completedCount + index + 1;
    question.total = total;
  }
  return questionQueue;
}

function attachDesignWizardRuntime(state = {}) {
  const runtimeStatus = buildDesignWizardRuntimeStatus(state);
  return {
    ...state,
    runtimeStatus,
    resumeToken: runtimeStatus.resumeToken,
  };
}

function buildDesignWizardResumeToken(state = {}) {
  const payload = {
    mode: state.mode || null,
    target: state.target || "unknown",
    covered: state.coverage?.coveredAxes || [],
    missing: state.coverage?.missingAxes || [],
    next: state.questionQueue?.[0]?.axis || null,
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url").slice(0, 32);
}

function detectDesignLocale(text) {
  return /[а-яё]/i.test(String(text || "")) ? "ru" : "en";
}

function normalizeLocale(locale) {
  return String(locale || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
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
