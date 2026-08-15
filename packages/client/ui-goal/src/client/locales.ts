/** `goal` namespace dictionaries. */

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'phase.active': '进行中的目标',
  'phase.paused': '已暂停的目标',
  'phase.blocked': '受阻的目标',
  'objective.aria': '目标内容',
  'commandInput.aria': '命令输入',
  'action.save': '保存目标',
  'action.cancel': '取消编辑',
  'action.pause': '暂停目标',
  'action.resume': '恢复目标',
  'action.edit': '编辑目标',
  'action.clear': '清除目标',
} satisfies Record<string, string>

/** The goal namespace key union. */
export type GoalKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'phase.active': 'Ongoing Goal',
  'phase.paused': 'Paused Goal',
  'phase.blocked': 'Blocked Goal',
  'objective.aria': 'Goal objective',
  'commandInput.aria': 'Command input',
  'action.save': 'Save goal',
  'action.cancel': 'Cancel edit',
  'action.pause': 'Pause goal',
  'action.resume': 'Resume goal',
  'action.edit': 'Edit goal',
  'action.clear': 'Clear goal',
} satisfies Record<GoalKey, string>

/** Dictionnaire français. */
export const fr = {
  'phase.active': 'Objectif en cours',
  'phase.paused': 'Objectif en pause',
  'phase.blocked': 'Objectif bloqué',
  'objective.aria': 'Description de l’objectif',
  'commandInput.aria': 'Saisie de commande',
  'action.save': 'Enregistrer l’objectif',
  'action.cancel': 'Annuler la modification',
  'action.pause': 'Mettre l’objectif en pause',
  'action.resume': 'Reprendre l’objectif',
  'action.edit': 'Modifier l’objectif',
  'action.clear': 'Effacer l’objectif',
} satisfies Record<GoalKey, string>
