/* timeline.js — REIN: Zeitleiste eines Songs. Schläge ↔ Sekunden im Video,
   welcher Akkord wann klingt, Abschnitte und Phrasen.
   Kein DOM, keine Zeit, kein Zufall.

   Schlag 0 ist die Eins von Takt 1. Ein Ereignis { at, chord } klingt ab
   Schlag at bis zum nächsten. Die Zeitleiste ist gleichmäßig (ein festes
   Tempo, song.bpm); Schlag 0 liegt bei offsetSec der YouTube-Quelle (ohne
   Quelle bei 0). beatTimes (schwankendes Tempo) ist für später vorgesehen
   und wird hier nicht ausgewertet. */

const EPS = 1e-6;

/** Die YouTube-Quelle des Songs oder null. */
export function youtubeSource(song) {
  return (song?.sources || []).find((s) => s && s.type === 'youtube') || null;
}

/** Sekunde im Video, an der Schlag 0 liegt (ohne Quelle/Offset: 0). */
export function offsetOf(song) {
  return youtubeSource(song)?.offsetSec ?? 0;
}

/** Schlag → Sekunde im Video. bpm: anderes Tempo statt song.bpm (eigene Begleitung). */
export function beatToSec(song, beat, bpm = song.bpm) {
  return offsetOf(song) + (beat * 60) / bpm;
}

/** Sekunde im Video → Schlag (Bruchteil). */
export function secToBeat(song, sec, bpm = song.bpm) {
  return ((sec - offsetOf(song)) * bpm) / 60;
}

/** Auf das Raster runden (½ = Achtel, ¼ = Sechzehntel, 1 = ganze Schläge). */
export function quantize(beat, grid = 0.5) {
  const q = Math.round(beat / grid) * grid;
  return Math.round(q * 1e6) / 1e6 + 0; // + 0: keine −0
}

/** Index des Ereignisses, das bei `beat` klingt, oder −1. */
export function eventIndexAt(song, beat) {
  const ev = song.events || [];
  let lo = 0, hi = ev.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ev[mid].at <= beat + EPS) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Akkord bei `beat` oder null (vor dem ersten Ereignis). */
export function chordAt(song, beat) {
  const i = eventIndexAt(song, beat);
  return i < 0 ? null : song.events[i].chord;
}

/** Ereignisse mit fromBeat ≤ at < toBeat; klingt bei fromBeat schon ein
 *  Akkord, kommt er als Ereignis bei fromBeat dazu. */
export function eventsIn(song, fromBeat, toBeat) {
  const ev = song.events || [];
  const out = [];
  const i = eventIndexAt(song, fromBeat);
  if (i >= 0 && ev[i].at < fromBeat - EPS) out.push({ at: fromBeat, chord: ev[i].chord });
  for (const e of ev) if (e.at >= fromBeat - EPS && e.at < toBeat - EPS) out.push({ at: e.at, chord: e.chord });
  return out;
}

/** Akkordfolge ohne Zeiten, gleiche Nachbarn zusammengefasst. */
export function chordSequence(song, fromBeat, toBeat) {
  const seq = [];
  for (const e of eventsIn(song, fromBeat, toBeat)) if (seq[seq.length - 1] !== e.chord) seq.push(e.chord);
  return seq;
}

/** Abschnitt → Schlagbereich. Takte sind 1-basiert. */
export function sectionRange(song, section) {
  const bpb = song.beatsPerBar;
  return { fromBeat: (section.bar - 1) * bpb, toBeat: (section.bar - 1 + section.bars) * bpb };
}

/** Takt (1-basiert) eines Schlags. */
export const barOf = (song, beat) => Math.floor(beat / song.beatsPerBar + EPS) + 1;

/** Ende des Songs in Schlägen: Ende des letzten Abschnitts oder der Takt
 *  nach dem letzten Ereignis (was später kommt). */
export function songEndBeat(song) {
  const bpb = song.beatsPerBar;
  let end = 0;
  for (const s of song.sections || []) end = Math.max(end, sectionRange(song, s).toBeat);
  const ev = song.events || [];
  if (ev.length) end = Math.max(end, (Math.floor(ev[ev.length - 1].at / bpb + EPS) + 1) * bpb);
  return end;
}

/** „Strophe 1“, „Strophe 2“ → „Strophe 1/2“; sonst „A / B“. */
function joinNames(names) {
  if (names.length === 1) return names[0];
  const m = names.map((n) => /^(.*\S)\s+(\d+)$/.exec(n));
  if (m.every(Boolean) && m.every((x) => x[1] === m[0][1])) return `${m[0][1]} ${m.map((x) => x[2]).join('/')}`;
  return names.join(' / ');
}

