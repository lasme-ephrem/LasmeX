/**
 * Canonical publication manifest for the documentation website.
 *
 * Markdown stays in its owning repository tier. This manifest maps each
 * canonical source into matching route trees for the French, English, and
 * Chinese site locales. French routes use reviewed `.fr.md` sources when
 * available and otherwise identify their English fallback explicitly.
 */

/** Locale key used by the VitePress site. */
export type DocsLocale = 'root' | 'en' | 'zh'

/** Sidebar collection rendered for one locale and top-level module. */
export type DocsSidebar =
  | 'fr-guide'
  | 'fr-develop'
  | 'fr-reference'
  | 'zh-guide'
  | 'zh-develop'
  | 'zh-reference'
  | 'en-guide'
  | 'en-develop'
  | 'en-reference'

/** A page projected into the VitePress source tree. */
export interface DocsPage {
  /** VitePress locale whose route tree owns this projection. */
  locale: DocsLocale
  /** Language of the canonical source currently projected at this route. */
  contentLocale: 'fr-FR' | 'zh-CN' | 'en-US'
  /** Repository-relative canonical Markdown source. */
  source: string
  /** VitePress route, including the `.md` suffix. */
  route: string
  /** Navigation label shown in the sidebar. */
  label: string
  /** Sidebar collection that owns the page, or null for a locale home page. */
  sidebar: DocsSidebar | null
  /** Section label within the sidebar. */
  section: string
  /** Stable order within the section. */
  order: number
  /** Heading levels included in this page's VitePress outline. */
  outline?: number | readonly [number, number] | 'deep' | false
  /** Additional repository paths that resolve to this page. */
  sourceAliases?: string[]
}

interface MirroredPage {
  source: string | Record<DocsLocale, string>
  route: string
  contentLocale: DocsPage['contentLocale'] | Record<DocsLocale, DocsPage['contentLocale']>
  label: Record<DocsLocale, string>
  sidebar: Record<DocsLocale, DocsSidebar | null>
  section: Record<DocsLocale, string>
  order: number
  outline?: DocsPage['outline']
  sourceAliases?: string[] | Partial<Record<DocsLocale, string[]>>
}

/** Existing manifest copy: Chinese and English labels from the paired sources. */
type BilingualCopy<T> = Record<'root' | 'en', T>

type PairedPage = Omit<MirroredPage, 'source' | 'contentLocale' | 'label' | 'sidebar' | 'section' | 'sourceAliases'> & {
  /** English side of a sibling `foo.md` / `foo.zh.md` pair. */
  source: string
  /** Reviewed Chinese and English navigation labels. */
  label: BilingualCopy<string>
  /** Chinese and English sidebar collections. */
  sidebar: BilingualCopy<DocsSidebar | null>
  /** Reviewed Chinese and English section labels. */
  section: BilingualCopy<string>
  /** Language-neutral repository aliases, such as the directory of an index page. */
  sourceAliases?: string[]
}

type ReviewedFrenchPage = PairedPage & {
  /** Reviewed French source projected at the root-locale route. */
  frenchSource: string
}

/** Source without a Chinese counterpart; Chinese falls back to English. */
type FallbackPage = PairedPage & {
  contentLocale: DocsPage['contentLocale']
}

