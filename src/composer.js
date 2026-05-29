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
    else if (eff.type === 'crit')   out.push(`-c "${sub(eff.value)}"`);
    else if (eff.type === 'adv')    out.push('adv');
    else if (eff.type === 'dis')    out.push('dis');
    else if (eff.type === 'ro')     out.push(`-ro ${sub(eff.value)}`);
    else if (eff.type === 'rr')     out.push(`-rr ${sub(eff.value)}`);
    else if (eff.type === 'mi')     out.push(`-mi ${sub(eff.value)}`);
    else if (eff.type === 'max')    out.push('-max');
    else if (eff.type === 'dtype')  out.push(`-dtype "${sub(eff.value)}"`);
    else if (eff.type === 'hide')   out.push('-h');
    else if (eff.type === 'phrase') out.push(`-phrase "${sub(eff.value)}"`);
    else if (eff.type === 'raw')    out.push(sub(eff.value));
  }
  return out.join(' ');
}

export function compose({ action, activeMods, modParams, modifiers, custom }) {
  // Three command flavors per kind:
  //   - bound-character (player Roll): `!attack`, `!cast`, `!save`, `!check`
  //   - init-aware (DM Roll, current combatant): `!i a`, `!i cast`, `!i s`, `!i c`
  //   - out-of-turn (DM Roll, named combatant acting off-turn): Avrae's
  //     `!i offturnattack` / `!i offturncast` / `!i offturnsave` /
  //     `!i offturncheck`. These take `<combatant> <action-or-ability>`
  //     as positional args; we quote anything string-y to handle spaces.
  // `action.initContext: true` picks init-aware; combined with
  // `action.outOfTurn` + `action.combatantName` it picks out-of-turn.
  // Spell stays on the standard forms because DM Roll doesn't surface
  // spell buttons today, but the init-aware + OOT branches are wired in
  // so adding them later is free.
  const init   = !!action.initContext;
  const offturn = init && !!action.outOfTurn && !!action.combatantName;
  const ot     = action.combatantName;
  let cmd;
  if (action.kind === 'attack') {
    cmd = offturn ? `!i offturnattack "${ot}" "${action.id}"`
        : init    ? `!i a "${action.id}"`
                  : `!attack "${action.id}"`;
  } else if (action.kind === 'spell') {
    cmd = offturn ? `!i offturncast "${ot}" "${action.id}"`
        : init    ? `!i cast "${action.id}"`
                  : `!cast "${action.id}"`;
  } else if (action.kind === 'save') {
    cmd = offturn ? `!i offturnsave "${ot}" ${action.id}`
        : init    ? `!i s ${action.id}`
                  : `!save ${action.id}`;
  } else {
    cmd = offturn ? `!i offturncheck "${ot}" ${action.id}`
        : init    ? `!i c ${action.id}`
                  : `!check ${action.id}`;
  }

  const argParts = [];
  if (action.kind === 'spell' && action.upcastTo > action.level) {
    argParts.push(`-l ${action.upcastTo}`);
  }
  // Avrae targets: -t "<name>" repeated per target, only on attacks/spells.
  if ((action.kind === 'attack' || action.kind === 'spell') && action.targets?.length) {
    for (const t of action.targets) {
      argParts.push(`-t "${t}"`);
    }
  }
  for (const modId of activeMods) {
    const mod = modifiers.find(m => m.id === modId);
    if (!mod) continue;
    // Spells accept any toggled modifier — the user has explicit control
    // via the side panel, and Avrae's !cast accepts the same flags as
    // !attack (-b, -d, adv/dis, -phrase). Other action kinds (attack,
    // save, check) still respect mod.applies as a guard.
    if (action.kind !== 'spell' && !mod.applies.includes(action.kind)) continue;
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
