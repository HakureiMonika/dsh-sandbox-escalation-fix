import type { Agent } from '@deepseek-ai/dsh-agent'
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { TOOL_WRAPPER_PROTOCOL } from './wrapper-protocol.ts'
import type { CooperativeToolDefinition, WrapperLayer } from './wrapper-protocol.ts'

export const PLUGIN_OWNER = 'dsh-sandbox-escalation-fix'

export interface WrapperBinding {
  readonly definition: ToolDefinition
  updateDelegate(delegate: ToolDefinition): void
  contribute(layer: WrapperLayer): () => void
  markUnhealthy(error: Error): void
  releaseOwnLayer(): void
}

function sortedLayers(layers: ReadonlyMap<string, WrapperLayer>): WrapperLayer[] {
  return [...layers.values()].sort(
    (left, right) => left.priority - right.priority || left.owner.localeCompare(right.owner),
  )
}

export function createWrapperBinding(
  agent: Agent,
  initialDelegate: ToolDefinition,
  ownLayer: WrapperLayer,
): WrapperBinding {
  let currentDelegate = initialDelegate
  let unhealthy: Error | undefined
  const layers = new Map<string, WrapperLayer>([[ownLayer.owner, ownLayer]])
  const context = { toolName: initialDelegate.name }

  const delegate = (): ToolDefinition => {
    if (unhealthy !== undefined) {
      throw new Error(
        `dsh-sandbox-escalation-fix: agent "${agent.id}" tool "${initialDelegate.name}" is unavailable: ${unhealthy.message}`,
        { cause: unhealthy },
      )
    }
    return currentDelegate
  }

  const release = (owner: string): void => {
    layers.delete(owner)
  }

  const definition: CooperativeToolDefinition = {
    name: initialDelegate.name,
    get description(): string {
      const current = delegate()
      return sortedLayers(layers).reduce(
        (value, layer) => layer.projectDescription?.(value, context) ?? value,
        current.description,
      )
    },
    get parameters(): Record<string, unknown> {
      const current = delegate()
      return sortedLayers(layers).reduce(
        (value, layer) => layer.projectParameters?.(value, context) ?? value,
        current.parameters,
      )
    },
    get output() {
      return delegate().output
    },
    execute(args: unknown, exec: ToolRunContext): Promise<unknown> {
      const currentDelegate = delegate()
      const active = sortedLayers(layers).filter(
        (layer): layer is WrapperLayer & Required<Pick<WrapperLayer, 'execute'>> => layer.execute !== undefined,
      )
      const dispatch = (index: number, current: unknown): Promise<unknown> => {
        const layer = active[index]
        if (layer === undefined) {
          return Reflect.apply(currentDelegate.execute, currentDelegate, [current, exec]) as Promise<unknown>
        }
        let called = false
        return layer.execute(current, exec, (nextArgs) => {
          if (called) throw new Error(`dsh-sandbox-escalation-fix: wrapper "${layer.owner}" called next() more than once`)
          called = true
          return dispatch(index + 1, nextArgs)
        })
      }
      return dispatch(0, args)
    },
    [TOOL_WRAPPER_PROTOCOL]: {
      version: 1,
      owner: PLUGIN_OWNER,
      name: initialDelegate.name,
      contribute(layer: WrapperLayer): () => void {
        if (layers.has(layer.owner)) {
          throw new Error(`dsh-sandbox-escalation-fix: wrapper owner "${layer.owner}" is already registered for "${initialDelegate.name}"`)
        }
        layers.set(layer.owner, layer)
        let active = true
        return () => {
          if (!active) return
          active = false
          release(layer.owner)
        }
      },
    },
  }

  if (initialDelegate.timeoutMs !== undefined) {
    Object.defineProperty(definition, 'timeoutMs', {
      enumerable: true,
      get: () => delegate().timeoutMs,
    })
  }

  if (initialDelegate.finalizeContent !== undefined) {
    definition.finalizeContent = (exec, result) => {
      const current = delegate()
      return current.finalizeContent?.call(current, exec, result)
    }
  }
  if (initialDelegate.isConcurrencySafe !== undefined) {
    definition.isConcurrencySafe = args => {
      const current = delegate()
      return current.isConcurrencySafe?.call(current, args) === true
    }
  }
  if (initialDelegate.presentCall !== undefined) {
    definition.presentCall = args => {
      const current = delegate()
      return current.presentCall?.call(current, args)
    }
  }
  if (initialDelegate.presentResult !== undefined) {
    definition.presentResult = (args, result) => {
      const current = delegate()
      return current.presentResult?.call(current, args, result)
    }
  }

  return {
    definition,
    updateDelegate(next): void {
      if (next.name !== initialDelegate.name) {
        throw new Error(`delegate name changed from "${initialDelegate.name}" to "${next.name}"`)
      }
      currentDelegate = next
      unhealthy = undefined
    },
    contribute(layer): () => void {
      return definition[TOOL_WRAPPER_PROTOCOL]!.contribute(layer)
    },
    markUnhealthy(error): void {
      unhealthy = error
    },
    releaseOwnLayer(): void {
      release(ownLayer.owner)
    },
  }
}