/** French navigation copy keyed by the existing English manifest labels. */
const FRENCH_COPY: Readonly<Record<string, string>> = {
  '1. Your first plugin': '1. Votre premier plugin',
  '2. Lifecycle and effects': '2. Cycle de vie et effets',
  '3. Services': '3. Services',
  '4. Events': '4. Événements',
  '5. Configuration': '5. Configuration',
  '6. Composition and HMR': '6. Composition et HMR',
  '7. Into the harness': '7. Intégration au harness',
  'Adding a Conversation Node': 'Ajouter un nœud de conversation',
  'Adding a package': 'Ajouter un package',
  'Adding a tool': 'Ajouter un outil',
  'Adding an LLM adapter': 'Ajouter un adaptateur LLM',
  'Agent lifecycle': 'Cycle de vie de l’agent',
  'Approvals': 'Approbations',
  'Architecture': 'Architecture',
  'Background jobs': 'Tâches en arrière-plan',
  'Bash execution': 'Exécution Bash',
  'Basics': 'Fondamentaux',
  'Build a tool': 'Créer un outil',
  'Capability layering': 'Découpage des capacités',
  'Capability services': 'Services de capacités',
  'Client modules': 'Modules client',
  'Code runtime': 'Runtime de code',
  'Compaction': 'Compression',
  'Concepts': 'Concepts',
  'Configure models': 'Configurer les modèles',
  'Context': 'Contexte',
  'Cookbook': 'Guides pratiques',
  'Cordis Core API': 'API principale de Cordis',
  'Cordis framework tutorial': 'Tutoriel du framework Cordis',
  'Cordis primer': 'Introduction à Cordis',
  'Core': 'Noyau',
  'Core and scopes': 'Noyau et portées',
  'Event system': 'Système d’événements',
  'Events': 'Événements',
  'Execution and tools': 'Exécution et outils',
  'Extension patterns': 'Modèles d’extension',
  'Fiber': 'Fiber',
  'Filesystem': 'Système de fichiers',
  'Framework': 'Framework',
  'Generated reference': 'Référence générée',
  'Goals': 'Objectifs',
  'Guide': 'Guide',
  'HTTP server': 'Serveur HTTP',
  'Home': 'Accueil',
  'Human commands': 'Commandes utilisateur',
  'Inherited surface': 'Surface héritée',
  'LLM adapter': 'Adaptateur LLM',
  'LLM streaming': 'Streaming LLM',
  'LSP navigation': 'Navigation LSP',
  'Model and context': 'Modèles et contexte',
  'Overview': 'Vue d’ensemble',
  'PTY sessions': 'Sessions PTY',
  'Package and install': 'Empaqueter et installer',
  'Permission presets': 'Préréglages de permissions',
  'Persistence events': 'Événements de persistance',
  'Plan mode': 'Mode Plan',
  'Platform and access': 'Plateforme et accès',
  'Plugin Registry': 'Registre des plugins',
  'Plugin configuration': 'Configuration des plugins',
  'Plugin lifecycle': 'Cycle de vie des plugins',
  'Policy and interaction': 'Politiques et interaction',
  'Practice': 'Mise en pratique',
  'Python': 'Python',
  'Runtime invariants': 'Invariants du runtime',
  'SDK': 'SDK',
  'Sandboxing': 'Bac à sable',
  'Scheduled reminders': 'Rappels planifiés',
  'Scopes': 'Portées',
  'Service': 'Service',
  'Services and dependencies': 'Services et dépendances',
  'Session persistence': 'Persistance des sessions',
  'Session projections': 'Projections de session',
  'Session query': 'Requêtes de session',
  'Session references': 'Références de session',
  'Session titles': 'Titres de session',
  'SessionTelemetryBackend': 'SessionTelemetryBackend',
  'Sessions': 'Sessions',
  'Sessions and persistence': 'Sessions et persistance',
  'Skills': 'Compétences',
  'Spill storage': 'Stockage spill',
  'Storage': 'Stockage',
  'Subagents': 'Sous-agents',
  'Subprocesses': 'Sous-processus',
  'Subsystems': 'Sous-systèmes',
  'System prompts': 'Prompts système',
  'Token metering': 'Mesure des tokens',
  'Tool execution': 'Exécution des outils',
  'Tool schemas': 'Schémas des outils',
  'Tools': 'Outils',
  'Typert': 'Typert',
  'Use the Web UI': 'Utiliser l’interface Web',
  'User credentials': 'Identifiants utilisateur',
  'User interaction': 'Interaction utilisateur',
  'User settings': 'Paramètres utilisateur',
  'Web access': 'Accès Web',
  'Workflows': 'Workflows',
  'Workspaces': 'Espaces de travail',
  'Your first Harness plugin': 'Votre premier plugin de harness',
}

function frenchCopy(english: string): string {
  const translated = FRENCH_COPY[english]
  if (translated === undefined) throw new Error(`French documentation navigation copy is missing for ${JSON.stringify(english)}.`)
  return translated
}

function localized<T>(value: T | Record<DocsLocale, T>, locale: DocsLocale): T {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<DocsLocale, T>)[locale]
    : value
}

