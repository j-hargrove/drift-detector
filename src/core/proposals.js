// What an Amend would change in the contract, derived from the offending snippet.

const HEX = /#[0-9a-fA-F]{3,8}\b/;
const PX = /\b\d+(?:\.\d+)?px\b/g;
const VARIANT = /variant=["']([^"']+)["']/;

// Every contract change an Amend needs: the one the snippet implies, then one per
// token in the deviation's `alsoAllowTokens` that the component doesn't allow yet.
// A destructive variant, for example, also needs color.danger.
export function proposeChanges(deviation, contract) {
  const component = contract.component?.name ?? 'Component';
  const allowed = contract.component?.allowedTokens ?? {};
  const extra = (deviation.alsoAllowTokens ?? [])
    .filter((path) => !(allowed[tokenGroup(path)] ?? []).includes(path))
    .map((path) => `add ${path} to ${component}.allowedTokens.${tokenGroup(path)}`);
  return [proposeChange(deviation, component), ...new Set(extra)];
}

export function proposeChange(deviation, componentName) {
  const { rule, snippet } = deviation;

  if (rule === 'no-hardcoded-color') {
    const hex = snippet.match(HEX)?.[0];
    if (hex) return `add ${hex.toUpperCase()} to ${componentName}.allowedTokens.color`;
  }
  if (rule === 'no-arbitrary-spacing') {
    const values = snippet.match(PX);
    if (values) return `add ${[...new Set(values)].join(', ')} to ${componentName}.allowedTokens.spacing`;
  }
  if (rule === 'no-off-contract-variant') {
    const variant = snippet.match(VARIANT)?.[1];
    if (variant) return `add "${variant}" to ${componentName}.variants`;
  }
  return `allow \`${snippet.trim()}\` under ${rule}`;
}

// "color.danger" -> "color"
export const tokenGroup = (path) => String(path).split('.')[0];

// "color.primary" -> "#2563EB"; null when the suggestion isn't a token path.
export function resolveToken(contract, path) {
  const [group, name, ...rest] = String(path).split('.');
  const tokens = contract.tokens ?? {};
  if (rest.length || !Object.hasOwn(tokens, group) || !Object.hasOwn(tokens[group] ?? {}, name)) return null;
  return tokens[group][name];
}
