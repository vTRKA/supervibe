import {
  buildSpecialistQuestionProposal,
} from "./specialist-question-contract.mjs";

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
      choice("operational-clarity", "Operations scan layer", "Prioritizes fast repeated scanning; can feel restrained if the product needs stronger memory."),
      choice("technical-command-center", "Instrumented control surface", "Makes system state and expert controls explicit; can add weight for casual users."),
      choice("premium-editorial", "Narrative polish layer", "Creates a more memorable product voice; gives up some utilitarian density."),
      choice("warm-product-utility", "Guided utility layer", "Makes workflows feel approachable; can under-signal rigor for risky admin tasks."),
      choice("bold-launch-energy", "High-signal launch layer", "Creates strong first-visit momentum; raises fatigue risk for daily operators."),
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

const DESIGN_QUESTION_OWNERS = Object.freeze({
  mode: { stage: "stage-0-orchestrator", specialist: "supervibe-orchestrator", blocks: ["config.json.mode", "stageTriage"] },
  viewport: { stage: "stage-0-orchestrator", specialist: "supervibe-orchestrator", blocks: ["config.json.viewports", "review screenshots"] },
  creative_alternatives: { stage: "stage-1-brand-direction", specialist: "creative-director", blocks: ["direction.md", "tokens", "styleboard"] },
  anti_generic_guardrail: { stage: "stage-1-brand-direction", specialist: "creative-director", blocks: ["direction.md", "critique gate"] },
  visual_direction_tone: { stage: "stage-1-brand-direction", specialist: "creative-director", blocks: ["direction.md", "tokens"] },
  audience_trust_posture: { stage: "stage-1-brand-direction", specialist: "creative-director", blocks: ["direction.md", "copy tone", "assurance cues"] },
  information_density: { stage: "stage-2-design-system", specialist: "ux-ui-designer", blocks: ["spacing-density", "screen spec"] },
  typography_personality: { stage: "stage-2-design-system", specialist: "supervibe:brandbook", blocks: ["tokens.css", "type scale"] },
  palette_mood: { stage: "stage-2-design-system", specialist: "supervibe:brandbook", blocks: ["tokens.css", "semantic colors"] },
  motion_intensity: { stage: "stage-2-design-system", specialist: "supervibe:brandbook", blocks: ["motion.css", "reduced-motion policy"] },
  component_feel: { stage: "stage-2-design-system", specialist: "ux-ui-designer", blocks: ["component docs", "library adapter"] },
  reference_borrow_avoid: { stage: "stage-0-design-intelligence", specialist: "supervibe:design-intelligence", blocks: ["reference scope", "borrow/avoid list"] },
});

const DEFAULT_AXIS_ORDER = Object.freeze(DESIGN_WIZARD_AXES.map((axisDef) => axisDef.id));

const DESIGN_QUESTION_PROFILES = Object.freeze({
  default: {
    id: "default",
    viewportPlacement: "early",
    axisOrder: DEFAULT_AXIS_ORDER,
    recommendedChoices: {},
  },
  desktopOps: {
    id: "desktopOps",
    viewportPlacement: "early",
    axisOrder: [
      "information_density",
      "component_feel",
      "audience_trust_posture",
      "anti_generic_guardrail",
      "visual_direction_tone",
      "typography_personality",
      "palette_mood",
      "motion_intensity",
      "creative_alternatives",
      "reference_borrow_avoid",
    ],
    recommendedChoices: {
      information_density: "compact",
      component_feel: "platform-native",
      audience_trust_posture: "professional-calm",
      motion_intensity: "strict",
      visual_direction_tone: "operational-clarity",
    },
  },
  brandLaunch: {
    id: "brandLaunch",
    viewportPlacement: "after-creative",
    axisOrder: [
      "visual_direction_tone",
      "creative_alternatives",
      "palette_mood",
      "typography_personality",
      "motion_intensity",
      "audience_trust_posture",
      "information_density",
      "component_feel",
      "anti_generic_guardrail",
      "reference_borrow_avoid",
    ],
    recommendedChoices: {
      visual_direction_tone: "bold-launch-energy",
      creative_alternatives: "three-directions",
      palette_mood: "light-first",
      typography_personality: "geometric",
      motion_intensity: "expressive",
      audience_trust_posture: "consumer-friendly",
      information_density: "comfortable",
    },
  },
  regulatedTrust: {
    id: "regulatedTrust",
    viewportPlacement: "after-first-axis",
    axisOrder: [
      "audience_trust_posture",
      "information_density",
      "palette_mood",
      "typography_personality",
      "motion_intensity",
      "component_feel",
      "visual_direction_tone",
      "anti_generic_guardrail",
      "creative_alternatives",
      "reference_borrow_avoid",
    ],
    recommendedChoices: {
      audience_trust_posture: "regulated-assurance",
      palette_mood: "high-contrast",
      motion_intensity: "strict",
      visual_direction_tone: "operational-clarity",
      typography_personality: "system-native",
    },
  },
  developerTool: {
    id: "developerTool",
    viewportPlacement: "after-first-axis",
    axisOrder: [
      "component_feel",
      "typography_personality",
      "information_density",
      "visual_direction_tone",
      "palette_mood",
      "motion_intensity",
      "audience_trust_posture",
      "anti_generic_guardrail",
      "creative_alternatives",
      "reference_borrow_avoid",
    ],
    recommendedChoices: {
      component_feel: "radix-headless",
      typography_personality: "code-first",
      information_density: "compact",
      visual_direction_tone: "technical-command-center",
      palette_mood: "graphite-cyan",
      audience_trust_posture: "expert-power",
    },
  },
  referenceRefresh: {
    id: "referenceRefresh",
    viewportPlacement: "after-first-axis",
    axisOrder: [
      "reference_borrow_avoid",
      "anti_generic_guardrail",
      "visual_direction_tone",
      "creative_alternatives",
      "information_density",
      "component_feel",
      "typography_personality",
      "palette_mood",
      "motion_intensity",
      "audience_trust_posture",
    ],
    recommendedChoices: {
      reference_borrow_avoid: "functional-only",
      anti_generic_guardrail: "avoid-old-shell-repaint",
      creative_alternatives: "three-directions",
    },
  },
});

const CONTEXTUAL_AXIS_PROMPTS = Object.freeze({
  brandLaunch: {
    visual_direction_tone: "What first-impression direction should make {subject} feel specific rather than generic?",
    palette_mood: "Which color world best supports the offer, conversion moment, and brand memory?",
    typography_personality: "What type voice should carry the headline, proof points, and product UI together?",
    motion_intensity: "How expressive should motion be before it starts competing with the offer?",
    creative_alternatives: "Which launch directions should the creative director compare for {subject}?",
    information_density: "How much information should {subject} show before the call to action starts to feel crowded?",
  },
  regulatedTrust: {
    audience_trust_posture: "What trust posture must be visible before any user studies the details?",
    palette_mood: "Which palette gives audit-grade clarity without making the product feel hostile?",
    motion_intensity: "How restrained should motion be for a high-trust workflow?",
    creative_alternatives: "Which trust-building directions should be compared for {subject}?",
    information_density: "How dense can {subject} become before audit clarity and confidence suffer?",
  },
  developerTool: {
    component_feel: "What component model best supports power-user speed, keyboard work, and implementation handoff?",
    typography_personality: "How much developer-native typography should the interface expose?",
    information_density: "How much operational density can expert users handle before scanning breaks?",
    creative_alternatives: "Which product directions should the creative director compare for {subject}?",
  },
  desktopOps: {
    information_density: "How dense should the working surface be for repeated desktop sessions?",
    component_feel: "Which component feel best matches the host shell and resize constraints?",
    audience_trust_posture: "What trust signal should operators see while working quickly?",
    creative_alternatives: "Which desktop workspace directions should be compared for {subject}?",
  },
  referenceRefresh: {
    reference_borrow_avoid: "What exactly may survive from the reference, and what must be redesigned from scratch?",
    anti_generic_guardrail: "Which old-shell or generic pattern must the new design actively reject?",
    creative_alternatives: "Which redesign directions should be compared before {subject} inherits any old-shell decisions?",
    information_density: "How much density should {subject} keep from the reference before it starts feeling like a repaint?",
  },
});