function mirroredPages(pages: MirroredPage[]): DocsPage[] {
  return pages.flatMap(page => (['root', 'en', 'zh'] as const).map((locale) => {
    const aliases = page.sourceAliases === undefined
      ? undefined
      : Array.isArray(page.sourceAliases) ? page.sourceAliases : page.sourceAliases[locale]
    return {
      locale,
      contentLocale: localized(page.contentLocale, locale),
      source: localized(page.source, locale),
      route: locale === 'root' ? page.route : `${locale}/${page.route}`,
      label: page.label[locale],
      sidebar: page.sidebar[locale],
      section: page.section[locale],
      order: page.order,
      ...(page.outline === undefined ? {} : { outline: page.outline }),
      ...(aliases === undefined ? {} : { sourceAliases: aliases }),
    }
  }))
}

function frenchSidebar(sidebar: DocsSidebar | null): DocsSidebar | null {
  if (sidebar === null) return null
  if (!sidebar.startsWith('en-')) throw new Error(`French sidebar cannot derive from ${JSON.stringify(sidebar)}.`)
  return `fr-${sidebar.slice(3)}` as DocsSidebar
}

function pairedPages(pages: PairedPage[]): DocsPage[] {
  return pages.flatMap((page) => {
    if (REVIEWED_FRENCH_SOURCES.has(page.source)) {
      return reviewedFrenchPages([{ ...page, frenchSource: page.source.replace(/\.md$/, '.fr.md') }])
    }

    const chineseSource = page.source.replace(/\.md$/, '.zh.md')
    const sharedAliases = page.sourceAliases ?? []
    return mirroredPages([{
      ...page,
      source: { root: page.source, en: page.source, zh: chineseSource },
      contentLocale: { root: 'en-US', en: 'en-US', zh: 'zh-CN' },
      label: { root: frenchCopy(page.label.en), en: page.label.en, zh: page.label.root },
      sidebar: { root: frenchSidebar(page.sidebar.en), en: page.sidebar.en, zh: page.sidebar.root },
      section: { root: frenchCopy(page.section.en), en: page.section.en, zh: page.section.root },
      sourceAliases: {
        root: [...sharedAliases, chineseSource],
        en: [...sharedAliases, chineseSource],
        zh: [...sharedAliases, page.source],
      },
    }])
  })
}

/** English sources whose root routes have completed French editorial review. */
const REVIEWED_FRENCH_SOURCES = new Set([
  'docs/agent-lifecycle.md',
  'docs/architecture.md',
  'docs/cookbook/adding-a-conversation-node.md',
  'docs/cookbook/adding-a-package.md',
  'docs/cookbook/adding-a-tool.md',
  'docs/cookbook/adding-an-llm-adapter.md',
  'docs/cookbook/extension-cookbook.md',
  'docs/config-catalog.md',
  'docs/cordis-primer.md',
  'docs/cordis-api/context.md',
  'docs/cordis-api/events.md',
  'docs/cordis-api/fiber.md',
  'docs/cordis-api/registry.md',
  'docs/cordis-api/service.md',
  'docs/cordis-tutorial/05-config.md',
  'docs/cordis-tutorial/06-composition-and-hmr.md',
  'docs/cordis-tutorial/07-into-the-harness.md',
  'docs/cordis-tutorial/01-first-plugin.md',
  'docs/cordis-tutorial/02-lifecycle-and-effects.md',
  'docs/cordis-tutorial/03-services.md',
  'docs/cordis-tutorial/04-events.md',
  'docs/cordis-tutorial/index.md',
  'docs/persistence-catalog.md',
  'docs/subsystems/README.md',
  'docs/subsystems/approval.md',
  'docs/subsystems/client-modules.md',
  'docs/subsystems/code-runtime.md',
  'docs/subsystems/commands.md',
  'docs/subsystems/compaction.md',
  'docs/subsystems/core.md',
  'docs/subsystems/filesystem.md',
  'docs/subsystems/invariants.md',
  'docs/subsystems/jobs.md',
  'docs/subsystems/credentials.md',
  'docs/subsystems/llm-streaming.md',
  'docs/subsystems/lsp.md',
  'docs/subsystems/goal.md',
  'docs/subsystems/permission-presets.md',
  'docs/subsystems/persistence.md',
  'docs/subsystems/sandbox.md',
  'docs/subsystems/schedule.md',
  'docs/subsystems/plan.md',
  'docs/subsystems/scope.md',
  'docs/subsystems/session-projection.md',
  'docs/subsystems/session-reference.md',
  'docs/subsystems/session-telemetry.md',
  'docs/subsystems/session-title.md',
  'docs/subsystems/settings.md',
  'docs/subsystems/skills.md',
  'docs/subsystems/spill.md',
  'docs/subsystems/storage.md',
  'docs/subsystems/shell.md',
  'docs/subsystems/subprocess.md',
  'docs/subsystems/system-prompt.md',
  'docs/subsystems/token-meter.md',
  'docs/subsystems/terminal.md',
  'docs/subsystems/tools.md',
  'docs/subsystems/typert.md',
  'docs/subsystems/user-questions.md',
  'docs/subsystems/web-server.md',
  'docs/subsystems/web.md',
  'docs/subsystems/workflow.md',
  'docs/subsystems/workspace.md',
  'docs/tool-catalog.md',
  'docs/tool-execution-pipeline.md',
  'docs/user/develop/basic/config.md',
  'docs/user/develop/basic/index.md',
  'docs/user/develop/basic/publish.md',
  'docs/user/develop/basic/tool.md',
  'docs/user/develop/framework/events.md',
  'docs/user/develop/framework/index.md',
  'docs/user/develop/framework/service.md',
  'docs/user/develop/practice/index.md',
  'docs/user/develop/practice/llm-adapter.md',
])

