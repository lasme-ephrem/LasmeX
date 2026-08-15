/** Durable settings namespace for product-wide GUI onboarding facts. */
export const WELCOME_NOTICE_SETTINGS_NAMESPACE = 'ui-onboarding'

/** Field storing the last welcome notice version the user acknowledged. */
export const WELCOME_NOTICE_ACK_FIELD = 'welcomeNoticeVersion'

/**
 * Bump only when the notice changes materially and every user should see it
 * again. The acknowledgement is compared for exact equality.
 */
export const WELCOME_NOTICE_VERSION = '2026-08-14.3'

/** Complete welcome notice in every supported GUI locale. */
export const WELCOME_NOTICE_COPY = {
  fr: {
    title: 'Bienvenue dans LasmeX',
    body: 'LasmeX est un produit indépendant issu de DeepSeek Harness. Il réunit l’interface française, LasmeX Code, le tableau Mission, la mémoire par projet, les SDK et l’application desktop.\n\nNous construisons avec les développeurs un harness agentique ouvert, réutilisable, composable et contrôlé par ses utilisateurs. Vos retours, problèmes et idées sont les bienvenus.',
    continueLabel: 'Continuer',
  },
  zh: {
    title: '欢迎使用 LasmeX',
    body: 'LasmeX 是从 DeepSeek Harness 派生的独立产品，集成法语界面、LasmeX Code、Mission 仪表盘、项目记忆、SDK 与桌面应用。\n\n我们希望与开发者一起构建一个开放、可复用、可组合且由用户控制的 agent harness，欢迎反馈问题与建议。',
    continueLabel: '继续',
  },
  en: {
    title: 'Welcome to LasmeX',
    body: 'LasmeX is an independent product derived from DeepSeek Harness. It includes the French interface, LasmeX Code, the Mission dashboard, project memory, the SDKs, and the desktop application.\n\nWe welcome feedback as we build an open, reusable, composable, and user-controlled agent harness with developers.',
    continueLabel: 'Continue',
  },
} as const
