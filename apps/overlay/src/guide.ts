import { describeSource, type GameDef, type Trigger } from '@zerocade/shared'

// Una riga delle istruzioni in onda, letta come una frase: «Un messaggio in chat: indovina», «Rosa: rivela la più vicina».
export function guideLine(trigger: Trigger, game: Pick<GameDef, 'actions'>): { icon: string; text: string } {
  const source = describeSource(trigger.source)
  const label = game.actions.find((a) => a.id === trigger.action)?.label
  const action = label ? label.charAt(0).toLowerCase() + label.slice(1) : trigger.action
  return { icon: source.icon, text: `${source.label}: ${action}` }
}