function reviewedFrenchPages(pages: ReviewedFrenchPage[]): DocsPage[] {
  return mirroredPages(pages.map(({ frenchSource, ...page }) => {
    const chineseSource = page.source.replace(/\.md$/, '.zh.md')
    const sharedAliases = page.sourceAliases ?? []
    return {
      ...page,
      source: { root: frenchSource, en: page.source, zh: chineseSource },
      contentLocale: { root: 'fr-FR', en: 'en-US', zh: 'zh-CN' },
      label: { root: frenchCopy(page.label.en), en: page.label.en, zh: page.label.root },
      sidebar: { root: frenchSidebar(page.sidebar.en), en: page.sidebar.en, zh: page.sidebar.root },
      section: { root: frenchCopy(page.section.en), en: page.section.en, zh: page.section.root },
      sourceAliases: {
        root: [...sharedAliases, page.source, chineseSource],
        en: [...sharedAliases, chineseSource, frenchSource],
        zh: [...sharedAliases, page.source, frenchSource],
      },
    }
  }))
}

function fallbackPages(pages: FallbackPage[]): DocsPage[] {
  return mirroredPages(pages.map((page) => {
    const frenchSource = page.source.replace(/\.md$/, '.fr.md')
    const sharedAliases = page.sourceAliases ?? []
    return {
      ...page,
      source: { root: frenchSource, en: page.source, zh: page.source },
      contentLocale: { root: 'fr-FR', en: page.contentLocale, zh: page.contentLocale },
      label: { root: frenchCopy(page.label.en), en: page.label.en, zh: page.label.root },
      sidebar: { root: frenchSidebar(page.sidebar.en), en: page.sidebar.en, zh: page.sidebar.root },
      section: { root: frenchCopy(page.section.en), en: page.section.en, zh: page.section.root },
      sourceAliases: {
        root: [...sharedAliases, page.source],
        en: [...sharedAliases, frenchSource],
        zh: [...sharedAliases, frenchSource],
      },
    }
  }))
}

const homeAndGuide = [
  ...mirroredPages([{
    source: { root: 'docs/user/index.fr.md', en: 'docs/user/index.md', zh: 'docs/user/index.zh.md' },
    route: 'index.md',
    contentLocale: { root: 'fr-FR', en: 'en-US', zh: 'zh-CN' },
    label: { root: 'LasmeX', en: 'LasmeX', zh: 'LasmeX' },
    sidebar: { root: null, en: null, zh: null },
    section: { root: 'Accueil', en: 'Home', zh: '首页' },
    order: 0,
    sourceAliases: {
      root: ['docs/user/index.md', 'docs/user/index.zh.md'],
      en: ['docs/user/index.zh.md', 'docs/user/index.fr.md'],
      zh: ['docs/user/index.md', 'docs/user/index.fr.md'],
    },
  }]),
  ...reviewedFrenchPages([
    {
      source: 'docs/user/guide/index.md',
      frenchSource: 'docs/user/guide/index.fr.md',
      route: 'guide/quickstart.md',
      label: { root: '使用 Web UI', en: 'Use the Web UI' },
      sidebar: { root: 'zh-guide', en: 'en-guide' },
      section: { root: '入门', en: 'Guide' },
      order: 1,
      sourceAliases: ['docs/user/guide'],
    },
    {
      source: 'docs/user/guide/providers.md',
      frenchSource: 'docs/user/guide/providers.fr.md',
      route: 'guide/providers.md',
      label: { root: '配置模型', en: 'Configure models' },
      sidebar: { root: 'zh-guide', en: 'en-guide' },
      section: { root: '入门', en: 'Guide' },
      order: 2,
    },
    {
      source: 'docs/user/guide/python-sdk.md',
      frenchSource: 'docs/user/guide/python-sdk.fr.md',
      route: 'guide/python-sdk.md',
      label: { root: 'Python', en: 'Python' },
      sidebar: { root: 'zh-guide', en: 'en-guide' },
      section: { root: 'SDK', en: 'SDK' },
      order: 1,
    },
  ]),
]

