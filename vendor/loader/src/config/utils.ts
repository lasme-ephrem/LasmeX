import { valueMap } from '@deepseek-ai/cosmokit'

let expressionEvaluator: ((ctx: object, expr: string) => any) | undefined

/**
 * Evaluate a JavaScript expression against a loader context scope.
 * The dynamic compiler is created only when a serialized expression is used,
 * so browser Loader consumers without expressions can retain a strict CSP.
 * @param ctx - Loader context exposed as the expression scope.
 * @param expr - JavaScript expression source.
 * @returns the expression result.
 */
export function evaluate(ctx: object, expr: string): any {
  // eslint-disable-next-line no-new-func
  expressionEvaluator ??= new Function('ctx', 'expr', `
    with (ctx) {
      return eval(expr)
    }
  `) as ((ctx: object, expr: string) => any)
  return expressionEvaluator(ctx, expr)
}

/** Recursively replace YAML `!js` expression nodes with evaluated values. */
export function interpolate(ctx: object, value: any) {
  if (isJsExpr(value)) {
    return evaluate(ctx, value.__jsExpr)
  } else if (!value || typeof value !== 'object') {
    return value
  } else if (Array.isArray(value)) {
    return value.map(item => interpolate(ctx, item))
  } else {
    return valueMap(value, item => interpolate(ctx, item))
  }
}

/** Return true when a value is a serialized loader JavaScript expression. */
export function isJsExpr(value: any): value is JsExpr {
  return value instanceof Object && '__jsExpr' in value
}

/** Serialized JavaScript expression produced by the include YAML tag. */
export interface JsExpr {
  __jsExpr: string
}
