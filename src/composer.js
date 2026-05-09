// Avrae command composer — turns an action + active modifiers into a !command string.

export function substituteParams(template, params, selections) {
  if (!template) return template || '';
  let out = template;
  for (const param of params) {
    const idx = selections[param.id] ?? param.defaultIndex ?? 0;
    const value = param.options[idx]?.value ?? '';
    out = out.split(`{${param.id}}`).join(value);
  }
  return out;
}

export function composeFromMod(mod, paramSelections) {
  const sub  = (s) => substituteParams(s, mod.params, paramSelections);
  const out  = [];
  for (const eff of mod.effects) {
    if      (eff.type === 'bonus')  out.push(`-b ${sub(eff.value)}`);
    else if (eff.type === 'damage') out.push(`-d "${sub(eff.value)}"`);
    else if (eff.type === 'adv')    out.push('adv');
    else if (eff.type === 'dis')    out.push('dis');
    else if (eff.type === 'phrase') out.push(`-phrase "${sub(eff.value)}"`);
    else if (eff.type === 'raw')    out.push(sub(eff.value));
  }
  return out.join(' ');
}

export function compose({ action, activeMods, modParams, modifiers, custom }) {
  let cmd;
  if      (action.kind === 'attack') cmd = `!attack "${action.id}"`;
  else if (action.kind === 'spell')  cmd = `!cast "${action.id}"`;
  else if (action.kind === 'save')   cmd = `!save ${action.id}`;
  else                                cmd = `!check ${action.id}`;

  const argParts = [];
  if (action.kind === 'spell' && action.upcastTo > action.level) {
    argParts.push(`-l ${action.upcastTo}`);
  }
  for (const modId of activeMods) {
    const mod = modifiers.find(m => m.id === modId);
    if (!mod || !mod.applies.includes(action.kind)) continue;
    const a = composeFromMod(mod, modParams[modId] || {});
    if (a) argParts.push(a);
  }
  if (custom.bonus.trim())  argParts.push(`-b ${custom.bonus.trim()}`);
  if (custom.damage.trim() && (action.kind === 'attack' || action.kind === 'spell'))
    argParts.push(`-d "${custom.damage.trim()}"`);

  // Per-action flavor phrase, applied last so it shows up in the result text.
  if (action.phrase && action.phrase.trim()) {
    argParts.push(`-phrase "${action.phrase.trim()}"`);
  }

  return argParts.length ? `${cmd} ${argParts.join(' ')}` : cmd;
}