const develop = pairedPages([
  {
    source: 'docs/user/develop/basic/index.md',
    route: 'develop/basic/index.md',
    label: { root: '第一个 Harness 插件', en: 'Your first Harness plugin' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '基础', en: 'Basics' },
    order: 1,
    sourceAliases: ['docs/user/develop/basic'],
  },
  {
    source: 'docs/user/develop/basic/tool.md',
    route: 'develop/basic/tool.md',
    label: { root: '开发一个 Tool', en: 'Build a tool' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '基础', en: 'Basics' },
    order: 2,
  },
  {
    source: 'docs/user/develop/basic/config.md',
    route: 'develop/basic/config.md',
    label: { root: '插件配置', en: 'Plugin configuration' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '基础', en: 'Basics' },
    order: 3,
  },
  {
    source: 'docs/user/develop/basic/publish.md',
    route: 'develop/basic/publish.md',
    label: { root: '打包与安装插件', en: 'Package and install' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '基础', en: 'Basics' },
    order: 4,
  },
  {
    source: 'docs/user/develop/framework/index.md',
    route: 'develop/framework/index.md',
    label: { root: '插件与生命周期', en: 'Plugin lifecycle' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '框架能力', en: 'Framework' },
    order: 1,
    sourceAliases: ['docs/user/develop/framework'],
  },
  {
    source: 'docs/user/develop/framework/service.md',
    route: 'develop/framework/service.md',
    label: { root: '服务与依赖', en: 'Services and dependencies' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '框架能力', en: 'Framework' },
    order: 2,
  },
  {
    source: 'docs/user/develop/framework/events.md',
    route: 'develop/framework/events.md',
    label: { root: '事件系统', en: 'Event system' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '框架能力', en: 'Framework' },
    order: 3,
  },
  {
    source: 'docs/user/develop/practice/index.md',
    route: 'develop/practice/index.md',
    label: { root: '能力的三层拆分', en: 'Capability layering' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '实战', en: 'Practice' },
    order: 1,
    sourceAliases: ['docs/user/develop/practice'],
  },
  {
    source: 'docs/user/develop/practice/llm-adapter.md',
    route: 'develop/practice/llm-adapter.md',
    label: { root: 'LLM 适配器', en: 'LLM adapter' },
    sidebar: { root: 'zh-develop', en: 'en-develop' },
    section: { root: '实战', en: 'Practice' },
    order: 2,
  },
])

const cordisTutorial = pairedPages(([
  ['index.md', '总览', 'Overview'],
  ['01-first-plugin.md', '1. 第一个插件', '1. Your first plugin'],
  ['02-lifecycle-and-effects.md', '2. 生命周期与副作用', '2. Lifecycle and effects'],
  ['03-services.md', '3. 服务', '3. Services'],
  ['04-events.md', '4. 事件', '4. Events'],
  ['05-config.md', '5. 配置', '5. Configuration'],
  ['06-composition-and-hmr.md', '6. 组合与热重载', '6. Composition and HMR'],
  ['07-into-the-harness.md', '7. 进入 Harness', '7. Into the harness'],
] as const).map(([file, rootLabel, enLabel], order): PairedPage => ({
  source: `docs/cordis-tutorial/${file}`,
  route: `develop/cordis-tutorial/${file}`,
  label: { root: rootLabel, en: enLabel },
  sidebar: { root: 'zh-develop', en: 'en-develop' },
  section: { root: 'Cordis 框架教程', en: 'Cordis framework tutorial' },
  order,
  ...(file === 'index.md' ? { sourceAliases: ['docs/cordis-tutorial'] } : {}),
})))

