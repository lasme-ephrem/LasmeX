/**
 * `model` namespace dictionaries.
 *
 * `trigger.selectAria` reads identically to `trigger.fallback` today and is
 * still a separate key: the visible fallback label and the accessible name of
 * an unset trigger are free to diverge per locale, and folding it into
 * `trigger.aria` would announce the degenerate "Select model, current Select
 * model".
 */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'command.description': '选择本会话使用的模型',
  'option.loadError': '目录加载失败：{message}',
  'trigger.fallback': '选择模型',
  'trigger.selectAria': '选择模型',
  'trigger.aria': '选择模型，当前 {model}',
  'trigger.ariaEffort': '选择模型，当前 {model}，推理等级 {effort}',
  'menu.aria': '模型与推理等级',
  'menu.model': '模型',
  'menu.effort': '推理等级',
  'effort.providerDefault': 'Default',
  'status.loading': '正在刷新模型列表…',
  'error.action': '模型操作失败：{message}',
  'error.subagentUnavailable': '无法为定向子代理会话选择模型',
  'error.catalogSelectionUnavailable': '此提供商的目录加载失败，请从已加载的分组中选择模型',
  'action.reload': '重新加载',
  'warning.groupLoad': '{name} 加载失败：{message}',
  'empty.models': '没有可用的模型。',
  'blocked.composer': '当前模型不可用，请先选择模型',
  'empty.efforts': '当前模型未提供推理等级。',
} satisfies Record<string, string>

/** The model namespace key union. */
export type ModelKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'command.description': 'Select the model for this conversation',
  'option.loadError': 'Catalog failed to load: {message}',
  'trigger.fallback': 'Select model',
  'trigger.selectAria': 'Select model',
  'trigger.aria': 'Select model, current {model}',
  'trigger.ariaEffort': 'Select model, current {model}, reasoning effort {effort}',
  'menu.aria': 'Model and reasoning effort',
  'menu.model': 'Model',
  'menu.effort': 'Effort',
  'effort.providerDefault': 'Default',
  'status.loading': 'Refreshing model list…',
  'error.action': 'Model operation failed: {message}',
  'error.subagentUnavailable': 'Model selection is unavailable for addressed subagent sessions',
  'error.catalogSelectionUnavailable': 'This provider’s catalog failed to load — pick a model from a loaded group',
  'action.reload': 'Reload',
  'warning.groupLoad': '{name} failed to load: {message}',
  'empty.models': 'No models available.',
  'blocked.composer': 'This model is unavailable — select one to continue',
  'empty.efforts': 'This model provides no reasoning effort levels.',
} satisfies Record<ModelKey, string>

/** Dictionnaire français. */
export const fr = {
  'command.description': 'Choisir le modèle de cette conversation',
  'option.loadError': 'Échec du chargement du catalogue : {message}',
  'trigger.fallback': 'Choisir un modèle',
  'trigger.selectAria': 'Choisir un modèle',
  'trigger.aria': 'Choisir un modèle, modèle actuel : {model}',
  'trigger.ariaEffort': 'Choisir un modèle, modèle actuel : {model}, niveau de raisonnement : {effort}',
  'menu.aria': 'Modèle et niveau de raisonnement',
  'menu.model': 'Modèle',
  'menu.effort': 'Niveau de raisonnement',
  'effort.providerDefault': 'Par défaut',
  'status.loading': 'Actualisation de la liste des modèles…',
  'error.action': 'Échec de l’opération sur le modèle : {message}',
  'error.subagentUnavailable': 'La sélection du modèle est indisponible pour les sessions de sous-agent adressées',
  'error.catalogSelectionUnavailable': 'Échec du chargement du catalogue de ce fournisseur — choisissez un modèle dans un groupe chargé',
  'action.reload': 'Recharger',
  'warning.groupLoad': 'Échec du chargement de {name} : {message}',
  'empty.models': 'Aucun modèle disponible.',
  'blocked.composer': 'Ce modèle est indisponible — choisissez-en un pour continuer',
  'empty.efforts': 'Ce modèle ne propose aucun niveau de raisonnement.',
} satisfies Record<ModelKey, string>
