// Builds each operator's file (stats, skills, modules, archives, voice lines) from the excel tables.
// Stats and descriptions are for the fully built operator: max promotion and level, full potential,
// max trust, skills at their top rank (Mastery 3), and modules at stage 3.

import type { Profile, ProfileForm, ProfileModule, ProfileSkill, Stats } from '../src/types';

type Json = any; // the game tables are large and loosely shaped
type Blackboard = { key: string; value: number; valueStr?: string | null }[] | Record<string, never>;

const CLASSES: Record<string, string> = {
  PIONEER: 'Vanguard', WARRIOR: 'Guard', TANK: 'Defender', SNIPER: 'Sniper',
  CASTER: 'Caster', MEDIC: 'Medic', SUPPORT: 'Supporter', SPECIAL: 'Specialist',
};
const ACTIVATION: Record<string, string> = { AUTO: 'Auto', MANUAL: 'Manual', PASSIVE: 'Passive' };
const RECOVERY: Record<string, string> = {
  INCREASE_WITH_TIME: 'Auto Recovery',
  INCREASE_WHEN_ATTACK: 'Offensive Recovery',
  INCREASE_WHEN_TAKEN_DAMAGE: 'Defensive Recovery',
};
const ROOMS: Record<string, string> = {
  CONTROL: 'Control Center', DORMITORY: 'Dormitory', MANUFACTURE: 'Factory', TRADING: 'Trading Post',
  POWER: 'Power Plant', MEETING: 'Reception Room', HIRE: 'Office', WORKSHOP: 'Workshop', TRAINING: 'Training Room',
};
const MODULE_STATS: Record<string, keyof Stats> = {
  max_hp: 'hp', atk: 'atk', def: 'def', magic_resistance: 'res', cost: 'cost',
  respawn_time: 'redeploy', block_cnt: 'block', attack_speed: 'interval',
};
const PHASES = ['PHASE_0', 'PHASE_1', 'PHASE_2'];

/** The tables use {} where they mean an empty list. */
const list = (x: unknown): Json[] => (Array.isArray(x) ? x : []);

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function bbMap(bb: Blackboard | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  if (Array.isArray(bb)) for (const { key, value } of bb) m.set(key.toLowerCase(), value);
  return m;
}

function formatValue(v: number, fmt?: string): string {
  if (fmt === '0%') return `${Math.round(v * 100)}%`;
  if (fmt === '0.0%') return `${+(v * 100).toFixed(1)}%`;
  if (fmt === '0.0') return v.toFixed(1);
  if (fmt === '0') return String(Math.round(v));
  return String(+v.toFixed(3));
}

export class RichText {
  constructor(private terms: Record<string, { termName: string; description: string }>) {}

  /** Game rich text to HTML: fills `{key:fmt}` from the blackboard and turns `<@ba.vup>x</>` into spans. */
  html(src: string | null | undefined, bb?: Blackboard | null, extra: Record<string, number> = {}): string {
    if (!src) return '';
    const values = bbMap(bb);
    for (const [k, v] of Object.entries(extra)) if (!values.has(k)) values.set(k, v);
    const filled = src.replace(/\{(-)?([^{}:]+)(?::([^{}]+))?\}/g, (whole, neg, key, fmt) => {
      const v = values.get(key.trim().toLowerCase());
      return v === undefined ? whole : formatValue(neg ? -v : v, fmt);
    });
    let out = '';
    let open = 0;
    for (const part of filled.split(/(<[@$][^<>]+>|<\/>)/)) {
      if (part === '</>') {
        if (open) (out += '</span>'), open--;
      } else if (part.startsWith('<@')) {
        out += `<span class="rt-${esc(part.slice(2, -1).split('.').pop()!)}">`;
        open++;
      } else if (part.startsWith('<$')) {
        const term = this.terms[part.slice(2, -1)];
        out += term ? `<span class="rt-term" title="${esc(term.description.replace(/<[^>]*>/g, ''))}">` : '<span>';
        open++;
      } else out += esc(part).replace(/\n/g, '<br>');
    }
    return out + '</span>'.repeat(open);
  }
}

export function plainText(s: string): string {
  return s.replace(/<[@$][^<>]+>|<\/>/g, '').replace(/\r/g, '').trim();
}

export class ProfileBuilder {
  private rt: RichText;
  private patchOf = new Map<string, string[]>(); // base char id -> its alternate class ids

  constructor(private t: Record<string, Json>) {
    this.rt = new RichText(t.gamedata_const.termDescriptionDict ?? {});
    for (const [base, info] of Object.entries<Json>(t.char_patch_table.infos))
      this.patchOf.set(base, (info.tmplIds as string[]).filter((id) => id !== base));
  }

  private power(id: string | null): string | null {
    return id ? (this.t.handbook_team_table[id]?.powerName ?? id) : null;
  }