const cordisPrimerReference = pairedPages([
  {
    source: 'docs/cordis-primer.md',
    route: 'reference/cordis-primer.md',
    label: { root: 'Cordis 入门', en: 'Cordis primer' },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '概念', en: 'Concepts' },
    order: 1,
  },
])

/**
 * Subsystem pages grouped by the concern they document, as `[Chinese section,
 * English section, pages]`. One flat list of every subsystem pushed the rest of
 * the reference sidebar below the fold.
 */
const subsystemGroups = [
  ['总览', 'Overview', [
    ['README.md', '子系统', 'Subsystems'],
  ]],
  ['内核与作用域', 'Core and scopes', [
    ['core.md', '核心', 'Core'],
    ['scope.md', '作用域', 'Scopes'],
    ['invariants.md', '运行时不变式', 'Runtime invariants'],
  ]],
  ['会话与持久化', 'Sessions and persistence', [
    ['session.md', '会话', 'Sessions'],
    ['session-query.md', '会话查询', 'Session query'],
    ['session-reference.md', '会话引用', 'Session references'],
    ['session-title.md', '会话标题', 'Session titles'],
    ['session-projection.md', '会话投影', 'Session projections'],
    ['persistence.md', '会话持久化', 'Session persistence'],
    ['spill.md', 'Spill 存储', 'Spill storage'],
    ['session-telemetry.md', '遥测', 'SessionTelemetryBackend'],
  ]],
  ['模型与上下文', 'Model and context', [
    ['llm-streaming.md', 'LLM 流式响应', 'LLM streaming'],
    ['token-meter.md', 'Token 计量', 'Token metering'],
    ['system-prompt.md', '系统提示词', 'System prompts'],
    ['compaction.md', '上下文压缩', 'Compaction'],
  ]],
  ['执行与工具', 'Execution and tools', [
    ['tools.md', '工具', 'Tools'],
    ['shell.md', 'Bash 执行', 'Bash execution'],
    ['subprocess.md', '子进程', 'Subprocesses'],
    ['terminal.md', 'PTY 会话', 'PTY sessions'],
    ['jobs.md', '后台任务', 'Background jobs'],
    ['filesystem.md', '文件系统', 'Filesystem'],
    ['lsp.md', 'LSP 导航', 'LSP navigation'],
    ['code-runtime.md', '代码运行时', 'Code runtime'],
    ['web.md', 'Web 访问', 'Web access'],
    ['skills.md', '技能', 'Skills'],
    ['workflow.md', '工作流', 'Workflows'],
    ['subagent.md', '子代理', 'Subagents'],
  ]],
  ['策略与交互', 'Policy and interaction', [
    ['approval.md', '审批', 'Approvals'],
    ['permission-presets.md', '权限预设', 'Permission presets'],
    ['sandbox.md', '沙箱', 'Sandboxing'],
    ['plan.md', '计划模式', 'Plan mode'],
    ['user-questions.md', '用户交互', 'User interaction'],
    ['commands.md', '命令', 'Human commands'],
    ['goal.md', '目标', 'Goals'],
    ['schedule.md', '定时提醒', 'Scheduled reminders'],
  ]],
  ['平台与接入', 'Platform and access', [
    ['web-server.md', 'HTTP 服务器', 'HTTP server'],
    ['typert.md', 'Typert', 'Typert'],
    ['client-modules.md', '客户端模块', 'Client modules'],
    ['storage.md', '存储', 'Storage'],
    ['workspace.md', '工作区', 'Workspaces'],
    ['settings.md', '用户设置', 'User settings'],
    ['credentials.md', '用户凭据', 'User credentials'],
  ]],
] as const

const subsystemsReference = subsystemGroups.flatMap(([rootSection, enSection, files]) => pairedPages(
  files.map(([file, rootLabel, enLabel], order): PairedPage => ({
    source: `docs/subsystems/${file}`,
    route: file === 'README.md' ? 'reference/subsystems/index.md' : `reference/subsystems/${file}`,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: rootSection, en: enSection },
    order,
    // Subsystem pages carry long third-level sections a two-level outline reaches.
    outline: [2, 3],
    ...(file === 'README.md' ? { sourceAliases: ['docs/subsystems'] } : {}),
  })),
))