/** Phrasen für „Geführt“: je Abschnitt eine; Abschnitte gleicher Länge mit
 *  identischer Ereignisfolge (relativ zum Abschnittsanfang) werden eine
 *  Phrase, der Name nennt alle. Ohne Abschnitte: der ganze Song als eine
 *  Phrase. Abschnitte ohne Akkord fallen weg.
 *  → [{ id, name, sections: [ids], fromBeat, toBeat, beats, events (relativ),
 *       chords (Folge ohne Zeiten), whole }] in Song-Reihenfolge */
export function phrasesOf(song) {
  const secs = [...(song.sections || [])].sort((a, b) => a.bar - b.bar);
  if (!secs.length) {
    const toBeat = songEndBeat(song);
    const events = eventsIn(song, 0, toBeat);
    if (!events.length) return [];
    return [{ id: 'song', name: 'Ganzer Song', sections: [], fromBeat: 0, toBeat, beats: toBeat, events, chords: chordSequence(song, 0, toBeat), whole: true }];
  }
  const groups = [];
  for (const s of secs) {
    const { fromBeat, toBeat } = sectionRange(song, s);
    const events = eventsIn(song, fromBeat, toBeat).map((e) => ({ at: e.at - fromBeat, chord: e.chord }));
    if (!events.length) continue;
    const key = `${toBeat - fromBeat}|${events.map((e) => `${e.at}:${e.chord}`).join(',')}`;
    const g = groups.find((x) => x.key === key);
    if (g) { g.names.push(s.name); g.sections.push(s.id); continue; }
    groups.push({ key, names: [s.name], sections: [s.id], fromBeat, toBeat, events, chords: chordSequence(song, fromBeat, toBeat) });
  }
  return groups.map((g) => ({
    id: g.sections[0], name: joinNames(g.names), sections: g.sections, fromBeat: g.fromBeat, toBeat: g.toBeat,
    beats: g.toBeat - g.fromBeat, events: g.events, chords: g.chords, whole: false,
  }));
}

/** Übergänge der Ereignisfolge (gleiche Nachbarn übersprungen), gezählt.
 *  → [{ from, to, count, first }] häufigste zuerst, bei Gleichstand das
 *  frühere. */
export function transitionCounts(song) {
  const ev = song.events || [];
  const map = new Map();
  for (let i = 1; i < ev.length; i++) {
    if (ev[i].chord === ev[i - 1].chord) continue;
    const k = `${ev[i - 1].chord}>${ev[i].chord}`;
    if (!map.has(k)) map.set(k, { from: ev[i - 1].chord, to: ev[i].chord, count: 0, first: i });
    map.get(k).count++;
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.first - b.first);
}

/** Akkorde, die in der Ereignisfolge vor `symbol` kommen (häufigste zuerst).
 *  Ohne Ereignisse: der Akkord davor in chords (der letzte vor dem ersten). */
export function predecessors(song, symbol) {
  const t = transitionCounts(song).filter((x) => x.to === symbol).map((x) => x.from);
  if (t.length || (song.events || []).length) return t;
  const ch = song.chords || [];
  const i = ch.indexOf(symbol);
  if (i < 0 || ch.length < 2) return [];
  return [ch[(i - 1 + ch.length) % ch.length]];
}

/** Lage eines Schlags im Takt als Zählzeit: 3.5 → „4 und“, 0 → „1“. */
export function countLabel(song, beat) {
  const b = ((beat % song.beatsPerBar) + song.beatsPerBar) % song.beatsPerBar;
  const whole = Math.floor(b + EPS), frac = b - whole;
  if (Math.abs(frac) < EPS) return String(whole + 1);
  if (Math.abs(frac - 0.5) < EPS) return `${whole + 1} und`;
  return `${whole + 1}${Math.abs(frac - 0.25) < EPS ? ' e' : ' a'}`;
}

/** „1½“, „2“, „¼“: Schläge als kurze Zahl. */
export function beatsText(b) {
  const q = Math.round(b * 4) / 4;
  const whole = Math.floor(q), frac = q - whole;
  const f = frac === 0.5 ? '½' : frac === 0.25 ? '¼' : frac === 0.75 ? '¾' : '';
  return whole === 0 && f ? f : `${whole}${f}`;
}
