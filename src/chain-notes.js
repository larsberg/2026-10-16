import { noteToMidi } from '@strudel/core';

export const defaultChainNoteSettings = Object.freeze({ noteScaleEnabled: true, noteScaleMin: 0, noteScaleMax: 1.2, noteScaleAmount: .2,
  noteWeightMin: .1, noteWeightMax: 1, noteAttack: .035, noteRelease: .4, notePushEnabled: true, notePushStrength: 4 });
const percussionRegister = { kick: 28, snare: 55, hat: 69 };
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
function eventPitch(event) {
  if (event.note === undefined) return percussionRegister[event.layer];
  try { return noteToMidi(event.note) + (Number(event.ctranspose) || 0); } catch { return undefined; }
}
export function notePaletteForPattern(pattern, bars = 80) {
  const notes = new Map();
  for (const { value } of pattern.queryArc(0, bars)) {
    const midi = eventPitch(value);
    if (!Number.isFinite(midi)) continue;
    notes.set(`${value.layer}:${midi}`, { layer: value.layer, note: value.note ?? null, midi });
  }
  return [...notes.values()].sort((a, b) => a.midi - b.midi || a.layer.localeCompare(b.layer));
}

export function createChainNotes(chains, initial = {}, initialPalette = []) {
  const settings = { ...defaultChainNoteSettings, ...initial };
  const sortPalette = notes => [...notes].sort((a, b) => a.midi - b.midi || a.layer.localeCompare(b.layer));
  let palette = sortPalette(initialPalette);
  const ordered = [...chains].sort((a, b) => b.definition.volume - a.definition.volume || a.definition.id - b.definition.id);
  const states = new Map(ordered.map(chain => [chain, { age: Infinity, from: 0, peak: 0, envelope: 0, scale: 1 }]));
  function assign() {
    const low = palette[0]?.midi ?? 0, high = palette.at(-1)?.midi ?? low;
    const groups = new Map();
    for (const note of palette) {
      if (!groups.has(note.layer)) groups.set(note.layer, []);
      groups.get(note.layer).push(note);
    }
    const bass = groups.get('bass');
    const register = notes => notes.reduce((sum, note) => sum + note.midi, 0) / notes.length;
    const others = [...groups].filter(([layer]) => layer !== 'bass').sort((a, b) => register(a[1]) - register(b[1]) || a[0].localeCompare(b[0]));
    const bassCount = bass ? (others.length ? Math.min(ordered.length, Math.max(1, Math.round(ordered.length * .33))) : ordered.length) : 0;
    const remaining = ordered.length - bassCount, assigned = [];
    function addGroup(notes, count) {
      for (let i = 0; i < count; i++) assigned.push(notes[Math.min(notes.length - 1, Math.floor(i * notes.length / count))]);
    }
    if (bass) addGroup(bass, bassCount);
    others.forEach(([, notes], i) => addGroup(notes, Math.floor(remaining / others.length) + (i < remaining % others.length ? 1 : 0)));
    ordered.forEach((chain, rank) => {
      const note = assigned[rank];
      const pitch = note && high > low ? (note.midi - low) / (high - low) : 0;
      chain.noteAssignment = note ? { ...note, rank, size: chain.definition.volume,
        weight: clamp(settings.noteWeightMax + pitch * (settings.noteWeightMin - settings.noteWeightMax), settings.noteWeightMin, settings.noteWeightMax) } : null;
    });
  }
  function trigger(events) {
    const hits = new Map();
    for (const event of events) {
      const midi = eventPitch(event);
      if (!Number.isFinite(midi) || !(event.gain > 0)) continue;
      let candidates = ordered.filter(chain => chain.noteAssignment?.layer === event.layer);
      // Even a tiny mesh with fewer chains than notes still responds to every part.
      if (!candidates.length) {
        candidates = ordered.filter(chain => chain.noteAssignment);
        const distance = Math.min(...candidates.map(chain => Math.abs(chain.noteAssignment.midi - midi)));
        candidates = candidates.filter(chain => Math.abs(chain.noteAssignment.midi - midi) === distance);
      }
      // Share every note across its instrument's entire group, including chains
      // whose nominal register is absent from the current musical phrase.
      for (const chain of candidates) {
        const gain = clamp(event.gain, 0, 1);
        if (gain > (hits.get(chain)?.gain ?? 0)) hits.set(chain, { chain, gain, midi });
        if (!settings.noteScaleEnabled) continue;
        const state = states.get(chain);
        state.from = state.envelope; state.peak = Math.max(state.age === 0 ? state.peak : state.envelope, gain); state.age = 0;
      }
    }
    return [...hits.values()];
  }
  function update(dt) {
    for (const chain of ordered) {
      const state = states.get(chain); state.age += dt;
      if (!settings.noteScaleEnabled) { state.age = Infinity; state.from = state.peak = 0; }
      state.envelope = settings.noteScaleEnabled ? state.age < settings.noteAttack
        ? state.from + (state.peak - state.from) * state.age / settings.noteAttack
        : state.peak * Math.exp(-(state.age - settings.noteAttack) / settings.noteRelease) : 0;
      if (state.envelope < .001) state.envelope = 0;
      // Normalize the existing pitch weighting so the strongest low note can
      // reach the chosen maximum, while silence returns to the minimum.
      const weightedEnvelope = state.envelope * (1 + settings.noteScaleAmount * (chain.noteAssignment?.weight ?? 0))
        / (1 + settings.noteScaleAmount * settings.noteWeightMax);
      state.scale = settings.noteScaleEnabled && chain.noteAssignment
        ? settings.noteScaleMin + (settings.noteScaleMax - settings.noteScaleMin) * clamp(weightedEnvelope, 0, 1) : 1;
      chain.noteEnvelope = state.envelope;
      chain.noteScale = state.scale;
    }
  }
  function configure(patch) { Object.assign(settings, patch); assign(); update(0); }
  assign(); update(0);
  return { ordered, trigger, update, configure,
    setPalette(next) { palette = sortPalette(next); assign(); update(0); },
    get assignments() { return ordered.map(chain => ({ chainId: chain.definition.id, ...chain.noteAssignment })); },
  };
}
