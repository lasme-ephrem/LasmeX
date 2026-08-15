/** `settings.permission` namespace dictionaries (the Permission row's copy). */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'title': '权限',
  'description': '选择新会话的默认权限模式',
  'loading': '加载中',
  'unavailable': '不可用',
  'preset.readOnly': '只读',
  'preset.workspaceWrite': '工作区可写',
  'preset.fullAccess': '完全访问',
  'preset.readOnly.detail': '只允许读取和检查，需要更广访问的操作会请求批准。',
  'preset.workspaceWrite.detail': '可在工作区和允许的临时目录中修改，超出范围的操作会请求批准。',
  'preset.fullAccess.detail': '可直接访问全部文件系统，且不显示批准提示。',
  'confirm.title': '确认启用完全访问？',
  'confirm.description': '启用完全访问后，新会话将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任后续任务时使用。',
  'confirm.acknowledge': '我已了解风险，并愿意继续',
  'confirm.cancel': '取消',
  'confirm.enable': '启用完全访问',
} satisfies Record<string, string>

/** The settings.permission namespace key union. */
export type PermissionSettingsKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'title': 'Permission',
  'description': 'Choose the default permission mode for new sessions',
  'loading': 'Loading',
  'unavailable': 'Unavailable',
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'preset.readOnly.detail': 'Read and inspect only; actions requiring broader access ask for approval.',
  'preset.workspaceWrite.detail': 'Write inside the workspace and permitted temporary directories; broader actions ask for approval.',
  'preset.fullAccess.detail': 'Access the full filesystem directly without approval prompts.',
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access lets new sessions reduce confirmation steps and perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust subsequent tasks.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
} satisfies Record<PermissionSettingsKey, string>

/** Dictionnaire français des paramètres de permissions. */
export const fr = {
  'title': 'Permissions',
  'description': 'Choisir le mode de permissions par défaut des nouvelles sessions',
  'loading': 'Chargement',
  'unavailable': 'Indisponible',
  'preset.readOnly': 'Lecture seule',
  'preset.workspaceWrite': 'Écriture dans l’espace de travail',
  'preset.fullAccess': 'Accès complet',
  'preset.readOnly.detail': 'Lire et inspecter uniquement ; les actions demandant un accès plus large requièrent une autorisation.',
  'preset.workspaceWrite.detail': 'Modifier l’espace de travail et les dossiers temporaires autorisés ; les actions plus larges requièrent une autorisation.',
  'preset.fullAccess.detail': 'Accéder directement à tout le système de fichiers sans demande d’autorisation.',
  'confirm.title': 'Activer l’accès complet ?',
  'confirm.description': 'L’accès complet réduit les demandes de confirmation des nouvelles sessions et leur permet d’effectuer directement davantage d’actions, notamment des opérations sensibles, des modifications de fichiers ou des commandes externes. Utilisez-le uniquement si vous faites confiance aux tâches à venir.',
  'confirm.acknowledge': 'Je comprends les risques et souhaite continuer',
  'confirm.cancel': 'Annuler',
  'confirm.enable': 'Activer l’accès complet',
} satisfies Record<PermissionSettingsKey, string>

/** Simplified Chinese dictionary for the current-session popup gate. */
export const accessZh = {
  'preset.readOnly': '只读',
  'preset.workspaceWrite': '工作区可写',
  'preset.fullAccess': '完全访问',
  'preset.readOnly.detail': '只允许读取和检查，需要更广访问的操作会请求批准。',
  'preset.workspaceWrite.detail': '可在工作区和允许的临时目录中修改，超出范围的操作会请求批准。',
  'preset.fullAccess.detail': '可直接访问全部文件系统，且不显示批准提示。',
  'confirm.title': '确认启用完全访问？',
  'confirm.description': '启用完全访问后，agent 将减少确认步骤，并且可以直接执行更多操作，包括敏感操作、文件修改或外部命令。仅建议在你信任当前任务时使用。',
  'confirm.acknowledge': '我已了解风险，并愿意继续',
  'confirm.cancel': '取消',
  'confirm.enable': '启用完全访问',
  'error.hostUnavailable': '此主机不提供权限预设',
  'error.sessionPending': '此会话尚未就绪',
  'error.switchFailed': '权限切换失败：{code}：{message}',
  'error.commandUnavailable': '主机未提供 /permission 命令',
} satisfies Record<string, string>

/** Current-session popup-gate key union. */
export type PermissionAccessKey = keyof typeof accessZh

/** English dictionary for the current-session popup gate. */
export const accessEn = {
  'preset.readOnly': 'Read Only',
  'preset.workspaceWrite': 'Workspace Write',
  'preset.fullAccess': 'Full access',
  'preset.readOnly.detail': 'Read and inspect only; actions requiring broader access ask for approval.',
  'preset.workspaceWrite.detail': 'Write inside the workspace and permitted temporary directories; broader actions ask for approval.',
  'preset.fullAccess.detail': 'Access the full filesystem directly without approval prompts.',
  'confirm.title': 'Enable Full access?',
  'confirm.description': 'Full access reduces confirmation steps and lets the agent perform more actions directly, including sensitive operations, file changes, or external commands. Only use it when you trust the current task.',
  'confirm.acknowledge': 'I understand the risks and want to continue',
  'confirm.cancel': 'Cancel',
  'confirm.enable': 'Enable Full access',
  'error.hostUnavailable': 'Permission presets are not available on this host',
  'error.sessionPending': 'This session is not materialized yet',
  'error.switchFailed': 'Permission switch failed: {code}: {message}',
  'error.commandUnavailable': 'The host offers no /permission command',
} satisfies Record<PermissionAccessKey, string>

/** Dictionnaire français de la confirmation pour la session active. */
export const accessFr = {
  'preset.readOnly': 'Lecture seule',
  'preset.workspaceWrite': 'Écriture dans l’espace de travail',
  'preset.fullAccess': 'Accès complet',
  'preset.readOnly.detail': 'Lire et inspecter uniquement ; les actions demandant un accès plus large requièrent une autorisation.',
  'preset.workspaceWrite.detail': 'Modifier l’espace de travail et les dossiers temporaires autorisés ; les actions plus larges requièrent une autorisation.',
  'preset.fullAccess.detail': 'Accéder directement à tout le système de fichiers sans demande d’autorisation.',
  'confirm.title': 'Activer l’accès complet ?',
  'confirm.description': 'L’accès complet réduit les demandes de confirmation et permet à l’agent d’effectuer directement davantage d’actions, notamment des opérations sensibles, des modifications de fichiers ou des commandes externes. Utilisez-le uniquement si vous faites confiance à la tâche actuelle.',
  'confirm.acknowledge': 'Je comprends les risques et souhaite continuer',
  'confirm.cancel': 'Annuler',
  'confirm.enable': 'Activer l’accès complet',
  'error.hostUnavailable': 'Les modes de permissions ne sont pas disponibles sur cet hôte',
  'error.sessionPending': 'Cette session n’est pas encore prête',
  'error.switchFailed': 'Échec du changement de permissions : {code} : {message}',
  'error.commandUnavailable': 'L’hôte ne fournit pas la commande /permission',
} satisfies Record<PermissionAccessKey, string>