const reference = [
  ...pairedPages(([
    ['docs/architecture.md', 'reference/index.md', '架构', 'Architecture', 0],
  ] as const).map(([source, route, rootLabel, enLabel, order]): PairedPage => ({
    source,
    route,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '概念', en: 'Concepts' },
    order,
  }))),
  ...pairedPages(([
    ['docs/capability-seams.md', 'reference/capability-seams.md', '能力服务', 'Capability services', 2],
    ['docs/agent-lifecycle.md', 'reference/agent-lifecycle.md', 'Agent 生命周期', 'Agent lifecycle', 3],
    ['docs/tool-execution-pipeline.md', 'reference/tool-execution-pipeline.md', 'Tool 执行', 'Tool execution', 4],
  ] as const).map(([source, route, rootLabel, enLabel, order]): PairedPage => ({
    source,
    route,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '概念', en: 'Concepts' },
    order,
  }))),
  ...pairedPages(([
    ['docs/config-catalog.md', 'reference/config-catalog.md', '插件配置', 'Plugin configuration'],
    ['docs/tool-catalog.md', 'reference/tool-catalog.md', 'Tool Schema', 'Tool schemas'],
    ['docs/persistence-catalog.md', 'reference/persistence-catalog.md', '持久化事件', 'Persistence events', 'deep'],
  ] as const).map(([source, route, rootLabel, enLabel, outline], order): PairedPage => ({
    source,
    route,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '生成参考', en: 'Generated reference' },
    order,
    ...(outline === undefined ? {} : { outline }),
  }))),
  ...pairedPages(([
    ['context.md', 'Context', 'Context'],
    ['events.md', 'Events', 'Events'],
    ['fiber.md', 'Fiber', 'Fiber'],
    ['registry.md', 'Plugin Registry', 'Plugin Registry'],
    ['service.md', 'Service', 'Service'],
  ] as const).map(([file, rootLabel, enLabel], order): PairedPage => ({
    source: `docs/cordis-api/${file}`,
    route: `reference/cordis-api/${file}`,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: 'Cordis API', en: 'Cordis Core API' },
    order,
  }))),
  ...fallbackPages(([
    ['inherited.md', '继承接口面', 'Inherited surface'],
  ] as const).map(([file, rootLabel, enLabel], order): FallbackPage => ({
    source: `docs/cordis-api/${file}`,
    route: `reference/cordis-api/${file}`,
    contentLocale: 'en-US',
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: 'Cordis API', en: 'Cordis Core API' },
    order: order + 5,
  }))),
  ...pairedPages(([
    ['adding-a-package.md', '新增 Package', 'Adding a package'],
    ['adding-a-tool.md', '新增 Tool', 'Adding a tool'],
    ['adding-an-llm-adapter.md', '新增 LLM Adapter', 'Adding an LLM adapter'],
    ['extension-cookbook.md', '扩展模式', 'Extension patterns'],
  ] as const).map(([file, rootLabel, enLabel], order): PairedPage => ({
    source: `docs/cookbook/${file}`,
    route: `reference/cookbook/${file}`,
    label: { root: rootLabel, en: enLabel },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '开发手册', en: 'Cookbook' },
    order,
  }))),
  ...pairedPages([{
    source: 'docs/cookbook/adding-a-conversation-node.md',
    route: 'reference/cookbook/adding-a-conversation-node.md',
    label: { root: '新增 Conversation Node', en: 'Adding a Conversation Node' },
    sidebar: { root: 'zh-reference', en: 'en-reference' },
    section: { root: '开发手册', en: 'Cookbook' },
    order: 4,
  }]),
]

/** A sidebar group, matched to pages by `label`. */
export interface DocsSection {
  /** Group heading, equal to the `section` field of every page it holds. */
  label: string
  /** Render the group collapsed until it holds the page being read. */
  collapsed?: boolean
}

/**
 * Every sidebar group, in the order its locale renders it.
 *
 * The subsystem groups collapse because together they outnumber the rest of the
 * reference sidebar; expanded, they push every other group below the fold.
 */