  private range(id: string | null): [number, number][] {
    const r = id ? this.t.range_table[id] : null;
    return r ? r.grids.map((g: Json) => [g.row, g.col]) : [];
  }

  private stats(c: Json): Stats {
    const phase = c.phases[c.phases.length - 1];
    const d = phase.attributesKeyFrames[phase.attributesKeyFrames.length - 1].data;
    const trust = c.favorKeyFrames?.length ? c.favorKeyFrames[c.favorKeyFrames.length - 1].data : {};
    const pot: Record<string, number> = {};
    for (const p of list(c.potentialRanks))
      for (const m of p.buff?.attributes?.attributeModifiers ?? [])
        if (m.formulaItem === 'ADDITION') pot[m.attributeType] = (pot[m.attributeType] ?? 0) + m.value;
    const atkSpeed = d.attackSpeed + (trust.attackSpeed ?? 0) + (pot.ATTACK_SPEED ?? 0);
    return {
      hp: d.maxHp + (trust.maxHp ?? 0) + (pot.MAX_HP ?? 0),
      atk: d.atk + (trust.atk ?? 0) + (pot.ATK ?? 0),
      def: d.def + (trust.def ?? 0) + (pot.DEF ?? 0),
      res: d.magicResistance + (trust.magicResistance ?? 0) + (pot.MAGIC_RESISTANCE ?? 0),
      redeploy: d.respawnTime + (pot.RESPAWN_TIME ?? 0),
      cost: d.cost + (pot.COST ?? 0),
      block: d.blockCnt,
      interval: +((d.baseAttackTime * 100) / atkSpeed).toFixed(2),
    };
  }

  /** The top candidate: highest promotion, then highest potential. */
  private best(cands: Json[] | null | undefined): Json | null {
    const rank = (c: Json) =>
      PHASES.indexOf(c.unlockCondition?.phase) * 1000 + (c.unlockCondition?.level ?? 0) + (c.requiredPotentialRank ?? 0) * 0.01;
    return list(cands).reduce((a: Json, c: Json) => (!a || rank(c) >= rank(a) ? c : a), null);
  }

  private skill(entry: Json): ProfileSkill | null {
    const s = this.t.skill_table[entry.skillId];
    if (!s) return null;
    const l = s.levels[s.levels.length - 1];
    return {
      name: l.name,
      level: s.levels.length > 7 ? `Mastery ${s.levels.length - 7}` : `Level ${s.levels.length}`,
      activation: ACTIVATION[l.skillType] ?? '',
      recovery: RECOVERY[l.spData.spType] ?? '',
      spCost: l.spData.spCost,
      initSp: l.spData.initSp,
      duration: l.duration,
      html: this.rt.html(l.description, l.blackboard, { duration: l.duration }),
      range: l.rangeId ? this.range(l.rangeId) : null,
    };
  }

  private module(id: string): ProfileModule | null {
    const u = this.t.uniequip_table.equipDict[id];
    const b = this.t.battle_equip_table[id];
    if (!u || u.type === 'INITIAL' || !b) return null;
    const top = b.phases[b.phases.length - 1];
    const bonus = (top.attributeBlackboard as Json[])
      .filter((a) => MODULE_STATS[a.key])
      .map((a) => ({ stat: MODULE_STATS[a.key], value: a.value }));
    let traitHtml = '';
    const talents = new Map<number, { name: string; html: string }>();
    for (const part of top.parts) {
      const trait = this.best(part.overrideTraitDataBundle?.candidates);
      if (trait) {
        traitHtml = trait.overrideDescripton
          ? this.rt.html(trait.overrideDescripton, trait.blackboard)
          : this.rt.html(trait.additionalDescription, trait.blackboard);
      }
      const byIndex = new Map<number, Json[]>();
      for (const c of part.addOrOverrideTalentDataBundle?.candidates ?? []) {
        if (!byIndex.has(c.talentIndex)) byIndex.set(c.talentIndex, []);
        byIndex.get(c.talentIndex)!.push(c);
      }
      for (const [i, cands] of byIndex) {
        const c = this.best(cands)!;
        const text = c.upgradeDescription ?? c.description;
        if (text) talents.set(i, { name: c.name ?? '', html: this.rt.html(text, c.blackboard) });
      }
    }
    return {
      name: u.uniEquipName,
      code: [u.typeName1, u.typeName2].filter(Boolean).join('-'),
      bonus,
      traitHtml,
      talents: [...talents.values()],
      story: (u.uniEquipDesc ?? '').trim(),
    };
  }