const CONTEXTUAL_AXIS_PROMPTS_RU = Object.freeze({
  brandLaunch: {
    visual_direction_tone: "Какое первое впечатление должно сделать {subject}, чтобы запуск не выглядел шаблонно?",
    palette_mood: "Какая цветовая среда поддержит оффер, конверсию и запоминаемость {subject}?",
    typography_personality: "Какой голос типографики должен связать заголовки, доказательства и UI {subject}?",
    motion_intensity: "Насколько выразительным может быть motion в {subject}, прежде чем он начнет спорить с оффером?",
    creative_alternatives: "Какие launch-направления creative director должен сравнить для {subjectGen}?",
    information_density: "Сколько информации может показать {subject}, пока первый CTA не начал теряться?",
  },
  regulatedTrust: {
    audience_trust_posture: "Какое доверие {subject} должен показать до того, как пользователь начнет читать детали?",
    palette_mood: "Какая палитра даст {subject} audit-grade ясность без ощущения враждебности?",
    motion_intensity: "Насколько сдержанным должен быть motion в {subject} для high-trust workflow?",
    creative_alternatives: "Какие trust-направления нужно сравнить для {subjectGen}?",
    information_density: "Какую плотность выдержит {subject}, прежде чем пострадают audit clarity и уверенность?",
  },
  developerTool: {
    component_feel: "Какая компонентная модель даст {subject} скорость power-user, клавиатурность и чистый handoff?",
    typography_personality: "Сколько developer-native типографики должен показать {subject}?",
    information_density: "Какую плотность выдержит {subject}, прежде чем сломается сканирование?",
    creative_alternatives: "Какие продуктовые направления creative director должен сравнить для {subjectGen}?",
  },
  desktopOps: {
    information_density: "Какой ритм плотности нужен для {subjectGen} при повторной desktop-работе?",
    component_feel: "Какие компоненты лучше совпадут с shell, resize и desktop-ограничениями {subject}?",
    audience_trust_posture: "Какой сигнал доверия оператор должен видеть в {subject}, пока работает быстро?",
    creative_alternatives: "Какие desktop-направления нужно сравнить для {subjectGen}?",
  },
  referenceRefresh: {
    reference_borrow_avoid: "Что именно может пережить редизайн {subjectGen}, а что надо собрать заново?",
    anti_generic_guardrail: "Какой old-shell или generic pattern {subject} должен активно отвергнуть?",
    creative_alternatives: "Какие redesign-направления сравнить, прежде чем {subject} унаследует старые решения?",
    information_density: "Какую плотность {subject} может сохранить из референса, прежде чем это станет перекраской?",
  },
});

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
      "operational-clarity": ["Слой быстрого сканирования", "Ускоряет повторную работу; может быть сдержанным, если продукту нужна сильная память."],
      "technical-command-center": ["Инструментальная поверхность контроля", "Явно показывает состояние системы и экспертные controls; может добавить веса новичкам."],
      "premium-editorial": ["Слой продуктовой подачи", "Дает более запоминаемый голос; уступает часть утилитарной плотности."],
      "warm-product-utility": ["Направляющая утилитарность", "Делает workflow понятнее и мягче; может слабее показывать строгость рискованных задач."],
      "bold-launch-energy": ["Высокий launch-сигнал", "Создает сильный первый импульс; повышает риск усталости для ежедневных операторов."],
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
  const questionStrategy = buildDesignQuestionStrategy({
    brief,
    target,
    mode,
    decisions,
    viewportPolicy,
  });

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
    questionQueue.push(modeQuestion(resolvedLocale, questionStrategy));
  }

  const viewportNeeded = needsViewportQuestion(decisions.viewport, viewportPolicy);
  const axisQuestions = orderedDesignAxisIds(requiredAxes, questionStrategy)
    .map((axisId) => axisQuestion(DESIGN_WIZARD_AXES.find((axisDef) => axisDef.id === axisId), resolvedLocale, questionStrategy));
  const viewport = viewportNeeded ? viewportQuestion(viewportPolicy, resolvedLocale, questionStrategy) : null;
  questionQueue.push(...interleaveViewportQuestion(axisQuestions, viewport, questionStrategy));
  numberQuestionQueue(questionQueue, {
    completedCount: mode
      ? 1 + Number(!viewportNeeded) + (DESIGN_WIZARD_AXES.length - missingAxes.length)
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
    questionStrategy,
    questionQueue,
    questionProposals: questionQueue.map((question) => specialistQuestionProposal(question)),
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

export function formatDesignWizardQuestion(question = {}, options = {}) {
  if (options.protocol === true || options.mode === "protocol") {
    return formatDesignWizardProtocolQuestion(question);
  }
  return formatDesignWizardConversationalQuestion(question, options);
}

export function formatDesignWizardProtocolQuestion(question = {}) {
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

function formatDesignWizardConversationalQuestion(question = {}, options = {}) {
  const locale = normalizeLocale(question.locale || detectDesignLocale(`${question.prompt || ""} ${question.why || ""}`));
  const choices = Array.isArray(question.choices) ? question.choices : [];
  const recommended = choices.find((item) => item.recommended) || choices[0] || null;
  const visibleChoices = orderChoicesForConversation(choices, recommended);
  const prompt = question.prompt || question.question || (locale === "ru" ? "Какой дизайн-выбор фиксируем дальше?" : "Which design choice should we lock next?");
  const lead = conversationalLeadForQuestion(question, recommended, locale, options);
  const lines = [
    `**${prompt}**`,
    "",
    lead,
    "",
  ];

  for (const item of visibleChoices) {
    lines.push(`- **${item.label}** - ${item.tradeoff || (locale === "ru" ? "Компромисс не указан." : "No tradeoff provided.")}`);
  }

  lines.push("");
  lines.push(locale === "ru"
    ? "Можно выбрать вариант выше или ответить своими словами; если стоп, я сохраню текущее состояние без скрытого продолжения."
    : "Pick one option above or answer in your own words; stop means I save the current state without hidden continuation.");
  return lines.join("\n");
}

function orderChoicesForConversation(choices = [], recommended = null) {
  if (!recommended) return choices;
  return [recommended, ...choices.filter((item) => item !== recommended)];
}

function conversationalLeadForQuestion(question = {}, recommended = null, locale = "en", options = {}) {
  const decision = question.decisionUnlocked || question.decision || "";
  const why = question.whyNow || question.why || "";
  const detail = [why, decision].filter(Boolean).join(locale === "ru" ? " " : " ");
  const owner = ownerVoicePrefix(question.ownerAgent || question.specialist, locale);
  const recommendedCopy = recommended
    ? (locale === "ru"
      ? `Я бы начал с **${recommended.label}**, но это только стартовая гипотеза, а не закрытый дефолт.`
      : `I would start with **${recommended.label}**, but treat it as a starting hypothesis, not a locked default.`)
    : (locale === "ru"
      ? "Нужно зафиксировать один выбор, чтобы следующий producer работал с понятной рамкой."
      : "One choice needs to be locked so the next producer works from a clear boundary.");
  const lead = owner ? `${owner} ${recommendedCopy}` : recommendedCopy;
  if (options.compact === true || !detail) return lead;
  return `${lead} ${detail}`;
}

function ownerVoicePrefix(ownerAgent = "", locale = "en") {
  const owner = String(ownerAgent || "");
  if (!owner) return "";
  const label = {
    "creative-director": locale === "ru" ? "Креативный директор:" : "Creative director:",
    "ux-ui-designer": locale === "ru" ? "UX/UI дизайнер:" : "UX/UI designer:",
    "supervibe:brandbook": locale === "ru" ? "Brandbook producer:" : "Brandbook producer:",
    "supervibe:design-intelligence": locale === "ru" ? "Design intelligence:" : "Design intelligence:",
    "supervibe-orchestrator": locale === "ru" ? "Оркестратор:" : "Orchestrator:",
  }[owner];
  return label || `${owner}:`;
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

function buildDesignQuestionStrategy({
  brief = "",
  target = "web",
  mode = null,
  decisions = {},
  viewportPolicy = null,
} = {}) {
  const text = `${brief || ""} ${target || ""}`.toLowerCase();
  const profileId = inferDesignQuestionProfile(text, target);
  const profile = DESIGN_QUESTION_PROFILES[profileId] || DESIGN_QUESTION_PROFILES.default;
  const signals = designQuestionSignals(text, target);
  const recommendedChoices = {
    ...profile.recommendedChoices,
    mode: inferDesignWorkflowModeChoice(text, profileId, mode),
    ...(isDesktopTarget(target) ? { component_feel: "platform-native" } : {}),
  };
  const decisionChoiceIds = Object.fromEntries(Object.entries(decisions || {}).map(([axisId, decision]) => [axisId, decision?.choiceId || null]));
  return {
    schemaVersion: 1,
    profile: profile.id,
    signals,
    subject: inferDesignQuestionSubject(text, target, signals),
    axisOrder: profile.axisOrder,
    viewportPlacement: viewportPolicy?.requiresActualWindowQuestion ? "early" : profile.viewportPlacement,
    recommendedChoices,
    decisionsCount: Object.keys(decisions || {}).length,
    decisionChoiceIds,
    evidence: designQuestionEvidence({ profileId: profile.id, signals, target, decisions }),
  };
}

function inferDesignQuestionProfile(text = "", target = "web") {
  const signals = designQuestionSignals(text, target);
  if (signals.referenceRefresh) return "referenceRefresh";
  if (signals.brandLaunch) return "brandLaunch";
  if (signals.regulatedTrust) return "regulatedTrust";
  if (signals.developerTool) return "developerTool";
  if (signals.desktopOps || signals.desktopTarget) return "desktopOps";
  return "default";
}

function designQuestionSignals(text = "", target = "web") {
  const haystack = `${text || ""} ${target || ""}`.toLowerCase();
  return {
    desktopTarget: isDesktopTarget(target) || hasAny(haystack, ["tauri", "electron", "desktop", "desktop app", "native app", "app shell", "windows app", "десктоп", "десктопн", "настольн", "таури"]),
    desktopOps: hasAny(haystack, ["dashboard", "admin", "operator", "support", "backoffice", "ops", "table", "grid", "queue", "monitoring", "control plane", "админ", "оператор", "таблиц", "очеред", "мониторинг"]),
    brandLaunch: hasAny(haystack, ["landing", "marketing", "launch", "homepage", "hero", "conversion", "campaign", "waitlist", "portfolio", "brand page", "лендинг", "маркетинг", "запуск", "главная", "конверси"]),
    regulatedTrust: hasAny(haystack, ["compliance", "audit", "bank", "finance", "fintech", "medical", "healthcare", "security", "soc2", "privacy", "risk", "regulated", "комплаенс", "аудит", "банк", "финанс", "медицин", "безопасн", "приват", "риск"]),
    developerTool: hasAny(haystack, ["developer", "code", "codex", "agent", "api", "cli", "sdk", "terminal", "prompt", "devtool", "debug", "разработ", "код", "агент", "api", "cli", "терминал", "промпт", "дебаг"]),
    referenceRefresh: hasAny(haystack, ["old prototype", "previous prototype", "existing prototype", "old shell", "screenshot", "figma", "reference", "redesign", "rework", "старый прототип", "старые прототипы", "старый shell", "скриншот", "референс", "редизайн", "переработ"]),
    agentChat: hasAny(haystack, ["agent chat", "agentic chat", "chat system", "conversation workspace", "агентск", "агентская система чатов", "чат", "чаты", "диалог"]),
  };
}

function designQuestionEvidence({ profileId = "default", signals = {}, target = "web", decisions = {} } = {}) {
  const evidence = [`question profile: ${profileId}`];
  if (signals.desktopTarget || isDesktopTarget(target)) evidence.push("desktop/Tauri target requires real viewport and resize evidence");
  if (signals.agentChat) evidence.push("agent chat workspace signal from brief");
  if (signals.developerTool) evidence.push("developer workflow, traces, code, or terminal signal from brief");
  if (signals.referenceRefresh) evidence.push("old/reference artifact signal requires explicit borrow/avoid scope");
  if (signals.desktopOps) evidence.push("operator dashboard/table/queue density signal from brief");
  if (signals.regulatedTrust) evidence.push("audit, privacy, risk, or compliance signal from brief");
  if (signals.brandLaunch) evidence.push("launch, hero, conversion, or marketing signal from brief");
  if (decisions?.typography_personality?.choiceId === "code-first") evidence.push("user or brief already points to code-first trace typography");
  if (Object.keys(decisions || {}).length > 0) evidence.push(`saved wizard decisions: ${Object.keys(decisions).length}`);
  return [...new Set(evidence)];
}

function inferDesignWorkflowModeChoice(text = "", profileId = "default", mode = null) {
  if (mode) return mode;
  if (hasAny(text, ["prototype", "preview", "clickable", "html", "screen", "handoff", "tauri", "electron", "full pipeline"])) {
    return "full-prototype-pipeline";
  }
  if (hasAny(text, ["ux spec", "screen spec", " user flow", "flow map", "information architecture", "wireframe", "states"])) {
    return "design-system-plus-ux";
  }
  if (hasAny(text, ["tokens", "brandbook", "design system", "styleboard"])) {
    return "design-system-only";
  }
  if (profileId === "brandLaunch") return "full-prototype-pipeline";
  return "design-system-only";
}

function orderedDesignAxisIds(axisIds = [], strategy = {}) {
  const wanted = new Set(axisIds);
  const ordered = [];
  for (const axisId of strategy.axisOrder || DEFAULT_AXIS_ORDER) {
    if (wanted.has(axisId)) {
      ordered.push(axisId);
      wanted.delete(axisId);
    }
  }
  return [...ordered, ...axisIds.filter((axisId) => wanted.has(axisId))];
}

function interleaveViewportQuestion(axisQuestions = [], viewportQuestionDef = null, strategy = {}) {
  if (!viewportQuestionDef) return axisQuestions;
  const placement = strategy.viewportPlacement || "early";
  if (placement === "after-creative") {
    const creativeCount = Math.min(2, axisQuestions.length);
    return [...axisQuestions.slice(0, creativeCount), viewportQuestionDef, ...axisQuestions.slice(creativeCount)];
  }
  if (placement === "after-first-axis" && axisQuestions.length > 0) {
    return [axisQuestions[0], viewportQuestionDef, ...axisQuestions.slice(1)];
  }
  return [viewportQuestionDef, ...axisQuestions];
}

function recommendedChoiceIdFor(axisId, strategy = {}, fallback = null) {
  return strategy.recommendedChoices?.[axisId] || fallback;
}

function contextualPromptFor(axisId, fallbackPrompt, locale = "en", strategy = {}) {
  const normalized = normalizeLocale(locale);
  const promptMap = normalized === "ru" ? CONTEXTUAL_AXIS_PROMPTS_RU : CONTEXTUAL_AXIS_PROMPTS;
  const prompt = promptMap[strategy.profile]?.[axisId] || fallbackPrompt;
  return hydrateQuestionText(prompt, strategy, normalized);
}

function contextualWhyFor(axisId, axisLabel, locale = "en", strategy = {}) {
  const normalized = normalizeLocale(locale);
  const subject = subjectForLocale(strategy.subject, normalized, "genitive");
  if (normalized === "ru") {
    return `Этот выбор меняет конкретный сценарий ${subject}; это не общий пункт анкеты и не безопасный шаблон.`;
  }
  return `${axisLabel} changes the concrete ${subject} experience; this is not a reusable questionnaire default.`;
}

function contextualChoicesFor(axisDef, locale = "en", strategy = {}) {
  const normalized = normalizeLocale(locale);
  const recommendedChoice = recommendedChoiceIdFor(axisDef.id, strategy, axisDef.defaultChoiceId);
  const choiceIds = contextualChoiceIdsFor(axisDef.id, strategy);
  const choices = choiceIds
    ? choiceIds.map((choiceId) => axisDef.choices.find((item) => item.id === choiceId)).filter(Boolean)
    : axisDef.choices;
  return choices.map((item) => {
    const baseChoice = localizedChoice(item, normalized, axisDef.id);
    const contextual = contextualChoiceFor(axisDef.id, item.id, baseChoice, normalized, strategy);
    return {
      ...contextual,
      recommended: item.id === recommendedChoice,
    };
  });
}

function contextualChoiceIdsFor(axisId, strategy = {}) {
  if (axisId !== "visual_direction_tone") return null;
  const profile = strategy.profile || "default";
  const signals = strategy.signals || {};
  if (signals.brandLaunch || profile === "brandLaunch") {
    return ["bold-launch-energy", "premium-editorial", "warm-product-utility", "operational-clarity"];
  }
  if (signals.regulatedTrust || profile === "regulatedTrust") {
    return ["operational-clarity", "technical-command-center", "premium-editorial", "warm-product-utility"];
  }
  if (signals.referenceRefresh || profile === "referenceRefresh") {
    return ["operational-clarity", "technical-command-center", "premium-editorial", "warm-product-utility"];
  }
  if (signals.agentChat || signals.developerTool || profile === "developerTool") {
    return ["technical-command-center", "operational-clarity", "premium-editorial", "warm-product-utility"];
  }
  if (signals.desktopTarget || profile === "desktopOps") {
    return ["operational-clarity", "technical-command-center", "warm-product-utility", "premium-editorial"];
  }
  return null;
}

function withChoiceImpacts(choices = [], axisId = "design", strategy = {}) {
  return choices.map((choiceItem) => ({
    ...choiceItem,
    unlocks: choiceUnlocksFor(axisId, choiceItem.id, strategy),
    risk: choiceRiskFor(axisId, choiceItem),
    evidence: choiceEvidenceFor(axisId, choiceItem.id, strategy),
    artifactImpact: choiceArtifactImpactFor(axisId, choiceItem.id, strategy),
  }));
}

function choiceUnlocksFor(axisId = "design", choiceId = "", strategy = {}) {
  const owner = DESIGN_QUESTION_OWNERS[axisId] || DESIGN_QUESTION_OWNERS.mode;
  const base = [
    ...(owner.blocks || []),
    artifactUnlockForChoice(axisId, choiceId),
  ].filter(Boolean);
  if (strategy.signals?.agentChat) base.push("agent trace workspace hierarchy");
  if (strategy.signals?.desktopTarget) base.push("desktop resize and viewport review plan");
  return [...new Set(base)].slice(0, 5);
}

function artifactUnlockForChoice(axisId = "", choiceId = "") {
  if (axisId === "mode") return "continuation boundary";
  if (axisId === "viewport") return "screenshot viewport matrix";
  if (axisId === "information_density") return "trace rail density and scan rhythm";
  if (axisId === "typography_personality" && choiceId === "code-first") return "code block and trace typography";
  if (axisId === "component_feel") return "component implementation ownership";
  if (axisId === "reference_borrow_avoid") return "old artifact reuse boundary";
  return "next specialist output shape";
}

function choiceEvidenceFor(axisId = "design", choiceId = "", strategy = {}) {
  const owner = DESIGN_QUESTION_OWNERS[axisId] || DESIGN_QUESTION_OWNERS.mode;
  const evidence = [
    ...(strategy.evidence || []),
    `artifact impact: ${choiceArtifactImpactFor(axisId, choiceId, strategy)}`,
    `owner specialist: ${owner.specialist}`,
  ];
  if (strategy.signals?.agentChat) evidence.push("product risk: pending approvals, subagents, tool calls, traces, and memory proposals compete for first-layer hierarchy");
  if (strategy.signals?.referenceRefresh) evidence.push("old prototype signal: reference must become flows/states/capabilities, not visual shell reuse");
  if (strategy.signals?.developerTool) evidence.push("code/workflow signal: command, terminal, API log, or Code Graph surface in brief");
  if (axisId === "reference_borrow_avoid") evidence.push("artifact impact: reference-inventory.md borrow/avoid boundary");
  return [...new Set(evidence)].filter(Boolean).slice(0, 6);
}

function choiceArtifactImpactFor(axisId = "design", choiceId = "", strategy = {}) {
  const owner = DESIGN_QUESTION_OWNERS[axisId] || DESIGN_QUESTION_OWNERS.mode;
  const base = owner.blocks?.join(", ") || "next specialist artifact";
  if (axisId === "mode") return "config.json executionMode, stage triage, and continuation boundary";
  if (axisId === "viewport") return "config.json viewports, screenshot matrix, and resize review policy";
  if (axisId === "creative_alternatives") return "direction.md alternatives, selected direction, rejected rationale, and styleboard framing";
  if (axisId === "reference_borrow_avoid") return "reference-inventory.md, borrow/avoid list, and old-artifact reuse boundary";
  if (axisId === "information_density") return "screen spec density, trace rail hierarchy, table/card sizing, and styleboard spacing";
  if (axisId === "component_feel") return "component inventory, implementation adapter, interaction states, and handoff ownership";
  if (axisId === "palette_mood") return "tokens.css color ramps, semantic aliases, chart/accent policy, and contrast review";
  if (axisId === "typography_personality") return "tokens.css type stack, scale, mono usage, and language fallback";
  if (axisId === "motion_intensity") return "motion.css timing tiers, reduced-motion policy, and transition budget";
  if (axisId === "audience_trust_posture") return "direction.md trust posture, assurance cues, and copy tone";
  return `${base}${choiceId ? ` for ${choiceId}` : ""}`;
}

function choiceRiskFor(axisId = "design", choice = {}) {
  const tradeoff = String(choice.tradeoff || "");
  const riskMatch = tradeoff.match(/(?:risk|risks?|may|может|риск|выше)\b[^.;]*/i);
  if (riskMatch) return riskMatch[0].trim();
  if (axisId === "mode" && choice.id === "design-system-only") return "May stop before prototype evidence if the user expects a draft build.";
  if (axisId === "viewport") return "Wrong viewport can hide overflow, density, focus, and resize defects.";
  if (axisId === "information_density") return "May reduce readability or hide critical workflow hierarchy.";
  if (axisId === "motion_intensity") return "May create fatigue, reduced-motion gaps, or performance noise.";
  return "May optimize this stage while weakening a downstream specialist constraint.";
}

function evidenceForQuestion(axisId = "design", strategy = {}) {
  const owner = DESIGN_QUESTION_OWNERS[axisId] || DESIGN_QUESTION_OWNERS.mode;
  return [
    ...(strategy.evidence || []),
    `owner stage: ${owner.stage}`,
    `owner agent: ${owner.specialist}`,
    ...(axisId === "viewport" ? ["viewport policy gates review screenshots"] : []),
    ...(axisId === "mode" ? ["mode controls whether prototype stages unlock"] : []),
  ].filter(Boolean).slice(0, 8);
}

function whyNowForQuestion(axisId = "design", locale = "en", strategy = {}) {
  const normalized = normalizeLocale(locale);
  const subject = subjectForLocale(strategy.subject, normalized, "genitive");
  const profile = strategy.profile || "default";
  if (axisId === "mode") {
    return normalized === "ru"
      ? `Сначала нужен boundary workflow для ${subject}, иначе state machine может преждевременно остановиться или перейти в prototype без явного выбора.`
      : `Workflow boundary must be chosen first for ${subject}, or the state machine can stop too early or enter prototype work without an explicit decision.`;
  }
  if (axisId === "viewport") {
    return normalized === "ru"
      ? `Viewport фиксируется до review, чтобы overflow, focus и density проверялись на реальной поверхности ${subject}.`
      : `Viewport is locked before review so overflow, focus, and density are tested on the real ${subject} surface.`;
  }
  if (axisId === "information_density" && strategy.signals?.agentChat) {
    return normalized === "ru"
      ? `Плотность нужно выбрать до UX/spec: она решает, будут ли traces evidence-first или chat-first.`
      : "Density must be chosen before UX/spec because it decides whether traces are evidence-first or chat-first.";
  }
  if (axisId === "creative_alternatives") {
    return normalized === "ru"
      ? `Creative director должен сравнить направления до токенов, иначе ${subject} унаследует первый безопасный вариант.`
      : `The creative director must compare directions before tokens, or ${subject} inherits the first safe option.`;
  }
  if (axisId === "reference_borrow_avoid") {
    return normalized === "ru"
      ? `Reference scope нужен до визуальных решений, чтобы старые прототипы дали evidence, а не случайный shell.`
      : "Reference scope is needed before visual decisions so old prototypes provide evidence, not an accidental shell.";
  }
  return normalized === "ru"
    ? `Этот выбор нужен до следующего producer: для ${subject} он меняет ${artifactImpactForWhyNow(axisId)}, а не только формулировку в wizard.`
    : `This needs a decision before the next producer because it changes ${artifactImpactForWhyNow(axisId)} for ${subject}.`;
}

function artifactImpactForWhyNow(axisId = "design") {
  if (axisId === "palette_mood") return "semantic tokens, contrast policy, and chart accents";
  if (axisId === "typography_personality") return "type stack, scale, mono usage, and fallback behavior";
  if (axisId === "motion_intensity") return "motion budget, timing tiers, and reduced-motion behavior";
  if (axisId === "component_feel") return "component ownership, state variants, and implementation adapter";
  if (axisId === "audience_trust_posture") return "trust cues, copy tone, and visual restraint";
  if (axisId === "anti_generic_guardrail") return "the critique gate and avoid-list before visual exploration";
  if (axisId === "visual_direction_tone") return "direction.md mood, risk, and product-fit rationale";
  return "the next durable design artifact";
}

function contextualChoiceFor(axisId, choiceId, baseChoice, locale = "en", strategy = {}) {
  const normalized = normalizeLocale(locale);
  if (axisId === "creative_alternatives") {
    return contextualCreativeAlternativeChoice(choiceId, baseChoice, normalized, strategy);
  }
  if (axisId === "visual_direction_tone") {
    return contextualVisualDirectionChoice(choiceId, baseChoice, normalized, strategy);
  }
  if (axisId === "information_density") {
    return contextualDensityChoice(choiceId, baseChoice, normalized, strategy);
  }
  if (axisId === "palette_mood") {
    return contextualPaletteChoice(choiceId, baseChoice, normalized, strategy);
  }
  if (axisId === "typography_personality") {
    return contextualTypographyChoice(choiceId, baseChoice, normalized, strategy);
  }
  if (axisId === "motion_intensity") {
    return contextualMotionChoice(choiceId, baseChoice, normalized, strategy);
  }
  if (axisId === "component_feel") {
    return contextualComponentChoice(choiceId, baseChoice, normalized, strategy);
  }
  if (axisId === "audience_trust_posture") {
    return contextualTrustChoice(choiceId, baseChoice, normalized, strategy);
  }
  return contextualFallbackChoice(baseChoice, normalized, strategy);
}

function contextualCreativeAlternativeChoice(choiceId, baseChoice, locale = "en", strategy = {}) {
  const subject = subjectForLocale(strategy.subject, locale);
  const profile = strategy.profile || "default";
  const agentChat = strategy.signals?.agentChat || profile === "developerTool";
  if (locale === "ru") {
    if (agentChat) {
      const map = {
        "three-directions": ["Сравнить cockpit, editorial workspace и command center", `Три реально разных подхода для ${subject}: рабочая консоль, выразительный чат и системный центр управления.`],
        "two-directions": ["Сравнить консоль и редакторский чат", `Быстрее для ${subject}, но меньше шанс найти неожиданный агентский UX.`],
        "single-locked-direction": ["Зафиксировать выбранный agent-chat cockpit", `Только если направление ${subject} уже принято пользователем и не требует creative-director сравнения.`],
      };
      return contextualChoiceFromMap(choiceId, baseChoice, map);
    }
    if (profile === "brandLaunch") {
      const map = {
        "three-directions": ["Сравнить premium launch, proof-led и product-first", `Три разных launch-рамки для ${subject}: эмоция, доверие и демонстрация продукта.`],
        "two-directions": ["Сравнить brand-led и conversion-led", `Быстрее для ${subject}, но меньше пространства для неожиданного первого экрана.`],
        "single-locked-direction": ["Зафиксировать выбранную launch-рамку", `Только если позиционирование ${subject} уже утверждено.`],
      };
      return contextualChoiceFromMap(choiceId, baseChoice, map);
    }
    const map = {
      "three-directions": [`Сравнить три разные рамки для ${subject}`, "Больше творческого покрытия; снижает риск одного безопасного дефолта."],
      "two-directions": [`Сравнить два сфокусированных пути для ${subject}`, "Быстрее, но меньше проверяет необычные решения."],
      "single-locked-direction": [`Зафиксировать уже выбранный путь для ${subject}`, "Только если направление уже ясно и подтверждено."],
    };
    return contextualChoiceFromMap(choiceId, baseChoice, map);
  }

  if (agentChat) {
    const map = {
      "three-directions": ["Compare cockpit, editorial workspace, and command center", `Three genuinely different frames for ${subject}: operating console, expressive chat, and system control.`],
      "two-directions": ["Compare console and editorial chat", `Faster for ${subject}, but leaves less room for a surprising agentic UX.`],
      "single-locked-direction": ["Lock the chosen agent-chat cockpit", `Only if the ${subject} direction is already approved and does not need creative-director comparison.`],
    };
    return contextualChoiceFromMap(choiceId, baseChoice, map);
  }
  if (profile === "brandLaunch") {
    const map = {
      "three-directions": ["Compare premium launch, proof-led, and product-first", `Three launch frames for ${subject}: emotion, trust, and product demonstration.`],
      "two-directions": ["Compare brand-led and conversion-led", `Faster for ${subject}, with less room for an unexpected first impression.`],
      "single-locked-direction": ["Lock the chosen launch frame", `Only if ${subject} positioning is already approved.`],
    };
    return contextualChoiceFromMap(choiceId, baseChoice, map);
  }
  const map = {
    "three-directions": [`Compare three distinct frames for ${subject}`, "Broader creative coverage; reduces one safe default becoming the design."],
    "two-directions": [`Compare two focused paths for ${subject}`, "Faster, but explores fewer unusual moves."],
    "single-locked-direction": [`Lock the already chosen path for ${subject}`, "Only when direction is already clear and approved."],
  };
  return contextualChoiceFromMap(choiceId, baseChoice, map);
}

function contextualVisualDirectionChoice(choiceId, baseChoice, locale = "en", strategy = {}) {
  const subject = subjectForLocale(strategy.subject, locale);
  const profile = strategy.profile || "default";
  const signals = strategy.signals || {};
  const brandLaunch = signals.brandLaunch || profile === "brandLaunch";
  const regulatedTrust = signals.regulatedTrust || profile === "regulatedTrust";
  const referenceRefresh = signals.referenceRefresh || profile === "referenceRefresh";
  const agentWorkspace = !brandLaunch && !regulatedTrust && !referenceRefresh
    && (signals.agentChat || signals.developerTool || profile === "developerTool");
  const desktopOps = signals.desktopTarget || profile === "desktopOps";

  if (locale === "ru") {
    if (agentWorkspace) {
      return contextualChoiceFromMap(choiceId, baseChoice, {
        "technical-command-center": ["Операционный cockpit с закрепленным evidence", `Для ${subject}: logs, status rails и action gates делают запуск агента проверяемым; выше плотность для casual review.`],
        "operational-clarity": ["Командный центр с первым слоем trace", `Для ${subject}: tool calls, approvals, subagents и memory proposals сразу в первом слое сканирования; меньше места для выразительной подачи.`],
        "premium-editorial": ["Рабочее пространство расследования", `Для ${subject}: ответы читаются как case file с явной иерархией; медленнее для повторного command execution.`],
        "warm-product-utility": ["Совместный рабочий стол агента", `Для ${subject}: chat и вмешательства остаются доступными, trace не прячется; может слабее сигналить debug power.`],
      });
    }
    if (brandLaunch) {
      return contextualChoiceFromMap(choiceId, baseChoice, {
        "bold-launch-energy": ["Фирменный launch-момент", `Для ${subject}: первый экран строит память через motion, контраст и историю; после hero нужны fatigue guardrails.`],
        "premium-editorial": ["Редакционный запуск через доказательства", `Для ${subject}: выше доверие к claims, кейсам и polish; меньше сырой продуктовой плотности.`],
        "warm-product-utility": ["Проводник к product trial", `Для ${subject}: проще понять оффер и перейти к conversion; менее заметно как brand move.`],
        "operational-clarity": ["Ясный путь к конверсии", `Для ${subject}: CTA, proof и навигация очевидны; может ощущаться скорее product page, чем кампания.`],
      });
    }
    if (regulatedTrust) {
      return contextualChoiceFromMap(choiceId, baseChoice, {
        "operational-clarity": ["Ясность вокруг audit trail", `Для ${subject}: статус, audit trails и risk review первичны; меньше брендовой выразительности.`],
        "technical-command-center": ["Контрольная комната evidence", `Для ${subject}: logs, decision history и approval gates видны сразу; выше когнитивная нагрузка.`],
        "premium-editorial": ["Executive brief по assurance", `Для ${subject}: polished overview помогает stakeholders; операционные детали могут уйти в summary.`],
        "warm-product-utility": ["Проводник по compliance review", `Для ${subject}: сложные review paths становятся дружелюбнее; нельзя смягчить severity cues.`],
      });
    }
    if (referenceRefresh) {
      return contextualChoiceFromMap(choiceId, baseChoice, {
        "operational-clarity": ["Редизайн с сохранением функций", `Для ${subject}: flows, states и capabilities из старых прототипов остаются evidence; визуальный язык строится заново.`],
        "technical-command-center": ["Жесткий отказ от old shell", `Для ${subject}: inherited sidebars, cards и chrome явно попадают в avoid list; можно потерять знакомые shortcuts.`],
        "premium-editorial": ["Новый визуальный язык поверх старых flow", `Для ${subject}: референсы влияют на IA, но не на стиль; нужен explicit borrow/avoid list.`],
        "warm-product-utility": ["Мягкая миграция без repaint", `Для ${subject}: сохраняет знакомые touchpoints без repaint; визуальный разрыв будет менее решительным.`],
      });
    }
    if (desktopOps) {
      return contextualChoiceFromMap(choiceId, baseChoice, {
        "operational-clarity": ["Операционная поверхность от resize", `Для ${subject}: Tauri window, queues, panels и repeated scanning первичны; меньше запоминаемости бренда.`],
        "technical-command-center": ["Плотная desktop control room", `Для ${subject}: rails и status zones держат high-throughput работу; нужно доказать overflow и resize.`],
        "warm-product-utility": ["Тихое utility-пространство", `Для ${subject}: долгие сессии спокойнее и читабельнее; меньше expert drama на первом экране.`],
        "premium-editorial": ["Направляемый review workspace", `Для ${subject}: добавляет reading rhythm для сложных задач; снижает raw density.`],
      });
    }
  }

  if (agentWorkspace) {
    return contextualChoiceFromMap(choiceId, baseChoice, {
      "technical-command-center": ["Pinned-evidence operations cockpit", `For ${subject}: logs, status rails, and action gates make each agent run inspectable; denser for casual review.`],
      "operational-clarity": ["Trace-first command center", `For ${subject}: tool calls, approvals, subagents, and memory proposals sit in the first scanning layer; less room for expressive presentation.`],
      "premium-editorial": ["Investigation workspace", `For ${subject}: outputs read like a guided case file with clear narrative hierarchy; slower for repeated command execution.`],
      "warm-product-utility": ["Collaborative agent desk", `For ${subject}: chat and interventions stay approachable while trace access remains visible; may under-signal debugging power.`],
    });
  }
  if (brandLaunch) {
    return contextualChoiceFromMap(choiceId, baseChoice, {
      "bold-launch-energy": ["Signature launch moment", `For ${subject}: motion, contrast, and story make the first viewport memorable; needs fatigue guardrails after the hero.`],
      "premium-editorial": ["Proof-led editorial launch", `For ${subject}: claims, case-study proof, and visual polish carry the page; gives up some raw product density.`],
      "warm-product-utility": ["Guided product trial", `For ${subject}: the offer and conversion path are easier to understand; less distinctive as a brand move.`],
      "operational-clarity": ["Conversion clarity lane", `For ${subject}: CTA, proof, and navigation stay obvious; can feel more product page than campaign.`],
    });
  }
  if (regulatedTrust) {
    return contextualChoiceFromMap(choiceId, baseChoice, {
      "operational-clarity": ["Audit-first clarity", `For ${subject}: status, audit trails, and risk review lead the layout; less expressive brand memory.`],
      "technical-command-center": ["Evidence control room", `For ${subject}: logs, decision history, and approval gates are visible immediately; increases cognitive load.`],
      "premium-editorial": ["Executive assurance brief", `For ${subject}: polished overview helps stakeholders; operational detail can hide behind summaries.`],
      "warm-product-utility": ["Guided compliance utility", `For ${subject}: complex review paths become friendlier; severity cues must stay sharp.`],
    });
  }
  if (referenceRefresh) {
    return contextualChoiceFromMap(choiceId, baseChoice, {
      "operational-clarity": ["Function-preserving redesign", `For ${subject}: old flows, states, and capabilities survive as evidence while the visual language is rebuilt.`],
      "technical-command-center": ["Old-shell rejection pass", `For ${subject}: inherited sidebars, cards, and chrome are explicitly rejected before tokens; familiar shortcuts may be lost.`],
      "premium-editorial": ["New visual language over old flows", `For ${subject}: references shape IA, not style; requires an explicit borrow/avoid list.`],
      "warm-product-utility": ["Gentler migration path", `For ${subject}: familiar touchpoints remain without a repaint; the visual break is less decisive.`],
    });
  }
  if (desktopOps) {
    return contextualChoiceFromMap(choiceId, baseChoice, {
      "operational-clarity": ["Resize-first operations surface", `For ${subject}: Tauri window behavior, queues, panels, and repeated scanning lead the composition; less brand memorability.`],
      "technical-command-center": ["Dense desktop control room", `For ${subject}: rails and status zones support high-throughput work; overflow and resize proof are mandatory.`],
      "warm-product-utility": ["Quiet utility workspace", `For ${subject}: long sessions stay calm and legible; less expert drama in the first viewport.`],
      "premium-editorial": ["Guided review workspace", `For ${subject}: reading rhythm and prioritization help complex tasks; lower raw density.`],
    });
  }

  return contextualFallbackChoice(baseChoice, locale, strategy);
}

function contextualDensityChoice(choiceId, baseChoice, locale = "en", strategy = {}) {
  const subject = subjectForLocale(strategy.subject, locale);
  const profile = strategy.profile || "default";
  const agentChat = strategy.signals?.agentChat || profile === "developerTool";
  if (locale === "ru") {
    if (agentChat) {
      const map = {
        balanced: ["Сбалансировать чат, трассы и инспектор", `Для ${subject}: хороший скан без перегруза, но часть деталей уйдет в раскрытия.`],
        compact: ["Плотный cockpit для agent traces", `Для ${subject}: больше логов, статусов и действий в окне; иерархия должна быть жестче.`],
        comfortable: ["Фокус на диалоге с деталями по запросу", `Для ${subject}: спокойнее читать чат, но меньше состояния агентов видно сразу.`],
      };
      return contextualChoiceFromMap(choiceId, baseChoice, map);
    }
    if (profile === "brandLaunch") {
      const map = {
        balanced: ["Дать офферу и proof равный вес", `Для ${subject}: сканируемо, но без агрессивного above-the-fold.`],
        compact: ["Уплотнить proof и CTA", `Для ${subject}: больше аргументов сразу, выше риск визуального шума.`],
        comfortable: ["Сделать hero и историю просторнее", `Для ${subject}: сильнее впечатление, меньше деталей на первом экране.`],
      };
      return contextualChoiceFromMap(choiceId, baseChoice, map);
    }
    const map = {
      balanced: [`Сбалансировать плотность для ${subject}`, "Сохраняет скорость сканирования без ощущения перегруза."],
      compact: [`Уплотнить рабочий экран ${subject}`, "Больше информации в окне; требуется сильнее контролировать иерархию."],
      comfortable: [`Дать ${subject} больше воздуха`, "Легче читать и нажимать; меньше информации видно сразу."],
    };
    return contextualChoiceFromMap(choiceId, baseChoice, map);
  }

  if (agentChat) {
    const map = {
      balanced: ["Balance chat, traces, and inspector", `For ${subject}: good scan speed without crowding, with some detail moved into disclosure.`],
      compact: ["Dense cockpit for agent traces", `For ${subject}: more logs, statuses, and actions per window; hierarchy must work harder.`],
      comfortable: ["Conversation focus with details on demand", `For ${subject}: calmer reading, but less agent state visible at once.`],
    };
    return contextualChoiceFromMap(choiceId, baseChoice, map);
  }
  if (profile === "brandLaunch") {
    const map = {
      balanced: ["Give offer and proof equal weight", `For ${subject}: scannable without an aggressive above-the-fold.`],
      compact: ["Compress proof and CTA density", `For ${subject}: more arguments immediately, with higher visual-noise risk.`],
      comfortable: ["Give the hero and story more air", `For ${subject}: stronger impression, fewer details visible first.`],
    };
    return contextualChoiceFromMap(choiceId, baseChoice, map);
  }
  const map = {
    balanced: [`Balance density for ${subject}`, "Keeps scanning fast without crowding the workflow."],
    compact: [`Compress the ${subject} working screen`, "Shows more at once; hierarchy must be stricter."],
    comfortable: [`Give ${subject} more breathing room`, "Easier reading and controls; less is visible immediately."],
  };
  return contextualChoiceFromMap(choiceId, baseChoice, map);
}

function contextualPaletteChoice(choiceId, baseChoice, locale = "en", strategy = {}) {
  const subject = subjectForLocale(strategy.subject, locale);
  const profile = strategy.profile || "default";
  const agentChat = strategy.signals?.agentChat || profile === "developerTool";
  if (locale === "ru") {
    if (agentChat) {
      return contextualChoiceFromMap(choiceId, baseChoice, {
        "graphite-cyan": ["Graphite + cyan как technical signal", `Для ${subject}: точный agent/workflow акцент; нужно удержать поверхности от холодной консольности.`],
        "graphite-amber": ["Graphite + amber как operational emphasis", `Для ${subject}: теплее и заметнее действия; важно не спутать акцент с warning.`],
        "light-first": ["Light first для ежедневной работы", `Для ${subject}: лучше читаемость длинных сессий; меньше cinematic command feel.`],
        "high-contrast": ["High contrast для control-room режима", `Для ${subject}: сильная доступность и статусность; нужно смягчить для постоянного чтения.`],
      });
    }
    if (profile === "brandLaunch") {
      return contextualChoiceFromMap(choiceId, baseChoice, {
        "graphite-cyan": ["Graphite + cyan как precise launch", `Для ${subject}: технологичная память бренда; может быть холодно для широкой аудитории.`],
        "graphite-amber": ["Graphite + amber как warm launch", `Для ${subject}: теплее и смелее CTA; следить, чтобы amber не выглядел как предупреждение.`],
        "light-first": ["Light first с сильными акцентами", `Для ${subject}: конверсионно и читаемо; меньше драматичного первого кадра.`],
        "high-contrast": ["High contrast как statement", `Для ${subject}: мощное первое впечатление; выше риск визуальной усталости.`],
      });
    }
    return contextualChoiceFromMap(choiceId, baseChoice, {
      "graphite-cyan": [`Graphite + cyan для ${subject}`, "Точный технический сигнал; важно не сделать систему слишком холодной."],
      "graphite-amber": [`Graphite + amber для ${subject}`, "Теплее и операционнее; нужно отделить акцент от warning-семантики."],
      "light-first": [`Light first для ${subject}`, "Лучше для ежедневной читабельности; меньше кинематографичности."],
      "high-contrast": [`High contrast для ${subject}`, "Сильная доступность и command feel; требуется контроль утомляемости."],
    });
  }
  if (agentChat) {
    return contextualChoiceFromMap(choiceId, baseChoice, {
      "graphite-cyan": ["Graphite + cyan as technical signal", `For ${subject}: precise agent/workflow accent; keep surfaces from becoming cold console chrome.`],
      "graphite-amber": ["Graphite + amber as operational emphasis", `For ${subject}: warmer actions and attention; avoid confusing accent with warning state.`],
      "light-first": ["Light first for daily work", `For ${subject}: stronger long-session readability; less cinematic command feel.`],
      "high-contrast": ["High contrast for control-room mode", `For ${subject}: strong accessibility and status; soften for sustained reading.`],
    });
  }
  return contextualFallbackChoice(baseChoice, locale, strategy);
}

function contextualTypographyChoice(choiceId, baseChoice, locale = "en", strategy = {}) {
  const subject = subjectForLocale(strategy.subject, locale);
  const profile = strategy.profile || "default";
  const agentChat = strategy.signals?.agentChat || profile === "developerTool";
  if (locale === "ru") {
    if (agentChat) {
      return contextualChoiceFromMap(choiceId, baseChoice, {
        "system-native": ["System native для спокойного shell", `Для ${subject}: быстро и привычно платформе; меньше собственной агентской идентичности.`],
        geometric: ["Geometric для точного продукта", `Для ${subject}: современно и структурно; может охладить длинное чтение.`],
        humanist: ["Humanist для доверительного чтения", `Для ${subject}: легче читать диалог и пояснения; экспертность станет мягче.`],
        "code-first": ["Code first для agent traces", `Для ${subject}: сильная mono-поддержка логов и кода; нишевее для нетехнических пользователей.`],
      });
    }
    return contextualChoiceFromMap(choiceId, baseChoice, {
      "system-native": [`System native для ${subject}`, "Быстро и привычно; меньше брендовой выразительности."],
      geometric: [`Geometric для ${subject}`, "Современно и точно; может быть холодно на длинном чтении."],
      humanist: [`Humanist для ${subject}`, "Читабельнее и человечнее; чуть мягче экспертный характер."],
      "code-first": [`Code first для ${subject}`, "Сильная mono-поддержка; подходит, если продукт действительно technical."],
    });
  }
  if (agentChat) {
    return contextualChoiceFromMap(choiceId, baseChoice, {
      "system-native": ["System native for a calm shell", `For ${subject}: fast and platform-familiar; less agent-product identity.`],
      geometric: ["Geometric for product precision", `For ${subject}: modern and structured; can cool down long reading.`],
      humanist: ["Humanist for trustful reading", `For ${subject}: easier dialogue and explanation reading; softer expert posture.`],
      "code-first": ["Code first for agent traces", `For ${subject}: strong mono support for logs and code; narrower for non-technical users.`],
    });
  }
  return contextualFallbackChoice(baseChoice, locale, strategy);
}

function contextualMotionChoice(choiceId, baseChoice, locale = "en", strategy = {}) {
  const subject = subjectForLocale(strategy.subject, locale);
  if (locale === "ru") {
    return contextualChoiceFromMap(choiceId, baseChoice, {
      subtle: [`Subtle motion для ${subject}`, "Дает понятную обратную связь без шоу; безопасно для продуктивной работы."],
      strict: [`Strict motion для ${subject}`, "Быстрые состояния и минимум движения; может ощущаться сухо."],
      expressive: [`Expressive motion для ${subject}`, "Лучше показывает состояние и характер; выше риск усталости и perf-бюджета."],
    });
  }
  return contextualChoiceFromMap(choiceId, baseChoice, {
    subtle: [`Subtle motion for ${subject}`, "Clear feedback without spectacle; safe for productivity work."],
    strict: [`Strict motion for ${subject}`, "Fast state changes and minimal movement; can feel dry."],
    expressive: [`Expressive motion for ${subject}`, "More state storytelling and character; higher fatigue and performance risk."],
  });
}

function contextualComponentChoice(choiceId, baseChoice, locale = "en", strategy = {}) {
  const subject = subjectForLocale(strategy.subject, locale);
  if (locale === "ru") {
    return contextualChoiceFromMap(choiceId, baseChoice, {
      "radix-headless": [`Radix/headless для ${subject}`, "Поведение доступности есть, визуальная система полностью наша; больше композиционной работы."],
      custom: [`Custom components для ${subject}`, "Максимальный контроль и host-neutral handoff; дольше до production-ready набора."],
      "shadcn-adapter": [`shadcn-style adapter для ${subject}`, "Быстрый React handoff с исходниками; менее нейтрален к другим host."],
      "platform-native": [`Platform native для ${subject}`, "Лучше совпадает с desktop/native shell; меньше переносимых web primitives."],
    });
  }
  return contextualChoiceFromMap(choiceId, baseChoice, {
    "radix-headless": [`Radix/headless for ${subject}`, "Accessible behavior with full visual ownership; more composition work."],
    custom: [`Custom components for ${subject}`, "Maximum control and host-neutral handoff; longer path to production-ready coverage."],
    "shadcn-adapter": [`shadcn-style adapter for ${subject}`, "Fast React handoff with source ownership; less neutral for other hosts."],
    "platform-native": [`Platform native for ${subject}`, "Best match for desktop/native shells; fewer reusable web primitives."],
  });
}

function contextualTrustChoice(choiceId, baseChoice, locale = "en", strategy = {}) {
  const subject = subjectForLocale(strategy.subject, locale);
  if (locale === "ru") {
    return contextualChoiceFromMap(choiceId, baseChoice, {
      "professional-calm": [`Спокойный профессиональный инструмент для ${subject}`, "Снижает тревожность и держит workflow рабочим; может быть сдержанно."],
      "expert-power": [`Мощный operator cockpit для ${subject}`, "Сильнее сигнализирует контроль и экспертизу; выше когнитивная нагрузка."],
      "consumer-friendly": [`Дружелюбная поверхность для ${subject}`, "Снижает порог входа; может недосигналить rigor."],
      "regulated-assurance": [`Audit-grade уверенность для ${subject}`, "Много assurance cues; интерфейс станет формальнее и медленнее."],
    });
  }
  return contextualChoiceFromMap(choiceId, baseChoice, {
    "professional-calm": [`Calm professional tool for ${subject}`, "Lowers anxiety and keeps workflow practical; can feel restrained."],
    "expert-power": [`Powerful operator cockpit for ${subject}`, "Signals control and expertise; increases cognitive load."],
    "consumer-friendly": [`Friendly surface for ${subject}`, "Lowers intimidation; may under-signal rigor."],
    "regulated-assurance": [`Audit-grade assurance for ${subject}`, "Adds assurance cues; makes the interface more formal and slower."],
  });
}

function contextualFallbackChoice(baseChoice, locale = "en", strategy = {}) {
  const subject = subjectForLocale(strategy.subject, locale);
  if (locale === "ru") {
    return {
      ...baseChoice,
      label: `${baseChoice.label} для ${subject}`,
      tradeoff: baseChoice.tradeoff,
    };
  }
  return {
    ...baseChoice,
    label: `${baseChoice.label} for ${subject}`,
    tradeoff: baseChoice.tradeoff,
  };
}

function contextualChoiceFromMap(choiceId, baseChoice, map) {
  const copy = map[choiceId];
  if (!copy) return baseChoice;
  return {
    ...baseChoice,
    label: copy[0],
    tradeoff: copy[1],
  };
}

function hydrateQuestionText(text, strategy = {}, locale = "en") {
  return String(text || "")
    .replace(/\{subjectGen\}/g, subjectForLocale(strategy.subject, locale, "genitive"))
    .replace(/\{subject\}/g, subjectForLocale(strategy.subject, locale, "nominative"));
}

function inferDesignQuestionSubject(text = "", target = "web", signals = {}) {
  if (signals.agentChat) {
    return {
      en: "agent chat workspace",
      ru: "агентского чат-пространства",
      ruNominative: "агентское чат-пространство",
      ruGenitive: "агентского чат-пространства",
    };
  }
  if (signals.regulatedTrust) {
    return {
      en: "high-trust workflow",
      ru: "high-trust workflow",
      ruNominative: "high-trust workflow",
      ruGenitive: "high-trust workflow",
    };
  }
  if (signals.brandLaunch) {
    return {
      en: "launch surface",
      ru: "launch-поверхности",
      ruNominative: "launch-поверхность",
      ruGenitive: "launch-поверхности",
    };
  }
  if (signals.developerTool) {
    return {
      en: "developer workflow surface",
      ru: "developer workflow-поверхности",
      ruNominative: "developer workflow-поверхность",
      ruGenitive: "developer workflow-поверхности",
    };
  }
  if (signals.desktopTarget || isDesktopTarget(target)) {
    return {
      en: "desktop workspace",
      ru: "desktop workspace",
      ruNominative: "desktop workspace",
      ruGenitive: "desktop workspace",
    };
  }
  return {
    en: "this product surface",
    ru: "этой продуктовой поверхности",
    ruNominative: "эта продуктовая поверхность",
    ruGenitive: "этой продуктовой поверхности",
  };
}

function subjectForLocale(subject = null, locale = "en", form = "genitive") {
  const normalized = normalizeLocale(locale);
  if (normalized === "ru") {
    if (form === "nominative") return subject?.ruNominative || subject?.ru || "эта продуктовая поверхность";
    if (form === "genitive") return subject?.ruGenitive || subject?.ru || "этой продуктовой поверхности";
    return subject?.ru || "этой продуктовой поверхности";
  }
  return subject?.en || "this product surface";
}

function hasAny(text = "", needles = []) {
  const value = String(text || "").toLowerCase();
  return needles.some((needle) => value.includes(String(needle).toLowerCase()));
}

function isDesktopTarget(target = "web") {
  return /tauri|electron|desktop|native-app|app-shell/i.test(String(target || ""));
}

function modeQuestion(locale = "en", strategy = {}) {
  const normalized = normalizeLocale(locale);
  const recommendedMode = recommendedChoiceIdFor("mode", strategy, "design-system-only");
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
    whyNow: whyNowForQuestion("mode", normalized, strategy),
    evidence: evidenceForQuestion("mode", strategy),
    decisionUnlocked: "config.json.executionMode, stageTriage, and continuation boundary",
    ifSkipped: normalized === "ru"
      ? "Полный pipeline выбирается только когда brief явно просит prototype delivery; иначе лучше остановиться и спросить."
      : "Use full pipeline only when the brief clearly asks for prototype delivery; otherwise stop and ask.",
    choices: withChoiceImpacts(DESIGN_WIZARD_MODES.map((item) => ({ ...localizedChoice(item, normalized, "mode"), recommended: item.id === recommendedMode })), "mode", strategy),
    freeFormPath: normalized === "ru"
      ? "Можно ответить своими словами, например: дизайн-система сейчас, прототип после approval."
      : "Name a custom boundary, for example: design system now, prototype after approval.",
    stopCondition: normalized === "ru"
      ? "Остановиться: сохранить brief и не писать durable design artifacts."
      : "Stop here - save the brief and do not write durable design artifacts.",
  };
}

function axisQuestion(axisDef, locale = "en", strategy = {}) {
  const normalized = normalizeLocale(locale);
  const axisCopy = localizedAxisCopy(axisDef, normalized);
  return {
    id: axisDef.id,
    axis: axisDef.id,
    step: "N",
    total: "M",
    locale: normalized,
    prompt: contextualPromptFor(axisDef.id, axisCopy.prompt, normalized, strategy),
    why: contextualWhyFor(axisDef.id, axisCopy.label, normalized, strategy),
    whyNow: whyNowForQuestion(axisDef.id, normalized, strategy),
    evidence: evidenceForQuestion(axisDef.id, strategy),
    decisionUnlocked: axisCopy.decisionUnlocked,
    ifSkipped: normalized === "ru"
      ? "Рекомендованный дефолт можно использовать только если пользователь явно делегировал этот выбор."
      : "Only use the recommended default when the user explicitly delegates this axis.",
    choices: withChoiceImpacts(contextualChoicesFor(axisDef, normalized, strategy), axisDef.id, strategy),
    freeFormPath: normalized === "ru"
      ? "Можно написать свой стиль, референс или ограничение, если варианты не подходят."
      : "Answer with a different style, reference, or constraint if none of these options fit.",
    stopCondition: normalized === "ru"
      ? "Остановиться: оставить wizard в draft и не создавать tokens."
      : "Stop here - keep the wizard state draft and do not create tokens.",
    minChoices: Math.min(axisDef.choices.length, 3),
  };
}

function viewportQuestion(policy, locale = "en", strategy = {}) {
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
    whyNow: whyNowForQuestion("viewport", normalized, strategy),
    evidence: evidenceForQuestion("viewport", strategy),
    decisionUnlocked: "config.json.viewports, review screenshots, and platform resize policy",
    ifSkipped: policy.requiresActualWindowQuestion
      ? (normalized === "ru" ? "Использовать 1920x1080, 1440x900, 1280x800 и 800x600, записав exactWindow=false." : "Use 1920x1080, 1440x900, 1280x800, and 800x600, then record exactWindow=false.")
      : (normalized === "ru" ? "Использовать web defaults 375px и 1440px." : "Use web defaults 375px and 1440px."),
    choices: withChoiceImpacts(policy.choices.map((item, index) => ({ ...localizedChoice(item, normalized, "viewport"), recommended: index === 0 })), "viewport", strategy),
    strategyProfile: strategy.profile || "default",
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
    Object.assign(question, specialistQuestionMetadata(question));
  }
  return questionQueue;
}

function attachDesignWizardRuntime(state = {}) {
  const runtimeStatus = buildDesignWizardRuntimeStatus(state);
  return {
    ...state,
    questionProposals: (state.questionQueue || []).map((question) => specialistQuestionProposal(question)),
    runtimeStatus,
    resumeToken: runtimeStatus.resumeToken,
  };
}

function specialistQuestionMetadata(question = {}) {
  const owner = DESIGN_QUESTION_OWNERS[question.axis] || DESIGN_QUESTION_OWNERS.mode;
  return {
    stage: owner.stage,
    specialist: owner.specialist,
    ownerAgent: owner.specialist,
    blocks: [...owner.blocks],
    artifactImpact: question.decisionUnlocked || question.decision || owner.blocks.join(", "),
    skipDefault: question.ifSkipped || "Stop or use an explicitly delegated safe default; never assume silently.",
    canAnswerFromEvidence: false,
  };
}

function specialistQuestionProposal(question = {}) {
  const metadata = specialistQuestionMetadata(question);
  return buildSpecialistQuestionProposal({
    proposalId: `${metadata.stage}:${metadata.specialist}:${question.axis || "question"}`,
    stage: metadata.stage,
    specialist: metadata.specialist,
    ownerAgent: question.ownerAgent || metadata.ownerAgent,
    question: question.prompt || question.question || "",
    why: question.why || `${metadata.artifactImpact} changes if this answer changes.`,
    whyNow: question.whyNow || whyNowForQuestion(question.axis, question.locale, question),
    choices: (question.choices || []).map((choiceItem) => ({
      id: choiceItem.id,
      label: choiceItem.label,
      tradeoff: choiceItem.tradeoff || choiceItem.description || "",
      unlocks: choiceItem.unlocks || metadata.blocks,
      risk: choiceItem.risk || "Risk must be reviewed by the owner specialist.",
      evidence: choiceItem.evidence || evidenceForQuestion(question.axis, question),
      artifactImpact: choiceItem.artifactImpact || metadata.artifactImpact,
      recommended: choiceItem.recommended === true,
    })),
    blocks: metadata.blocks,
    artifactImpact: metadata.artifactImpact,
    skipDefault: metadata.skipDefault,
    canAnswerFromEvidence: metadata.canAnswerFromEvidence,
    evidence: question.evidence || evidenceForQuestion(question.axis, question),
    locale: question.locale || "en",
    decisionUnlocked: question.decisionUnlocked || question.decision || metadata.artifactImpact,
    currentContext: `${question.axis || "design"} ${metadata.stage} ${metadata.specialist}`,
    freeformAllowed: true,
  });
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