const sections: Record<DocsLocale, readonly DocsSection[]> = {
  root: [
    { label: 'Guide' }, { label: 'SDK' },
    { label: 'Fondamentaux' }, { label: 'Framework' }, { label: 'Mise en pratique' }, { label: 'Tutoriel du framework Cordis' },
    { label: 'Concepts' }, { label: 'Référence générée' }, { label: 'API principale de Cordis' }, { label: 'Guides pratiques' },
    { label: 'Vue d’ensemble' },
    { label: 'Noyau et portées', collapsed: true },
    { label: 'Sessions et persistance', collapsed: true },
    { label: 'Modèles et contexte', collapsed: true },
    { label: 'Exécution et outils', collapsed: true },
    { label: 'Politiques et interaction', collapsed: true },
    { label: 'Plateforme et accès', collapsed: true },
  ],
  en: [
    { label: 'Guide' }, { label: 'SDK' },
    { label: 'Basics' }, { label: 'Framework' }, { label: 'Practice' }, { label: 'Cordis framework tutorial' },
    { label: 'Concepts' }, { label: 'Generated reference' }, { label: 'Cordis Core API' }, { label: 'Cookbook' },
    { label: 'Overview' },
    { label: 'Core and scopes', collapsed: true },
    { label: 'Sessions and persistence', collapsed: true },
    { label: 'Model and context', collapsed: true },
    { label: 'Execution and tools', collapsed: true },
    { label: 'Policy and interaction', collapsed: true },
    { label: 'Platform and access', collapsed: true },
  ],
  zh: [
    { label: '入门' }, { label: 'SDK' },
    { label: '基础' }, { label: '框架能力' }, { label: '实战' }, { label: 'Cordis 框架教程' },
    { label: '概念' }, { label: '生成参考' }, { label: 'Cordis API' }, { label: '开发手册' },
    { label: '总览' },
    { label: '内核与作用域', collapsed: true },
    { label: '会话与持久化', collapsed: true },
    { label: '模型与上下文', collapsed: true },
    { label: '执行与工具', collapsed: true },
    { label: '策略与交互', collapsed: true },
    { label: '平台与接入', collapsed: true },
  ],
}

/**
 * Placement and collapse behavior of one sidebar group.
 *
 * @param locale - Route tree whose sidebar is being built.
 * @param label - Section label carried by the pages in the group.
 * @returns The declared group, plus its zero-based position in the locale.
 * @throws When the locale declares no placement for the label. Ranking by list
 *   membership alone would sort an undeclared group silently ahead of every
 *   declared one.
 */
export function sectionSpec(locale: DocsLocale, label: string): DocsSection & { index: number } {
  const declared = sections[locale]
  const section = declared.find(candidate => candidate.label === label)
  if (section === undefined) throw new Error(`Sidebar section "${label}" has no placement in the ${locale} locale.`)
  return { ...section, index: declared.indexOf(section) }
}

/** Every canonical page published by the documentation website. */
export const docsPages: DocsPage[] = [
  ...homeAndGuide,
  ...develop,
  ...cordisTutorial,
  ...cordisPrimerReference,
  ...subsystemsReference,
  ...reference,
]

/**
 * Pages of one sidebar collection, in the order the sidebar lists them.
 *
 * @param locale - Route tree whose sidebar is being built.
 * @param collection - Sidebar collection to read.
 * @returns The collection's pages, ordered by section placement then by `order`.
 */
export function orderedPages(locale: DocsLocale, collection: DocsSidebar): DocsPage[] {
  return docsPages
    .filter(page => page.locale === locale && page.sidebar === collection)
    .sort((left, right) => (
      sectionSpec(locale, left.section).index - sectionSpec(locale, right.section).index
      || left.order - right.order
    ))
}

/**
 * Site-relative link for a published route.
 *
 * @param route - Manifest route, including its `.md` suffix.
 * @returns The link VitePress serves the route at.
 */
export function routeLink(route: string): string {
  return `/${route.replace(/(?:index)?\.md$/, '')}`
}

/**
 * Where a top-level navigation item lands.
 *
 * The target is derived rather than written down: a collection whose first page
 * is renamed or reordered would otherwise leave the navigation bar pointing at
 * a route the manifest no longer publishes.
 *
 * @param locale - Route tree the navigation item belongs to.
 * @param collection - Sidebar collection the item opens.
 * @returns Site-relative link of the collection's first page.
 * @throws When the collection publishes no page.
 */
export function landingLink(locale: DocsLocale, collection: DocsSidebar): string {
  const first = orderedPages(locale, collection)[0]
  if (first === undefined) throw new Error(`Sidebar collection "${collection}" publishes no page.`)
  return routeLink(first.route)
}