  private form(id: string, c: Json): ProfileForm {
    const phase = c.phases[c.phases.length - 1];
    return {
      id,
      className: CLASSES[c.profession] ?? c.profession,
      branch: this.t.uniequip_table.subProfDict[c.subProfessionId]?.subProfessionName ?? c.subProfessionId,
      position: c.position === 'MELEE' ? 'Melee' : c.position === 'RANGED' ? 'Ranged' : c.position,
      tags: list(c.tagList),
      stats: this.stats(c),
      range: this.range(phase.rangeId),
      traitHtml: this.rt.html(c.description, this.best(c.trait?.candidates)?.blackboard),
      talents: list(c.talents)
        .map((t: Json) => this.best((t.candidates as Json[]).filter((x) => !/^[?？]+$/.test(x.name ?? ''))))
        .filter(Boolean)
        .map((t: Json) => ({ name: t.name, html: this.rt.html(t.description, t.blackboard) })),
      skills: list(c.skills)
        .map((s: Json) => this.skill(s))
        .filter((s): s is ProfileSkill => s !== null),
      modules: (this.t.uniequip_table.charEquip[id] ?? []).map((m: string) => this.module(m)).filter(Boolean),
    };
  }

  build(id: string): Profile {
    const c = this.t.character_table[id];
    const patches = this.patchOf.get(id) ?? [];
    const forms = [this.form(id, c), ...patches.map((p) => this.form(p, this.t.char_patch_table.patchChars[p]))];
    const formName = new Map(forms.map((f) => [f.id, f.className]));

    // Archive files. Alternate classes add their own copies, which are labelled with the class.
    const files: Profile['files'] = [];
    let basicInfo = '';
    for (const sec of this.t.handbook_info_table.handbookDict[id]?.storyTextAudio ?? []) {
      for (const st of sec.stories ?? []) {
        const ids: string[] | null = st.patchIdList;
        const forBase = !ids || ids.includes(id);
        const text = plainText(st.storyText ?? '');
        if (!text || /^[?？\s]*$/.test(sec.storyTitle)) continue; // locked placeholder entries
        if (sec.storyTitle === 'Basic Info' && forBase && !basicInfo) basicInfo = text;
        const label = forBase ? '' : ` (${ids!.map((x) => formName.get(x) ?? x).join(', ')})`;
        if (!forBase && files.some((f) => f.title === sec.storyTitle && f.text === text)) continue;
        files.push({ title: sec.storyTitle + label, text });
      }
    }
    const info = [...basicInfo.matchAll(/\[([^\]]+)\]\s*([^[]*)/g)]
      .map((m) => ({ key: m[1].trim(), value: m[2].replace(/\s+/g, ' ').trim() }))
      .filter((x) => x.value && x.key !== 'Code Name');

    const main = c.mainPower ?? { nationId: c.nationId, groupId: c.groupId, teamId: c.teamId };
    const affiliation: Profile['affiliation'] = [];
    const add = (label: string, pid: string | null) => {
      const name = this.power(pid);
      if (name && !affiliation.some((a) => a.name === name)) affiliation.push({ label, name });
    };
    add('Nation', main.nationId);
    add('Allegiance', main.groupId);
    add('Squad', main.teamId);
    for (const p of c.subPower ?? []) {
      add('Also tied to', p.nationId);
      add('Also tied to', p.groupId);
      add('Also tied to', p.teamId);
    }

    const words = this.t.charword_table;
    const voices = Object.entries<Json>(words.voiceLangDict[id]?.dict ?? {}).map(([lang, v]) => ({
      lang: words.voiceLangTypeDict[lang]?.name ?? lang,
      names: v.cvName ?? [],
    }));
    const voiceLines = Object.values<Json>(words.charWords)
      .filter((w) => w.wordKey === id)
      .sort((a, b) => a.voiceIndex - b.voiceIndex)
      .map((w) => ({ title: w.voiceTitle, text: plainText(w.voiceText) }));

    const building = this.t.building_data;
    const baseSkills = (building.chars[id]?.buffChar ?? [])
      .map((slot: Json) => slot.buffData[slot.buffData.length - 1])
      .filter(Boolean)
      .map((d: Json) => building.buffs[d.buffId])
      .filter(Boolean)
      .map((b: Json) => ({ name: b.buffName, room: ROOMS[b.roomType] ?? b.roomType, html: this.rt.html(b.description) }));

    return {
      id,
      name: c.name,
      number: c.displayNumber ?? '',
      rarity: Number(String(c.rarity).replace(/\D/g, '')) || 0,
      usage: plainText(c.itemUsage ?? ''),
      quote: plainText(c.itemDesc ?? ''),
      obtain: plainText(c.itemObtainApproach ?? ''),
      affiliation,
      info,
      illustrators: this.t.skin_table.charSkins[`${id}#1`]?.displaySkin?.drawerList ?? [],
      voices,
      forms,
      potentials: (list(c.potentialRanks)).map((p: Json) => p.description),
      baseSkills,
      files,
      voiceLines,
    };
  }
}
